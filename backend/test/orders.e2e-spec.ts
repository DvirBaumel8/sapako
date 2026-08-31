import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, seed, Seeded } from './helpers';
import { RECENT_ORDER_LIMIT } from '../src/orders/orders.service';

describe('orders (e2e)', () => {
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

  it('returns a fractional quantity as a number, not a string', async () => {
    // numeric columns come back from node-postgres as strings. A transformer
    // on the entity prevents that reaching callers; nothing else guards it,
    // and the failure is quiet — arithmetic concatenates and the WhatsApp
    // message reads "2.50 ק"ג".
    const order = await request(app.getHttpServer())
      .post('/orders').set(auth(fixtures.adminToken))
      .send({ branchId: fixtures.branchId, providerId: fixtures.providerIds[0] })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/orders/${order.body.id}/items`).set(auth(fixtures.adminToken))
      .send({ productId: fixtures.productId, quantity: 2.5 })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(`/branches/${fixtures.branchId}/orders`).set(auth(fixtures.adminToken))
      .expect(200);

    const found = list.body.find((o: { id: string }) => o.id === order.body.id);
    expect(typeof found.items[0].quantity).toBe('number');
    expect(found.items[0].quantity).toBe(2.5);
  });

  it('accepts a fractional quantity and rejects one with three decimal places', async () => {
    const order = await request(app.getHttpServer())
      .post('/orders').set(auth(fixtures.adminToken))
      .send({ branchId: fixtures.branchId, providerId: fixtures.providerIds[0] })
      .expect(201);

    // fixtures.productId is a weight product ('ק"ג'), so a fractional
    // quantity like 2.5 is a legitimate order, not an edge case.
    await request(app.getHttpServer())
      .post(`/orders/${order.body.id}/items`).set(auth(fixtures.adminToken))
      .send({ productId: fixtures.productId, quantity: 2.5 })
      .expect(201);

    // The numeric(10,2) column, and the DTO's maxDecimalPlaces: 2, both cap
    // precision at two decimal places.
    await request(app.getHttpServer())
      .post(`/orders/${order.body.id}/items`).set(auth(fixtures.adminToken))
      .send({ productId: fixtures.productId, quantity: 2.567 })
      .expect(400);
  });

  it('publishing marks the order PUBLISHED and it appears in the branch orders', async () => {
    const order = await request(app.getHttpServer())
      .post('/orders').set(auth(fixtures.adminToken))
      .send({ branchId: fixtures.branchId, providerId: fixtures.providerIds[0] })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/orders/${order.body.id}/items`).set(auth(fixtures.adminToken))
      .send({ productId: fixtures.productId, quantity: 1 })
      .expect(201);

    const published = await request(app.getHttpServer())
      .post(`/orders/${order.body.id}/publish`).set(auth(fixtures.adminToken))
      .expect(201);
    expect(published.body.status).toBe('PUBLISHED');

    const list = await request(app.getHttpServer())
      .get(`/branches/${fixtures.branchId}/orders`).set(auth(fixtures.adminToken))
      .expect(200);
    expect(list.body.some((o: { id: string }) => o.id === order.body.id)).toBe(true);
  });

  it('rejects adding an item to a published order', async () => {
    const order = await request(app.getHttpServer())
      .post('/orders').set(auth(fixtures.adminToken))
      .send({ branchId: fixtures.branchId, providerId: fixtures.providerIds[0] })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/orders/${order.body.id}/items`).set(auth(fixtures.adminToken))
      .send({ productId: fixtures.productId, quantity: 1 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/orders/${order.body.id}/publish`).set(auth(fixtures.adminToken))
      .expect(201);

    // withDraftOrder rejects any mutation once the order has left DRAFT —
    // a published order's contents must not move after being handed to
    // WhatsApp.
    await request(app.getHttpServer())
      .post(`/orders/${order.body.id}/items`).set(auth(fixtures.adminToken))
      .send({ productId: fixtures.productId, quantity: 1 })
      .expect(409);
  });

  it(
    'excludes empty orders from the branch list and caps it at RECENT_ORDER_LIMIT',
    async () => {
      // An order with no items should never be returned, regardless of the cap.
      const empty = await request(app.getHttpServer())
        .post('/orders').set(auth(fixtures.adminToken))
        .send({ branchId: fixtures.branchId, providerId: fixtures.providerIds[0] })
        .expect(201);

      // More than the cap, each with one item, so the response can only be
      // explained by the take: RECENT_ORDER_LIMIT in findByBranch.
      for (let i = 0; i < RECENT_ORDER_LIMIT + 5; i++) {
        const order = await request(app.getHttpServer())
          .post('/orders').set(auth(fixtures.adminToken))
          .send({ branchId: fixtures.branchId, providerId: fixtures.providerIds[0] })
          .expect(201);
        await request(app.getHttpServer())
          .post(`/orders/${order.body.id}/items`).set(auth(fixtures.adminToken))
          .send({ productId: fixtures.productId, quantity: 1 })
          .expect(201);
      }

      const list = await request(app.getHttpServer())
        .get(`/branches/${fixtures.branchId}/orders`).set(auth(fixtures.adminToken))
        .expect(200);

      expect(list.body.length).toBe(RECENT_ORDER_LIMIT);
      expect(list.body.some((o: { id: string }) => o.id === empty.body.id)).toBe(false);
    },
    60000,
  );

  it('stops a staff user touching an order for a provider they lack access to', async () => {
    // providerIds[2] sits in the second, ungranted department — this staff
    // user (fresh from this file's own seed()) has no grant reaching it.
    await request(app.getHttpServer())
      .post('/orders').set(auth(fixtures.staffToken))
      .send({ branchId: fixtures.branchId, providerId: fixtures.providerIds[2] })
      .expect(403);

    const order = await request(app.getHttpServer())
      .post('/orders').set(auth(fixtures.adminToken))
      .send({ branchId: fixtures.branchId, providerId: fixtures.providerIds[2] })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/orders/${order.body.id}/items`).set(auth(fixtures.staffToken))
      .send({ quantity: 1 })
      .expect(403);
  });
});
