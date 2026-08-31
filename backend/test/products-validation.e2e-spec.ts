import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, seed, Seeded } from './helpers';
import { UNIT_TYPES } from '../src/products/unit-types';

/**
 * The DTO constraints themselves are covered in
 * src/products/products.controller.spec.ts. This file exists to prove
 * something that unit test cannot: that the ValidationPipe enforcing them is
 * actually mounted on the running application.
 *
 * That distinction has teeth. The constraints could be perfectly correct and
 * still enforce nothing, if the pipe applying them were not configured to
 * run — and every DTO unit test would stay green.
 *
 * The harness builds that pipe from the same VALIDATION_PIPE_OPTIONS main.ts
 * uses, so these assertions cover the real configuration rather than a copy
 * of it that could drift.
 */
describe('product validation (e2e)', () => {
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
  const createProduct = (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/providers/${fixtures.providerIds[0]}/products`)
      .set(auth(fixtures.adminToken))
      .send(body);

  describe('creating', () => {
    it.each(UNIT_TYPES)(
      'stores a product in the listed unit %s',
      async (unitType) => {
        const response = await createProduct({
          name: 'עגבניות',
          unitType,
        }).expect(201);

        expect(response.body.unitType).toBe(unitType);
      },
    );

    it('rejects a unit outside the list with 400', async () => {
      await createProduct({ name: 'עגבניות', unitType: 'שקית' }).expect(400);
    });

    it('rejects a product with no unit at all', async () => {
      await createProduct({ name: 'עגבניות' }).expect(400);
    });

    it('names the offending field, so the app can show a useful message', async () => {
      const response = await createProduct({
        name: 'עגבניות',
        unitType: 'שקית',
      }).expect(400);

      expect(JSON.stringify(response.body.message)).toContain('unitType');
    });

    it('strips an unknown field rather than storing it', async () => {
      // forbidNonWhitelisted, also set only in main.ts: a payload carrying a
      // field no DTO declares is refused outright rather than silently
      // dropped, which is what stops a typo'd field from looking accepted.
      await createProduct({
        name: 'עגבניות',
        unitType: 'קרטון',
        price: 12.5,
      }).expect(400);
    });
  });

  describe('updating', () => {
    it('rejects changing a product to a unit outside the list', async () => {
      await request(app.getHttpServer())
        .patch(`/products/${fixtures.productId}`)
        .set(auth(fixtures.adminToken))
        .send({ unitType: 'שקית' })
        .expect(400);
    });

    it('allows an update that does not mention the unit', async () => {
      await request(app.getHttpServer())
        .patch(`/products/${fixtures.productId}`)
        .set(auth(fixtures.adminToken))
        .send({ name: 'עגבניות שרי' })
        .expect(200);
    });

    it('leaves the stored unit untouched when a bad update is refused', async () => {
      await request(app.getHttpServer())
        .patch(`/products/${fixtures.productId}`)
        .set(auth(fixtures.adminToken))
        .send({ unitType: 'שקית' })
        .expect(400);

      const products = await request(app.getHttpServer())
        .get(`/providers/${fixtures.providerIds[0]}/products`)
        .set(auth(fixtures.adminToken))
        .expect(200);

      const product = products.body.find(
        (candidate: { id: string }) => candidate.id === fixtures.productId,
      );
      expect(product.unitType).toBe('ק"ג');
    });
  });
});
