import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, seed, Seeded } from './helpers';

describe('permissions (e2e)', () => {
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

  it('gives a staff user with no grants nothing at all', async () => {
    // Branch access is itself derived from provider access
    // (PermissionsService.getAccessibleBranchIds) — with zero grants
    // anywhere in the branch, the branch is not just empty, it is 403.
    await request(app.getHttpServer())
      .get(`/branches/${fixtures.branchId}/providers`)
      .set(auth(fixtures.staffToken))
      .expect(403);

    await request(app.getHttpServer())
      .get(`/providers/${fixtures.providerIds[0]}/products`)
      .set(auth(fixtures.staffToken))
      .expect(403);
  });

  it('a direct grant makes exactly that provider visible', async () => {
    // providerIds[3] sits in the second, ungranted department, so this is a
    // grant with no department behind it at all.
    await request(app.getHttpServer())
      .put(
        `/users/${fixtures.staffUserId}/providers/${fixtures.providerIds[3]}/access`,
      )
      .set(auth(fixtures.adminToken))
      .send({ granted: true })
      .expect(200);

    const list = await request(app.getHttpServer())
      .get(`/branches/${fixtures.branchId}/providers`)
      .set(auth(fixtures.staffToken))
      .expect(200);
    expect(list.body.map((p: { id: string }) => p.id)).toEqual([
      fixtures.providerIds[3],
    ]);

    await request(app.getHttpServer())
      .get(`/providers/${fixtures.providerIds[3]}/products`)
      .set(auth(fixtures.staffToken))
      .expect(200);

    // The others stay 403 — a direct grant on one provider grants nothing else.
    await request(app.getHttpServer())
      .get(`/providers/${fixtures.providerIds[0]}/products`)
      .set(auth(fixtures.staffToken))
      .expect(403);
  });

  it('a department grant makes every provider in it visible, reported as DEPARTMENT', async () => {
    await request(app.getHttpServer())
      .put(
        `/users/${fixtures.staffUserId}/departments/${fixtures.departmentId}/access`,
      )
      .set(auth(fixtures.adminToken))
      .send({ granted: true })
      .expect(200);

    await request(app.getHttpServer())
      .get(`/providers/${fixtures.providerIds[0]}/products`)
      .set(auth(fixtures.staffToken))
      .expect(200);
    await request(app.getHttpServer())
      .get(`/providers/${fixtures.providerIds[1]}/products`)
      .set(auth(fixtures.staffToken))
      .expect(200);

    const access = await request(app.getHttpServer())
      .get(`/users/${fixtures.staffUserId}/access`)
      .query({ branchId: fixtures.branchId })
      .set(auth(fixtures.adminToken))
      .expect(200);
    const byId = Object.fromEntries(
      access.body.providers.map((p: { id: string; reason: string }) => [
        p.id,
        p,
      ]),
    );
    expect(byId[fixtures.providerIds[0]].reason).toBe('DEPARTMENT');
    expect(byId[fixtures.providerIds[1]].reason).toBe('DEPARTMENT');
  });

  it('reaches a provider added to a granted department afterwards', async () => {
    // The reason department grants exist rather than being expanded into
    // individual grants at write time. Nothing else can catch that
    // regression: at the moment of granting, both designs look identical.
    const created = await request(app.getHttpServer())
      .post(`/branches/${fixtures.branchId}/providers`)
      .set(auth(fixtures.adminToken))
      .send({
        name: 'ספק חדש',
        phone: '0500000001',
        departmentIds: [fixtures.departmentId],
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/providers/${created.body.id}/products`)
      .set(auth(fixtures.staffToken))
      .expect(200);
  });

  it('blocking a department-granted provider 403s it while siblings stay 200', async () => {
    await request(app.getHttpServer())
      .put(
        `/users/${fixtures.staffUserId}/providers/${fixtures.providerIds[0]}/access`,
      )
      .set(auth(fixtures.adminToken))
      .send({ granted: false })
      .expect(200);

    await request(app.getHttpServer())
      .get(`/providers/${fixtures.providerIds[0]}/products`)
      .set(auth(fixtures.staffToken))
      .expect(403);

    // Its sibling in the same department is untouched.
    await request(app.getHttpServer())
      .get(`/providers/${fixtures.providerIds[1]}/products`)
      .set(auth(fixtures.staffToken))
      .expect(200);
  });

  it('revoking the department leaves the block dormant, with no viaDepartmentName', async () => {
    await request(app.getHttpServer())
      .put(
        `/users/${fixtures.staffUserId}/departments/${fixtures.departmentId}/access`,
      )
      .set(auth(fixtures.adminToken))
      .send({ granted: false })
      .expect(200);

    const access = await request(app.getHttpServer())
      .get(`/users/${fixtures.staffUserId}/access`)
      .query({ branchId: fixtures.branchId })
      .set(auth(fixtures.adminToken))
      .expect(200);
    const provider0 = access.body.providers.find(
      (p: { id: string }) => p.id === fixtures.providerIds[0],
    );
    expect(provider0.reason).toBe('BLOCKED');
    expect(provider0.viaDepartmentName).toBeUndefined();
  });

  it('re-granting the department brings the exception back, name and all', async () => {
    await request(app.getHttpServer())
      .put(
        `/users/${fixtures.staffUserId}/departments/${fixtures.departmentId}/access`,
      )
      .set(auth(fixtures.adminToken))
      .send({ granted: true })
      .expect(200);

    const access = await request(app.getHttpServer())
      .get(`/users/${fixtures.staffUserId}/access`)
      .query({ branchId: fixtures.branchId })
      .set(auth(fixtures.adminToken))
      .expect(200);
    const provider0 = access.body.providers.find(
      (p: { id: string }) => p.id === fixtures.providerIds[0],
    );
    expect(provider0.reason).toBe('BLOCKED');
    expect(provider0.viaDepartmentName).toBe('חלב');

    // Still blocked, unlike its department-granted sibling.
    await request(app.getHttpServer())
      .get(`/providers/${fixtures.providerIds[0]}/products`)
      .set(auth(fixtures.staffToken))
      .expect(403);
    await request(app.getHttpServer())
      .get(`/providers/${fixtures.providerIds[1]}/products`)
      .set(auth(fixtures.staffToken))
      .expect(200);
  });

  it('clearing a branch removes its grants and leaves the other branch alone', async () => {
    // Set up a provider on the second branch, granted directly to staff, so
    // there is something concrete to prove the clear does not touch it.
    const otherDepartment = await request(app.getHttpServer())
      .post(`/branches/${fixtures.otherBranchId}/departments`)
      .set(auth(fixtures.adminToken))
      .send({ name: 'משקאות' })
      .expect(201);
    const otherProvider = await request(app.getHttpServer())
      .post(`/branches/${fixtures.otherBranchId}/providers`)
      .set(auth(fixtures.adminToken))
      .send({
        name: 'ספק בסניף אחר',
        phone: '0500000002',
        departmentIds: [otherDepartment.body.id],
      })
      .expect(201);
    await request(app.getHttpServer())
      .put(
        `/users/${fixtures.staffUserId}/providers/${otherProvider.body.id}/access`,
      )
      .set(auth(fixtures.adminToken))
      .send({ granted: true })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/providers/${otherProvider.body.id}/products`)
      .set(auth(fixtures.staffToken))
      .expect(200);

    // Clear the first branch entirely.
    await request(app.getHttpServer())
      .put(
        `/users/${fixtures.staffUserId}/branches/${fixtures.branchId}/access`,
      )
      .set(auth(fixtures.adminToken))
      .send({ granted: false })
      .expect(200);

    // Everything in the cleared branch is gone: the direct grant (providerIds[3]),
    // the department grant (providerIds[1]) and the dormant block (providerIds[0]).
    await request(app.getHttpServer())
      .get(`/providers/${fixtures.providerIds[3]}/products`)
      .set(auth(fixtures.staffToken))
      .expect(403);
    await request(app.getHttpServer())
      .get(`/providers/${fixtures.providerIds[1]}/products`)
      .set(auth(fixtures.staffToken))
      .expect(403);
    await request(app.getHttpServer())
      .get(`/providers/${fixtures.providerIds[0]}/products`)
      .set(auth(fixtures.staffToken))
      .expect(403);

    // The other branch's grant is untouched.
    await request(app.getHttpServer())
      .get(`/providers/${otherProvider.body.id}/products`)
      .set(auth(fixtures.staffToken))
      .expect(200);
  });

  it('a staff user cannot call any of the access endpoints', async () => {
    await request(app.getHttpServer())
      .get(`/users/${fixtures.staffUserId}/access`)
      .query({ branchId: fixtures.branchId })
      .set(auth(fixtures.staffToken))
      .expect(403);

    await request(app.getHttpServer())
      .put(
        `/users/${fixtures.staffUserId}/providers/${fixtures.providerIds[0]}/access`,
      )
      .set(auth(fixtures.staffToken))
      .send({ granted: true })
      .expect(403);

    await request(app.getHttpServer())
      .put(
        `/users/${fixtures.staffUserId}/departments/${fixtures.departmentId}/access`,
      )
      .set(auth(fixtures.staffToken))
      .send({ granted: true })
      .expect(403);

    await request(app.getHttpServer())
      .put(
        `/users/${fixtures.staffUserId}/branches/${fixtures.branchId}/access`,
      )
      .set(auth(fixtures.staffToken))
      .send({ granted: true })
      .expect(403);
  });
});
