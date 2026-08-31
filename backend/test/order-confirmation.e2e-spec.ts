import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, seed, Seeded } from './helpers';

/**
 * The lifecycle a WhatsApp send actually has.
 *
 * Opening wa.me tells the app nothing about whether the message left the
 * device, so an order goes to AWAITING_CONFIRMATION on handoff and only
 * reaches PUBLISHED when the user says so. These tests walk both endings.
 *
 * No email is sent from here: RESEND_API_KEY is unset in CI and locally, and
 * the notifier no-ops without it. That is asserted directly in
 * src/notifications/order-notifier.service.spec.ts.
 */
describe('order send confirmation (e2e)', () => {
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
  const http = () => app.getHttpServer();

  const draftWithItem = async (): Promise<string> => {
    const order = await request(http())
      .post('/orders')
      .set(auth(fixtures.adminToken))
      .send({
        branchId: fixtures.branchId,
        providerId: fixtures.providerIds[0],
      })
      .expect(201);
    await request(http())
      .post(`/orders/${order.body.id}/items`)
      .set(auth(fixtures.adminToken))
      .send({ productId: fixtures.productId, quantity: 2 })
      .expect(201);
    return order.body.id;
  };

  describe('handing off to WhatsApp', () => {
    it('moves the order to AWAITING_CONFIRMATION, not PUBLISHED', async () => {
      const orderId = await draftWithItem();

      const response = await request(http())
        .post(`/orders/${orderId}/handoff`)
        .set(auth(fixtures.adminToken))
        .expect(201);

      expect(response.body.status).toBe('AWAITING_CONFIRMATION');
    });

    it('records the handoff time but leaves publishedAt empty', async () => {
      // publishedAt means "the supplier was contacted". Nothing yet proves
      // that, so it must stay null.
      const orderId = await draftWithItem();

      const response = await request(http())
        .post(`/orders/${orderId}/handoff`)
        .set(auth(fixtures.adminToken))
        .expect(201);

      expect(response.body.handedOffAt).not.toBeNull();
      expect(response.body.publishedAt ?? null).toBeNull();
    });

    it('refuses a second handoff', async () => {
      const orderId = await draftWithItem();
      await request(http())
        .post(`/orders/${orderId}/handoff`)
        .set(auth(fixtures.adminToken))
        .expect(201);

      await request(http())
        .post(`/orders/${orderId}/handoff`)
        .set(auth(fixtures.adminToken))
        .expect(409);
    });

    it('locks the items, so the record cannot drift from what was sent', async () => {
      const orderId = await draftWithItem();
      const order = await request(http())
        .get(`/branches/${fixtures.branchId}/orders`)
        .set(auth(fixtures.adminToken))
        .expect(200);
      const itemId = order.body.find(
        (candidate: { id: string }) => candidate.id === orderId,
      ).items[0].id;

      await request(http())
        .post(`/orders/${orderId}/handoff`)
        .set(auth(fixtures.adminToken))
        .expect(201);

      await request(http())
        .patch(`/orders/${orderId}/items/${itemId}`)
        .set(auth(fixtures.adminToken))
        .send({ quantity: 99 })
        .expect(409);
    });
  });

  describe('confirming it was sent', () => {
    it('publishes the order and stamps publishedAt', async () => {
      const orderId = await draftWithItem();
      await request(http())
        .post(`/orders/${orderId}/handoff`)
        .set(auth(fixtures.adminToken))
        .expect(201);

      const response = await request(http())
        .post(`/orders/${orderId}/confirm`)
        .set(auth(fixtures.adminToken))
        .expect(201);

      expect(response.body.status).toBe('PUBLISHED');
      expect(response.body.publishedAt).not.toBeNull();
    });

    it('refuses to confirm an order that was never handed off', async () => {
      const orderId = await draftWithItem();

      await request(http())
        .post(`/orders/${orderId}/confirm`)
        .set(auth(fixtures.adminToken))
        .expect(409);
    });

    it('refuses to confirm twice, so no duplicate record is produced', async () => {
      const orderId = await draftWithItem();
      await request(http())
        .post(`/orders/${orderId}/handoff`)
        .set(auth(fixtures.adminToken))
        .expect(201);
      await request(http())
        .post(`/orders/${orderId}/confirm`)
        .set(auth(fixtures.adminToken))
        .expect(201);

      await request(http())
        .post(`/orders/${orderId}/confirm`)
        .set(auth(fixtures.adminToken))
        .expect(409);
    });
  });

  describe('saying it was not sent', () => {
    it('returns the order to DRAFT', async () => {
      const orderId = await draftWithItem();
      await request(http())
        .post(`/orders/${orderId}/handoff`)
        .set(auth(fixtures.adminToken))
        .expect(201);

      const response = await request(http())
        .post(`/orders/${orderId}/revert`)
        .set(auth(fixtures.adminToken))
        .expect(201);

      expect(response.body.status).toBe('DRAFT');
      expect(response.body.handedOffAt ?? null).toBeNull();
    });

    it('makes the items editable again', async () => {
      // The point of reverting: the order was never sent, so it goes back to
      // being a draft the user can fix and retry.
      const orderId = await draftWithItem();
      const orders = await request(http())
        .get(`/branches/${fixtures.branchId}/orders`)
        .set(auth(fixtures.adminToken))
        .expect(200);
      const itemId = orders.body.find(
        (candidate: { id: string }) => candidate.id === orderId,
      ).items[0].id;
      await request(http())
        .post(`/orders/${orderId}/handoff`)
        .set(auth(fixtures.adminToken))
        .expect(201);
      await request(http())
        .post(`/orders/${orderId}/revert`)
        .set(auth(fixtures.adminToken))
        .expect(201);

      await request(http())
        .patch(`/orders/${orderId}/items/${itemId}`)
        .set(auth(fixtures.adminToken))
        .send({ quantity: 99 })
        .expect(200);
    });

    it('refuses to revert an order that is already published', async () => {
      const orderId = await draftWithItem();
      await request(http())
        .post(`/orders/${orderId}/handoff`)
        .set(auth(fixtures.adminToken))
        .expect(201);
      await request(http())
        .post(`/orders/${orderId}/confirm`)
        .set(auth(fixtures.adminToken))
        .expect(201);

      await request(http())
        .post(`/orders/${orderId}/revert`)
        .set(auth(fixtures.adminToken))
        .expect(409);
    });
  });

  describe('the awaiting list', () => {
    it('reports an order that is waiting to be answered for', async () => {
      const orderId = await draftWithItem();
      await request(http())
        .post(`/orders/${orderId}/handoff`)
        .set(auth(fixtures.adminToken))
        .expect(201);

      const response = await request(http())
        .get(`/branches/${fixtures.branchId}/orders/awaiting-confirmation`)
        .set(auth(fixtures.adminToken))
        .expect(200);

      expect(response.body.map((order: { id: string }) => order.id)).toContain(
        orderId,
      );
    });

    it('drops it once confirmed', async () => {
      const orderId = await draftWithItem();
      await request(http())
        .post(`/orders/${orderId}/handoff`)
        .set(auth(fixtures.adminToken))
        .expect(201);
      await request(http())
        .post(`/orders/${orderId}/confirm`)
        .set(auth(fixtures.adminToken))
        .expect(201);

      const response = await request(http())
        .get(`/branches/${fixtures.branchId}/orders/awaiting-confirmation`)
        .set(auth(fixtures.adminToken))
        .expect(200);

      expect(
        response.body.map((order: { id: string }) => order.id),
      ).not.toContain(orderId);
    });

    it('carries the provider, so the prompt can name who it was sent to', async () => {
      const orderId = await draftWithItem();
      await request(http())
        .post(`/orders/${orderId}/handoff`)
        .set(auth(fixtures.adminToken))
        .expect(201);

      const response = await request(http())
        .get(`/branches/${fixtures.branchId}/orders/awaiting-confirmation`)
        .set(auth(fixtures.adminToken))
        .expect(200);

      const awaiting = response.body.find(
        (order: { id: string }) => order.id === orderId,
      );
      expect(awaiting.provider.name).toBeTruthy();
    });
  });

  describe('changing an item unit', () => {
    it('changes the unit for this order without touching the catalogue', async () => {
      const orderId = await draftWithItem();
      const orders = await request(http())
        .get(`/branches/${fixtures.branchId}/orders`)
        .set(auth(fixtures.adminToken))
        .expect(200);
      const itemId = orders.body.find(
        (candidate: { id: string }) => candidate.id === orderId,
      ).items[0].id;

      await request(http())
        .patch(`/orders/${orderId}/items/${itemId}`)
        .set(auth(fixtures.adminToken))
        .send({ unitType: 'קרטון' })
        .expect(200);

      const products = await request(http())
        .get(`/providers/${fixtures.providerIds[0]}/products`)
        .set(auth(fixtures.adminToken))
        .expect(200);
      const product = products.body.find(
        (candidate: { id: string }) => candidate.id === fixtures.productId,
      );
      // The fixture product is a weight item; the order line is now cartons
      // and the catalogue must be unchanged.
      expect(product.unitType).toBe('ק"ג');
    });

    it('rejects a unit outside the fixed list', async () => {
      const orderId = await draftWithItem();
      const orders = await request(http())
        .get(`/branches/${fixtures.branchId}/orders`)
        .set(auth(fixtures.adminToken))
        .expect(200);
      const itemId = orders.body.find(
        (candidate: { id: string }) => candidate.id === orderId,
      ).items[0].id;

      await request(http())
        .patch(`/orders/${orderId}/items/${itemId}`)
        .set(auth(fixtures.adminToken))
        .send({ unitType: 'שקית' })
        .expect(400);
    });

    it('rejects a request carrying neither a quantity nor a unit', async () => {
      const orderId = await draftWithItem();
      const orders = await request(http())
        .get(`/branches/${fixtures.branchId}/orders`)
        .set(auth(fixtures.adminToken))
        .expect(200);
      const itemId = orders.body.find(
        (candidate: { id: string }) => candidate.id === orderId,
      ).items[0].id;

      await request(http())
        .patch(`/orders/${orderId}/items/${itemId}`)
        .set(auth(fixtures.adminToken))
        .send({})
        .expect(400);
    });
  });

  describe('adding an item with a unit override', () => {
    it('stores the override instead of the product’s catalogue unit', async () => {
      const order = await request(http())
        .post('/orders')
        .set(auth(fixtures.adminToken))
        .send({
          branchId: fixtures.branchId,
          providerId: fixtures.providerIds[0],
        })
        .expect(201);

      const item = await request(http())
        .post(`/orders/${order.body.id}/items`)
        .set(auth(fixtures.adminToken))
        // The fixture product is 'ק"ג' in the catalogue.
        .send({ productId: fixtures.productId, unitType: 'קרטון', quantity: 2 })
        .expect(201);

      expect(item.body.unitType).toBe('קרטון');
    });

    it('rejects a unit outside the list even when a productId is given', async () => {
      // The validation guard used to be keyed on the absence of a productId,
      // which skipped every check on exactly this path.
      const order = await request(http())
        .post('/orders')
        .set(auth(fixtures.adminToken))
        .send({
          branchId: fixtures.branchId,
          providerId: fixtures.providerIds[0],
        })
        .expect(201);

      await request(http())
        .post(`/orders/${order.body.id}/items`)
        .set(auth(fixtures.adminToken))
        .send({ productId: fixtures.productId, unitType: 'שקית', quantity: 2 })
        .expect(400);
    });

    it('still falls back to the catalogue unit when none is given', async () => {
      const order = await request(http())
        .post('/orders')
        .set(auth(fixtures.adminToken))
        .send({
          branchId: fixtures.branchId,
          providerId: fixtures.providerIds[0],
        })
        .expect(201);

      const item = await request(http())
        .post(`/orders/${order.body.id}/items`)
        .set(auth(fixtures.adminToken))
        .send({ productId: fixtures.productId, quantity: 2 })
        .expect(201);

      expect(item.body.unitType).toBe('ק"ג');
    });
  });
});
