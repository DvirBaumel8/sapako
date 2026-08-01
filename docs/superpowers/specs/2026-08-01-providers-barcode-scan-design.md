# Barcode Scan from Providers List — Design

## 1. Purpose & Scope

Today, scanning a barcode only works from inside a provider's order screen
(`app/(app)/providers/[providerId]/order.tsx`), and only matches against that
one provider's already-loaded product list. This adds a scan entry point to
the providers list screen (`app/(app)/index.tsx`) itself: scan a barcode
before picking a provider, and if it matches a product anywhere in the
branch, jump straight into that provider's order screen with the product
scrolled-to and highlighted, ready to start an order.

Out of scope: changing the existing in-provider scan behavior (still scans
only that provider's products, still auto-adds 1 unit on match — unchanged);
building a shared/reusable barcode-lookup component beyond what's described
here; a custom chooser UI for multi-provider matches (uses a native `Alert`
instead, see §4).

## 2. Background: shared endpoint with the (unbuilt) product-search feature

`docs/superpowers/specs/2026-08-01-provider-product-search-design.md`
already designs `GET /branches/:branchId/products` (returning products across
every provider in a branch, scoped by `getAccessibleProviderIds`) for a
different feature (product-*name* search) that hasn't been implemented yet.
This feature needs the same kind of branch-wide product data, so it builds
that endpoint now rather than duplicating it — implementing this feature also
unblocks the name-search feature later.

One deviation from that spec: it trims the response `select` to
`{ id, providerId, name }` and explicitly excludes `barcode`. This feature
needs `barcode` to do the match, so the `select` is widened to
`{ id, providerId, name, barcode }`, and `ProviderProductSummary` becomes
`Pick<Product, 'id' | 'name' | 'providerId' | 'barcode'>`. Everything else in
that spec's backend section (guards, branch/active scoping) is unchanged.

## 3. Backend (NestJS)

### `GET /branches/:branchId/products`

New `BranchProductsController` in `products.controller.ts`, mirroring the
existing `BranchProvidersController` pattern in `providers.controller.ts`:

- Guards: `JwtAuthGuard`, `BranchAccessGuard`, `RolesGuard`.
- Resolves `accessibleProviderIds` via
  `PermissionsService.getAccessibleProviderIds(req.user)`.
- Delegates to `ProductsService.findActiveByBranch(branchId, accessibleProviderIds)`.

### `ProductsService.findActiveByBranch`

```ts
findActiveByBranch(
  branchId: string,
  accessibleProviderIds: string[] | 'ALL',
): Promise<Product[]> {
  return this.productsRepo.find({
    where: {
      isActive: true,
      provider: {
        branchId,
        isActive: true,
        ...(accessibleProviderIds !== 'ALL'
          ? { id: In(accessibleProviderIds) }
          : {}),
      },
    },
    select: { id: true, providerId: true, name: true, barcode: true },
  });
}
```

Same nested-relation `where` idiom already used in `orders.service.ts` /
`permissions.service.ts`.

## 4. Mobile (Expo)

### API client

`src/api/products.ts` gains `fetchProductsForBranch(branchId): Promise<ProviderProductSummary[]>`
calling `GET /branches/${branchId}/products`.

`types.ts` gains `ProviderProductSummary = Pick<Product, 'id' | 'name' | 'providerId' | 'barcode'>`.

### `app/(app)/index.tsx`

- New scan button next to the existing "פעילות אחרונה" button, same
  `secondaryButton` visual style. Opens the existing `BarcodeScannerModal`
  (already generic — takes `onScanned(barcode: string)`, no changes needed).
- New query alongside the existing providers query:
  `useQuery(['branch-products', selectedBranch.id], () => fetchProductsForBranch(selectedBranch.id))`.
- New pure helper `mobile/src/providers/resolveBarcodeMatches.ts`:
  ```ts
  interface BarcodeMatch {
    providerId: string;
    providerName: string;
    productId: string;
  }

  function resolveBarcodeMatches(
    providers: Provider[],
    products: ProviderProductSummary[],
    barcode: string,
  ): BarcodeMatch[]
  ```
  Filters `products` by `barcode === scanned`, joins each to its provider's
  `name` via `providers`. Products whose `providerId` doesn't resolve to a
  provider in `providers` (e.g. a race with the providers query) are dropped.
  Pure function, no I/O — same shape as `buildProviderSearchResults.ts`,
  colocated with a `.test.ts`.
- `handleBarcodeScanned(barcode)`:
  - `matches = resolveBarcodeMatches(providers ?? [], branchProducts ?? [], barcode)`
  - **0 matches** → `Alert.alert('לא נמצא מוצר תואם', 'לא נמצא מוצר עם ברקוד זה אצל אף ספק בסניף.')`, stays on the providers screen.
  - **1 match** → `router.push({ pathname: '/providers/[providerId]/order', params: { providerId: match.providerId, providerName: match.providerName, highlightProductId: match.productId } })`.
  - **>1 matches** → `Alert.alert` with title asking which provider, and one
    button per match labeled with `providerName`; each button's `onPress`
    navigates as in the single-match case for that match.

### `app/(app)/providers/[providerId]/order.tsx`

- Reads a new optional `highlightProductId` param (alongside existing
  `providerId`, `providerName`, `sourceOrder`).
- Adds a `FlatList` ref (`listRef`) and a `hasScrolledRef` guard, mirroring
  the mechanism already designed (but not yet built) in the product-search
  spec: a `useEffect` keyed on `[filteredProducts, highlightProductId]`
  finds `filteredProducts.findIndex(p => p.id === highlightProductId)` once
  products are loaded, calls
  `listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 })`,
  and sets `hasScrolledRef.current = true`. `onScrollToIndexFailed` handler
  on the `FlatList` covers variable row heights (no `getItemLayout`).
- Card highlight: when rendering a product row, if
  `product.id === highlightProductId`, apply an additional style (colored
  border) to that card. Persists for the screen's lifetime — no fade timer,
  no clear-on-interaction. Simplest version for v1; revisit if it feels wrong
  in practice.
- No changes to the existing in-provider `handleBarcodeScanned` / scan
  button — that flow (scan while already on an order screen, auto-add 1
  unit) is untouched.

## 5. Testing

**Backend** — `products.service.spec.ts` (extended), covering
`findActiveByBranch`:
- returns only active products from active providers in the given branch
- excludes products from providers in other branches
- excludes inactive products and products belonging to inactive providers
- `accessibleProviderIds: 'ALL'` returns every matching product regardless of provider
- a restricted `accessibleProviderIds` list excludes products from providers not in that list
- an empty `accessibleProviderIds` list returns no products (no SQL error)
- returned products include `barcode`

**Mobile** — `mobile/src/providers/resolveBarcodeMatches.test.ts` (new):
- no product matches the barcode → empty array
- exactly one product matches → single `BarcodeMatch` with correct `providerId`/`providerName`/`productId`
- products from multiple providers share the same barcode → one `BarcodeMatch` per provider
- a matching product's `providerId` has no corresponding entry in `providers` → that match is dropped, not included with an empty/undefined `providerName`

## 6. Out of scope / explicitly deferred

- Custom in-app chooser UI for multi-provider matches (uses native `Alert`).
- Highlight fade timer or clear-on-interaction behavior.
- Any change to the existing in-provider scan-to-add-1-unit flow.
- The product-*name*-search feature's own UI (only its backend endpoint is built here, as a byproduct).
