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
      const product = list.body.find(
        (p: { id: string }) => p.id === fixtures.productId,
      );
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
      await request(app.getHttpServer())
        .patch(noteUrl(fixtures.providerIds[0], fixtures.productId))
        .set(auth(fixtures.staffToken))
        .send({ note: 'temporary note' })
        .expect(200);
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
