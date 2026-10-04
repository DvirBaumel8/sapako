# Product Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone with access to a supplier attach a short, persistent, internal-only note to each of its products, visible and editable on the order screen.

**Architecture:** A nullable `note` column on `products`, written through a new provider-scoped endpoint (`PATCH /providers/:providerId/products/:productId/note`) that any role with provider access may call. The existing admin product-edit endpoint is untouched. On mobile, the order screen's product card shows the note and an icon that opens a new `ProductNoteDialog`; the list's fixed-row-height layout becomes a precomputed per-row table so scroll-to-row stays exact.

**Tech Stack:** NestJS + TypeORM + Postgres (backend, Jest unit + supertest e2e); Expo / React Native + React Query (mobile, Jest + @testing-library/react-native).

**Spec:** `docs/superpowers/specs/2026-10-04-product-notes-design.md` — read it first.

## Global Constraints

- Max note length: **200** characters (DB `VARCHAR(200)`, DTO `@MaxLength(200)`, input `maxLength={200}`).
- Note is trimmed server-side; empty/whitespace-only → stored as `NULL`.
- The note must **never** appear in the WhatsApp message (`mobile/src/order/buildOrderMessage.ts`) or the order email. Do not touch either.
- `PATCH /products/:id` (admin) and `UpdateProductDto` must **not** change.
- All user-facing copy is Hebrew, exactly as written in this plan.
- Work locally on `main`. **Commit after each task, never push** — pushing to `main` deploys to production. Dvir pushes after final review.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
  ```
- Backend commands run from `backend/`; mobile commands from `mobile/`. A local Postgres is running on `localhost:5432`, so `npm run test:e2e` works without setup.

## Review Focus

1. **Cross-provider write:** a user with access to provider A sends A's id in the URL but a product id belonging to provider B → must be 404, product untouched. (Task 1 unit test + Task 2 e2e test.)
2. **Malformed product id** in the URL (not a UUID) → must be 400, not a Postgres 500. (Task 2 e2e test, via `ParseUUIDPipe`.)
3. **Empty save on a product with no note** → closes the dialog with no request and no "deleted" toast. (Task 4 test.)
4. **Failed save** → dialog stays open, typed text intact, error shown; a double-tap on Save while a request is in flight must not send twice. (Task 4 tests.)
5. **Scroll-to-row after a barcode scan with noted products above the target** → offsets must include the extra note-line height, in both the flat (search) list and the sectioned list. (Task 3 tests.)

---

### Task 1: Backend — `note` column and `ProductsService.updateNote`

**Files:**
- Create: `backend/src/database/migrations/1700000000018-AddProductNote.ts`
- Modify: `backend/src/database/data-source.ts` (import + append to `migrations` array)
- Modify: `backend/src/products/product.entity.ts`
- Modify: `backend/src/products/products.service.ts`
- Test: `backend/src/products/products.service.spec.ts`

**Interfaces:**
- Produces: `Product.note?: string | null`; `ProductsService.updateNote(providerId: string, productId: string, note: string | null): Promise<Product>` — throws `NotFoundException` when no product has that id **and** providerId.

- [ ] **Step 1: Write the failing service tests**

Append inside the top-level `describe('ProductsService', ...)` block in `backend/src/products/products.service.spec.ts` (the existing `mockRepo` already has `findOneBy` and `save`):

```ts
  describe('updateNote', () => {
    it('saves the trimmed note on a product that belongs to the provider', async () => {
      mockRepo.findOneBy.mockResolvedValue({ id: 'pr1', providerId: 'p1', note: null });
      mockRepo.save.mockImplementation((data) => Promise.resolve(data));

      const result = await service.updateNote('p1', 'pr1', '  לבקש תאריך ארוך  ');

      expect(mockRepo.findOneBy).toHaveBeenCalledWith({ id: 'pr1', providerId: 'p1' });
      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'pr1', note: 'לבקש תאריך ארוך' }),
      );
      expect(result.note).toBe('לבקש תאריך ארוך');
    });

    it('stores a whitespace-only note as null', async () => {
      mockRepo.findOneBy.mockResolvedValue({ id: 'pr1', providerId: 'p1', note: 'ישן' });
      mockRepo.save.mockImplementation((data) => Promise.resolve(data));

      const result = await service.updateNote('p1', 'pr1', '   ');

      expect(result.note).toBeNull();
    });

    it('clears the note when given null', async () => {
      mockRepo.findOneBy.mockResolvedValue({ id: 'pr1', providerId: 'p1', note: 'ישן' });
      mockRepo.save.mockImplementation((data) => Promise.resolve(data));

      const result = await service.updateNote('p1', 'pr1', null);

      expect(result.note).toBeNull();
    });

    it('rejects with NotFoundException when the product is not under that provider, without saving', async () => {
      mockRepo.findOneBy.mockResolvedValue(null);

      await expect(service.updateNote('p1', 'pr-of-p2', 'x')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockRepo.save).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/products/products.service.spec.ts -t updateNote`
Expected: FAIL — `service.updateNote is not a function`.

- [ ] **Step 3: Add the migration**

Create `backend/src/database/migrations/1700000000018-AddProductNote.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductNote1700000000018 implements MigrationInterface {
  name = 'AddProductNote1700000000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Nullable with no backfill: "no note" is the normal state for every
    // existing product. The length cap mirrors the DTO so a write that
    // bypassed validation still could not store more.
    await queryRunner.query(
      `ALTER TABLE products ADD COLUMN note VARCHAR(200) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE products DROP COLUMN note`);
  }
}
```

In `backend/src/database/data-source.ts`, add after the `AddOrdersBranchCreatedAtIndex1700000000017` import:

```ts
import { AddProductNote1700000000018 } from './migrations/1700000000018-AddProductNote';
```

and append `AddProductNote1700000000018,` as the last entry of the `migrations` array.

- [ ] **Step 4: Add the entity column**

In `backend/src/products/product.entity.ts`, after the `category` relation and before `isActive`:

```ts
  // Internal reminder for staff ordering this product. Never sent to the
  // supplier — it is not part of the WhatsApp message or the order email.
  @Column({ type: 'varchar', length: 200, nullable: true })
  note?: string | null;
```

- [ ] **Step 5: Implement `updateNote`**

In `backend/src/products/products.service.ts`, add after `create(...)`:

```ts
  /**
   * Looked up by provider as well as id: the route is authorised per
   * provider, so without this a user with access to one supplier could edit
   * another supplier's product by pairing its id with their own provider's.
   */
  async updateNote(
    providerId: string,
    productId: string,
    note: string | null,
  ): Promise<Product> {
    const product = await this.productsRepo.findOneBy({ id: productId, providerId });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const trimmed = note?.trim() ?? '';
    product.note = trimmed.length > 0 ? trimmed : null;
    return this.productsRepo.save(product);
  }
```

(`NotFoundException` is already imported in this file.)

- [ ] **Step 6: Run the tests**

Run: `npx jest src/products/products.service.spec.ts`
Expected: PASS (all, including the existing ones).

- [ ] **Step 7: Lint and commit**

```bash
npm run lint
git add src/database/migrations/1700000000018-AddProductNote.ts src/database/data-source.ts src/products/product.entity.ts src/products/products.service.ts src/products/products.service.spec.ts
git commit -m "feat(products): add note column and ProductsService.updateNote"
```

---

### Task 2: Backend — `PATCH /providers/:providerId/products/:productId/note`

**Files:**
- Create: `backend/src/products/dto/update-product-note.dto.ts`
- Modify: `backend/src/products/products.controller.ts` (`ProviderProductsController`)
- Test: `backend/src/products/products.controller.spec.ts`
- Create test: `backend/test/product-notes.e2e-spec.ts`

**Interfaces:**
- Consumes: `ProductsService.updateNote(providerId, productId, note)` from Task 1.
- Produces: HTTP `PATCH /providers/:providerId/products/:productId/note`, body `{ "note": string | null }`, returns the updated `Product` JSON (200). Any role with provider access. 400 for invalid body or non-UUID productId, 403 without provider access, 404 if the product isn't under that provider.

- [ ] **Step 1: Write the failing controller/DTO unit tests**

In `backend/src/products/products.controller.spec.ts`:

Add import at the top with the other DTO imports:
```ts
import { UpdateProductNoteDto } from './dto/update-product-note.dto';
```

In the `ProviderProductsController` describe, add `updateNote: jest.fn(),` to `mockProductsService`, then add inside its `describe('guards', ...)`:

```ts
    it('leaves editing a note open to any authenticated role with provider access', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        ProviderProductsController.prototype.updateNote,
      );
      expect(roles).toBeUndefined();
    });
```

and after its `describe('create', ...)`:

```ts
  describe('updateNote', () => {
    it('delegates to the service with the provider id, product id and note', async () => {
      const updated = { id: 'prod1', note: 'לבקש תאריך ארוך' };
      mockProductsService.updateNote.mockResolvedValue(updated);

      const result = await controller.updateNote('p1', 'prod1', {
        note: 'לבקש תאריך ארוך',
      });

      expect(mockProductsService.updateNote).toHaveBeenCalledWith(
        'p1',
        'prod1',
        'לבקש תאריך ארוך',
      );
      expect(result).toBe(updated);
    });
  });
```

At the end of the file add:

```ts
describe('UpdateProductNoteDto', () => {
  it('accepts a note of exactly 200 characters', async () => {
    const dto = plainToInstance(UpdateProductNoteDto, { note: 'א'.repeat(200) });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a note longer than 200 characters', async () => {
    const dto = plainToInstance(UpdateProductNoteDto, { note: 'א'.repeat(201) });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('accepts null, which clears the note', async () => {
    const dto = plainToInstance(UpdateProductNoteDto, { note: null });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a body with no note field at all', async () => {
    const dto = plainToInstance(UpdateProductNoteDto, {});
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects a non-string note', async () => {
    const dto = plainToInstance(UpdateProductNoteDto, { note: 5 });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/products/products.controller.spec.ts`
Expected: FAIL — cannot find module `./dto/update-product-note.dto`.

- [ ] **Step 3: Create the DTO**

`backend/src/products/dto/update-product-note.dto.ts`:

```ts
import { IsDefined, IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpdateProductNoteDto {
  // Required, but nullable: null clears the note. A missing field is a 400
  // rather than a silent no-op, so a client bug can't look like a save.
  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200)
  note: string | null;
}
```

(`@ValidateIf` returning false skips every other validator on the property, `@IsDefined` included — so `null` passes, while a missing field fails `@IsDefined`.)

- [ ] **Step 4: Add the route**

In `backend/src/products/products.controller.ts`:

- Add `ParseUUIDPipe` to the `@nestjs/common` import list.
- Add `import { UpdateProductNoteDto } from './dto/update-product-note.dto';`
- Inside `ProviderProductsController`, after `create(...)`:

```ts
  // No @Roles: anyone who can see this provider's products can keep their
  // notes. Deliberately a separate route from the admin PATCH /products/:id,
  // so this grants staff the note and nothing else on the product.
  @Patch(':productId/note')
  updateNote(
    @Param('providerId') providerId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: UpdateProductNoteDto,
  ): Promise<Product> {
    return this.productsService.updateNote(providerId, productId, dto.note);
  }
```

- [ ] **Step 5: Run unit tests**

Run: `npx jest src/products/products.controller.spec.ts`
Expected: PASS.

- [ ] **Step 6: Write the e2e test**

Create `backend/test/product-notes.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, seed, Seeded } from './helpers';

describe('product notes (e2e)', () => {
  let app: INestApplication;
  let fixtures: Seeded;

  beforeAll(async () => {
    app = await createTestApp();
    fixtures = await seed(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const noteUrl = (providerId: string, productId: string) =>
    `/providers/${providerId}/products/${productId}/note`;
  const grantProvider = (providerId: string) =>
    request(app.getHttpServer())
      .put(`/users/${fixtures.staffUserId}/providers/${providerId}/access`)
      .set(auth(fixtures.adminToken))
      .send({ granted: true })
      .expect(200);

  it('refuses a staff user without access to the provider', async () => {
    await request(app.getHttpServer())
      .patch(noteUrl(fixtures.providerIds[0], fixtures.productId))
      .set(auth(fixtures.staffToken))
      .send({ note: 'x' })
      .expect(403);
  });

  describe('with access to the provider', () => {
    beforeAll(async () => {
      await grantProvider(fixtures.providerIds[0]);
    });

    it('lets staff set a note, and the product list returns it', async () => {
      const response = await request(app.getHttpServer())
        .patch(noteUrl(fixtures.providerIds[0], fixtures.productId))
        .set(auth(fixtures.staffToken))
        .send({ note: '  לבקש תאריך ארוך  ' })
        .expect(200);
      expect(response.body.note).toBe('לבקש תאריך ארוך');

      const list = await request(app.getHttpServer())
        .get(`/providers/${fixtures.providerIds[0]}/products`)
        .set(auth(fixtures.staffToken))
        .expect(200);
      const product = list.body.find((p: { id: string }) => p.id === fixtures.productId);
      expect(product.note).toBe('לבקש תאריך ארוך');
    });

    it('clears the note when sent whitespace only', async () => {
      const response = await request(app.getHttpServer())
        .patch(noteUrl(fixtures.providerIds[0], fixtures.productId))
        .set(auth(fixtures.staffToken))
        .send({ note: '   ' })
        .expect(200);
      expect(response.body.note).toBeNull();
    });

    it('clears the note when sent null', async () => {
      const response = await request(app.getHttpServer())
        .patch(noteUrl(fixtures.providerIds[0], fixtures.productId))
        .set(auth(fixtures.staffToken))
        .send({ note: null })
        .expect(200);
      expect(response.body.note).toBeNull();
    });

    it('rejects a note over 200 characters with 400', async () => {
      await request(app.getHttpServer())
        .patch(noteUrl(fixtures.providerIds[0], fixtures.productId))
        .set(auth(fixtures.staffToken))
        .send({ note: 'א'.repeat(201) })
        .expect(400);
    });

    it('rejects a product id that is not a UUID with 400', async () => {
      await request(app.getHttpServer())
        .patch(noteUrl(fixtures.providerIds[0], 'not-a-uuid'))
        .set(auth(fixtures.staffToken))
        .send({ note: 'x' })
        .expect(400);
    });

    it('still refuses staff the admin product edit', async () => {
      await request(app.getHttpServer())
        .patch(`/products/${fixtures.productId}`)
        .set(auth(fixtures.staffToken))
        .send({ name: 'שם אחר' })
        .expect(403);
    });
  });

  it('returns 404 when the product belongs to a different provider than the URL', async () => {
    // Admin has access to every provider, so the guard passes and only the
    // provider/product pairing check can stop this.
    await request(app.getHttpServer())
      .patch(noteUrl(fixtures.providerIds[1], fixtures.productId))
      .set(auth(fixtures.adminToken))
      .send({ note: 'x' })
      .expect(404);
  });
});
```

- [ ] **Step 7: Run e2e**

Run: `npm run test:e2e -- product-notes`
Expected: PASS. Then run the whole e2e suite once: `npm run test:e2e` — expected PASS (confirms the migration applies cleanly from scratch).

- [ ] **Step 8: Lint and commit**

```bash
npm run lint && npm test
git add src/products/dto/update-product-note.dto.ts src/products/products.controller.ts src/products/products.controller.spec.ts test/product-notes.e2e-spec.ts
git commit -m "feat(products): let anyone with provider access edit a product's note"
```

---

### Task 3: Mobile — API client, `Product.note`, and per-row list layout

**Files:**
- Modify: `mobile/src/api/types.ts` (`Product`)
- Modify: `mobile/src/api/products.ts`
- Create: `mobile/src/products/productRowLayout.ts`
- Test: `mobile/src/products/productRowLayout.test.ts`

**Interfaces:**
- Produces:
  - `Product.note?: string | null`
  - `updateProductNote(providerId: string, productId: string, note: string | null): Promise<Product>`
  - From `productRowLayout.ts`: `ROW_HEIGHT = 104`, `NOTE_LINE_HEIGHT = 26`, `SECTION_HEADER_HEIGHT = 44`, `hasNote(product: Pick<Product, 'note'>): boolean`, `rowHeightFor(product: Pick<Product, 'note'>): number`, `interface ItemLayoutTable { lengths: number[]; offsets: number[]; total: number }`, `buildFlatLayout(products: readonly Pick<Product, 'note'>[]): ItemLayoutTable`, `buildSectionLayout(sections: readonly { data: readonly Pick<Product, 'note'>[] }[]): ItemLayoutTable`, `layoutAt(table: ItemLayoutTable, index: number): { length: number; offset: number; index: number }`.

- [ ] **Step 1: Write the failing layout tests**

Create `mobile/src/products/productRowLayout.test.ts`:

```ts
import {
  ROW_HEIGHT,
  NOTE_LINE_HEIGHT,
  SECTION_HEADER_HEIGHT,
  hasNote,
  rowHeightFor,
  buildFlatLayout,
  buildSectionLayout,
  layoutAt,
} from './productRowLayout';

const plain = { note: null };
const noted = { note: 'לבקש תאריך ארוך' };

describe('hasNote', () => {
  it('is false for null, undefined, empty and whitespace-only notes', () => {
    expect(hasNote({ note: null })).toBe(false);
    expect(hasNote({})).toBe(false);
    expect(hasNote({ note: '' })).toBe(false);
    expect(hasNote({ note: '   ' })).toBe(false);
  });

  it('is true for a real note', () => {
    expect(hasNote(noted)).toBe(true);
  });
});

describe('rowHeightFor', () => {
  it('adds the note line only for products with a note', () => {
    expect(rowHeightFor(plain)).toBe(ROW_HEIGHT);
    expect(rowHeightFor(noted)).toBe(ROW_HEIGHT + NOTE_LINE_HEIGHT);
  });
});

describe('buildFlatLayout', () => {
  it('matches the old fixed-height formula when no product has a note', () => {
    const table = buildFlatLayout([plain, plain, plain]);
    expect(layoutAt(table, 2)).toEqual({ length: ROW_HEIGHT, offset: ROW_HEIGHT * 2, index: 2 });
  });

  it('pushes later rows down by the note line of every noted row above them', () => {
    const table = buildFlatLayout([noted, plain, noted, plain]);
    expect(layoutAt(table, 3)).toEqual({
      length: ROW_HEIGHT,
      offset: ROW_HEIGHT * 3 + NOTE_LINE_HEIGHT * 2,
      index: 3,
    });
    expect(layoutAt(table, 2).length).toBe(ROW_HEIGHT + NOTE_LINE_HEIGHT);
  });
});

describe('buildSectionLayout', () => {
  it('matches the old formula (header then rows, per section) with no notes', () => {
    const table = buildSectionLayout([{ data: [plain, plain] }, { data: [plain] }]);
    // Flattened: [h0, r, r, h1, r]
    expect(layoutAt(table, 0)).toEqual({ length: SECTION_HEADER_HEIGHT, offset: 0, index: 0 });
    expect(layoutAt(table, 2)).toEqual({
      length: ROW_HEIGHT,
      offset: SECTION_HEADER_HEIGHT + ROW_HEIGHT,
      index: 2,
    });
    expect(layoutAt(table, 4)).toEqual({
      length: ROW_HEIGHT,
      offset: SECTION_HEADER_HEIGHT * 2 + ROW_HEIGHT * 2,
      index: 4,
    });
  });

  it('includes note lines from earlier sections in later offsets', () => {
    const table = buildSectionLayout([{ data: [noted] }, { data: [plain] }]);
    // Flattened: [h0, noted, h1, plain]
    expect(layoutAt(table, 3).offset).toBe(
      SECTION_HEADER_HEIGHT * 2 + ROW_HEIGHT + NOTE_LINE_HEIGHT,
    );
  });

  it('treats a collapsed (empty) section as just its header', () => {
    const table = buildSectionLayout([{ data: [] }, { data: [plain] }]);
    expect(layoutAt(table, 2)).toEqual({
      length: ROW_HEIGHT,
      offset: SECTION_HEADER_HEIGHT * 2,
      index: 2,
    });
  });
});

describe('layoutAt', () => {
  it('returns a row-height slot at the end for an index past the table, like the old fallback', () => {
    const table = buildSectionLayout([{ data: [plain] }]);
    expect(layoutAt(table, 5)).toEqual({
      length: ROW_HEIGHT,
      offset: SECTION_HEADER_HEIGHT + ROW_HEIGHT,
      index: 5,
    });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/products/productRowLayout.test.ts`
Expected: FAIL — cannot find module `./productRowLayout`.

- [ ] **Step 3: Implement `productRowLayout.ts`**

```ts
import type { Product } from '../api/types';

// Product rows have a known height, measured from the running app. Declaring
// it lets the list jump straight to any row: without it, scrollToIndex cannot
// reach a row outside the rendered window, and its own averageItemLength
// estimate reads ~82 against a real pitch of 104 — so every retry recomputed
// the same wrong offset and the scroll stopped ~80 rows short.
export const ROW_HEIGHT = 104;

// A product with a note renders one extra line under its name: the card's
// 10px gap plus a 16px line, pinned to one line (numberOfLines={1}) so this
// stays exact. Must match styles.productNote in the order screen.
export const NOTE_LINE_HEIGHT = 26;

// Same reasoning as ROW_HEIGHT: an exact height lets the category SectionList
// jump straight to any row instead of guessing from an unmeasured average.
export const SECTION_HEADER_HEIGHT = 44;

type HasNoteField = Pick<Product, 'note'>;

export function hasNote(product: HasNoteField): boolean {
  return !!product.note?.trim();
}

export function rowHeightFor(product: HasNoteField): number {
  return hasNote(product) ? ROW_HEIGHT + NOTE_LINE_HEIGHT : ROW_HEIGHT;
}

/**
 * Precomputed so getItemLayout is a lookup: it is called for many indexes on
 * every scroll, and summing row heights per call would be quadratic on a
 * large catalogue.
 */
export interface ItemLayoutTable {
  lengths: number[];
  offsets: number[];
  total: number;
}

function pushSlot(table: ItemLayoutTable, length: number): void {
  table.lengths.push(length);
  table.offsets.push(table.total);
  table.total += length;
}

export function buildFlatLayout(products: readonly HasNoteField[]): ItemLayoutTable {
  const table: ItemLayoutTable = { lengths: [], offsets: [], total: 0 };
  for (const product of products) pushSlot(table, rowHeightFor(product));
  return table;
}

/** Treats headers and rows as one flat sequence: [header, ...rows] per section. */
export function buildSectionLayout(
  sections: readonly { data: readonly HasNoteField[] }[],
): ItemLayoutTable {
  const table: ItemLayoutTable = { lengths: [], offsets: [], total: 0 };
  for (const section of sections) {
    pushSlot(table, SECTION_HEADER_HEIGHT);
    for (const product of section.data) pushSlot(table, rowHeightFor(product));
  }
  return table;
}

export function layoutAt(
  table: ItemLayoutTable,
  index: number,
): { length: number; offset: number; index: number } {
  if (index < table.lengths.length) {
    return { length: table.lengths[index], offset: table.offsets[index], index };
  }
  return { length: ROW_HEIGHT, offset: table.total, index };
}
```

- [ ] **Step 4: Add `note` to the type and the API function**

In `mobile/src/api/types.ts`, inside `interface Product`, after `categoryId`:

```ts
  // Internal staff reminder; null/undefined means no note.
  note?: string | null;
```

In `mobile/src/api/products.ts`, after `updateProduct`:

```ts
// Separate from updateProduct on purpose: this route is open to staff with
// access to the provider, while updateProduct is admin-only.
export async function updateProductNote(
  providerId: string,
  productId: string,
  note: string | null,
): Promise<Product> {
  const response = await apiClient.patch<Product>(
    `/providers/${providerId}/products/${productId}/note`,
    { note },
  );
  return response.data;
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx jest src/products/productRowLayout.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/api/types.ts src/api/products.ts src/products/productRowLayout.ts src/products/productRowLayout.test.ts
git commit -m "feat(mobile): product note API client and per-row list layout"
```

---

### Task 4: Mobile — `ProductNoteDialog`

**Files:**
- Create: `mobile/src/products/ProductNoteDialog.tsx`
- Test: `mobile/src/products/ProductNoteDialog.test.tsx`

**Interfaces:**
- Consumes: `updateProductNote` (Task 3), `Product` (Task 3).
- Produces: `ProductNoteDialog({ product, onSaved, onClose })` where `onSaved: (updated: Product, outcome: 'saved' | 'deleted') => void`, `onClose: () => void`. testIDs: `note-input`, `note-counter`, `note-save`, `note-cancel`, `note-delete`, `note-error`, `note-backdrop`. Also exports `NOTE_MAX_LENGTH = 200`.

- [ ] **Step 1: Write the failing tests**

Create `mobile/src/products/ProductNoteDialog.test.tsx`:

```tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import type { Product } from '../api/types';
import { ProductNoteDialog } from './ProductNoteDialog';

jest.mock('../api/products', () => ({
  updateProductNote: jest.fn(),
}));
import { updateProductNote } from '../api/products';

const BASE: Product = {
  id: 'product-1',
  providerId: 'provider-1',
  name: 'חלב 3%',
  unitType: 'קרטון',
  isActive: true,
  createdAt: '2024-01-01T00:00:00.000Z',
};
const WITH_NOTE: Product = { ...BASE, note: 'לבקש תאריך ארוך' };

const onSaved = jest.fn();
const onClose = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (updateProductNote as jest.Mock).mockImplementation(
    async (_providerId: string, _productId: string, note: string | null) => ({ ...BASE, note }),
  );
});

function renderDialog(product: Product) {
  return render(<ProductNoteDialog product={product} onSaved={onSaved} onClose={onClose} />);
}

it('shows the product name and prefills the existing note with its length', () => {
  renderDialog(WITH_NOTE);
  expect(screen.getByText('הערה למוצר')).toBeTruthy();
  expect(screen.getByText('חלב 3%')).toBeTruthy();
  expect(screen.getByTestId('note-input').props.value).toBe('לבקש תאריך ארוך');
  expect(screen.getByTestId('note-counter')).toHaveTextContent(`${'לבקש תאריך ארוך'.length}/200`);
});

it('saves the trimmed text and reports it as saved', async () => {
  renderDialog(BASE);
  fireEvent.changeText(screen.getByTestId('note-input'), '  להזמין רק ביום ראשון  ');
  fireEvent.press(screen.getByTestId('note-save'));

  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(updateProductNote).toHaveBeenCalledWith('provider-1', 'product-1', 'להזמין רק ביום ראשון');
  expect(onSaved.mock.calls[0][1]).toBe('saved');
});

it('deletes the note when saving an empty box on a product that has one', async () => {
  renderDialog(WITH_NOTE);
  fireEvent.changeText(screen.getByTestId('note-input'), '   ');
  fireEvent.press(screen.getByTestId('note-save'));

  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(updateProductNote).toHaveBeenCalledWith('provider-1', 'product-1', null);
  expect(onSaved.mock.calls[0][1]).toBe('deleted');
});

it('just closes, with no request, when saving an empty box on a product with no note', () => {
  renderDialog(BASE);
  fireEvent.press(screen.getByTestId('note-save'));

  expect(updateProductNote).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('offers "delete note" only when the product has a note', () => {
  const { unmount } = renderDialog(BASE);
  expect(screen.queryByTestId('note-delete')).toBeNull();
  unmount();

  renderDialog(WITH_NOTE);
  expect(screen.getByTestId('note-delete')).toBeTruthy();
});

it('deletes immediately from the delete link', async () => {
  renderDialog(WITH_NOTE);
  fireEvent.press(screen.getByTestId('note-delete'));

  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(updateProductNote).toHaveBeenCalledWith('provider-1', 'product-1', null);
  expect(onSaved.mock.calls[0][1]).toBe('deleted');
});

it('keeps the dialog and the typed text when the save fails, and shows why', async () => {
  (updateProductNote as jest.Mock).mockRejectedValueOnce(new Error('network down'));
  renderDialog(BASE);
  fireEvent.changeText(screen.getByTestId('note-input'), 'טקסט חשוב');
  fireEvent.press(screen.getByTestId('note-save'));

  await waitFor(() =>
    expect(screen.getByTestId('note-error')).toHaveTextContent(
      'ההערה לא נשמרה. בדקו את החיבור ונסו שוב.',
    ),
  );
  expect(screen.getByTestId('note-input').props.value).toBe('טקסט חשוב');
  expect(onSaved).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});

it('sends only one request when Save is tapped twice quickly', async () => {
  let resolve: (p: Product) => void = () => {};
  (updateProductNote as jest.Mock).mockReturnValueOnce(
    new Promise<Product>((r) => {
      resolve = r;
    }),
  );
  renderDialog(BASE);
  fireEvent.changeText(screen.getByTestId('note-input'), 'x');
  fireEvent.press(screen.getByTestId('note-save'));
  fireEvent.press(screen.getByTestId('note-save'));
  resolve({ ...BASE, note: 'x' });

  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(updateProductNote).toHaveBeenCalledTimes(1);
});

it('closes without saving on cancel', () => {
  renderDialog(WITH_NOTE);
  fireEvent.changeText(screen.getByTestId('note-input'), 'שינוי שלא נשמר');
  fireEvent.press(screen.getByTestId('note-cancel'));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(updateProductNote).not.toHaveBeenCalled();
});

it('closes without saving when the backdrop is tapped', () => {
  renderDialog(WITH_NOTE);
  fireEvent.press(screen.getByTestId('note-backdrop'));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(updateProductNote).not.toHaveBeenCalled();
});
```

If `toHaveTextContent` is not available in this Jest setup (check `mobile/jest.config*` / setup files for `@testing-library/jest-native` or RNTL ≥12.4 built-in matchers), use `expect(screen.getByTestId('note-counter').props.children).toEqual(...)` or `screen.getByText('15/200')` instead — keep the assertion's meaning.

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/products/ProductNoteDialog.test.tsx`
Expected: FAIL — cannot find module `./ProductNoteDialog`.

- [ ] **Step 3: Implement the dialog**

Create `mobile/src/products/ProductNoteDialog.tsx`:

```tsx
import React, { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { updateProductNote } from '../api/products';
import type { Product } from '../api/types';
import { colors, radius, spacing } from '../ui/theme';

export const NOTE_MAX_LENGTH = 200;

interface ProductNoteDialogProps {
  product: Product;
  onSaved: (updated: Product, outcome: 'saved' | 'deleted') => void;
  onClose: () => void;
}

/**
 * Adds, edits or deletes a product's internal note.
 *
 * Same centered-card shape as UnitPickerSheet so the order screen's dialogs
 * read as one family. On failure the dialog stays open with the text intact:
 * a note is typed on a phone in a busy shop, and losing it to a dropped
 * connection would mean typing it again.
 */
export function ProductNoteDialog({ product, onSaved, onClose }: ProductNoteDialogProps) {
  const [text, setText] = useState(product.note ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A ref as well as state: two taps in the same frame both read the stale
  // state value, and the second would send a duplicate request.
  const isSavingRef = useRef(false);
  const hasExistingNote = !!product.note?.trim();

  const submit = async (note: string | null) => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateProductNote(product.providerId, product.id, note);
      onSaved(updated, updated.note ? 'saved' : 'deleted');
    } catch {
      isSavingRef.current = false;
      setIsSaving(false);
      setError('ההערה לא נשמרה. בדקו את החיבור ונסו שוב.');
    }
  };

  const save = () => {
    const trimmed = text.trim();
    if (!trimmed && !hasExistingNote) {
      // Nothing to save and nothing to delete.
      onClose();
      return;
    }
    void submit(trimmed || null);
  };

  const close = () => {
    if (!isSavingRef.current) onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <Pressable testID="note-backdrop" style={styles.backdrop} onPress={close} accessibilityLabel="סגירה">
        {/* Stops a tap inside the dialog from reaching the backdrop and closing it. */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>הערה למוצר</Text>
          <Text style={styles.subtitle}>{product.name}</Text>
          <TextInput
            testID="note-input"
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="למשל: להזמין רק ביום ראשון"
            maxLength={NOTE_MAX_LENGTH}
            multiline
            autoFocus
            textAlignVertical="top"
            editable={!isSaving}
          />
          <Text testID="note-counter" style={styles.counter}>
            {`${text.length}/${NOTE_MAX_LENGTH}`}
          </Text>
          {error ? (
            <Text testID="note-error" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <View style={styles.buttonRow}>
            <Pressable
              testID="note-save"
              style={[styles.button, styles.primaryButton, isSaving && styles.buttonDisabled]}
              onPress={save}
              accessibilityRole="button"
            >
              <Text style={styles.primaryButtonText}>שמירה</Text>
            </Pressable>
            <Pressable
              testID="note-cancel"
              style={[styles.button, styles.secondaryButton]}
              onPress={close}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryButtonText}>ביטול</Text>
            </Pressable>
          </View>
          {hasExistingNote && (
            <Pressable
              testID="note-delete"
              onPress={() => void submit(null)}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={styles.deleteText}>מחיקת ההערה</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'right' },
  subtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'right' },
  input: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    padding: spacing.md,
    minHeight: 80,
    fontSize: 15,
    textAlign: 'right',
    color: colors.text,
  },
  counter: { fontSize: 12, color: colors.textMuted, textAlign: 'left' },
  error: { fontSize: 13, color: colors.danger, textAlign: 'right' },
  buttonRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  button: { flex: 1, alignItems: 'center', borderRadius: radius.control, paddingVertical: 12 },
  primaryButton: { backgroundColor: colors.accent },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  secondaryButton: { backgroundColor: '#f3f4f6' },
  secondaryButtonText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  deleteText: { color: colors.danger, fontSize: 14, textAlign: 'center', paddingTop: spacing.xs },
});
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx jest src/products/ProductNoteDialog.test.tsx && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/products/ProductNoteDialog.tsx src/products/ProductNoteDialog.test.tsx
git commit -m "feat(mobile): add ProductNoteDialog for adding, editing and deleting a product note"
```

---

### Task 5: Mobile — wire notes into the order screen, plus release note

**Files:**
- Modify: `mobile/app/(app)/providers/[providerId]/order.tsx`
- Test: `mobile/app/(app)/providers/[providerId]/order.test.tsx`
- Modify: `docs/release-notes/draft.md`

**Interfaces:**
- Consumes: `ProductNoteDialog` (Task 4); `ROW_HEIGHT`, `SECTION_HEADER_HEIGHT`, `hasNote`, `buildFlatLayout`, `buildSectionLayout`, `layoutAt` (Task 3); `Product.note` (Task 3).
- Produces: on each product card, testIDs `note-icon-${product.id}` (always) and `note-${product.id}` (only when the product has a note); toast testID `note-toast`.

- [ ] **Step 1: Write the failing screen tests**

In `mobile/app/(app)/providers/[providerId]/order.test.tsx`:

Add `updateProductNote: jest.fn(),` to the `jest.mock('../../../../src/api/products', ...)` factory, and change the import line to:

```ts
import { fetchProductsForProvider, updateProductNote } from '../../../../src/api/products';
```

Append at the end of the file:

```tsx
describe('product notes', () => {
  const NOTE = 'לבקש רק תאריך ארוך';

  it('shows a note line only under products that have a note', async () => {
    (fetchProductsForProvider as jest.Mock).mockResolvedValue([
      { ...CARTON_PRODUCT, note: NOTE },
      WEIGHT_PRODUCT,
    ]);
    await renderScreen();

    expect(screen.getByTestId(`note-${CARTON_PRODUCT.id}`)).toHaveTextContent(NOTE);
    expect(screen.queryByTestId(`note-${WEIGHT_PRODUCT.id}`)).toBeNull();
    // The icon is on every card, for every role (this suite runs as STAFF).
    expect(screen.getByTestId(`note-icon-${CARTON_PRODUCT.id}`)).toBeTruthy();
    expect(screen.getByTestId(`note-icon-${WEIGHT_PRODUCT.id}`)).toBeTruthy();
  });

  it('opens the note dialog from the icon', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId(`note-icon-${WEIGHT_PRODUCT.id}`));

    expect(screen.getByText('הערה למוצר')).toBeTruthy();
    expect(screen.getByTestId('note-input').props.value).toBe('');
  });

  it('opens the note dialog with the full note from the note line', async () => {
    (fetchProductsForProvider as jest.Mock).mockResolvedValue([
      { ...CARTON_PRODUCT, note: NOTE },
      WEIGHT_PRODUCT,
    ]);
    await renderScreen();
    await fireEvent.press(screen.getByTestId(`note-${CARTON_PRODUCT.id}`));

    expect(screen.getByTestId('note-input').props.value).toBe(NOTE);
  });

  it('shows a saved note on the card straight away and confirms it', async () => {
    (updateProductNote as jest.Mock).mockResolvedValue({ ...WEIGHT_PRODUCT, note: NOTE });
    await renderScreen();

    await fireEvent.press(screen.getByTestId(`note-icon-${WEIGHT_PRODUCT.id}`));
    await fireEvent.changeText(screen.getByTestId('note-input'), NOTE);
    await fireEvent.press(screen.getByTestId('note-save'));

    await waitFor(() =>
      expect(screen.getByTestId(`note-${WEIGHT_PRODUCT.id}`)).toHaveTextContent(NOTE),
    );
    expect(screen.getByTestId('note-toast')).toHaveTextContent('ההערה נשמרה');
    expect(screen.queryByTestId('note-input')).toBeNull();
    expect(updateProductNote).toHaveBeenCalledWith(PROVIDER_ID, WEIGHT_PRODUCT.id, NOTE);
  });

  it('removes the note line after deleting and confirms it', async () => {
    (fetchProductsForProvider as jest.Mock).mockResolvedValue([
      { ...CARTON_PRODUCT, note: NOTE },
      WEIGHT_PRODUCT,
    ]);
    (updateProductNote as jest.Mock).mockResolvedValue({ ...CARTON_PRODUCT, note: null });
    await renderScreen();

    await fireEvent.press(screen.getByTestId(`note-${CARTON_PRODUCT.id}`));
    await fireEvent.press(screen.getByTestId('note-delete'));

    await waitFor(() => expect(screen.queryByTestId(`note-${CARTON_PRODUCT.id}`)).toBeNull());
    expect(screen.getByTestId('note-toast')).toHaveTextContent('ההערה נמחקה');
  });
});
```

(Same `toHaveTextContent` fallback note as Task 4 applies.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest "app/(app)/providers/\[providerId\]/order.test.tsx" -t "product notes"`
Expected: FAIL — `Unable to find an element with testID: note-...`.

- [ ] **Step 3: Move the layout constants and switch to the layout tables**

In `order.tsx`:

1. Delete the local `ROW_HEIGHT` and `SECTION_HEADER_HEIGHT` constants and their comments (lines ~31–41; the comments now live in `productRowLayout.ts`).
2. Add imports:

```ts
import {
  ROW_HEIGHT,
  hasNote,
  buildFlatLayout,
  buildSectionLayout,
  layoutAt,
} from '../../../../src/products/productRowLayout';
import { ProductNoteDialog } from '../../../../src/products/ProductNoteDialog';
```

(Keep `ROW_HEIGHT` only if still referenced after the edits below; remove it from the import otherwise so lint stays clean. `SECTION_HEADER_HEIGHT` is no longer needed in this file.)

3. Replace the entire `sectionGetItemLayout` function (the one with the `let offset = 0; let remaining = index;` loop) with:

```ts
  // Rows with a note are taller by one fixed line, so heights are per row but
  // still exact; precomputed so each getItemLayout call is a lookup.
  const sectionLayout = useMemo(() => buildSectionLayout(sectionsForList), [sectionsForList]);
  const flatLayout = useMemo(() => buildFlatLayout(filteredProducts ?? []), [filteredProducts]);

  const sectionGetItemLayout = (
    _data: unknown,
    index: number,
  ): { length: number; offset: number; index: number } => layoutAt(sectionLayout, index);
```

Keep the existing comment above it ("Treats headers and rows as one flat sequence…") or merge it into the new one.

4. In the search `FlatList`, replace

```ts
          getItemLayout={(_data, index) => ({
            length: ROW_HEIGHT,
            offset: ROW_HEIGHT * index,
            index,
          })}
```

with

```ts
          getItemLayout={(_data, index) => layoutAt(flatLayout, index)}
```

and in its `onScrollToIndexFailed`, replace

```ts
            const rowHeight = ROW_HEIGHT;
            listRef.current?.scrollToOffset({ offset: rowHeight * info.index, animated: false });
```

with

```ts
            listRef.current?.scrollToOffset({
              offset: layoutAt(flatLayout, info.index).offset,
              animated: false,
            });
```

- [ ] **Step 4: Add dialog + toast state and the save handler**

Next to the other `useState` hooks (e.g. after `unitPickerProduct`):

```ts
  const [noteProduct, setNoteProduct] = useState<Product | null>(null);
  const [noteToast, setNoteToast] = useState<string | null>(null);
```

After the state declarations, add:

```ts
  useEffect(() => {
    if (!noteToast) return;
    const timer = setTimeout(() => setNoteToast(null), 2000);
    return () => clearTimeout(timer);
  }, [noteToast]);

  // Written into the cached list rather than refetched: the card should show
  // the note the moment the dialog closes, and the server has already
  // returned the saved value.
  const handleNoteSaved = (updated: Product, outcome: 'saved' | 'deleted') => {
    queryClient.setQueryData<Product[]>(['products', providerId], (previous) =>
      previous?.map((product) =>
        product.id === updated.id ? { ...product, note: updated.note ?? null } : product,
      ),
    );
    setNoteProduct(null);
    setNoteToast(outcome === 'saved' ? 'ההערה נשמרה' : 'ההערה נמחקה');
  };
```

- [ ] **Step 5: Render the icon and note line on the card**

In `renderProductCard`, replace

```tsx
        <View style={styles.productNameRow}>
          <Text style={styles.productName}>{product.name}</Text>
```

with

```tsx
        <View style={styles.productNameRow}>
          <View style={styles.productNameGroup}>
            <Text style={styles.productName}>{product.name}</Text>
            <Pressable
              testID={`note-icon-${product.id}`}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={hasNote(product) ? 'עריכת הערה למוצר' : 'הוספת הערה למוצר'}
              onPress={() => setNoteProduct(product)}
            >
              {/* An emoji can't be recolored, so state is carried by opacity. */}
              <Text style={[styles.noteIcon, !hasNote(product) && styles.noteIconEmpty]}>🗒</Text>
            </Pressable>
          </View>
```

(The admin ✎ `Pressable` and the closing `</View>` of `productNameRow` stay exactly as they are.)

Immediately after the `productNameRow` `</View>` and before `<View style={styles.rowBottom}>`, add:

```tsx
        {hasNote(product) && (
          <Pressable
            testID={`note-${product.id}`}
            onPress={() => setNoteProduct(product)}
            accessibilityRole="button"
            accessibilityLabel={`הערה: ${product.note}`}
          >
            <Text style={styles.productNote} numberOfLines={1}>
              {product.note}
            </Text>
          </Pressable>
        )}
```

- [ ] **Step 6: Render the dialog and toast**

Right after the `{unitPickerProduct && (<UnitPickerSheet … />)}` block, add:

```tsx
      {noteProduct && (
        <ProductNoteDialog
          product={noteProduct}
          onSaved={handleNoteSaved}
          onClose={() => setNoteProduct(null)}
        />
      )}
```

Just before the final `</View>` of the screen's returned JSX (after the `PublishButton` block), add:

```tsx
      {noteToast && (
        <View style={styles.toast} pointerEvents="none">
          <Text testID="note-toast" style={styles.toastText}>
            {noteToast}
          </Text>
        </View>
      )}
```

- [ ] **Step 7: Add the styles**

In the `StyleSheet.create` block, change `productName` to add `flexShrink: 1` and add the new entries next to it:

```ts
  productName: { fontSize: 15, fontWeight: '600', textAlign: 'right', color: '#1a1a1a', flexShrink: 1 },
  productNameGroup: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  noteIcon: { fontSize: 15 },
  noteIconEmpty: { opacity: 0.3 },
  // height and lineHeight are fixed at 16 so the extra row height is exactly
  // NOTE_LINE_HEIGHT (card gap 10 + 16) in productRowLayout.ts.
  productNote: { fontSize: 12, lineHeight: 16, height: 16, color: '#6b7280', textAlign: 'right' },
  toast: {
    position: 'absolute',
    top: 72,
    alignSelf: 'center',
    backgroundColor: '#111827',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '600' },
```

- [ ] **Step 8: Run all mobile tests, typecheck**

Run: `npx jest && npx tsc --noEmit`
Expected: all PASS (existing order-screen tests included), no type errors.

- [ ] **Step 9: Add the release note**

Append to `docs/release-notes/draft.md`, after the header comment:

```markdown
- אפשר להוסיף הערה לכל מוצר במסך ההזמנה (למשל "לבקש תאריך ארוך"). ההערה נשמרת ומופיעה לכל מי שמזמין מהספק, והספק לא רואה אותה.
```

- [ ] **Step 10: Commit**

```bash
git add "app/(app)/providers/[providerId]/order.tsx" "app/(app)/providers/[providerId]/order.test.tsx" ../docs/release-notes/draft.md
git commit -m "feat(mobile): show and edit product notes on the order screen"
```

---

## After all tasks (Opus, not the implementer)

- Whole-branch review against the spec.
- Run the app on web (`cd mobile && npm run web`, pointed at a local backend) and confirm visually: the note line renders on one line, and **a noted card is exactly 26px taller** than a plain one (measure in devtools). If it isn't, adjust `NOTE_LINE_HEIGHT` to the measured value. Then scan/search to a product below several noted ones and confirm the list lands on it.
- Hand back to Dvir for the push to `main`.
