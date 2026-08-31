import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication();
  // Mirrors main.ts: without it, DTO validation is absent and every test
  // asserting a 400 would fail for reasons unrelated to the endpoint.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
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
 */
export async function seed(app: INestApplication): Promise<Seeded> {
  const http = app.getHttpServer();
  const adminToken = await login(app, ADMIN.username, ADMIN.password);
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const branch = await request(http)
    .post('/branches').set(auth(adminToken)).send({ name: 'סניף בדיקה' }).expect(201);
  const otherBranch = await request(http)
    .post('/branches').set(auth(adminToken)).send({ name: 'סניף שני' }).expect(201);

  const department = await request(http)
    .post(`/branches/${branch.body.id}/departments`)
    .set(auth(adminToken)).send({ name: 'חלב' }).expect(201);
  // CreateProviderDto requires a non-empty departmentIds array (@ArrayNotEmpty),
  // so a provider outside any department isn't possible — the other two
  // providers go in a second, ungranted department instead. That still makes
  // a department grant distinguishable from a grant of everything.
  const otherDepartment = await request(http)
    .post(`/branches/${branch.body.id}/departments`)
    .set(auth(adminToken)).send({ name: 'ירקות' }).expect(201);

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
    .post('/users').set(auth(adminToken))
    .send({ username: STAFF.username, password: STAFF.password, role: 'STAFF' })
    .expect(201);

  return {
    adminToken,
    staffToken: await login(app, STAFF.username, STAFF.password),
    staffUserId: staff.body.id,
    branchId: branch.body.id,
    otherBranchId: otherBranch.body.id,
    departmentId: department.body.id,
    providerIds,
  };
}
