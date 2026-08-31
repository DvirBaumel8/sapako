import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, seed, Seeded } from './helpers';

/**
 * Every mutating endpoint (`@Post`/`@Patch`/`@Put`/`@Delete`) in the four
 * controllers that had 0% coverage — departments, orders, products,
 * providers. What lives in those controllers is routing plus guards; a
 * missing `@UseGuards`/`@Roles` on one of them is invisible to every other
 * test in this repo and would let any signed-in user change another
 * branch's data.
 *
 * This is a literal table, not a loop over the app's route metadata, so an
 * endpoint added later without a row here is a silent gap rather than one
 * this file would have caught automatically. Read the four controllers
 * again when adding a route and add its row.
 *
 * Enumerated (method, path):
 *  - POST   /branches/:branchId/departments
 *  - PATCH  /departments/:id
 *  - DELETE /departments/:id
 *  - POST   /branches/:branchId/providers
 *  - PATCH  /providers/:id
 *  - DELETE /providers/:id
 *  - POST   /providers/:providerId/products
 *  - PATCH  /products/:id
 *  - DELETE /products/:id
 *  - POST   /orders
 *  - POST   /orders/:id/items
 *  - PATCH  /orders/:id/items/:itemId
 *  - DELETE /orders/:id/items/:itemId
 *  - POST   /orders/:id/publish
 *  - DELETE /orders/:id
 *
 * Each case is checked three ways:
 *  1. No token -> 401.
 *  2. STAFF token with no access to the target (seed()'s staff user holds
 *     no grants at all) -> 403. This is the case that finds bugs.
 *  3. Admin token -> anything other than 401/403. The call may legitimately
 *     400 on a body this test does not bother making fully valid; what
 *     matters is that authorization did not reject it.
 *
 * Only the admin case actually performs the mutation (guards reject the
 * other two before the handler runs), so PATCH/DELETE cases target
 * dedicated "victim" resources created in beforeAll rather than the shared
 * fixtures other cases still need afterwards.
 */
describe('authorization matrix (e2e)', () => {
  let app: INestApplication;
  let fixtures: Seeded;

  let victimDepartmentId: string;
  let victimProviderId: string;
  let victimProductId: string;
  let orderId: string;
  let itemId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
    fixtures = await seed(app);
    const http = app.getHttpServer();

    const victimDepartment = await request(http)
      .post(`/branches/${fixtures.branchId}/departments`)
      .set(auth(fixtures.adminToken))
      .send({ name: 'מחלקת קורבן' })
      .expect(201);
    victimDepartmentId = victimDepartment.body.id;

    const victimProvider = await request(http)
      .post(`/branches/${fixtures.branchId}/providers`)
      .set(auth(fixtures.adminToken))
      .send({
        name: 'ספק קורבן',
        phone: '0500000009',
        departmentIds: [fixtures.departmentId],
      })
      .expect(201);
    victimProviderId = victimProvider.body.id;

    const victimProduct = await request(http)
      .post(`/providers/${fixtures.providerIds[0]}/products`)
      .set(auth(fixtures.adminToken))
      .send({ name: 'מוצר קורבן', unitType: 'יחידה' })
      .expect(201);
    victimProductId = victimProduct.body.id;

    const order = await request(http)
      .post('/orders')
      .set(auth(fixtures.adminToken))
      .send({
        branchId: fixtures.branchId,
        providerId: fixtures.providerIds[0],
      })
      .expect(201);
    orderId = order.body.id;

    const item = await request(http)
      .post(`/orders/${orderId}/items`)
      .set(auth(fixtures.adminToken))
      .send({ productId: fixtures.productId, quantity: 1 })
      .expect(201);
    itemId = item.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  interface Case {
    name: string;
    method: 'post' | 'patch' | 'put' | 'delete';
    path: () => string;
    body?: () => Record<string, unknown>;
  }

  // Order matters: PATCH/DELETE cases against a shared fixture (as opposed
  // to a dedicated victim) run after every case that still needs that
  // fixture to exist. See the per-case comments below.
  const cases: Case[] = [
    {
      name: 'POST /branches/:branchId/departments',
      method: 'post',
      path: () => `/branches/${fixtures.branchId}/departments`,
      body: () => ({ name: 'מחלקה חדשה' }),
    },
    {
      // Targets the dedicated victim, not fixtures.departmentId, which the
      // provider-creation case below still needs.
      name: 'PATCH /departments/:id',
      method: 'patch',
      path: () => `/departments/${victimDepartmentId}`,
      body: () => ({ name: 'שם מחלקה מעודכן' }),
    },
    {
      name: 'DELETE /departments/:id',
      method: 'delete',
      path: () => `/departments/${victimDepartmentId}`,
    },
    {
      name: 'POST /branches/:branchId/providers',
      method: 'post',
      path: () => `/branches/${fixtures.branchId}/providers`,
      body: () => ({
        name: 'ספק חדש',
        phone: '0500000002',
        departmentIds: [fixtures.departmentId],
      }),
    },
    {
      // Targets the dedicated victim, not fixtures.providerIds[0], which the
      // product-creation case below still needs.
      name: 'PATCH /providers/:id',
      method: 'patch',
      path: () => `/providers/${victimProviderId}`,
      body: () => ({ name: 'שם ספק מעודכן' }),
    },
    {
      name: 'DELETE /providers/:id',
      method: 'delete',
      path: () => `/providers/${victimProviderId}`,
    },
    {
      name: 'POST /providers/:providerId/products',
      method: 'post',
      path: () => `/providers/${fixtures.providerIds[0]}/products`,
      body: () => ({ name: 'מוצר חדש', unitType: 'יחידה' }),
    },
    {
      // Targets the dedicated victim, not fixtures.productId, which the
      // order-item cases below still need.
      name: 'PATCH /products/:id',
      method: 'patch',
      path: () => `/products/${victimProductId}`,
      body: () => ({ name: 'שם מוצר מעודכן' }),
    },
    {
      name: 'DELETE /products/:id',
      method: 'delete',
      path: () => `/products/${victimProductId}`,
    },
    {
      name: 'POST /orders',
      method: 'post',
      path: () => '/orders',
      body: () => ({
        branchId: fixtures.branchId,
        providerId: fixtures.providerIds[0],
      }),
    },
    {
      name: 'POST /orders/:id/items',
      method: 'post',
      path: () => `/orders/${orderId}/items`,
      body: () => ({ productId: fixtures.productId, quantity: 1 }),
    },
    {
      // Runs before the DELETE case below, while itemId still exists.
      name: 'PATCH /orders/:id/items/:itemId',
      method: 'patch',
      path: () => `/orders/${orderId}/items/${itemId}`,
      body: () => ({ quantity: 2 }),
    },
    {
      // The admin case here removes itemId for real; nothing later needs it.
      name: 'DELETE /orders/:id/items/:itemId',
      method: 'delete',
      path: () => `/orders/${orderId}/items/${itemId}`,
    },
    {
      // Runs after the order's item has been removed above; publish does not
      // require items (see orders.service.ts), so this still exercises the
      // guard on a real DRAFT order.
      name: 'POST /orders/:id/publish',
      method: 'post',
      path: () => `/orders/${orderId}/publish`,
    },
    {
      // Last of the order cases: the admin call here deletes the order for
      // real, and nothing runs after it.
      name: 'DELETE /orders/:id',
      method: 'delete',
      path: () => `/orders/${orderId}`,
    },
  ];

  describe.each(cases)('$name', ({ method, path, body }) => {
    it('rejects a caller with no token', async () => {
      await request(app.getHttpServer())[method](path()).expect(401);
    });

    it('rejects a STAFF caller with no access to the target', async () => {
      const req = request(app.getHttpServer())
        [method](path())
        .set(auth(fixtures.staffToken));
      await (body ? req.send(body()) : req).expect(403);
    });

    it('does not reject an admin caller on authorization grounds', async () => {
      const req = request(app.getHttpServer())
        [method](path())
        .set(auth(fixtures.adminToken));
      const response = await (body ? req.send(body()) : req);
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });
  });
});
