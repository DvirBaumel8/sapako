# Provider Departments — Design

## 1. Purpose & Scope

The supermarket owner's first round of feedback after using the app: providers
need to be organized into departments (מחלקות) — categories like "dairy" or
"alcohol" — so he can browse providers by category instead of one flat list
per branch.

This adds a `Department` concept: a per-branch, admin-managed category that
providers are tagged with (many per provider). It also adds provider editing,
which didn't exist in the app before this feature (providers could only be
created, never edited).

Out of scope: department-level reporting/analytics, reordering/sorting
departments, department icons/colors.

## 2. Data Model

### `departments` table (new)

| column     | type        | notes                                   |
|------------|-------------|------------------------------------------|
| id         | uuid PK     | `gen_random_uuid()`                       |
| branchId   | uuid        | FK → `branches(id)`, `ON DELETE CASCADE`  |
| name       | varchar     |                                            |
| isActive   | boolean     | default `true`                            |
| createdAt  | timestamptz | default `now()`                           |

Unique constraint on `(branchId, name)`.

Departments are **per-branch**, not global — the same category name (e.g.
"מוצרי חלב") exists as a separate row, with its own id, in every branch that
has it. There is no cross-branch linkage at the data layer; the mobile app
resolves "the same" department across branches by name (see §4).

A migration seeds every branch that exists **at migration time** with 6
departments: יין/אלכוהול, חומרי ניקוי, פיצוחים, מוצרי חלב, קפואים, כללי.
Branches created after this migration runs start with **zero** departments —
an admin must add at least one before any provider can be created under that
branch (see the required-department invariant below). This is a deliberate
choice, not an oversight: auto-seeding future branches was explicitly ruled
out.

### `provider_departments` table (new — join table)

| column       | type    | notes                                       |
|--------------|---------|-----------------------------------------------|
| providerId   | uuid    | FK → `providers(id)`, `ON DELETE CASCADE`      |
| departmentId | uuid    | FK → `departments(id)`, `ON DELETE CASCADE`    |

Composite primary key `(providerId, departmentId)`.

**Invariant: every provider has at least one department.** Enforced at the
API layer (DTO validation + service checks), not a DB constraint (an empty
join-table result set for a provider isn't something Postgres can forbid
without a trigger, and a trigger is unnecessary weight here).

A provider's departments must belong to the **same branch** as the provider
itself — the service layer rejects a `departmentId` that exists but belongs
to a different branch.

## 3. Backend (NestJS)

### `DepartmentsModule`

Mirrors the existing `ProvidersModule` shape (entity / service / controller /
spec).

- `GET /branches/:branchId/departments` — any authenticated user with access
  to the branch (`JwtAuthGuard`, `BranchAccessGuard`). Returns **all**
  departments for the branch (active + inactive) — the client filters for
  display as needed (§4).
- `POST /branches/:branchId/departments` — `ADMIN` only. `{ name }`.
- `PATCH /departments/:id` — `ADMIN` only. `{ name?, isActive? }`.
- No `DELETE` endpoint — deactivation via `isActive` is the only removal
  path, consistent with how `providers` and `products` already work.

Creating a department "for more than one branch" (§4) is a **mobile-side**
convenience: the client calls `POST /branches/:branchId/departments` once
per selected branch with the same `name`. There's no batch endpoint — each
branch's department is an independent row created through the existing
single-branch endpoint.

### `ProvidersService` / DTOs

- `CreateProviderDto` gains `departmentIds: string[]` — required,
  `@ArrayNotEmpty()`.
- `UpdateProviderDto` gains `departmentIds?: string[]` — optional (omit to
  leave the provider's departments unchanged), but `@ArrayNotEmpty()` when
  present (can't PATCH a provider down to zero departments).
- `ProvidersService.create` / `.update`: for every `departmentId` supplied,
  verify it exists **and** its `branchId` matches the provider's branch;
  throw `NotFoundException` otherwise (mirrors the existing branch-exists
  guard already in `create`).
- `Provider` entity gains a `@ManyToMany(() => Department) @JoinTable(...)
  departments: Department[]` relation. Provider read endpoints (`findActiveByBranch`,
  `findById`) eager-load it (`relations: ['departments']`) so the mobile
  client gets department names without extra round trips.

## 4. Mobile (Expo)

### New API client

`src/api/departments.ts`: `fetchDepartments(branchId)`,
`createDepartment(branchId, { name })`, `updateDepartment(id, { name?, isActive? })`.

`Department` type added to `types.ts`. `Provider` type gains
`departments: Pick<Department, 'id' | 'name'>[]`.

### Navigation

- **Home screen** (`app/(app)/index.tsx`, today's Providers list): gains a
  new secondary button "מחלקות" next to the existing "פעילות אחרונה" button,
  pushing to `/departments`. Available to every role — same audience as
  today's Providers list. (Only the management actions inside are
  admin-gated.)
- **`app/(app)/departments/index.tsx`** (new): lists departments for
  `selectedBranch`. Admins see active + inactive; non-admins see active
  only. Each row: tap → filtered provider list for that branch+department
  (new `departments/[departmentId]/providers.tsx`, reusing the same card
  list UI as home — search included). Admins additionally see a small edit
  icon per row → `departments/[departmentId]/edit.tsx`.
  A "+ הוספת מחלקה" button, visible to admins only, opens
  `departments/new.tsx`.
- **`departments/new.tsx`** (new, admin only): name input, plus an
  **optional** multi-branch selector (chips, same interaction pattern as
  the existing provider-creation branch picker) — defaults to the currently
  selected branch checked. On submit, calls `createDepartment` once per
  checked branch with the same name.
- **`departments/[departmentId]/edit.tsx`** (new, admin only): rename +
  active toggle. Edits apply to that single branch's row only — there is no
  multi-branch edit (multi-branch only applies to creation, per the
  product requirement).
- **Provider edit entry point**: `providers/[providerId]/order.tsx` (the
  existing order-builder screen) gets an edit icon (✎) added to its
  `Stack.Screen` header, next to the provider name — rendered only when
  `useAuth().role === 'ADMIN'`. Opens **`providers/[providerId]/edit.tsx`**
  (new): name, phone, active toggle, and a department multi-select (chips,
  scoped to that provider's own branch's departments, required — submit
  disabled until ≥1 selected).
- **`admin/providers/new.tsx`** (existing, modified): after branches are
  selected (existing multi-select), a department multi-select appears,
  populated from the **intersection by name** of active departments across
  all selected branches. Required, submit disabled until ≥1 selected. On
  submit, for each selected branch, the chosen department *names* resolve
  to that branch's own department *ids* before calling `createProvider`.
  Edge case: a newly created branch with zero departments (see §2) can
  never appear in a non-empty intersection with any other branch, so it's
  effectively excluded from multi-branch provider creation until an admin
  adds at least one matching department there — this is expected, not a
  bug to work around.

No changes to `admin/index.tsx` — department creation is reached through the
new `/departments` tab, not the admin menu.

## 5. Testing (backend)

Per the project's standing rule, written in the same change as the backend
code.

**`departments.service.spec.ts`** (new):
- creates a department under a branch that exists
- rejects creation with `NotFoundException` when the branch doesn't exist,
  without saving
- lists all departments (active + inactive) for a branch
- updates a department's name and/or `isActive`
- throws `NotFoundException` from `findById` on an unknown id

**`providers.service.spec.ts`** (extended):
- creates a provider attached to multiple departments
- rejects creation with `NotFoundException` when a `departmentId` doesn't
  exist, without saving
- rejects creation with `NotFoundException` when a `departmentId` belongs to
  a different branch than the provider being created, without saving
- update replaces the provider's department set
- update rejects a cross-branch `departmentId` without saving

## 6. Out of scope / explicitly deferred

- Auto-seeding departments for branches created after this migration.
- Any DB-level constraint enforcing "at least one department" (API-layer
  only).
- Department reordering, colors/icons, or nesting.
- Bulk department rename/merge tooling.
