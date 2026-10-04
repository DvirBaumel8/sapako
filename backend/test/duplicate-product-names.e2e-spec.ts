import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
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
    const response = await create(
      fixtures.providerIds[1],
      '  סלרי   ראש ',
    ).expect(409);
    expect(response.body.message).toBe(
      'A product with this name already exists for this provider',
    );
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

  describe('barcode lookup (e2e)', () => {
    const lookup = (code: string) =>
      request(app.getHttpServer())
        .get(`/branches/${fixtures.branchId}/products?barcode=${code}`)
        .set({ Authorization: `Bearer ${fixtures.adminToken}` })
        .expect(200);

    it('matches additional barcodes and main barcodes, and skips barcode-less products', async () => {
      const db = app.get(DataSource);
      const withExtra = await create(
        fixtures.providerIds[1],
        'מוצר עם ברקודים',
      ).expect(201);
      await db.query(
        `UPDATE products SET "additionalBarcodes" = ARRAY['7290003706020','27'] WHERE id = $1`,
        [withExtra.body.id],
      );
      const mainOnly = await create(
        fixtures.providerIds[1],
        'מוצר ברקוד ראשי',
      ).expect(201);
      await db.query(
        `UPDATE products SET barcode = '4006381333931' WHERE id = $1`,
        [mainOnly.body.id],
      );
      const none = await create(
        fixtures.providerIds[1],
        'מוצר בלי ברקוד',
      ).expect(201);

      const ids = (res: { body: { id: string }[] }) =>
        res.body.map((p) => p.id);

      expect(ids(await lookup('7290003706020'))).toEqual([withExtra.body.id]);
      expect(ids(await lookup('27'))).toEqual([withExtra.body.id]);
      expect(ids(await lookup('4006381333931'))).toEqual([mainOnly.body.id]);
      expect(ids(await lookup('999'))).not.toContain(none.body.id);
      expect(ids(await lookup('999'))).toEqual([]);
    });
  });
});
