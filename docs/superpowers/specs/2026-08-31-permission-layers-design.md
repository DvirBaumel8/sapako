# Permission Layers: Departments, Exceptions and Select-All — Design

## 1. Purpose & Scope

Today a non-admin user's access is a flat list of providers
(`user_provider_access`). Every supplier must be ticked individually, and a
supplier added later reaches nobody until an admin remembers to grant it.

This adds two layers on top of that list — grants by department, and explicit
blocks — plus a select-all for a branch, and makes the existing per-branch
capability visible.

**In scope:** the permissions data model, the resolution rule, the API that
exposes it, and the admin screen that edits it.

**Out of scope:** roles beyond ADMIN/STAFF, per-product permissions, and any
change to what a permitted user can *do* with a provider (ordering is
unchanged).

## 2. What already exists, and what does not

Worth recording, because the request that prompted this work assumed
otherwise.

**Branch-level permission already works.** `Provider` carries a `branchId`
and is unique on `(branchId, name)`, so `אוסם` in הילס and `אוסם` in נתניה
are two rows with different ids. Granting one does not grant the other, and
`PermissionsService.getAccessibleBranchIds` derives branch access from the
providers a user holds. The admin screen already has a branch selector
scoping the provider list.

It read as missing because the branch chips are styled so quietly they look
like a heading rather than a control. That is a visibility problem, and the
fix is presentational.

**Genuinely missing:** granting by department, exceptions to such a grant, and
any way to grant a whole branch at once.

## 3. Model

Three tables. `user_provider_access` is unchanged.

| Table | Meaning |
|---|---|
| `user_provider_access (userId, providerId)` | direct grant — unchanged |
| `user_department_access (userId, departmentId)` | grants every provider in that department, including ones added later |
| `user_provider_block (userId, providerId)` | an exception: denies a provider the user would otherwise reach |

Separate tables rather than an `effect: ALLOW｜DENY` column on the existing
one: a column would require rewriting live grants to carry a new meaning,
whereas this leaves every existing row saying exactly what it said before.

Departments are already branch-scoped (`departments` is unique on
`(branchId, name)`), so a department grant is inherently confined to one
branch, consistent with providers.

Both new tables cascade on delete from their user, department and provider,
matching `user_provider_access`.

### 3.1 Resolution

Per provider, in order:

1. Explicitly blocked → **no**
2. Directly granted → **yes**
3. Belongs to *any* granted department → **yes**
4. Otherwise → **no**

Block wins over everything; any weaker order makes an exception unreliable,
which is the whole point of having one. A provider may belong to several
departments (`provider_departments` is many-to-many) — one granted department
is enough.

Admins bypass all of this, as they do today.

### 3.2 What a switch does

The three underlying states collapse into one control:

| Current state | Turning ON | Turning OFF |
|---|---|---|
| Off, no department grant | add direct grant | — |
| On, direct grant | — | remove direct grant |
| On, via department | — | **add block** |
| Off, blocked | remove block | — |

A direct grant and a block are never both present for one pair: setting either
clears the other.

### 3.3 Cases the table above does not settle

**Turning a department off** removes only that department's grant. A provider
inside it that also holds a direct grant stays accessible — the two rules are
independent, and silently dropping a direct grant because an unrelated one was
withdrawn would be surprising.

**A block outlives the department grant it was made against.** Revoking the
department leaves the block in place, dormant; re-granting the department
brings the exception back. The alternative — clearing blocks whenever a
department is revoked — quietly discards a decision the admin made, and would
re-expose a supplier they had deliberately excluded. The screen shows a
dormant block as a plain off switch, since with no department granting it
there is nothing to explain.

**A provider in two granted departments** reports whichever comes first
alphabetically as `viaDepartmentName`. It is one of several true answers and
only feeds an explanatory line; picking deterministically keeps the display
stable between reads rather than varying with row order.

## 4. API

### 4.1 Reading

```
GET /users/:userId/access?branchId=<id>
```

```jsonc
{
  "departments": [{ "id": "…", "name": "חלב", "isGranted": true }],
  "providers": [{
    "id": "…", "name": "תנובה", "isGranted": false,
    "reason": "BLOCKED",           // DIRECT | DEPARTMENT | BLOCKED | NONE
    "viaDepartmentName": "חלב"     // present for DEPARTMENT and BLOCKED
  }]
}
```

Resolution happens in `PermissionsService` and nowhere else. The previous
screen fetched every user plus the branch's providers and resolved
client-side; with three rules in play that duplication is how the client and
server come to disagree.

Guarded by `JwtAuthGuard` + `RolesGuard(ADMIN)`, like the existing
grant/revoke endpoints.

### 4.2 Writing

Intent, not mechanism:

```
PUT /users/:userId/providers/:providerId/access     { "granted": boolean }
PUT /users/:userId/departments/:departmentId/access { "granted": boolean }
PUT /users/:userId/branches/:branchId/access        { "granted": boolean }
```

The caller states what should be true; the server decides whether that means
adding a grant, removing one, adding a block or removing one. Putting that
decision in the client would place the resolution rule in two codebases.

`granted: true` on a branch adds a direct grant for every provider in it and
clears that branch's blocks. `granted: false` removes that branch's direct
grants, department grants and blocks. Neither touches another branch — the
distinction the whole feature exists to preserve.

The existing `POST`/`DELETE` grant endpoints are replaced by these; nothing
outside the admin screen calls them.

## 5. Screen

`app/(app)/admin/users/[userId]/access.tsx`, top to bottom:

1. **Branch chips**, restyled to read as a selector rather than a heading —
   the fix for §2.
2. **`הרשאה לכל הספקים בסניף`** — select-all, scoped to the visible branch and
   labelled so it cannot be mistaken for a global grant.
3. **`מחלקות`** — one switch per department in that branch.
4. **`ספקים`** — per-provider switches, each showing its reason when it has
   one:
   - *(nothing)* — granted directly, or plainly off
   - `דרך מחלקה: חלב`
   - `חסום למרות מחלקה: חלב`

The reason line is not decoration. With exceptions in the model an off switch
has two indistinguishable causes, and without it "why can't this user see
Tnuva" cannot be answered from the screen.

Writes stay optimistic, as they are now: the switch moves immediately and
reverts on failure. A department or select-all write changes many rows, so the
whole list is refetched once it succeeds rather than each row being predicted
locally.

## 6. Testing

**Pure and testable:** the resolution rule is a function over (direct grants,
department grants, blocks, provider→departments) returning access plus reason.
It is tested directly, covering: block beating a direct grant; block beating a
department grant; a provider in two departments where only one is granted;
a department grant reaching a provider added afterwards; and admin bypass.

**Service and controller:** that each intent lands the right rows, that
`granted: false` on a branch leaves another branch untouched, and that a
direct grant and a block are never both present.

**Not tested:** the screen itself, per the existing convention — there is no
React testing library and adding one stays out of scope.

## 7. Migration and rollout

One migration creating the two tables. No data is rewritten: existing rows in
`user_provider_access` are direct grants and keep that meaning, so every
current user's access is identical the moment this ships.

Render runs migrations on deploy, so this applies automatically.
