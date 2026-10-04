# Merge Duplicate Products Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge same-name products under the same supplier into one product that keeps every barcode, hide the copies reversibly, and stop new duplicates.

**Architecture:** One migration adds `additionalBarcodes TEXT[]` and `mergedIntoProductId` to `products`, runs an exported, separately tested `mergeDuplicateProducts()` SQL routine, then adds a partial unique index on (provider, normalized name) for active products. Barcode matching on backend and mobile checks `[barcode, ...additionalBarcodes]`. Create/rename map the index's unique violation to 409, shown in Hebrew in the app. The import script merges same-name rows.

**Tech Stack:** NestJS + TypeORM + Postgres (Jest unit + supertest e2e on real Postgres); Expo / React Native + React Query (Jest + @testing-library/react-native v14 — `render`/`fireEvent` are async, `await` them).

**Spec:** `docs/superpowers/specs/2026-10-05-merge-duplicate-products-design.md` — read it first.

## Global Constraints

- Name normalization, verbatim everywhere in SQL: `lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))`.
- A duplicate = same `providerId` + same normalized name, **active products only**.
- Copies are hidden (`"isActive" = false`, `"mergedIntoProductId" = <survivor id>`), never deleted.
- Survivor order: referenced by an order line → has a real GTIN barcode (all digits, length 8/12/13/14) → has any barcode → oldest `createdAt` → lowest `id`.
- Notes are NOT merged.
- Hebrew copy, exact: duplicate-name error `מוצר בשם הזה כבר קיים אצל הספק.`; edit screen label `ברקודים נוספים:`.
- Backend 409 message, exact: `A product with this name already exists for this provider`.
- Work locally on `main`. **Commit after each task, never push** (push deploys production and runs the migration on live data). Dvir pushes after the local preview.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Backend: do NOT run `npm run lint` (it rewrites ~20 unrelated files). Run `npx eslint --fix <files you touched>`. Mobile has no lint script.
- Backend commands from `backend/`, mobile from `mobile/`. Local Postgres on `localhost:5432` serves `npm run test:e2e`.

## Review Focus

1. **NULL ordering in the survivor ranking:** `ORDER BY <bool> DESC` puts NULLs first in Postgres — every boolean in the ranking must be `coalesce(..., false)` or a product with no barcode can win. (Task 1 test: no-barcode product loses to barcoded one.)
2. **Idempotence:** running the merge twice changes nothing the second time. (Task 1 test.)
3. **Barcodes not lost or duplicated:** every loser barcode (and any loser `additionalBarcodes`) ends on the survivor exactly once, never including the survivor's own `barcode`. (Task 1 test.)
4. **Scan by an additional barcode** works on the order screen and in the branch-wide resolution, including GTIN-normalized matches (scanner prefix / dropped leading zero). (Tasks 2 and 3 tests.)
5. **409 doesn't fire for legitimate names:** same name under another supplier, or same name as a hidden product, is allowed. (Task 2 e2e.)

---

### Task 1: Backend — schema, merge routine, migration

**Files:**
- Create: `backend/src/products/mergeDuplicateProducts.ts`
- Create: `backend/src/database/migrations/1700000000019-MergeDuplicateProducts.ts`
- Modify: `backend/src/database/data-source.ts` (import + append to `migrations`)
- Modify: `backend/src/products/product.entity.ts`
- Create test: `backend/test/merge-duplicate-products.e2e-spec.ts`

**Interfaces:**
- Produces:
  - `Product.additionalBarcodes: string[]`, `Product.mergedIntoProductId?: string | null`
  - `mergeDuplicateProducts(runner: SqlRunner): Promise<MergeSummary>` where `interface SqlRunner { query(sql: string, params?: unknown[]): Promise<any> }` and `interface MergeSummary { groups: number; hidden: number; orderLinesRepointed: number }`
  - `NORMALIZED_NAME_INDEX = 'uq_products_provider_normalized_name'`, `createNormalizedNameIndex(runner)`, `dropNormalizedNameIndex(runner)`

- [ ] **Step 1: Entity columns**

In `backend/src/products/product.entity.ts`, after `barcode`:

```ts
  // Every other barcode this product is known by — a product sold under
  // several barcodes (different packers, a supplier's own short code next to
  // the GTIN) is still one product to order.
  @Column('text', { array: true, default: () => "'{}'" })
  additionalBarcodes: string[];

  // Set on a duplicate that was merged into another product and hidden.
  // Kept so the merge can be undone; null on every live product.
  @Column({ type: 'uuid', nullable: true })
  mergedIntoProductId?: string | null;
```

- [ ] **Step 2: The merge routine**

Create `backend/src/products/mergeDuplicateProducts.ts`:

```ts
/**
 * Merges active products that share a supplier and a name (ignoring
 * whitespace and Latin case) into one survivor per group.
 *
 * Exported separately from the migration that runs it so it can be tested
 * against a real database: by the time e2e tests run, migrations have
 * already applied and the unique index would refuse the duplicates a test
 * needs to seed.
 */
export interface SqlRunner {
  query(sql: string, params?: unknown[]): Promise<any>;
}

export interface MergeSummary {
  groups: number;
  hidden: number;
  orderLinesRepointed: number;
}

export const NORMALIZED_NAME_INDEX = 'uq_products_provider_normalized_name';

const NORMALIZED_NAME = `lower(btrim(regexp_replace(name, '\\s+', ' ', 'g')))`;

export async function createNormalizedNameIndex(runner: SqlRunner): Promise<void> {
  // Partial: hidden and soft-deleted products are exempt, so a merged copy
  // never blocks its survivor and can be restored by hand later.
  await runner.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS ${NORMALIZED_NAME_INDEX}
       ON products ("providerId", (${NORMALIZED_NAME}))
       WHERE "isActive"`,
  );
}

export async function dropNormalizedNameIndex(runner: SqlRunner): Promise<void> {
  await runner.query(`DROP INDEX IF EXISTS ${NORMALIZED_NAME_INDEX}`);
}

export async function mergeDuplicateProducts(runner: SqlRunner): Promise<MergeSummary> {
  // Every boolean is coalesced: Postgres sorts NULL first under DESC, so a
  // product with no barcode would otherwise outrank one with a real GTIN.
  // A temp table is per-connection: callers must pass ONE connection (a
  // QueryRunner), never a pooled DataSource whose calls may each land on a
  // different connection.
  await runner.query(`DROP TABLE IF EXISTS merge_map`);
  await runner.query(`
    CREATE TEMP TABLE merge_map AS
    WITH ranked AS (
      SELECT
        p.id,
        p."providerId",
        lower(btrim(regexp_replace(p.name, '\\s+', ' ', 'g'))) AS norm,
        row_number() OVER (
          PARTITION BY p."providerId", lower(btrim(regexp_replace(p.name, '\\s+', ' ', 'g')))
          ORDER BY
            EXISTS (SELECT 1 FROM order_items oi WHERE oi."productId" = p.id) DESC,
            coalesce(p.barcode ~ '^([0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})$', false) DESC,
            (p.barcode IS NOT NULL AND p.barcode <> '') DESC,
            p."createdAt" ASC,
            p.id ASC
        ) AS rn
      FROM products p
      WHERE p."isActive"
    )
    SELECT loser.id AS loser_id, survivor.id AS survivor_id
    FROM ranked loser
    JOIN ranked survivor
      ON survivor."providerId" = loser."providerId"
     AND survivor.norm = loser.norm
     AND survivor.rn = 1
    WHERE loser.rn > 1
  `);

  const [counts] = await runner.query(`
    SELECT
      count(DISTINCT survivor_id)::int AS groups,
      count(*)::int AS hidden,
      (SELECT count(*)::int FROM order_items oi
         WHERE oi."productId" IN (SELECT loser_id FROM merge_map)) AS "orderLinesRepointed"
    FROM merge_map
  `);

  await runner.query(`
    UPDATE products s
    SET "additionalBarcodes" = (
      SELECT coalesce(array_agg(DISTINCT code ORDER BY code), '{}')
      FROM (
        SELECT unnest(s."additionalBarcodes") AS code
        UNION
        SELECT l.barcode FROM merge_map m JOIN products l ON l.id = m.loser_id
          WHERE m.survivor_id = s.id
        UNION
        SELECT unnest(l."additionalBarcodes") FROM merge_map m JOIN products l ON l.id = m.loser_id
          WHERE m.survivor_id = s.id
      ) codes
      WHERE code IS NOT NULL AND code <> '' AND code IS DISTINCT FROM s.barcode
    )
    WHERE s.id IN (SELECT survivor_id FROM merge_map)
  `);

  await runner.query(`
    UPDATE order_items oi SET "productId" = m.survivor_id
    FROM merge_map m WHERE oi."productId" = m.loser_id
  `);

  await runner.query(`
    UPDATE products p SET "isActive" = false, "mergedIntoProductId" = m.survivor_id
    FROM merge_map m WHERE p.id = m.loser_id
  `);

  await runner.query(`DROP TABLE merge_map`);

  return {
    groups: counts.groups,
    hidden: counts.hidden,
    orderLinesRepointed: counts.orderLinesRepointed,
  };
}
```

(No `ON COMMIT DROP`: outside a transaction each statement commits on its own and the table would vanish before the next query. The routine drops it itself, at the start in case a previous run died midway, and at the end.)

- [ ] **Step 3: The migration**

Create `backend/src/database/migrations/1700000000019-MergeDuplicateProducts.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  createNormalizedNameIndex,
  dropNormalizedNameIndex,
  mergeDuplicateProducts,
} from '../../products/mergeDuplicateProducts';

export class MergeDuplicateProducts1700000000019 implements MigrationInterface {
  name = 'MergeDuplicateProducts1700000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE products
        ADD COLUMN "additionalBarcodes" TEXT[] NOT NULL DEFAULT '{}',
        ADD COLUMN "mergedIntoProductId" UUID NULL REFERENCES products(id)
    `);
    // The one-off item-file import created one product per barcode; see
    // docs/superpowers/specs/2026-10-05-merge-duplicate-products-design.md.
    const summary = await mergeDuplicateProducts(queryRunner);
    console.log(
      `MergeDuplicateProducts: merged ${summary.groups} groups, hid ${summary.hidden} products, repointed ${summary.orderLinesRepointed} order lines`,
    );
    await createNormalizedNameIndex(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await dropNormalizedNameIndex(queryRunner);
    // Repointed order lines stay on the survivor: same product, and each line
    // keeps its own name snapshot.
    await queryRunner.query(`
      UPDATE products SET "isActive" = true WHERE "mergedIntoProductId" IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE products DROP COLUMN "mergedIntoProductId", DROP COLUMN "additionalBarcodes"
    `);
  }
}
```

Register it in `backend/src/database/data-source.ts`: import after `AddProductNote1700000000018` and append `MergeDuplicateProducts1700000000019,` last in `migrations`.

- [ ] **Step 4: Write the merge e2e test**

Create `backend/test/merge-duplicate-products.e2e-spec.ts`. It seeds rows with raw SQL (the API would refuse duplicates once the index exists), so it drops the index in `beforeAll` and recreates it in `afterAll` — the e2e database is shared across spec files that run one at a time (`maxWorkers: 1`).

```ts
import { INestApplication } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { createTestApp, seed, Seeded } from './helpers';
import {
  createNormalizedNameIndex,
  dropNormalizedNameIndex,
  mergeDuplicateProducts,
} from '../src/products/mergeDuplicateProducts';

describe('mergeDuplicateProducts (e2e, real Postgres)', () => {
  let app: INestApplication;
  let db: DataSource;
  let runner: QueryRunner;
  let fixtures: Seeded;

  beforeAll(async () => {
    app = await createTestApp();
    fixtures = await seed(app);
    db = app.get(DataSource);
    // One dedicated connection: the merge uses a per-connection temp table.
    runner = db.createQueryRunner();
    await runner.connect();
    await dropNormalizedNameIndex(runner);
  });

  afterAll(async () => {
    await createNormalizedNameIndex(runner);
    await runner.release();
    await app.close();
  });

  // Each test uses its own provider-scoped names so tests don't see each
  // other's rows; providerIds[2] and [3] are untouched by the shared seed's
  // product.
  const P = () => fixtures.providerIds[2];
  const Q = () => fixtures.providerIds[3];

  async function insert(
    providerId: string,
    name: string,
    barcode: string | null,
    createdAt = '2026-01-01T00:00:00Z',
    isActive = true,
  ): Promise<string> {
    const [row] = await db.query(
      `INSERT INTO products ("providerId", name, "unitType", barcode, "createdAt", "isActive")
       VALUES ($1, $2, 'קרטון', $3, $4, $5) RETURNING id`,
      [providerId, name, barcode, createdAt, isActive],
    );
    return row.id;
  }

  const get = async (id: string) =>
    (await db.query(`SELECT * FROM products WHERE id = $1`, [id]))[0];

  it('keeps one active survivor and hides the rest, pointing at it', async () => {
    const a = await insert(P(), 'סלרי ראש', '7290000000534', '2026-01-01T00:00:00Z');
    const b = await insert(P(), 'סלרי ראש', '7290003706020', '2026-01-02T00:00:00Z');
    const c = await insert(P(), 'סלרי ראש', '27', '2026-01-03T00:00:00Z');

    await mergeDuplicateProducts(runner);

    expect((await get(a)).isActive).toBe(true);
    for (const id of [b, c]) {
      const row = await get(id);
      expect(row.isActive).toBe(false);
      expect(row.mergedIntoProductId).toBe(a);
    }
  });

  it('moves every other barcode onto the survivor once, never its own', async () => {
    const a = await insert(P(), 'סלרי עלים', '7290013232656', '2026-01-01T00:00:00Z');
    await insert(P(), 'סלרי עלים', '121', '2026-01-02T00:00:00Z');
    await insert(P(), 'סלרי עלים', '7290011276454', '2026-01-03T00:00:00Z');
    await insert(P(), 'סלרי עלים', '7290013232656', '2026-01-04T00:00:00Z');

    await mergeDuplicateProducts(runner);

    const survivor = await get(a);
    expect([...survivor.additionalBarcodes].sort()).toEqual(['121', '7290011276454']);
  });

  it('prefers a product used in an order, then a real GTIN, then any barcode, then the oldest', async () => {
    // A real GTIN beats an older short code and an even older no-barcode row.
    const none = await insert(P(), 'גזר', null, '2025-01-01T00:00:00Z');
    const short = await insert(P(), 'גזר', '27', '2025-06-01T00:00:00Z');
    const gtin = await insert(P(), 'גזר', '7290000000794', '2026-01-01T00:00:00Z');
    await mergeDuplicateProducts(runner);
    expect((await get(gtin)).isActive).toBe(true);
    expect((await get(short)).isActive).toBe(false);
    expect((await get(none)).isActive).toBe(false);

    // Any barcode beats none.
    const noBarcode = await insert(P(), 'בצל', null, '2025-01-01T00:00:00Z');
    const withShort = await insert(P(), 'בצל', '55', '2026-01-01T00:00:00Z');
    await mergeDuplicateProducts(runner);
    expect((await get(withShort)).isActive).toBe(true);
    expect((await get(noBarcode)).isActive).toBe(false);

    // Being on an order beats everything, and the order line is repointed.
    const ordered = await insert(P(), 'שום', null, '2026-03-01T00:00:00Z');
    const other = await insert(P(), 'שום', '7290000000800', '2025-01-01T00:00:00Z');
    const [order] = await db.query(
      `INSERT INTO orders ("branchId", "providerId", "createdByUserId", status)
       VALUES ($1, $2, (SELECT id FROM users LIMIT 1), 'DRAFT') RETURNING id`,
      [fixtures.branchId, P()],
    );
    await db.query(
      `INSERT INTO order_items ("orderId", "productId", "productNameSnapshot", "unitType", quantity)
       VALUES ($1, $2, 'שום', 'קרטון', 1), ($1, $3, 'שום', 'קרטון', 2)`,
      [order.id, ordered, other],
    );
    await mergeDuplicateProducts(runner);
    expect((await get(ordered)).isActive).toBe(true);
    expect((await get(other)).isActive).toBe(false);
    const lines = await db.query(
      `SELECT "productId" FROM order_items WHERE "orderId" = $1`,
      [order.id],
    );
    expect(lines.map((l: { productId: string }) => l.productId)).toEqual([ordered, ordered]);
  });

  it('treats whitespace differences as the same name', async () => {
    const a = await insert(P(), 'ראש  כרוב', '7290000000817', '2026-01-01T00:00:00Z');
    const b = await insert(P(), ' ראש כרוב ', '7290000000824', '2026-01-02T00:00:00Z');
    await mergeDuplicateProducts(runner);
    expect((await get(a)).isActive).toBe(true);
    expect((await get(b)).mergedIntoProductId).toBe(a);
  });

  it('leaves different names, other suppliers and already-hidden products alone', async () => {
    const a = await insert(P(), 'חסה', '7290000000831');
    const b = await insert(P(), 'חסה ערבית', '7290000000848');
    const c = await insert(Q(), 'חסה', '7290000000855');
    const hidden = await insert(P(), 'חסה', '7290000000862', '2025-01-01T00:00:00Z', false);
    await mergeDuplicateProducts(runner);
    for (const id of [a, b, c]) expect((await get(id)).isActive).toBe(true);
    expect((await get(hidden)).mergedIntoProductId).toBeNull();
  });

  it('changes nothing when run a second time', async () => {
    await insert(P(), 'פטרוזיליה', '7290000000879', '2026-01-01T00:00:00Z');
    await insert(P(), 'פטרוזיליה', '7290000000886', '2026-01-02T00:00:00Z');
    await mergeDuplicateProducts(runner);
    const before = await db.query(`SELECT id, "isActive", "additionalBarcodes" FROM products ORDER BY id`);
    const summary = await mergeDuplicateProducts(runner);
    const after = await db.query(`SELECT id, "isActive", "additionalBarcodes" FROM products ORDER BY id`);
    expect(summary).toEqual({ groups: 0, hidden: 0, orderLinesRepointed: 0 });
    expect(after).toEqual(before);
  });
});
```

If the `orders` insert fails on a required column, read `backend/src/database/migrations/1700000000006-CreateOrders.ts` (and later order migrations) for the exact required columns and supply them — keep the assertion's meaning.

- [ ] **Step 5: Run it**

Run: `npm run test:e2e -- merge-duplicate-products` → PASS. Then full `npm run test:e2e` → PASS (proves the migration applies from scratch and the recreated index doesn't break other specs), and `npm test`.

- [ ] **Step 6: Format and commit**

```bash
npx eslint --fix src/products/mergeDuplicateProducts.ts src/database/migrations/1700000000019-MergeDuplicateProducts.ts src/database/data-source.ts src/products/product.entity.ts test/merge-duplicate-products.e2e-spec.ts
git add src/products/mergeDuplicateProducts.ts src/database/migrations/1700000000019-MergeDuplicateProducts.ts src/database/data-source.ts src/products/product.entity.ts test/merge-duplicate-products.e2e-spec.ts
git commit -m "feat(products): merge same-name products into one that keeps every barcode"
```

---

### Task 2: Backend — match additional barcodes, refuse duplicate names, scripts

**Files:**
- Create: `backend/src/products/barcodesOf.ts` (+ `barcodesOf.spec.ts`)
- Modify: `backend/src/products/products.service.ts` (`findActiveByBranch`, `findByBarcodeInBranch`, `create`, `update`)
- Test: `backend/src/products/products.service.spec.ts`
- Create test: `backend/test/duplicate-product-names.e2e-spec.ts`
- Modify: `backend/scripts/import-friend-data.ts`, `backend/scripts/report-unscannable-products.ts`

**Interfaces:**
- Consumes: `Product.additionalBarcodes` (Task 1), the partial unique index (Task 1).
- Produces: `barcodesOf(product: Pick<Product, 'barcode' | 'additionalBarcodes'>): string[]`; `GET /branches/:branchId/products` items include `additionalBarcodes`; create/update return **409** `A product with this name already exists for this provider`.

- [ ] **Step 1: `barcodesOf` + test**

`backend/src/products/barcodesOf.ts`:

```ts
import { Product } from './product.entity';

/** Every barcode a product answers to: the main one first, then the rest. */
export function barcodesOf(
  product: Pick<Product, 'barcode' | 'additionalBarcodes'>,
): string[] {
  return [product.barcode, ...(product.additionalBarcodes ?? [])].filter(
    (code): code is string => !!code,
  );
}
```

`backend/src/products/barcodesOf.spec.ts`:

```ts
import { barcodesOf } from './barcodesOf';

describe('barcodesOf', () => {
  it('lists the main barcode first, then the additional ones', () => {
    expect(barcodesOf({ barcode: '1', additionalBarcodes: ['2', '3'] })).toEqual(['1', '2', '3']);
  });

  it('skips a missing main barcode and tolerates a missing array', () => {
    expect(barcodesOf({ barcode: undefined, additionalBarcodes: ['2'] })).toEqual(['2']);
    expect(barcodesOf({ barcode: '1' } as never)).toEqual(['1']);
  });
});
```

- [ ] **Step 2: Failing service tests**

Add to `products.service.spec.ts` (the `mockRepo` already has `find`, `save`, `create`, `findOneBy`):

```ts
  describe('barcode lookup with additional barcodes', () => {
    it('finds a product by one of its additional barcodes', async () => {
      mockRepo.find.mockResolvedValue([
        { id: 'a', providerId: 'p1', name: 'סלרי ראש', barcode: '7290000000534', additionalBarcodes: ['7290003706020', '27'] },
        { id: 'b', providerId: 'p1', name: 'גזר', barcode: '7290000000794', additionalBarcodes: [] },
      ]);

      const result = await service.findByBarcodeInBranch('br1', 'ALL', '7290003706020');

      expect(result.map((p) => p.id)).toEqual(['a']);
    });

    it('matches a non-GTIN additional code exactly', async () => {
      mockRepo.find.mockResolvedValue([
        { id: 'a', providerId: 'p1', name: 'סלרי ראש', barcode: '7290000000534', additionalBarcodes: ['27'] },
      ]);

      expect((await service.findByBarcodeInBranch('br1', 'ALL', '27')).map((p) => p.id)).toEqual(['a']);
      expect(await service.findByBarcodeInBranch('br1', 'ALL', '2')).toEqual([]);
    });
  });

  describe('duplicate names', () => {
    const uniqueViolation = Object.assign(new QueryFailedError('INSERT', [], new Error('dup')), { code: '23505' });

    it('turns a duplicate name on create into a ConflictException', async () => {
      mockProvidersService.findById.mockResolvedValue({ id: 'p1' });
      mockRepo.create.mockImplementation((data) => data);
      mockRepo.save.mockRejectedValue(uniqueViolation);

      await expect(service.create('p1', { name: 'סלרי ראש', unitType: 'קרטון' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('turns a duplicate name on update into a ConflictException', async () => {
      mockRepo.findOneBy.mockResolvedValue({ id: 'pr1', providerId: 'p1', name: 'גזר' });
      mockRepo.save.mockRejectedValue(uniqueViolation);

      await expect(service.update('pr1', { name: 'סלרי ראש' })).rejects.toThrow(ConflictException);
    });
  });
```

Add `ConflictException` to the `@nestjs/common` import and `QueryFailedError` to the `typeorm` import at the top of the spec. Run `npx jest src/products` → the new tests FAIL.

- [ ] **Step 3: Implement in `products.service.ts`**

1. Imports: add `ConflictException` (from `@nestjs/common`), `Raw` (from `typeorm`), `import { isUniqueViolation } from '../database/uniqueViolation';`, `import { barcodesOf } from './barcodesOf';`.
2. `findActiveByBranch`: add `additionalBarcodes: true` to `select`.
3. `findByBarcodeInBranch`: replace the `find` call and the filter with:

```ts
    const scope = { isActive: true, provider: providerWhere };
    // Only rows with at least one barcode can match — a real cut, since most
    // rows have none.
    const candidates = await this.productsRepo.find({
      where: [
        { ...scope, barcode: Not(IsNull()) },
        { ...scope, additionalBarcodes: Raw((column) => `cardinality(${column}) > 0`) },
      ],
      select: { id: true, providerId: true, name: true, barcode: true, additionalBarcodes: true },
      take: MAX_PRODUCTS_PER_QUERY,
    });
    const scannedKey = gtinMatchKey(barcode);
    return candidates.filter((product) =>
      barcodesOf(product).some((stored) =>
        // Mirrors matchesBarcode in mobile/src/barcode/matchesBarcode.ts: a
        // valid GTIN compares on its normalised key (so symbology prefixes and
        // stripped leading zeros still match); anything else falls back to
        // exact equality for suppliers' own non-GTIN codes.
        scannedKey !== null ? gtinMatchKey(stored) === scannedKey : stored === barcode,
      ),
    );
```

Update the method's doc comment: "rows that have *a* barcode" → "rows that have at least one barcode (main or additional)".

4. Add a private helper and use it in `create` and `update`:

```ts
  /** The partial unique index on (provider, normalized name) for active products. */
  private async saveRefusingDuplicateName(product: Product): Promise<Product> {
    try {
      return await this.productsRepo.save(product);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'A product with this name already exists for this provider',
        );
      }
      throw error;
    }
  }
```

In `create`, replace `return this.productsRepo.save(entity);` with `return this.saveRefusingDuplicateName(entity);`. In `update`, replace `return this.productsRepo.save(product);` with `return this.saveRefusingDuplicateName(product);`. (Do not touch `updateNote` — it can't change the name.)

Run `npx jest src/products` → PASS.

- [ ] **Step 4: E2E for the 409 and branch summary**

Create `backend/test/duplicate-product-names.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, seed, Seeded } from './helpers';

describe('duplicate product names (e2e)', () => {
  let app: INestApplication;
  let fixtures: Seeded;

  beforeAll(async () => {
    app = await createTestApp();
    fixtures = await seed(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const create = (providerId: string, name: string) =>
    request(app.getHttpServer())
      .post(`/providers/${providerId}/products`)
      .set({ Authorization: `Bearer ${fixtures.adminToken}` })
      .send({ name, unitType: 'קרטון' });

  it('refuses a second product with the same name under the same supplier', async () => {
    await create(fixtures.providerIds[1], 'סלרי ראש').expect(201);
    const response = await create(fixtures.providerIds[1], '  סלרי   ראש ').expect(409);
    expect(response.body.message).toBe('A product with this name already exists for this provider');
  });

  it('allows the same name under a different supplier', async () => {
    await create(fixtures.providerIds[2], 'סלרי ראש').expect(201);
  });

  it('refuses renaming a product to a name already taken under its supplier', async () => {
    const other = await create(fixtures.providerIds[1], 'גזר').expect(201);
    await request(app.getHttpServer())
      .patch(`/products/${other.body.id}`)
      .set({ Authorization: `Bearer ${fixtures.adminToken}` })
      .send({ name: 'סלרי ראש' })
      .expect(409);
  });

  it('allows reusing the name of a hidden product', async () => {
    const hidden = await create(fixtures.providerIds[3], 'חסה').expect(201);
    await request(app.getHttpServer())
      .patch(`/products/${hidden.body.id}`)
      .set({ Authorization: `Bearer ${fixtures.adminToken}` })
      .send({ isActive: false })
      .expect(200);
    await create(fixtures.providerIds[3], 'חסה').expect(201);
  });

  it('returns additionalBarcodes in the branch-wide product list', async () => {
    const list = await request(app.getHttpServer())
      .get(`/branches/${fixtures.branchId}/products`)
      .set({ Authorization: `Bearer ${fixtures.adminToken}` })
      .expect(200);
    expect(list.body.length).toBeGreaterThan(0);
    expect(Array.isArray(list.body[0].additionalBarcodes)).toBe(true);
  });
});
```

Run `npm run test:e2e -- duplicate-product-names` → PASS.

- [ ] **Step 5: Import script merges same-name rows**

In `backend/scripts/import-friend-data.ts`, replace the product-insert loop (the `for (let i = 0; i < products.length; i += BATCH_SIZE)` block and its counters) with a version that first groups rows, then inserts one product per group:

```ts
    // The item file has one row per barcode, so one product can appear on
    // several rows. Group them by supplier + normalized name (same rule as
    // the MergeDuplicateProducts migration) into one product per group.
    const normalize = (name: string) => name.replace(/\s+/g, ' ').trim().toLowerCase();
    const groups = new Map<string, { providerId: string; name: string; barcodes: string[] }>();
    let productsSkipped = 0;
    for (const row of products) {
      const providerId = supplierCodeToProviderId.get(row['קוד ספק ראשי']?.trim());
      const name = row['תאור פריט']?.trim().replace(/\s+/g, ' ');
      if (!providerId || !name) {
        productsSkipped++;
        continue;
      }
      const key = `${providerId}|${normalize(name)}`;
      const group = groups.get(key) ?? { providerId, name, barcodes: [] };
      const barcode = row['ברקוד']?.trim();
      if (barcode && !group.barcodes.includes(barcode)) group.barcodes.push(barcode);
      groups.set(key, group);
    }

    const grouped = [...groups.values()];
    for (let i = 0; i < grouped.length; i += BATCH_SIZE) {
      const batch = grouped.slice(i, i + BATCH_SIZE);
      const values: string[] = [];
      const params: unknown[] = [];
      batch.forEach((group, index) => {
        const base = index * 5;
        values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
        const [first = null, ...rest] = group.barcodes;
        params.push(group.providerId, group.name, DEFAULT_UNIT_TYPE, first, rest);
      });
      await client.query(
        `INSERT INTO products ("providerId", name, "unitType", barcode, "additionalBarcodes") VALUES ${values.join(', ')}`,
        params,
      );
    }
    console.log(
      `Created ${grouped.length} products from ${products.length - productsSkipped} rows, skipped ${productsSkipped} (missing supplier match or name).`,
    );
```

(Keep the surrounding transaction, `importDepartments`, and COMMIT exactly as they are. There is no test harness for this script; verify with `npx tsc --noEmit -p .` from backend/.)

- [ ] **Step 6: Report script checks every barcode**

In `backend/scripts/report-unscannable-products.ts`, change the duplicate query to:

```sql
      SELECT code AS barcode, string_agg(pr.name || ' / ' || p.name, '  |  ') AS names
      FROM products p
      JOIN providers pr ON pr.id = p."providerId"
      CROSS JOIN LATERAL unnest(array_remove(array[p.barcode] || p."additionalBarcodes", NULL)) AS code
      WHERE p."isActive" = true
      GROUP BY code
      HAVING count(*) > 1
```

- [ ] **Step 7: Run everything, format, commit**

Run `npm test`, `npm run test:e2e`, `npx tsc --noEmit -p .` → all PASS/clean.

```bash
npx eslint --fix src/products/barcodesOf.ts src/products/barcodesOf.spec.ts src/products/products.service.ts src/products/products.service.spec.ts test/duplicate-product-names.e2e-spec.ts scripts/import-friend-data.ts scripts/report-unscannable-products.ts
git add src/products/barcodesOf.ts src/products/barcodesOf.spec.ts src/products/products.service.ts src/products/products.service.spec.ts test/duplicate-product-names.e2e-spec.ts scripts/import-friend-data.ts scripts/report-unscannable-products.ts
git commit -m "feat(products): match additional barcodes and refuse duplicate product names"
```

---

### Task 3: Mobile — match additional barcodes

**Files:**
- Modify: `mobile/src/api/types.ts`
- Create: `mobile/src/barcode/productBarcodes.ts` (+ `productBarcodes.test.ts`)
- Modify: `mobile/app/(app)/providers/[providerId]/order.tsx` (`handleBarcodeScanned`)
- Modify: `mobile/src/providers/resolveBarcodeMatches.ts` (+ test)
- Modify: `mobile/src/providers/buildProviderSearchResults.ts` (+ test)
- Test: `mobile/app/(app)/providers/[providerId]/order.test.tsx`

**Interfaces:**
- Consumes: API now returns `additionalBarcodes: string[]` on products and branch summaries (Tasks 1–2).
- Produces: `Product.additionalBarcodes?: string[]`; `ProviderProductSummary` includes `additionalBarcodes`; `productBarcodes(product: Pick<Product, 'barcode' | 'additionalBarcodes'>): string[]`; `productMatchesBarcode(product, scanned: string): boolean`.

- [ ] **Step 1: Types**

In `mobile/src/api/types.ts`, inside `interface Product` after `barcode?: string;`:

```ts
  // Other barcodes this product answers to (merged duplicates). Absent from
  // responses of servers older than the merge.
  additionalBarcodes?: string[];
```

and change `ProviderProductSummary` to `Pick<Product, 'id' | 'name' | 'providerId' | 'barcode' | 'additionalBarcodes'>`.

- [ ] **Step 2: Helper + failing tests**

`mobile/src/barcode/productBarcodes.test.ts`:

```ts
import { productBarcodes, productMatchesBarcode } from './productBarcodes';

describe('productBarcodes', () => {
  it('lists the main barcode first, then the additional ones, skipping blanks', () => {
    expect(productBarcodes({ barcode: '1', additionalBarcodes: ['2', ''] })).toEqual(['1', '2']);
    expect(productBarcodes({ barcode: undefined, additionalBarcodes: undefined })).toEqual([]);
  });
});

describe('productMatchesBarcode', () => {
  const product = { barcode: '7290000000534', additionalBarcodes: ['7290003706020', '27'] };

  it('matches the main barcode', () => {
    expect(productMatchesBarcode(product, '7290000000534')).toBe(true);
  });

  it('matches an additional GTIN, including with a scanner prefix', () => {
    expect(productMatchesBarcode(product, '7290003706020')).toBe(true);
    expect(productMatchesBarcode(product, ']E07290003706020')).toBe(true);
  });

  it('matches a short supplier code exactly, not by prefix', () => {
    expect(productMatchesBarcode(product, '27')).toBe(true);
    expect(productMatchesBarcode(product, '2')).toBe(false);
  });

  it('matches nothing for a product with no barcodes', () => {
    expect(productMatchesBarcode({ barcode: undefined }, '27')).toBe(false);
  });
});
```

(Check `mobile/src/barcode/matchesBarcode.test.ts` for how scanner prefixes are written in existing tests and use the same form if `]E0` is not what `gtinMatchKey` strips.)

Run `npx jest src/barcode/productBarcodes.test.ts` → FAIL.

`mobile/src/barcode/productBarcodes.ts`:

```ts
import type { Product } from '../api/types';
import { matchesBarcode } from './matchesBarcode';

type WithBarcodes = Pick<Product, 'barcode' | 'additionalBarcodes'>;

/** Every barcode a product answers to: the main one first, then the rest. */
export function productBarcodes(product: WithBarcodes): string[] {
  return [product.barcode, ...(product.additionalBarcodes ?? [])].filter(
    (code): code is string => !!code,
  );
}

export function productMatchesBarcode(product: WithBarcodes, scanned: string): boolean {
  return productBarcodes(product).some((stored) => matchesBarcode(stored, scanned));
}
```

Run → PASS.

- [ ] **Step 3: Use it in the three matching sites**

1. `order.tsx` `handleBarcodeScanned`: replace `(product) => product.barcode && matchesBarcode(product.barcode, barcode)` with `(product) => productMatchesBarcode(product, barcode)`. Replace the `matchesBarcode` import with `import { productMatchesBarcode } from '../../../../src/barcode/productBarcodes';` (remove the old import if now unused).
2. `resolveBarcodeMatches.ts`: replace `if (!product.barcode || !matchesBarcode(product.barcode, barcode)) continue;` with `if (!productMatchesBarcode(product, barcode)) continue;` and swap the import accordingly.
3. `buildProviderSearchResults.ts`: the local `matchesBarcode(product, query)` becomes:

```ts
function matchesBarcode(product: ProviderProductSummary, query: string): boolean {
  const trimmed = query.trim();
  if (!DIGITS_ONLY.test(trimmed)) return false;
  return productBarcodes(product).some((code) => code.startsWith(trimmed));
}
```

with `import { productBarcodes } from '../barcode/productBarcodes';`.

- [ ] **Step 4: Tests at the call sites**

- `resolveBarcodeMatches.test.ts`: add `it('matches a product by one of its additional barcodes', ...)` — a product `{ id, providerId, name, barcode: '7290000000534', additionalBarcodes: ['7290003706020'] }` resolves for scan `'7290003706020'`. Follow the file's existing fixture style.
- `buildProviderSearchResults.test.ts`: add a test that a digits-only query matching the *prefix of an additional barcode* puts that product in `matchingProducts` for its provider. Follow existing style.
- `order.test.tsx`: add inside a new `describe('scanning by an additional barcode', ...)`: with `fetchProductsForProvider` resolving `[{ ...CARTON_PRODUCT, barcode: '7290000000534', additionalBarcodes: ['7290003706020'] }, WEIGHT_PRODUCT]`, simulate the scan the same way existing scan tests in this file do (search the file for `BarcodeScannerModal` / `onScanned`; if no scan test exists, mock `../../../../src/barcode/BarcodeScannerModal` to render a button with testID `fake-scan` that calls `onScanned('7290003706020')`, and press it). Assert the "not found" alert text `לא נמצא מוצר עם ברקוד` does NOT appear and the carton row is highlighted / scrolled-to target (assert whatever observable the existing code exposes — e.g. no alert shown). Keep it minimal.

- [ ] **Step 5: Run, commit**

Run full `npx jest` and `npx tsc --noEmit` → PASS / clean.

```bash
git add src/api/types.ts src/barcode/productBarcodes.ts src/barcode/productBarcodes.test.ts "app/(app)/providers/[providerId]/order.tsx" "app/(app)/providers/[providerId]/order.test.tsx" src/providers/resolveBarcodeMatches.ts src/providers/resolveBarcodeMatches.test.ts src/providers/buildProviderSearchResults.ts src/providers/buildProviderSearchResults.test.ts
git commit -m "feat(mobile): find products by any of their barcodes"
```

---

### Task 4: Mobile — duplicate-name message, additional barcodes on edit, release note

**Files:**
- Modify: `mobile/app/(app)/admin/products/new.tsx`
- Modify: `mobile/src/order/AddUnknownProductModal.tsx`
- Modify: `mobile/app/(app)/products/[productId]/edit.tsx`
- Modify: `mobile/app/(app)/providers/[providerId]/order.tsx` (route params to edit)
- Tests: alongside each (create `*.test.tsx` files where none exist, following `order.test.tsx` mocking style)
- Modify: `docs/release-notes/draft.md`

**Interfaces:**
- Consumes: backend 409 on duplicate name (Task 2); `Product.additionalBarcodes` (Task 3); existing `isConflictError` from `src/api/errors.ts`.

- [ ] **Step 1: 409 message in the three create/rename flows**

In each catch block, show the duplicate-name message on a 409 and keep the existing generic message otherwise:

`admin/products/new.tsx` (existing `catch {` around line 146):

```tsx
    } catch (err) {
      // Previously unhandled: a failed create left the screen silently doing
      // nothing, which on a slow connection is indistinguishable from the app
      // having ignored the tap.
      showAlert({
        title: 'שגיאה',
        message: isConflictError(err)
          ? 'מוצר בשם הזה כבר קיים אצל הספק.'
          : 'יצירת המוצר נכשלה. יש לנסות שוב.',
      });
    }
```

`AddUnknownProductModal.tsx` (`handleSubmit` catch): same shape, generic text stays `הוספת המוצר נכשלה. יש לנסות שוב.`.

`products/[productId]/edit.tsx` (`handleSubmit` catch): same shape, generic text stays `שמירת המוצר נכשלה. יש לנסות שוב.`.

Import `isConflictError` from `src/api/errors` with the correct relative path in each file.

- [ ] **Step 2: Additional barcodes on the edit screen**

- `order.tsx`: in the `router.push` to `/products/[productId]/edit`, add param `additionalBarcodes: (product.additionalBarcodes ?? []).join(',')`.
- `edit.tsx`: add `additionalBarcodes?: string` to the `useLocalSearchParams` type, then under the barcode `TextInput`:

```tsx
      {additionalBarcodes ? (
        <Text style={styles.additionalBarcodes}>
          {`ברקודים נוספים: ${additionalBarcodes.split(',').join(', ')}`}
        </Text>
      ) : null}
```

with style `additionalBarcodes: { fontSize: 13, color: '#666', textAlign: 'right' }`. Read-only; the save payload is unchanged.

- [ ] **Step 3: Tests**

For each of the three flows, a test that a rejected create/update with an axios-style 409 error (`Object.assign(new Error('conflict'), { isAxiosError: true, response: { status: 409 } })` — check `src/api/errors.ts`'s `axios.isAxiosError` accepts it; if not, construct an `AxiosError` with `response: { status: 409 }`) shows `מוצר בשם הזה כבר קיים אצל הספק.`, and that a non-409 error still shows the generic message. Mock `expo-router`, `src/api/products`, auth (`useRequireAdmin` → no-op) the way `order.test.tsx` does; wrap in `AlertProvider` and `QueryClientProvider`. For `edit.tsx`, also test that `additionalBarcodes: '7290003706020,27'` in route params renders `ברקודים נוספים: 7290003706020, 27`, and that it renders nothing when the param is empty.

If a screen's dependencies make a render test impractical (e.g. `new.tsx` pulls in hard-to-mock modules), report it as a concern rather than skipping silently.

- [ ] **Step 4: Release note**

Append to `docs/release-notes/draft.md` after the existing bullets:

```markdown
- מוצרים שהופיעו כמה פעמים אצל אותו ספק אוחדו למוצר אחד. סריקה של כל אחד מהברקודים שלהם עדיין עובדת.
```

- [ ] **Step 5: Run, commit**

Run full `npx jest` and `npx tsc --noEmit`.

```bash
git add "app/(app)/admin/products/new.tsx" src/order/AddUnknownProductModal.tsx "app/(app)/products/[productId]/edit.tsx" "app/(app)/providers/[providerId]/order.tsx" ../docs/release-notes/draft.md <the new/changed test files>
git commit -m "feat(mobile): explain duplicate product names and show additional barcodes"
```

---

## After all tasks (Opus, not the implementer)

- Whole-branch review against the spec.
- **Local preview:** run `npm run migration:run` in `backend/` against the local copy; report groups merged / products hidden / order lines repointed (from the migration's log line) plus 10 sample groups (survivor name, main barcode, additional barcodes). Confirm the order screen in the local web app shows one "סלרי ראש" under י.ל.ת, and that scanning one of the merged barcodes finds it.
- Hand back to Dvir with the preview before any push.
