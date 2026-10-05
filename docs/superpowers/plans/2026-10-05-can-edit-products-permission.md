# "יכול לערוך מוצרים" Permission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-user flag that lets a staff user create/edit/delete products and categories for suppliers they can already access.

**Architecture:** `users."canEditProducts"` boolean, set via the existing admin `PATCH /users/:id`. `PermissionsService.assertCanEditProducts(user, providerId)` (admin, or flag read fresh from DB + `hasProviderAccess`) is called at the start of the six product/category write routes, replacing their `@Roles(ADMIN)`. `GET /auth/me` exposes the flag; the mobile auth context loads it and every product/category edit gate switches from "is admin" to "can edit products".

**Tech Stack:** NestJS + TypeORM + Postgres (Jest unit + supertest e2e on real Postgres); Expo / React Native + React Query (Jest + @testing-library/react-native v14 — `render`/`fireEvent` are async; `await` them).

**Spec:** `docs/superpowers/specs/2026-10-05-can-edit-products-permission-design.md` — read it first.

## Global Constraints

- Hebrew label, exact: `יכול לערוך מוצרים`. New order-screen buttons, exact: `הוספת מוצר`, `קטגוריות`.
- Enforcement is server-side; app gating is convenience only.
- The flag is read from the database on each protected request — no JWT changes.
- ADMIN always passes; for ADMIN, `/auth/me` reports `canEditProducts: true`.
- Unchanged and admin-only: suppliers, departments, users, branches, the provider-header ✎, the admin menu.
- Product notes (`PATCH /providers/:providerId/products/:productId/note`) are unchanged.
- Work locally on `main`. **Commit after each task, never push.** Trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Backend: never `npm run lint`; `npx eslint --fix <touched files>`. Mobile: no lint script. Never run migrations against the dev DB `sapako`; e2e uses its own DB.
- A pre-existing flake exists in `test/orders.e2e-spec.ts` ("caps it at RECENT_ORDER_LIMIT"); if it's the only failure, rerun once and report it.

## Review Focus

1. **By-id routes check the target's supplier, not a URL param:** an editor with access to supplier A must get 403 on `PATCH/DELETE /products/:id` and `/categories/:id` for a supplier-B row. (Task 2 e2e.)
2. **Revocation is immediate:** same token, flag turned off → next write is 403. (Task 2 e2e.)
3. **No cross-supplier category assignment** by an editor (existing 400 path still fires for editors). (Task 2 e2e.)
4. **App shows nothing new to plain staff**, and gates load from `/auth/me` without requiring re-login. (Tasks 3–4 tests.)
5. **The admin toggle never shows for an ADMIN user** and reverts on failure. (Task 3 test.)

---

### Task 1: Backend — flag, admin setting, `/auth/me`, permission check

**Files:**
- Create: `backend/src/database/migrations/1700000000020-AddCanEditProducts.ts`; register in `backend/src/database/data-source.ts` (import + last in `migrations`)
- Modify: `backend/src/users/user.entity.ts`, `backend/src/users/dto/update-user.dto.ts`, `backend/src/users/users.service.ts` (`update`, `toSafeUser`, `SafeUser` type if it enumerates fields)
- Modify: `backend/src/permissions/permissions.module.ts` (add `User` to `forFeature`), `backend/src/permissions/permissions.service.ts`
- Modify: `backend/src/auth/auth.controller.ts` (+ `auth.module.ts` if it needs `UsersModule`/`PermissionsModule`)
- Tests: `backend/src/permissions/permissions.service.spec.ts`, `backend/src/users/users.service.spec.ts`, `backend/src/auth/auth.controller.spec.ts`

**Interfaces — Produces:**
- `User.canEditProducts: boolean`; `SafeUser` includes `canEditProducts`.
- `PATCH /users/:id` accepts `canEditProducts?: boolean`.
- `GET /auth/me` → `{ userId: string; username: string; role: 'ADMIN' | 'STAFF'; canEditProducts: boolean }`.
- `PermissionsService.canEditProductsOf(user: AuthenticatedUser, providerId: string): Promise<boolean>` and `assertCanEditProducts(user, providerId): Promise<void>` (throws `ForbiddenException('No permission to edit products for this provider')`).

- [ ] **Step 1: Migration + entity**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCanEditProducts1700000000020 implements MigrationInterface {
  name = 'AddCanEditProducts1700000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE users ADD COLUMN "canEditProducts" BOOLEAN NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP COLUMN "canEditProducts"`);
  }
}
```

Entity (`user.entity.ts`, after `role`):

```ts
  // Lets a STAFF user manage products and categories of the suppliers they
  // can already access. Ignored for ADMIN, who can do everything anyway.
  @Column({ default: false })
  canEditProducts: boolean;
```

- [ ] **Step 2: Failing tests**

`permissions.service.spec.ts` — add (follow the file's existing mocking style for repos; add a mocked `User` repo with `findOneBy`):
- admin → `canEditProductsOf` true without reading the user row
- staff, flag false → false (and does not need provider access)
- staff, flag true, `hasProviderAccess` true → true
- staff, flag true, no provider access → false
- `assertCanEditProducts` throws `ForbiddenException` when false, resolves when true
- staff whose user row no longer exists → false

`users.service.spec.ts` — `update(id, { canEditProducts: true })` sets it and saves; omitted leaves it unchanged; `toSafeUser` includes `canEditProducts` and still no `passwordHash`.

`auth.controller.spec.ts` (create if missing, following other controller specs' style) — `me()` returns `{ userId, username, role, canEditProducts }` from the user row, and `canEditProducts: true` for an ADMIN even if the column is false.

Run `npx jest src/permissions src/users src/auth` → new tests FAIL.

- [ ] **Step 3: Implement**

`UpdateUserDto`: add

```ts
  @IsOptional()
  @IsBoolean()
  canEditProducts?: boolean;
```

`UsersService.update`: accept `canEditProducts?: boolean` in `input`; `if (input.canEditProducts !== undefined) user.canEditProducts = input.canEditProducts;`. `toSafeUser`: add `canEditProducts: user.canEditProducts,`.

`PermissionsService` (inject `@InjectRepository(User) private readonly usersRepo: Repository<User>`; add `User` to the module's `forFeature`):

```ts
  /**
   * Product/category writes: admins always; staff only with the flag AND
   * access to that provider. Read from the database on every call so that
   * revoking the flag takes effect on the very next request, not at the
   * token's expiry.
   */
  async canEditProductsOf(user: AuthenticatedUser, providerId: string): Promise<boolean> {
    if (user.role === Role.ADMIN) return true;
    const row = await this.usersRepo.findOne({
      where: { id: user.userId },
      select: { id: true, canEditProducts: true },
    });
    if (!row?.canEditProducts) return false;
    return this.hasProviderAccess(user, providerId);
  }

  async assertCanEditProducts(user: AuthenticatedUser, providerId: string): Promise<void> {
    if (!(await this.canEditProductsOf(user, providerId))) {
      throw new ForbiddenException('No permission to edit products for this provider');
    }
  }
```

`AuthController`: add

```ts
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: { user: AuthenticatedUser }) {
    const user = await this.usersService.findById(req.user.userId);
    return {
      userId: user.id,
      username: user.username,
      role: user.role,
      // One flag for the client to check: admins can always edit products.
      canEditProducts: user.role === Role.ADMIN || user.canEditProducts,
    };
  }
```

Inject `UsersService` (wire `UsersModule` into `AuthModule` imports if not already; check for an existing import cycle and use whatever pattern the repo already uses — e.g. `forwardRef` — if needed). Keep the existing throttled `login` untouched.

Run the focused tests → PASS. Then `npm test`, `npx tsc --noEmit -p .`.

- [ ] **Step 4: Commit**

```bash
npx eslint --fix <every file you touched>
git add <those files>
git commit -m "feat(users): can-edit-products flag, /auth/me, and the permission check"
```

---

### Task 2: Backend — enforce on product and category writes

**Files:**
- Modify: `backend/src/products/products.controller.ts` (`ProviderProductsController.create`, `ProductAdminController.update` and `.remove`)
- Modify: `backend/src/categories/categories.controller.ts` (`ProviderCategoriesController.create`, `CategoryAdminController.update` and `.remove`)
- Tests: `products.controller.spec.ts`, `categories.controller.spec.ts`; create `backend/test/can-edit-products.e2e-spec.ts`

**Interfaces — Consumes:** `PermissionsService.assertCanEditProducts` (Task 1), `PATCH /users/:id { canEditProducts }`, `ProductsService.findById`, `CategoriesService.findById`.

- [ ] **Step 1: Controllers**

On each of the six methods: remove `@Roles(Role.ADMIN)`, take `@Req() req: { user: AuthenticatedUser }`, and before doing the work:
- URL-param routes: `await this.permissionsService.assertCanEditProducts(req.user, providerId);`
- by-id product routes: `const product = await this.productsService.findById(id); await this.permissionsService.assertCanEditProducts(req.user, product.providerId);`
- by-id category routes: `const category = await this.categoriesService.findById(id); await this.permissionsService.assertCanEditProducts(req.user, category.providerId);`

Inject `PermissionsService` into the controllers that don't have it (both modules already import `PermissionsModule`). Add a short comment on each class or method group: who may call it and why it is an explicit call rather than `@Roles`.

Update the controller unit specs: the "restricts … to ADMIN" metadata tests for these six methods now assert `roles` is `undefined`; add delegation tests asserting `assertCanEditProducts` is called with the right provider id (for by-id routes, the found entity's `providerId`) and that a rejection stops the service call. Keep every other route's ADMIN metadata test as is.

- [ ] **Step 2: E2E**

`backend/test/can-edit-products.e2e-spec.ts` with `seed()` fixtures (`adminToken`, `staffToken`, `staffUserId`, `providerIds`, `productId` which is under `providerIds[0]`). In `beforeAll`: grant the staff user `providerIds[0]` (`PUT /users/:id/providers/:providerId/access { granted: true }` as admin). Helper `setFlag(value)` = `PATCH /users/${staffUserId} { canEditProducts: value }` as admin.

Tests (staff token unless noted):
1. Flag off: `POST /providers/P0/products`, `PATCH /products/:productId`, `DELETE` of a product, `POST /providers/P0/categories`, `PATCH /categories/:id`, `DELETE /categories/:id` → all 403. (Create the product/category rows to act on as admin first.)
2. Flag on, P0: each of the above succeeds (201/200/200…, match the existing status codes of those routes).
3. Flag on, P1 (not granted): `POST /providers/P1/products` → 403; and by-id: an admin-created product and category under P1 → `PATCH`/`DELETE` by staff → 403.
4. Revocation: flag on → a write succeeds → flag off (admin) → the same staff token's next write → 403.
5. Cross-supplier category: flag on; admin creates category C1 under P1; staff `PATCH /products/:productId { categoryId: C1 }` → 400 (existing check) — not 200.
6. `GET /auth/me`: staff before/after flag → `canEditProducts` false/true; admin → true.
7. `PATCH /users/:id { canEditProducts: true }` with the staff token → 403.
8. Staff with flag can NOT edit suppliers: `PATCH /providers/P0` → 403 (sanity that nothing else opened up).

Run `npm run test:e2e -- can-edit-products` → PASS; then `npm test`, full `npm run test:e2e`, `npx tsc --noEmit -p .`.

- [ ] **Step 3: Commit**

```bash
npx eslint --fix <touched files>
git add <touched files>
git commit -m "feat(products): let staff with the can-edit-products flag manage products and categories"
```

---

### Task 3: Mobile — load the capability, admin toggle

**Files:**
- Modify: `mobile/src/api/auth.ts` (`fetchMe`), `mobile/src/api/types.ts` (`UserWithAccess.canEditProducts`, `Me` type), `mobile/src/api/users.ts` (`updateUser` input accepts `canEditProducts?: boolean`)
- Modify: `mobile/src/auth/AuthContext.tsx`
- Create: `mobile/src/auth/useRequireProductEditor.ts`
- Modify: `mobile/app/(app)/admin/users/[userId]/access.tsx`
- Tests: `mobile/src/auth/AuthContext.test.tsx` (create if missing), `mobile/src/auth/useRequireProductEditor.test.tsx`, `mobile/app/(app)/admin/users/[userId]/access.test.tsx`

**Interfaces — Produces:** `useAuth().canEditProducts: boolean` (false until loaded / logged out; true for admins); `useRequireProductEditor(): void`; `fetchMe(): Promise<Me>` where `interface Me { userId: string; username: string; role: Role; canEditProducts: boolean }`.

- [ ] **Step 1: API + context**

`fetchMe` = `apiClient.get<Me>('/auth/me')`. In `AuthProvider` (it's inside `QueryClientProvider`): `useQuery({ queryKey: ['me', userId], queryFn: fetchMe, enabled: !!userId })`; also refetch when the app returns to the foreground — subscribe to `AppState` `'change'` and `refetch()` on `'active'` (remove the subscription on unmount). Expose `canEditProducts: role === 'ADMIN' || !!me?.canEditProducts` (admins don't wait for the fetch). On logout the query is disabled and the value is false. Add `canEditProducts` to the memoized context value and its deps.

**Existing tests mock `useAuth`** in many files as `{ isLoading, userId, role, login, logout }` — TypeScript may require `canEditProducts` in those mock objects. Add `canEditProducts: false` (or `true` where the test's role is ADMIN and the screen needs it) wherever `tsc` or a test complains; don't change test intent.

`useRequireProductEditor` mirrors `useRequireAdmin` but must not redirect while the capability is still loading for a staff user: expose `isCapabilityLoading` (true while the `me` query is pending for a logged-in non-admin) from the context and only redirect when `!isCapabilityLoading && !canEditProducts`.

- [ ] **Step 2: Admin toggle**

In `access.tsx`, read the target user from the users list (`useQuery({ queryKey: ['users'], queryFn: fetchUsers })`, find by `userId`). If the user is STAFF, render above the branch chips a `common.cardRow` with `<Text style={common.label}>יכול לערוך מוצרים</Text>` and a `Toggle` (`accessibilityLabel="יכול לערוך מוצרים"`). Optimistic like the existing toggles: flip immediately, call `updateUser(userId, { canEditProducts: next })`, invalidate `['users']`; on failure revert and `showAlert({ title: 'שגיאה', message: 'שמירת ההרשאה נכשלה. יש לנסות שוב.' })`; ignore taps while in flight. Hidden for ADMIN users.

- [ ] **Step 3: Tests**

- AuthContext: logged-in staff — `canEditProducts` false until `fetchMe` resolves with true, then true; admin — true without waiting; logged out — false. (Mock `api/auth` and token storage the way any existing auth test does; if none exists, mock `jwt-decode`/`tokenStorage` minimally.)
- `useRequireProductEditor`: redirects (router.replace('/')) for staff once loaded without the flag; does not redirect while loading; does not redirect for an editor or admin.
- access screen: toggle shown for a STAFF target, absent for an ADMIN target; tapping calls `updateUser(userId, { canEditProducts: true })`; a rejected call reverts the toggle and shows the error. Follow `access.test.tsx`'s existing mocks; add `fetchUsers` to its `api/users` mock.

Run full `npx jest` and `npx tsc --noEmit`.

- [ ] **Step 4: Commit**

```bash
git add <touched files>
git commit -m "feat(mobile): load the can-edit-products capability and let admins grant it"
```

---

### Task 4: Mobile — open product/category editing to editors

**Files:**
- Modify: `mobile/app/(app)/providers/[providerId]/order.tsx`, `mobile/app/(app)/index.tsx`
- Modify: `mobile/app/(app)/admin/products/new.tsx`, `mobile/app/(app)/products/[productId]/edit.tsx`
- Modify: `mobile/app/(app)/providers/[providerId]/categories/index.tsx`, `.../categories/new.tsx`, `.../categories/[categoryId]/edit.tsx`, `.../categories/[categoryId]/products.tsx`
- Tests: `order.test.tsx`, plus focused tests for `index.tsx` scan prompt and one categories screen
- Modify: `docs/release-notes/draft.md`

**Interfaces — Consumes:** `useAuth().canEditProducts`, `useRequireProductEditor()` (Task 3).

- [ ] **Step 1: Swap the gates (product/category only)**

- In the four category screens, `products/[productId]/edit.tsx` and `admin/products/new.tsx`: replace `useRequireAdmin()` with `useRequireProductEditor()`. In `categories/index.tsx`, replace `const isAdmin = role === 'ADMIN'` usage for edit affordances with `canEditProducts`.
- `order.tsx`: the "עריכה" toggle and the per-product ✎ use `canEditProducts` instead of `role === 'ADMIN'`; the unknown-barcode branch offers "הוספת מוצר חדש" when `canEditProducts`. **The header ✎ (edit supplier, `headerRight`) stays `role === 'ADMIN'`.** In edit mode (`isEditingProducts`), show a row under the toolbar with two buttons: `הוספת מוצר` → `router.push({ pathname: '/admin/products/new', params: { providerId } })` and `קטגוריות` → ``router.push(`/providers/${providerId}/categories`)``. Style them like the existing `editToggle`.
- `index.tsx`: the unknown-barcode "add" offer uses `canEditProducts` instead of `role !== 'ADMIN'`.
- `admin/products/new.tsx`: accept an optional `providerId` route param and preselect it in the supplier picker when present (and present in the user's provider list). The picker already lists only providers the server returns for the user's branch(es).

Grep afterwards for `role === 'ADMIN'` / `useRequireAdmin` under `app/(app)/providers/[providerId]/categories`, `products/`, `admin/products/` and the order screen to make sure no product/category gate was missed — and that supplier/department/user/branch gates were NOT changed.

- [ ] **Step 2: Tests**

- `order.test.tsx` (it mocks `useAuth` as STAFF): add `canEditProducts` to that mock. With `canEditProducts: true`: "עריכה" visible; pressing it shows `הוספת מוצר` and `קטגוריות` and the per-product ✎; pressing `קטגוריות` pushes `/providers/provider-1/categories`; header ✎ still absent (staff). With `canEditProducts: false`: none of them. Unknown-barcode scan offers `הוספת מוצר חדש` only for the editor (reuse the fake-scan mock already in this file).
- `index.tsx` scan prompt: editor gets the add option; plain staff doesn't (create a focused test if none exists; mock the branch-products fetch to return no match).
- One categories screen (`categories/index.tsx`): renders edit affordances for an editor.
- `admin/products/new.test.tsx`: with `providerId` param, that supplier is preselected.

Run full `npx jest` and `npx tsc --noEmit`.

- [ ] **Step 3: Release note + commit**

Append to `docs/release-notes/draft.md`:

```markdown
- מנהל יכול לתת לעובד הרשאה "יכול לערוך מוצרים": העובד יוכל להוסיף, לערוך ולמחוק מוצרים וקטגוריות אצל הספקים שיש לו גישה אליהם.
```

```bash
git add <touched files> ../docs/release-notes/draft.md
git commit -m "feat(mobile): product and category editing for users with the can-edit-products permission"
```

---

## After all tasks (Opus, not the implementer)

- Whole-branch review against the spec.
- Local check: run the backend locally, create a STAFF test user with one provider granted, toggle the flag from the admin screen, and confirm in the browser that the staff session gains "עריכה" / "הוספת מוצר" / "קטגוריות" on that supplier only, and loses them when revoked.
- Hand back to Dvir before any push.
