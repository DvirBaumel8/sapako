# Product Notes — Design

**Date:** 2026-10-04
**Status:** Approved in conversation; awaiting written-spec review
**Mockup:** https://claude.ai/artifact/76oMiwLUiN32svggGVgYVu

## Goal

Let the shop's staff attach a short, persistent note to a product — a
reminder like "always ask for the long expiry date" — that everyone ordering
from that supplier sees on the order screen.

## Decisions (from Dvir)

1. The note belongs to the **product**, not to an individual order. It is
   written once and shows every time until changed.
2. **Internal only.** Staff see it in the app. It never appears in the
   WhatsApp order message or the order notification email.
3. **Anyone with access to the product's provider** may add, edit, or delete
   the note — ADMIN or STAFF. Access is the same per-provider check the order
   screen already uses to show the product at all.

## Rules

- One note per product, free text, max **200 characters**.
- Whitespace is trimmed. Saving an empty (or whitespace-only) note deletes it
  (stored as `NULL`).
- No history and no author tracking: last write wins.
- Editing a note does not require an open order and does not touch any order.
- Search matches product names only — notes are not searched.

## UX (order screen — `mobile/app/(app)/providers/[providerId]/order.tsx`)

- **Every product card** gets a note icon 🗒 next to the product name, for every
  role. Grey when the product has no note, orange when it has one. This is
  separate from the admin-only ✎ edit-mode pencil, which stays as is.
- If the product has a note, it renders as **one grey line under the name**,
  truncated with an ellipsis (`numberOfLines={1}`).
- Tapping the icon **or** the note line opens a **centered modal dialog**
  styled like the existing `UnitPickerSheet`:
  - Title "הערה למוצר", subtitle = product name.
  - Multiline text input, autofocused, prefilled with the current note,
    placeholder "למשל: להזמין רק ביום ראשון", `maxLength={200}`.
  - Character counter `n/200`.
  - Buttons "שמירה" (primary) and "ביטול".
  - "מחיקת ההערה" (red text link) — only shown when the product already has a
    note. Deletes immediately (no extra confirm step; the user is already in
    a deliberate edit dialog and can simply re-type).
- Cancel / tapping the backdrop / Android back closes without saving.
- On save success: dialog closes, the card updates immediately, a short
  "ההערה נשמרה" toast/confirmation is shown (on delete: "ההערה נמחקה").
- On save failure: the dialog **stays open with the text intact** and shows an
  inline error "ההערה לא נשמרה. בדקו את החיבור ונסו שוב."
- Barcode scan → jump-to-product keeps working; the target row shows its note.

### List row heights

The order screen's `FlatList`/`SectionList` use `getItemLayout` with a fixed
`ROW_HEIGHT` (104) so scroll-to-row (after a barcode scan) is exact. With
notes, row height becomes **per-row but still deterministic**:
`ROW_HEIGHT` for products without a note, `ROW_HEIGHT + NOTE_LINE_HEIGHT` for
products with one. The note is pinned to one line exactly so this stays
exact. Both `getItemLayout` implementations (flat and sectioned) must use the
same per-product height function.

## Backend

### Data

- Migration `1700000000018-AddProductNote`: `ALTER TABLE products ADD COLUMN
  note VARCHAR(200) NULL`. No backfill.
- `Product` entity: `@Column({ type: 'varchar', length: 200, nullable: true })
  note?: string | null`.
- `GET /providers/:providerId/products` returns `note` automatically (full
  entity). The branch-wide `GET /branches/:branchId/products` keeps its
  narrow `select` — it does not need the note.

### Endpoint

`PATCH /providers/:providerId/products/:productId/note`

- Guards: `JwtAuthGuard`, `ProviderAccessGuard`. **No `@Roles`** — STAFF allowed.
- Body DTO `UpdateProductNoteDto`: `note: string | null`, `@IsString()` when
  non-null, `@MaxLength(200)`.
- Service `updateNote(providerId, productId, note)`:
  - Loads the product by `id` **and** `providerId`; if not found → 404. (This
    stops a user with access to provider A from editing a product of
    provider B by putting A's id in the URL.)
  - Trims; empty → `null`. Saves only the `note` column.
  - Returns the updated product.
- The existing admin `PATCH /products/:id` and its DTO are **not** changed —
  staff must not gain any other product-edit ability.

## Mobile

- `Product` type in `mobile/src/api/types.ts`: add `note?: string | null`.
- `mobile/src/api/products.ts`: add
  `updateProductNote(providerId, productId, note: string | null): Promise<Product>`.
- New component `mobile/src/products/ProductNoteDialog.tsx` (dialog UI +
  save/delete/error states; takes product, `onSaved(product)`, `onClose`).
- `order.tsx`: note icon + note line in `renderProductCard`, dialog state,
  per-row height function, local update of the product list on save.

## Out of scope

- Note on the admin product create/edit screens.
- Notes on order lines, in WhatsApp messages, or in emails.
- Note history, author, or timestamps.
- Searching notes.

## Testing

**Backend (Jest, existing patterns):**
- STAFF with provider access can set, change, and clear a note.
- User without access to the provider → 403.
- Product belonging to a different provider than the URL → 404.
- Empty / whitespace note stored as `null`; >200 chars → 400.
- Admin `PATCH /products/:id` still rejects STAFF (unchanged).

**Mobile (Jest + RTL, existing patterns):**
- Card shows the note line only when a note exists; icon color reflects state.
- Dialog saves a new note and the card updates.
- Saving empty text deletes the note.
- "מחיקת ההערה" appears only when a note exists and deletes it.
- Failed save keeps the dialog open with the text and shows the error.
- Per-row height function returns the larger height for noted products.

## Release notes

Add one Hebrew bullet to `docs/release-notes/draft.md`, e.g.
"אפשר להוסיף הערה לכל מוצר במסך ההזמנה (למשל 'לבקש תאריך ארוך') – ההערה
נשמרת ומופיעה לכל מי שמזמין מהספק. הספק לא רואה אותה."
