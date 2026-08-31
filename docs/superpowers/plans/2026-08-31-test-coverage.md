# Closing the Test Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the checks that were performed by hand into tests that run on every push, and cover the three areas currently untested: the API against a real database, the screens, and controller validation.

**Architecture:** Three independent layers. API tests boot the real Nest app against a throwaway Postgres database and assert over HTTP. Screen tests introduce `@testing-library/react-native` and cover the handful of behaviours that actually broke during development. Controller tests stay unit-level with mocked services, covering validation and guards.

**Tech Stack:** NestJS, TypeORM, Postgres, supertest, Jest, Expo/React Native Web, `@testing-library/react-native`.

**Starting point, measured:** backend 58.5% statements / 51.3% functions; mobile 96.8% of lines — but only 186 of 4,994 lines are instrumented, with zero `.tsx` files measured. One e2e test (`GET /health`). No screen has any test.

---

## What this plan does not attempt

Chasing a coverage percentage. `main.ts`, module files and `data-source.ts` are wiring — a test that boots them proves only that they boot, which the existing e2e already does. The target is the behaviour that broke in practice, not the number.

---

## File Structure

### Created

| File | Responsibility |
|---|---|
| `backend/test/setup-database.ts` | creates, migrates and truncates the test database |
| `backend/test/helpers.ts` | app bootstrap, login, and fixture builders shared by API specs |
| `backend/test/permissions.e2e-spec.ts` | the permission rules over HTTP |
| `backend/test/orders.e2e-spec.ts` | the order lifecycle over HTTP |
| `backend/src/users/users.controller.spec.ts` | (extend) validation and guards |
| `backend/src/branches/branches.controller.spec.ts` | validation and guards |
| `mobile/src/ui/AlertProvider.test.tsx` | the dialog that lost its Cancel branch |
| `mobile/app/(app)/providers/[providerId]/order.test.tsx` | the stepper that dropped taps |

### Modified

| File | Change |
|---|---|
| `backend/test/jest-e2e.json` | global setup/teardown, serial execution |
| `backend/package.json` | `test:e2e` script |
| `.github/workflows/backend-ci.yml` | Postgres service container, run e2e |
| `mobile/package.json` | `@testing-library/react-native`, jest setup file |

---

## Task 1: A database the API tests can own

API tests are worth having only if they run against real Postgres — mocked
repositories would re-test the mocks. They therefore need a database they may
freely destroy.

**Files:**
- Create: `backend/test/setup-database.ts`
- Modify: `backend/test/jest-e2e.json`, `backend/package.json`

- [ ] **Step 1: Write the setup module**

```ts
import { DataSource } from 'typeorm';
import dataSource from '../src/database/data-source';

/**
 * The API tests run against a real Postgres database, not mocked
 * repositories — a mocked repository test would only assert that the mocks
 * behave like the mocks. This creates a database the tests may destroy.
 *
 * DATABASE_URL is redirected before anything imports the app, because the
 * data source reads process.env at module-evaluation time.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://${process.env.USER ?? 'postgres'}@localhost:5432/sapako_e2e`;

export async function createTestDatabase(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL);
  const databaseName = url.pathname.slice(1);
  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = '/postgres';

  const admin = new DataSource({ type: 'postgres', url: adminUrl.toString() });
  await admin.initialize();
  // Dropped and recreated rather than truncated: a schema change between runs
  // would otherwise leave a stale database that fails in confusing ways.
  await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${databaseName}`);
  await admin.destroy();

  process.env.DATABASE_URL = TEST_DATABASE_URL;
  await dataSource.setOptions({ url: TEST_DATABASE_URL }).initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();
}

export async function dropTestDatabase(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL);
  const databaseName = url.pathname.slice(1);
  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = '/postgres';

  const admin = new DataSource({ type: 'postgres', url: adminUrl.toString() });
  await admin.initialize();
  await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await admin.destroy();
}
```

- [ ] **Step 2: Wire it into the e2e jest config**

`backend/test/jest-e2e.json`:

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "globalSetup": "<rootDir>/global-setup.ts",
  "globalTeardown": "<rootDir>/global-teardown.ts",
  "maxWorkers": 1
}
```

`maxWorkers: 1` is deliberate: the specs share one database, and running them
in parallel would have them truncating each other's rows mid-test.

`backend/test/global-setup.ts`:

```ts
import { createTestDatabase } from './setup-database';

export default async function globalSetup(): Promise<void> {
  await createTestDatabase();
}
```

`backend/test/global-teardown.ts`:

```ts
import { dropTestDatabase } from './setup-database';

export default async function globalTeardown(): Promise<void> {
  await dropTestDatabase();
}
```

- [ ] **Step 3: Add the script**

In `backend/package.json`, the `test:e2e` script already exists as
`jest --config ./test/jest-e2e.json`. Confirm it, and leave `npm test`
covering unit tests only — the two suites have different requirements and
mixing them makes a failure harder to place.

- [ ] **Step 4: Verify the harness before writing any test against it**

```bash
cd backend && npm run test:e2e
```

Expected: the existing health spec passes, and `psql -l` shows no
`sapako_e2e` afterwards. If the database survives teardown, stop — a leaked
test database will make the next run pass for the wrong reason.

- [ ] **Step 5: Commit**

```bash
git add backend/test backend/package.json
git commit -m "test(backend): give the API tests a disposable database"
```

---

## Task 2: Shared fixtures

Every API spec needs an admin, a branch, providers and a staff user. Written
once so a spec reads as the behaviour it tests rather than as setup.

**Files:**
- Create: `backend/test/helpers.ts`

- [ ] **Step 1: Write the helpers**

```ts
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

  const providerIds: string[] = [];
  for (const name of ['תנובה', 'שטראוס', 'אוסם', 'הנמל']) {
    const created = await request(http)
      .post(`/branches/${branch.body.id}/providers`)
      .set(auth(adminToken))
      // Only the first two sit in the department, so a department grant is
      // distinguishable from a grant of everything.
      .send({
        name,
        phone: '0500000000',
        departmentIds: providerIds.length < 2 ? [department.body.id] : [],
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
```

**The first admin comes from the bootstrap service, not a direct insert.**
`AdminBootstrapService.onModuleInit` creates one when the users table is empty
and `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` are set — which is
exactly the state of a freshly migrated test database. Set both in
`global-setup.ts` before any app boots:

```ts
process.env.BOOTSTRAP_ADMIN_USERNAME = 'e2e-admin';
process.env.BOOTSTRAP_ADMIN_PASSWORD = 'e2e-admin-pass';
```

Verify the provider and department endpoint paths against the real
controllers before relying on them above; correct the helper if they differ,
and say so in your report.

- [ ] **Step 2: Verify the helpers boot and seed**

Write one throwaway spec that calls `seed` and asserts the branch has four
providers over HTTP, run it, then delete it.

- [ ] **Step 3: Commit**

```bash
git add backend/test/helpers.ts
git commit -m "test(backend): shared fixtures for the API tests"
```

---

## Task 3: The permission rules over HTTP

These are the checks performed by hand while building the feature. They found
nothing wrong at the time, which is exactly why they need to keep running.

**Files:**
- Create: `backend/test/permissions.e2e-spec.ts`

- [ ] **Step 1: Write the spec**

Cover, each as its own test:

1. A staff user with no grants sees no providers, and `GET /providers/:id/products` returns 403.
2. A direct grant makes exactly that provider visible; the others stay 403.
3. A department grant makes every provider in it visible, each reported as `reason: DEPARTMENT`.
4. **A provider added to a granted department afterwards is reachable without any new grant.** This is the whole reason department grants exist and cannot be checked any other way.
5. Blocking a department-granted provider returns 403 for it while its siblings stay 200.
6. Revoking the department leaves the block dormant: the provider reports `BLOCKED` with no `viaDepartmentName`.
7. Re-granting the department brings the exception back, name and all.
8. `PUT /branches/:id/access {granted:false}` clears that branch and leaves the other branch's grants intact.
9. A staff user cannot call any of the access endpoints (403).

Test 4 and test 8 are the two that justify this file existing; the rest are
regression guards.

The first two, written out — the remainder follow the same shape:

```ts
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
    const list = await request(app.getHttpServer())
      .get(`/branches/${fixtures.branchId}/providers`)
      .set(auth(fixtures.staffToken))
      .expect(200);
    expect(list.body).toEqual([]);

    await request(app.getHttpServer())
      .get(`/providers/${fixtures.providerIds[0]}/products`)
      .set(auth(fixtures.staffToken))
      .expect(403);
  });

  it('reaches a provider added to a granted department afterwards', async () => {
    // The reason department grants exist rather than being expanded into
    // individual grants at write time. Nothing else can catch that
    // regression: at the moment of granting, both designs look identical.
    await request(app.getHttpServer())
      .put(`/users/${fixtures.staffUserId}/departments/${fixtures.departmentId}/access`)
      .set(auth(fixtures.adminToken))
      .send({ granted: true })
      .expect(200);

    const created = await request(app.getHttpServer())
      .post(`/branches/${fixtures.branchId}/providers`)
      .set(auth(fixtures.adminToken))
      .send({ name: 'ספק חדש', phone: '0500000001', departmentIds: [fixtures.departmentId] })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/providers/${created.body.id}/products`)
      .set(auth(fixtures.staffToken))
      .expect(200);
  });
});
```

- [ ] **Step 2: Run**

```bash
cd backend && npm run test:e2e
```

Expected: all pass. If test 4 fails, the department grant is being expanded
into individual grants at write time rather than resolved at read time —
report it, because that is a design regression rather than a test failure.

- [ ] **Step 3: Commit**

```bash
git add backend/test/permissions.e2e-spec.ts
git commit -m "test(backend): cover the permission rules over HTTP"
```

---

## Task 4: The order lifecycle over HTTP

**Files:**
- Create: `backend/test/orders.e2e-spec.ts`

- [ ] **Step 1: Write the spec**

1. Creating a draft, adding an item, changing its quantity, and reading it back — asserting `quantity` arrives as a **number**, not the string `"2.50"`. This is the numeric-column trap that a transformer exists to prevent; nothing else guards it.
2. A weight product accepts `2.5`; a three-decimal quantity is rejected with 400.
3. Publishing marks the order `PUBLISHED` and it then appears in the branch's orders.
4. An item cannot be added to a published order.
5. The branch orders list excludes orders with no items and is capped at `RECENT_ORDER_LIMIT`.
6. A staff user cannot touch an order for a provider they lack access to.

The first, written out — the remainder follow the same shape:

```ts
it('returns a fractional quantity as a number, not a string', async () => {
  // numeric columns come back from node-postgres as strings. A transformer
  // on the entity prevents that reaching callers; nothing else guards it,
  // and the failure is quiet — arithmetic concatenates and the WhatsApp
  // message reads "2.50 קילו".
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

  expect(typeof list.body[0].items[0].quantity).toBe('number');
  expect(list.body[0].items[0].quantity).toBe(2.5);
});
```

`seed` does not currently create a product; add one to it, and add `productId`
to `Seeded`, as part of this task.

- [ ] **Step 2: Run and commit**

```bash
cd backend && npm run test:e2e
git add backend/test/orders.e2e-spec.ts
git commit -m "test(backend): cover the order lifecycle over HTTP"
```

---

## Task 5: Run the API tests in CI

Without this they are tests that someone must remember to run.

**Files:**
- Modify: `.github/workflows/backend-ci.yml`

- [ ] **Step 1: Add a Postgres service and the e2e step**

```yaml
jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: postgres
        ports: ['5432:5432']
        # Without a health check the steps start before Postgres accepts
        # connections and the first run fails intermittently.
        options: >-
          --health-cmd pg_isready --health-interval 10s
          --health-timeout 5s --health-retries 5
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run test:e2e
        env:
          TEST_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/sapako_e2e
          JWT_SECRET: test-secret-not-used-outside-ci
```

- [ ] **Step 2: Note the trigger gap**

`backend-ci.yml` runs on `pull_request` only, and this project pushes straight
to `main`. Add `push:` with the same paths so these actually run. Say so in
the commit message rather than leaving it as a silent change.

- [ ] **Step 3: Commit and confirm the run is green**

```bash
git add .github/workflows/backend-ci.yml
git commit -m "ci: run the API tests against Postgres on every push"
git push && gh run watch
```

---

## Task 6: Screen tests

This introduces a dependency the project deliberately lacked. The cases below
are the ones that actually broke during development; a screen test that
asserts a heading renders would be cost without benefit.

**Files:**
- Modify: `mobile/package.json`
- Create: `mobile/src/ui/AlertProvider.test.tsx`, `mobile/app/(app)/providers/[providerId]/order.test.tsx`

- [ ] **Step 1: Install**

```bash
cd mobile && npm install --save-dev @testing-library/react-native
```

`jest-expo` already provides the environment and transform, so no preset
change should be needed. If it is, report what you changed and why.

- [ ] **Step 2: Test the dialog that lost its Cancel branch**

`AlertProvider` replaced `Alert`, whose web implementation silently dropped
every button but the first — which would have made "Cancel" perform a delete.
Assert:

1. Both buttons render for a two-button dialog.
2. Tapping the destructive button calls its handler exactly once.
3. Tapping cancel calls the cancel handler and **not** the destructive one.
4. Dismissing by tapping the backdrop calls the cancel handler and not the destructive one.

The third, written out — the others follow the same shape:

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { AlertProvider, useAlert } from './AlertProvider';
import { Text, Pressable } from 'react-native';

function Harness({ onDelete, onCancel }: { onDelete: () => void; onCancel: () => void }) {
  const showAlert = useAlert();
  return (
    <Pressable
      onPress={() =>
        showAlert({
          title: 'מחיקת מוצר',
          buttons: [
            { text: 'ביטול', style: 'cancel', onPress: onCancel },
            { text: 'מחיקה', style: 'destructive', onPress: onDelete },
          ],
        })
      }
    >
      <Text>open</Text>
    </Pressable>
  );
}

it('runs cancel and never the destructive handler', () => {
  const onDelete = jest.fn();
  const onCancel = jest.fn();
  render(
    <AlertProvider>
      <Harness onDelete={onDelete} onCancel={onCancel} />
    </AlertProvider>,
  );

  fireEvent.press(screen.getByText('open'));
  fireEvent.press(screen.getByText('ביטול'));

  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onDelete).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Test the stepper that dropped taps**

Two quick taps on `+` used to send the same quantity twice, leaving 1 instead
of 2. With a mocked API module, assert:

1. Two taps in succession show `2`.
2. Rapid taps collapse into one write carrying the final value.
3. A weight product steps by `0.5`; a carton product by `1`.
4. A failed write reverts the displayed quantity.

- [ ] **Step 4: Run**

```bash
cd mobile && npm test
```

Expected: all pass, and the existing 98 unit tests still pass.

- [ ] **Step 5: Commit**

```bash
git add mobile
git commit -m "test(mobile): cover the dialog and stepper that broke in practice"
```

---

## Task 7: Controller validation

The cheapest and least likely to find anything — worth doing after the rest,
not before.

**Files:**
- Modify: `backend/src/users/users.controller.spec.ts`
- Create: `backend/src/branches/branches.controller.spec.ts`

- [ ] **Step 1: Cover what validation actually rejects**

With mocked services, assert that each controller delegates with the right
arguments, and that its DTO rejects: a missing required field, a `unitType`
outside the fixed list, a quantity with three decimals, and a password under
eight characters.

- [ ] **Step 2: Re-measure and record**

```bash
cd backend && npx jest --coverage --coverageReporters=text-summary
cd ../mobile && npx jest --coverage --coverageReporters=text-summary
```

Record both figures in the commit message. **Do not** state a mobile
percentage without also stating how many lines are instrumented — the current
96.8% covers 186 of 4,994 lines, and quoting it alone is misleading.

- [ ] **Step 3: Commit**

```bash
git add backend/src
git commit -m "test(backend): cover controller delegation and DTO validation"
```

---

## Task 8: An authorization matrix

**The most likely place a real bug is still hiding.** Four controllers —
`departments`, `orders`, `products`, `providers` — have 0% coverage, and what
lives in them is routing plus guards. A missing `@UseGuards` or `@Roles` on a
mutating endpoint is invisible to every test written so far and would let any
signed-in user change another branch's data.

Rather than test each controller's internals, assert the property that
matters across all of them at once.

**Files:**
- Create: `backend/test/authorization.e2e-spec.ts`

- [ ] **Step 1: Enumerate every mutating endpoint**

Read the four controllers and list every `@Post`, `@Patch`, `@Put` and
`@Delete` with its path and the role it should require. Write the list into
the spec as a table of cases — a literal array the tests iterate — so that
adding an endpoint later without a guard shows up as a missing row rather
than as silence.

- [ ] **Step 2: Assert the matrix**

For each endpoint, three cases:

1. **No token** → 401.
2. **STAFF token, no access to the target** → 403.
3. **Admin token** → anything other than 401/403 (the call may legitimately
   400 on a body this test does not bother to make valid; what matters is
   that authorization did not reject it).

Case 2 is the one that finds bugs. Use the existing `seed()` staff user, who
holds no grants.

- [ ] **Step 3: Run**

```bash
cd backend && npm run test:e2e
```

**If a case fails, that is a finding, not a test to adjust.** Report the
endpoint and what it allowed. Do not add a guard and move on — the fix may
need to be a deliberate decision about that endpoint's intended audience.

- [ ] **Step 4: Commit**

```bash
git add backend/test/authorization.e2e-spec.ts
git commit -m "test(backend): assert every mutating endpoint rejects the wrong caller"
```

---

## Task 9: The permission branches nothing exercises

Unit coverage of `permissions.service.ts` sits at 65% of branches. Statements
are nearly all covered, which is exactly how a gap hides: the paths not taken
are the ones with the surprises.

**Files:**
- Modify: `backend/src/permissions/permissions.service.spec.ts`

- [ ] **Step 1: Cover the untaken paths**

Each of these is currently unexercised at unit level:

1. `setDepartmentAccess(granted: true)` — the feature's main happy path.
2. `setBranchAccess` on a branch with **no providers**. This is not
   hypothetical: נתניה is exactly that today. Assert it makes no writes and
   does not throw.
3. `setBranchAccess(granted: true)` clearing existing blocks in that branch.
4. `setProviderAccess` for a provider id that does not exist → `NotFoundException`.
5. A provider whose `departments` relation is absent rather than empty —
   the `?? []` fallbacks at four call sites exist for this and nothing proves
   they work.

- [ ] **Step 2: Re-measure and commit**

```bash
cd backend && npx jest --coverage --coverageReporters=text 2>&1 | grep permissions.service
git add backend/src/permissions/permissions.service.spec.ts
git commit -m "test(backend): cover the permission branches nothing exercised"
```

---

## Task 10: Controller delegation

Lower value than the two above — do it last, and only after they are green.

**Files:**
- Create: `departments`, `orders`, `products`, `providers` controller specs

- [ ] **Step 1: For each, assert it delegates correctly**

With mocked services: that each route calls the expected service method with
the parameters taken from the request, and that the class carries the guards
Task 8 asserts behaviourally. Two levels covering the same property is
deliberate here — the unit test names the intent, the e2e proves the wiring.

- [ ] **Step 2: Commit**

```bash
git add backend/src
git commit -m "test(backend): cover controller delegation"
```
