# Merge Duplicate Products — Design

**Date:** 2026-10-05
**Status:** Design approved in conversation; awaiting written-spec review

## Problem

The customer sees the same product listed several times under one supplier
(e.g. "סלרי ראש" three times under י.ל.ת). The copies came from the one-off
import of the shop's item file (`backend/scripts/import-friend-data.ts`),
which inserted one product per item row — and the item file has one row per
barcode, so a product sold under several barcodes (different packers,
internal short codes like "27" next to real GTINs) became several products.

Local copy (≈ 2026-09-17, production will differ somewhat): **428 groups /
1,055 active products → ~627 extra rows.** 426 of the 428 groups have
different barcodes per copy. Within every group, unit type, category and
image are identical. No duplicate is referenced by an order line locally.

## Decisions (from Dvir)

1. **A product can carry several barcodes.** Merging keeps every barcode, so
   scanning any of them still finds the product.
2. **A duplicate = exactly the same name under the same supplier**, ignoring
   whitespace differences (leading/trailing, repeated spaces). Near-matches
   ("ראש סלרי" vs "סלרי ראש", "סלרי ראש טרי") are **out of scope**.
3. Extra copies are **hidden, not deleted**, and remember what they were
   merged into — fully reversible.
4. The merge runs as a **database migration** (applies automatically on
   deploy, no production credentials needed), previewed first on the local
   copy.
5. **Notes are not merged** — production has none yet.
6. Stop new duplicates: the import merges same-name rows; creating/renaming a
   product to a name that already exists under that supplier is refused with
   a clear message.

## Name normalization

`normalized(name) = lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))` —
the same expression in the migration, the unique index, and (equivalently)
in TypeScript where needed. `lower` only affects Latin letters; Hebrew is
unaffected.

## Data model

Migration `1700000000019-MergeDuplicateProducts` on `products`:

- `"additionalBarcodes" TEXT[] NOT NULL DEFAULT '{}'` — every barcode the
  product is known by besides `barcode`.
- `"mergedIntoProductId" UUID NULL REFERENCES products(id)` — set on hidden
  copies; null otherwise.
- After the merge: partial unique index
  `uq_products_provider_normalized_name ON products ("providerId", lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))) WHERE "isActive"`
  — enforces "no duplicates" for active products and closes the race on
  concurrent creates. Hidden/soft-deleted products are exempt.

Entity: `additionalBarcodes: string[]` (default `[]`),
`mergedIntoProductId?: string | null`.

## The merge (inside the migration, one transaction)

For each group of **active** products with the same `providerId` and
normalized name, with more than one member:

1. **Survivor** = first by:
   1. referenced by any order line (desc)
   2. has a barcode that is all digits with length 8, 12, 13 or 14 (a real
      GTIN) (desc)
   3. has any barcode at all (desc)
   4. `createdAt` (asc), then `id` (asc) — deterministic
2. Survivor's `additionalBarcodes` = distinct non-null barcodes of the other
   members, excluding the survivor's own `barcode`. If the survivor has no
   `barcode` but others do, it can't happen given rule 1.3 (survivor would
   have one) — no special case needed.
3. Every `order_items."productId"` pointing at a non-survivor is repointed to
   the survivor (open drafts included). Order lines keep their
   `productNameSnapshot`, so history reads the same.
4. Non-survivors: `"isActive" = false`, `"mergedIntoProductId" = survivor.id`.
5. Then create the partial unique index.
6. Log one summary line: groups merged, products hidden, order lines
   repointed (visible in Render deploy logs).

`down`: drop the index; re-activate rows with `mergedIntoProductId`, clear
it; set `additionalBarcodes` to `'{}'`; drop both columns. (Order lines that
were repointed stay on the survivor — same product, same snapshot name.)

## Barcode matching — everywhere a barcode is matched, check all of them

A product's barcodes = `[barcode, ...additionalBarcodes]` (non-empty values).

**Backend**
- `ProductsService.findByBarcodeInBranch`: candidates are active products
  with `barcode IS NOT NULL OR cardinality("additionalBarcodes") > 0`; the
  GTIN-aware comparison checks every barcode of the product.
- `findActiveByBranch` (branch-wide summary used by provider search and
  barcode resolution on mobile) also selects `additionalBarcodes`.
- `GET /providers/:id/products` returns it automatically (full entity).

**Mobile**
- `Product.additionalBarcodes?: string[]`; `ProviderProductSummary` includes it.
- New helper `productBarcodes(product)` in `src/barcode/`, and
  `productMatchesBarcode(product, scanned)` built on the existing
  `matchesBarcode`. Used by:
  - order screen scan (`handleBarcodeScanned` in `order.tsx`)
  - `src/providers/resolveBarcodeMatches.ts`
  - `src/providers/buildProviderSearchResults.ts` (barcode-prefix search
    checks every barcode)
- Admin product edit screen (`app/(app)/products/[productId]/edit.tsx`):
  shows additional barcodes **read-only** under the barcode field
  ("ברקודים נוספים: …"), passed in via route params like the other fields.
  Editing still changes only the main barcode.

Older app versions ignore the new field — they keep matching the main
barcode only until they refresh. Acceptable.

## Preventing new duplicates

- **Create / rename** (`ProductsService.create` / `update`): a unique
  violation from the partial index → `409 Conflict`
  ("A product with this name already exists for this provider"), same
  pattern as categories (`isUniqueViolation`). Re-activating a hidden product
  whose name is now taken also gets the 409.
- **Mobile**: the three places that create/rename a product —
  `app/(app)/admin/products/new.tsx`, `src/order/AddUnknownProductModal.tsx`,
  `app/(app)/products/[productId]/edit.tsx` — show
  "מוצר בשם הזה כבר קיים אצל הספק." on a 409 (via existing
  `isConflictError`) instead of the generic failure message.
- **Import script** (`import-friend-data.ts`): rows with the same supplier +
  normalized name become one product — first row's barcode as `barcode`,
  the rest into `additionalBarcodes`.

## Out of scope

- Near-match / fuzzy duplicates.
- "This name exists — add this barcode to it instead?" in the scan flow.
- Editing additional barcodes in the UI.
- Merging notes.
- Barcodes duplicated *across different names* (already reported by
  `report-unscannable-products.ts`; that script should include
  `additionalBarcodes` in its duplicate check — small, in scope).

## Testing

**Migration (e2e, real Postgres)** — a dedicated e2e spec that seeds
duplicates *before* the migration runs is awkward (migrations run first), so
the merge SQL lives in an exported function `mergeDuplicateProducts(queryRunner)`
called by the migration, and is tested directly against the e2e database:
- groups merge to one active survivor; others hidden with `mergedIntoProductId`
- survivor choice: order-referenced > real GTIN > any barcode > oldest
- all other barcodes land in `additionalBarcodes`, no duplicates, survivor's
  own excluded
- whitespace-only name differences merge; different names / different
  suppliers / already-inactive products don't
- order lines repointed to the survivor
- running it twice is a no-op
- after the index exists, creating a same-name product under the same
  supplier → 409; under another supplier → fine; same name as a hidden
  product → fine

**Backend unit**: `findByBarcodeInBranch` matches on an additional barcode;
create/update map unique violation → ConflictException.

**Mobile**: `productMatchesBarcode` / `productBarcodes`; scan on the order
screen finds a product by an additional barcode; provider search barcode
prefix hits an additional barcode; 409 shows the Hebrew message in the
create flows; edit screen shows additional barcodes.

**Local preview before push**: run migrations against the local copy and
report groups merged / rows hidden / a sample of 10 groups with survivor and
barcodes.

## Release note

"מוצרים שהופיעו כמה פעמים אצל אותו ספק אוחדו למוצר אחד. סריקה של כל אחד
מהברקודים שלהם עדיין עובדת."
