import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { VALIDATION_PIPE_OPTIONS } from '../src/validation';

export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication();
  // The same options object main.ts uses, not a copy of it — so a test
  // asserting a 400 is asserting something about production.
  app.useGlobalPipes(new ValidationPipe(VALIDATION_PIPE_OPTIONS));
  await app.init();
  return app;
}

export async function login(
  app: INestApplication,
  username: string,
  password: string,
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ username, password })
    .expect(201);
  return response.body.accessToken;
}

export interface Seeded {
  adminToken: string;
  staffToken: string;
  staffUserId: string;
  branchId: string;
  otherBranchId: string;
  departmentId: string;
  providerIds: string[];
  productId: string;
}

export const ADMIN = { username: 'e2e-admin', password: 'e2e-admin-pass' };
export const STAFF = { username: 'e2e-staff', password: 'e2e-staff-pass' };

/**
 * One branch with two departments and four providers, plus a second branch.
 * The second branch exists so tests can prove an action confined to one
 * branch leaves the other alone — the property the permission model is built
 * around.
 *
 * Everything after the first admin is created through the public API, so the
 * fixtures exercise the same paths the app does rather than a private
 * shortcut that could drift from them.
 *
 * Each spec file calls this in its own `beforeAll`, but they all share one
 * database with no reset in between (only the whole-run global setup/
 * teardown touch it) — so anything with a global-uniqueness constraint
 * (branches.name, users.username) is suffixed per call. Department and
 * provider names are only unique within their own branch, which this
 * already gives each call, so they need no suffix.
 */
export async function seed(app: INestApplication): Promise<Seeded> {
  const http = app.getHttpServer();
  const adminToken = await login(app, ADMIN.username, ADMIN.password);
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const suffix = randomUUID().slice(0, 8);
  const staffUsername = `${STAFF.username}-${suffix}`;

  const branch = await request(http)
    .post('/branches')
    .set(auth(adminToken))
    .send({ name: `סניף בדיקה ${suffix}` })
    .expect(201);
  const otherBranch = await request(http)
    .post('/branches')
    .set(auth(adminToken))
    .send({ name: `סניף שני ${suffix}` })
    .expect(201);

  const department = await request(http)
    .post(`/branches/${branch.body.id}/departments`)
    .set(auth(adminToken))
    .send({ name: 'חלב' })
    .expect(201);
  // CreateProviderDto requires a non-empty departmentIds array (@ArrayNotEmpty),
  // so a provider outside any department isn't possible — the other two
  // providers go in a second, ungranted department instead. That still makes
  // a department grant distinguishable from a grant of everything.
  const otherDepartment = await request(http)
    .post(`/branches/${branch.body.id}/departments`)
    .set(auth(adminToken))
    .send({ name: 'ירקות' })
    .expect(201);

  const providerIds: string[] = [];
  for (const name of ['תנובה', 'שטראוס', 'אוסם', 'הנמל']) {
    const created = await request(http)
      .post(`/branches/${branch.body.id}/providers`)
      .set(auth(adminToken))
      // Only the first two sit in the target department, so a department
      // grant is distinguishable from a grant of everything.
      .send({
        name,
        phone: '0500000000',
        departmentIds: [
          providerIds.length < 2 ? department.body.id : otherDepartment.body.id,
        ],
      })
      .expect(201);
    providerIds.push(created.body.id);
  }

  const staff = await request(http)
    .post('/users')
    .set(auth(adminToken))
    .send({ username: staffUsername, password: STAFF.password, role: 'STAFF' })
    .expect(201);

  // A weight unit ('ק"ג'), not a count, so the quantity is fractional and
  // the numeric-column transformer actually gets exercised.
  const product = await request(http)
    .post(`/providers/${providerIds[0]}/products`)
    .set(auth(adminToken))
    .send({ name: 'עגבניות', unitType: 'ק"ג' })
    .expect(201);

  return {
    adminToken,
    staffToken: await login(app, staffUsername, STAFF.password),
    staffUserId: staff.body.id,
    branchId: branch.body.id,
    otherBranchId: otherBranch.body.id,
    departmentId: department.body.id,
    providerIds,
    productId: product.body.id,
  };
}
