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
    try {
      await createNormalizedNameIndex(runner);
    } finally {
      await runner.release();
      await app.close();
    }
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

  async function insertOrder(status = 'DRAFT'): Promise<string> {
    const [order] = await db.query(
      `INSERT INTO orders ("branchId", "providerId", "createdByUserId", status)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [fixtures.branchId, P(), fixtures.staffUserId, status],
    );
    return order.id;
  }

  const insertLine = (
    orderId: string,
    productId: string,
    name: string,
    quantity = 1,
    unitType = 'קרטון',
  ) =>
    db.query(
      `INSERT INTO order_items ("orderId", "productId", "productNameSnapshot", "unitType", quantity)
       VALUES ($1, $2, $3, $4, $5)`,
      [orderId, productId, name, unitType, quantity],
    );

  const linesOf = (orderId: string) =>
    db.query(
      `SELECT "productId", "unitType", quantity::float AS quantity FROM order_items
       WHERE "orderId" = $1 ORDER BY quantity`,
      [orderId],
    );

  const get = async (id: string) =>
    (await db.query(`SELECT * FROM products WHERE id = $1`, [id]))[0];

  it('keeps one active survivor and hides the rest, pointing at it', async () => {
    const a = await insert(
      P(),
      'סלרי ראש',
      '7290000000534',
      '2026-01-01T00:00:00Z',
    );
    const b = await insert(
      P(),
      'סלרי ראש',
      '7290003706020',
      '2026-01-02T00:00:00Z',
    );
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
    const a = await insert(
      P(),
      'סלרי עלים',
      '7290013232656',
      '2026-01-01T00:00:00Z',
    );
    await insert(P(), 'סלרי עלים', '121', '2026-01-02T00:00:00Z');
    await insert(P(), 'סלרי עלים', '7290011276454', '2026-01-03T00:00:00Z');
    await insert(P(), 'סלרי עלים', '7290013232656', '2026-01-04T00:00:00Z');

    await mergeDuplicateProducts(runner);

    const survivor = await get(a);
    expect([...survivor.additionalBarcodes].sort()).toEqual([
      '121',
      '7290011276454',
    ]);
  });

  it('prefers a product used in an order, then a real GTIN, then any barcode, then the oldest', async () => {
    // A real GTIN beats an older short code and an even older no-barcode row.
    const none = await insert(P(), 'גזר', null, '2025-01-01T00:00:00Z');
    const short = await insert(P(), 'גזר', '27', '2025-06-01T00:00:00Z');
    const gtin = await insert(
      P(),
      'גזר',
      '7290000000794',
      '2026-01-01T00:00:00Z',
    );
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

    // Being on an order beats everything.
    const ordered = await insert(P(), 'שום', null, '2026-03-01T00:00:00Z');
    const unordered = await insert(
      P(),
      'שום',
      '7290000000800',
      '2025-01-01T00:00:00Z',
    );
    const orderId = await insertOrder();
    await insertLine(orderId, ordered, 'שום');
    await mergeDuplicateProducts(runner);
    expect((await get(ordered)).isActive).toBe(true);
    expect((await get(unordered)).isActive).toBe(false);
  });

  it('repoints the order lines of a hidden copy to the survivor', async () => {
    // Both are on orders, so the real GTIN wins and the other line moves.
    const loser = await insert(P(), 'כרפס', null, '2025-01-01T00:00:00Z');
    const survivor = await insert(
      P(),
      'כרפס',
      '7290000000900',
      '2026-01-01T00:00:00Z',
    );
    const orderId = await insertOrder('PUBLISHED');
    await insertLine(orderId, loser, 'כרפס');
    await insertLine(orderId, survivor, 'כרפס');
    const summary = await mergeDuplicateProducts(runner);
    expect((await get(survivor)).isActive).toBe(true);
    expect(summary.orderLinesRepointed).toBe(1);
    const lines = await db.query(
      `SELECT "productId" FROM order_items WHERE "orderId" = $1`,
      [orderId],
    );
    expect(lines.map((l: { productId: string }) => l.productId)).toEqual([
      survivor,
      survivor,
    ]);
  });

  it('treats whitespace differences as the same name', async () => {
    const a = await insert(
      P(),
      'ראש  כרוב',
      '7290000000817',
      '2026-01-01T00:00:00Z',
    );
    const b = await insert(
      P(),
      ' ראש כרוב ',
      '7290000000824',
      '2026-01-02T00:00:00Z',
    );
    await mergeDuplicateProducts(runner);
    expect((await get(a)).isActive).toBe(true);
    expect((await get(b)).mergedIntoProductId).toBe(a);
  });

  it('leaves different names, other suppliers and already-hidden products alone', async () => {
    const a = await insert(P(), 'חסה', '7290000000831');
    const b = await insert(P(), 'חסה ערבית', '7290000000848');
    const c = await insert(Q(), 'חסה', '7290000000855');
    const hidden = await insert(
      P(),
      'חסה',
      '7290000000862',
      '2025-01-01T00:00:00Z',
      false,
    );
    await mergeDuplicateProducts(runner);
    for (const id of [a, b, c]) expect((await get(id)).isActive).toBe(true);
    expect((await get(hidden)).mergedIntoProductId).toBeNull();
  });

  it('changes nothing when run a second time', async () => {
    await insert(P(), 'פטרוזיליה', '7290000000879', '2026-01-01T00:00:00Z');
    await insert(P(), 'פטרוזיליה', '7290000000886', '2026-01-02T00:00:00Z');
    await mergeDuplicateProducts(runner);
    const before = await db.query(
      `SELECT id, "isActive", "additionalBarcodes" FROM products ORDER BY id`,
    );
    const summary = await mergeDuplicateProducts(runner);
    const after = await db.query(
      `SELECT id, "isActive", "additionalBarcodes" FROM products ORDER BY id`,
    );
    expect(summary).toEqual({
      groups: 0,
      hidden: 0,
      orderLinesRepointed: 0,
      draftLinesCollapsed: 0,
      lockedOrderCollisions: 0,
    });
    expect(after).toEqual(before);
  });

  it('keeps the hidden copy when its survivor is deleted, clearing the pointer', async () => {
    const a = await insert(
      P(),
      'נענע',
      '7290000000917',
      '2026-01-01T00:00:00Z',
    );
    const b = await insert(
      P(),
      'נענע',
      '7290000000924',
      '2026-01-02T00:00:00Z',
    );
    await mergeDuplicateProducts(runner);
    expect((await get(b)).mergedIntoProductId).toBe(a);
    await db.query(`DELETE FROM products WHERE id = $1`, [a]);
    expect((await get(b)).mergedIntoProductId).toBeNull();
  });

  it("carries a loser's own additional barcodes over, once, and skips empty ones", async () => {
    const a = await insert(
      P(),
      'כוסברה',
      '7290000000931',
      '2026-01-01T00:00:00Z',
    );
    const b = await insert(
      P(),
      'כוסברה',
      '7290000000948',
      '2026-01-02T00:00:00Z',
    );
    const c = await insert(
      P(),
      'כוסברה',
      '7290000000948',
      '2026-01-03T00:00:00Z',
    );
    await insert(P(), 'כוסברה', '', '2026-01-04T00:00:00Z');
    await db.query(
      `UPDATE products SET "additionalBarcodes" = '{9001,9002}' WHERE id = $1`,
      [b],
    );
    await db.query(
      `UPDATE products SET "additionalBarcodes" = '{9002}' WHERE id = $1`,
      [c],
    );
    await mergeDuplicateProducts(runner);
    expect((await get(a)).additionalBarcodes).toEqual([
      '7290000000948',
      '9001',
      '9002',
    ]);
  });

  it('treats Latin case differences as the same name', async () => {
    const a = await insert(
      P(),
      'Coca Cola',
      '7290000000955',
      '2026-01-01T00:00:00Z',
    );
    const b = await insert(
      P(),
      'coca cola',
      '7290000000962',
      '2026-01-02T00:00:00Z',
    );
    await mergeDuplicateProducts(runner);
    expect((await get(a)).isActive).toBe(true);
    expect((await get(b)).mergedIntoProductId).toBe(a);
  });

  describe('order lines on a merged product', () => {
    it('collapses same-unit lines on a DRAFT into one with the summed quantity', async () => {
      const survivor = await insert(
        P(),
        'פלפל',
        '7290000000979',
        '2026-01-01T00:00:00Z',
      );
      const loser = await insert(P(), 'פלפל', null, '2026-01-02T00:00:00Z');
      const orderId = await insertOrder();
      await insertLine(orderId, survivor, 'פלפל', 2);
      await insertLine(orderId, loser, 'פלפל', 3);
      const summary = await mergeDuplicateProducts(runner);
      expect(await linesOf(orderId)).toEqual([
        { productId: survivor, unitType: 'קרטון', quantity: 5 },
      ]);
      expect(summary.draftLinesCollapsed).toBe(1);
      expect(summary.orderLinesRepointed).toBe(0);
    });

    it('keeps lines with different units separate on a DRAFT', async () => {
      const survivor = await insert(
        P(),
        'מלפפון',
        '7290000000986',
        '2026-01-01T00:00:00Z',
      );
      const loser = await insert(P(), 'מלפפון', null, '2026-01-02T00:00:00Z');
      // The survivor must be referenced too, or the ordered copy outranks it.
      await insertLine(await insertOrder('PUBLISHED'), survivor, 'מלפפון');
      const orderId = await insertOrder();
      await insertLine(orderId, loser, 'מלפפון', 1, 'קרטון');
      await insertLine(orderId, loser, 'מלפפון', 2, 'יחידה');
      await mergeDuplicateProducts(runner);
      expect(await linesOf(orderId)).toEqual([
        { productId: survivor, unitType: 'קרטון', quantity: 1 },
        { productId: survivor, unitType: 'יחידה', quantity: 2 },
      ]);
    });

    it('leaves sent orders with all their lines, repointed', async () => {
      const survivor = await insert(
        P(),
        'חציל',
        '7290000000993',
        '2026-01-01T00:00:00Z',
      );
      const loser = await insert(P(), 'חציל', null, '2026-01-02T00:00:00Z');
      const orderId = await insertOrder('PUBLISHED');
      await insertLine(orderId, survivor, 'חציל', 2);
      await insertLine(orderId, loser, 'חציל', 3);
      const summary = await mergeDuplicateProducts(runner);
      expect(await linesOf(orderId)).toEqual([
        { productId: survivor, unitType: 'קרטון', quantity: 2 },
        { productId: survivor, unitType: 'קרטון', quantity: 3 },
      ]);
      expect(summary.lockedOrderCollisions).toBe(1);
    });
  });
});
