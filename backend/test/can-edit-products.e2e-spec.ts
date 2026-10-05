import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, seed, Seeded } from './helpers';

describe('can-edit-products permission (e2e)', () => {
  let app: INestApplication;
  let fx: Seeded;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const http = () => app.getHttpServer();
  const P0 = () => fx.providerIds[0];
  const P1 = () => fx.providerIds[1];

  const setFlag = (value: boolean) =>
    request(http())
      .patch(`/users/${fx.staffUserId}`)
      .set(auth(fx.adminToken))
      .send({ canEditProducts: value })
      .expect(200);

  const adminProduct = async (providerId: string): Promise<string> => {
    const res = await request(http())
      .post(`/providers/${providerId}/products`)
      .set(auth(fx.adminToken))
      .send({ name: `מוצר ${Math.random()}`, unitType: 'ק"ג' })
      .expect(201);
    return res.body.id;
  };
  const adminCategory = async (providerId: string): Promise<string> => {
    const res = await request(http())
      .post(`/providers/${providerId}/categories`)
      .set(auth(fx.adminToken))
      .send({ name: `קטגוריה ${Math.random()}` })
      .expect(201);
    return res.body.id;
  };

  beforeAll(async () => {
    app = await createTestApp();
    fx = await seed(app);
    await request(http())
      .put(`/users/${fx.staffUserId}/providers/${P0()}/access`)
      .set(auth(fx.adminToken))
      .send({ granted: true })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('flag off: staff cannot create, edit or delete products and categories', async () => {
    await setFlag(false);
    const productId = await adminProduct(P0());
    const categoryId = await adminCategory(P0());
    const staff = auth(fx.staffToken);

    await request(http())
      .post(`/providers/${P0()}/products`)
      .set(staff)
      .send({ name: 'x', unitType: 'ק"ג' })
      .expect(403);
    await request(http())
      .patch(`/products/${productId}`)
      .set(staff)
      .send({ name: 'y' })
      .expect(403);
    await request(http())
      .delete(`/products/${productId}`)
      .set(staff)
      .expect(403);
    await request(http())
      .post(`/providers/${P0()}/categories`)
      .set(staff)
      .send({ name: 'x' })
      .expect(403);
    await request(http())
      .patch(`/categories/${categoryId}`)
      .set(staff)
      .send({ name: 'y' })
      .expect(403);
    await request(http())
      .delete(`/categories/${categoryId}`)
      .set(staff)
      .expect(403);
  });

  it('flag on, granted provider: staff can write products and categories', async () => {
    await setFlag(true);
    const staff = auth(fx.staffToken);

    const product = await request(http())
      .post(`/providers/${P0()}/products`)
      .set(staff)
      .send({ name: `חדש ${Math.random()}`, unitType: 'ק"ג' })
      .expect(201);
    await request(http())
      .patch(`/products/${product.body.id}`)
      .set(staff)
      .send({ name: `ערוך ${Math.random()}` })
      .expect(200);
    await request(http())
      .delete(`/products/${product.body.id}`)
      .set(staff)
      .expect(200);

    const category = await request(http())
      .post(`/providers/${P0()}/categories`)
      .set(staff)
      .send({ name: `חדשה ${Math.random()}` })
      .expect(201);
    await request(http())
      .patch(`/categories/${category.body.id}`)
      .set(staff)
      .send({ name: `ערוכה ${Math.random()}` })
      .expect(200);
    await request(http())
      .delete(`/categories/${category.body.id}`)
      .set(staff)
      .expect(200);
  });

  it('flag on, provider not granted: staff is refused, including by-id routes', async () => {
    await setFlag(true);
    const productId = await adminProduct(P1());
    const categoryId = await adminCategory(P1());
    const staff = auth(fx.staffToken);

    await request(http())
      .post(`/providers/${P1()}/products`)
      .set(staff)
      .send({ name: 'x', unitType: 'ק"ג' })
      .expect(403);
    await request(http())
      .patch(`/products/${productId}`)
      .set(staff)
      .send({ name: 'y' })
      .expect(403);
    await request(http())
      .delete(`/products/${productId}`)
      .set(staff)
      .expect(403);
    await request(http())
      .patch(`/categories/${categoryId}`)
      .set(staff)
      .send({ name: 'y' })
      .expect(403);
    await request(http())
      .delete(`/categories/${categoryId}`)
      .set(staff)
      .expect(403);
  });

  it('revocation takes effect on the same token immediately', async () => {
    await setFlag(true);
    const staff = auth(fx.staffToken);
    await request(http())
      .post(`/providers/${P0()}/categories`)
      .set(staff)
      .send({ name: `לפני ${Math.random()}` })
      .expect(201);

    await setFlag(false);
    await request(http())
      .post(`/providers/${P0()}/categories`)
      .set(staff)
      .send({ name: `אחרי ${Math.random()}` })
      .expect(403);
  });

  it("still rejects moving a product into another supplier's category", async () => {
    await setFlag(true);
    const foreignCategory = await adminCategory(P1());

    await request(http())
      .patch(`/products/${fx.productId}`)
      .set(auth(fx.staffToken))
      .send({ categoryId: foreignCategory })
      .expect(400);
  });

  it('GET /auth/me reports the flag', async () => {
    await setFlag(false);
    const before = await request(http())
      .get('/auth/me')
      .set(auth(fx.staffToken))
      .expect(200);
    expect(before.body.canEditProducts).toBe(false);

    await setFlag(true);
    const after = await request(http())
      .get('/auth/me')
      .set(auth(fx.staffToken))
      .expect(200);
    expect(after.body.canEditProducts).toBe(true);

    const admin = await request(http())
      .get('/auth/me')
      .set(auth(fx.adminToken))
      .expect(200);
    expect(admin.body.canEditProducts).toBe(true);
  });

  it('staff cannot grant the flag to themselves', async () => {
    await request(http())
      .patch(`/users/${fx.staffUserId}`)
      .set(auth(fx.staffToken))
      .send({ canEditProducts: true })
      .expect(403);
  });

  it('the flag does not open supplier editing', async () => {
    await setFlag(true);
    await request(http())
      .patch(`/providers/${P0()}`)
      .set(auth(fx.staffToken))
      .send({ name: 'שם חדש' })
      .expect(403);
  });
});
