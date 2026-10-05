# "יכול לערוך מוצרים" Permission — Design

**Date:** 2026-10-05
**Status:** Design approved in conversation; awaiting written-spec review

## Goal

Let an admin give a staff user the right to manage products and categories
— for the suppliers that user can already access — without making them an
admin.

## Decisions (from Dvir)

1. A per-user checkbox on the admin's user-permissions screen, labeled
   **"יכול לערוך מוצרים"**.
2. A user with it can, **for suppliers they already have access to**
   (direct supplier grant or via a department grant — the existing
   `hasProviderAccess` rule):
   - **Products:** create, edit (name, unit, barcode, category), delete.
   - **Categories:** create, rename, delete, bulk-assign products.
3. Deleting works exactly as for admins (product delete is permanent; order
   lines keep their snapshot; category delete un-categorizes its products).
4. Suppliers, departments, users and branches stay admin-only.

## Decisions (mine, approved with the design)

- The flag is per user, not per branch. Hidden on the screen for ADMIN users
  (they can already do everything); the server ignores it for admins.
- Entry points for these users: the order screen's **"עריכה"** toggle
  (currently admin-only) appears for them; in edit mode the screen also shows
  **"הוספת מוצר"** (opens the add-product screen with this supplier
  preselected) and **"קטגוריות"** (opens this supplier's categories screen).
  Scanning an unknown barcode (order screen and home screen) offers
  **"הוספת מוצר חדש"** to them as to admins.
- The flag is read **from the database on every protected request** — no
  JWT change. Revoking takes effect immediately; granting shows the buttons
  the next time the app fetches the user's capabilities (app start / return
  to foreground), with no re-login.

## Data

Migration `1700000000020-AddCanEditProducts`:
`ALTER TABLE users ADD COLUMN "canEditProducts" BOOLEAN NOT NULL DEFAULT false`.
Entity: `canEditProducts: boolean` (default false). It flows through
`toSafeUser()` like other non-secret fields.

## Backend

### Setting the flag
`PATCH /users/:id` (already ADMIN-only) accepts optional
`canEditProducts: boolean` in `UpdateUserDto`. `GET /users` and the user
returned by PATCH include it.

### Reading your own capabilities
New `GET /auth/me` (JWT required, any role) →
`{ userId, username, role, canEditProducts }` read from the database.
(`canEditProducts` is reported as `true` for ADMIN so the client has one
flag to check.)

### Enforcing
New `PermissionsService.canEditProductsOf(user, providerId): Promise<boolean>`:
`true` if ADMIN; else `true` only if the user row has `canEditProducts` AND
`hasProviderAccess(user, providerId)`.

`PermissionsService.assertCanEditProducts(user, providerId)` throws `403`
when that returns false. It is called at the start of each route below,
after resolving the provider (an explicit call rather than a guard: the
by-id routes need ProductsService/CategoriesService to find the provider,
and a guard in PermissionsModule depending on those would create a module
cycle):

| Route | Provider comes from |
|---|---|
| `POST /providers/:providerId/products` | URL param |
| `POST /providers/:providerId/categories` | URL param |
| `PATCH /products/:id`, `DELETE /products/:id` | the product's `providerId` (404 if the product doesn't exist) |
| `PATCH /categories/:id`, `DELETE /categories/:id` | the category's `providerId` (404 if missing) |

These routes drop `@Roles(Role.ADMIN)` and call `assertCanEditProducts` instead.
Everything else keeps its current guards. `PATCH /products/:id` keeps
validating that a new `categoryId` belongs to the product's own provider
(existing check) — so an editor can't attach a category from another
supplier. Products can't change supplier (no `providerId` in the DTO).

## Mobile

- `src/api/auth.ts` (or existing auth API module): `fetchMe()`.
- Auth context exposes `canEditProducts: boolean`, fetched after login and
  on app start / foreground (React Query, key `['me']`, refetch on focus);
  `false` until loaded; `true` for admins.
- New hook `useRequireProductEditor()` mirroring `useRequireAdmin()`
  (redirects when `canEditProducts` is false once loaded).
- Replace admin gates with the editor gate on:
  - `app/(app)/providers/[providerId]/order.tsx`: "עריכה" toggle and the ✎
    per product; unknown-barcode "הוספת מוצר חדש"; plus the new
    "הוספת מוצר" and "קטגוריות" buttons shown in edit mode.
  - `app/(app)/index.tsx`: unknown-barcode "הוספת מוצר חדש".
  - `app/(app)/admin/products/new.tsx` (add-product screen; accepts an
    optional `providerId` param to preselect), `app/(app)/products/[productId]/edit.tsx`,
    `providers/[providerId]/categories/index.tsx`, `.../categories/new.tsx`,
    `.../categories/[categoryId]/edit.tsx`, `.../categories/[categoryId]/products.tsx`.
- The provider-header ✎ (edit supplier) and the admin menu stay admin-only.
- Admin user-permissions screen (`admin/users/[userId]/access.tsx`): a
  `Toggle` labeled "יכול לערוך מוצרים" at the top, above the branch chips,
  hidden when the user being edited is an ADMIN. Toggling calls
  `PATCH /users/:id { canEditProducts }`; on failure revert and show the
  screen's existing error style.

## Out of scope

- Finer-grained rights (e.g. create but not delete).
- Editing suppliers, departments, users, branches.
- Audit log of who changed what.

## Testing

**Backend**
- Unit: `canEditProductsOf` — admin yes; staff without flag no; staff with
  flag + access yes; staff with flag without access no.
- E2E (real Postgres): with a STAFF user granted one provider:
  - without the flag: create/edit/delete product and category → 403
  - with the flag, on the granted provider: all succeed
  - with the flag, on a non-granted provider: 403 (both URL-param and by-id routes)
  - flag revoked mid-session (same token): next request → 403
  - editor can't move a product to another supplier's category (400)
  - `GET /auth/me` reflects the flag; admin gets `canEditProducts: true`
  - `PATCH /users/:id { canEditProducts }` is admin-only

**Mobile**
- Access screen: toggle shown for STAFF, hidden for ADMIN; toggling calls
  the API; failure reverts.
- Order screen as STAFF with `canEditProducts`: "עריכה" visible; edit mode
  shows ✎, "הוספת מוצר", "קטגוריות"; without the flag none of them.
- Unknown-barcode prompt offers add for an editor, not for plain staff.
- `useRequireProductEditor` redirects plain staff.

## Release note

"מנהל יכול לתת לעובד הרשאה 'יכול לערוך מוצרים': העובד יוכל להוסיף, לערוך
ולמחוק מוצרים וקטגוריות אצל הספקים שיש לו גישה אליהם."
