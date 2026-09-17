import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, seed, Seeded } from './helpers';

// Proves the actual race the transaction+catch in providers.service.ts and
// categories.service.ts exists for: two requests naming the same thing at
// once, neither seeing the other's row yet when each checks. Without that
// fix, the loser here would get an unhandled 500 instead of the same 409 a
// sequential duplicate already gets.
describe('Unique-name creation race (e2e)', () => {
  let app: INestApplication;
  let fixtures: Seeded;

  beforeAll(async () => {
    app = await createTestApp();
    fixtures = await seed(app);
  });

  afterAll(async () => {
    await app.close();
  });

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('lets exactly one of two concurrent same-name providers through, the other as a clean 409', async () => {
    const http = app.getHttpServer();
    const name = `מירוץ ${Date.now()}`;

    const [first, second] = await Promise.all([
      request(http)
        .post(`/branches/${fixtures.branchId}/providers`)
        .set(auth(fixtures.adminToken))
        .send({ name, phone: '0500000000', departmentIds: [fixtures.departmentId] }),
      request(http)
        .post(`/branches/${fixtures.branchId}/providers`)
        .set(auth(fixtures.adminToken))
        .send({ name, phone: '0500000000', departmentIds: [fixtures.departmentId] }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  it('lets exactly one of two concurrent same-name categories through, the other as a clean 409', async () => {
    const http = app.getHttpServer();
    const name = `מירוץ ${Date.now()}`;
    const providerId = fixtures.providerIds[0];

    const [first, second] = await Promise.all([
      request(http)
        .post(`/providers/${providerId}/categories`)
        .set(auth(fixtures.adminToken))
        .send({ name }),
      request(http)
        .post(`/providers/${providerId}/categories`)
        .set(auth(fixtures.adminToken))
        .send({ name }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
  });
});
