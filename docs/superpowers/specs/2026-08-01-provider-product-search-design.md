# Provider & Product Search — Design

## 1. Purpose & Scope

The user's friend (the supermarket owner) tests the app and wants to be able
to search for a product by name from the branch's providers screen — today
that screen (`app/(app)/index.tsx`) only searches by provider name.

This adds product-name matching to the same search bar, with product matches
surfaced as tappable sub-rows under their provider, deep-linking into the
order screen scrolled to that product.

Out of scope: debounced/server-driven search-as-you-type (rejected in favor
of loading all branch products once, see §3), capping the number of matching
products shown per provider (branch catalogs are small enough that showing
all matches is simplest), highlighting the scrolled-to product on the order
screen (scroll only, no flash/border), and reordering the provider list to
float product-matching providers to the top (list order is unchanged from
today; only membership is filtered).

## 2. UX

One search bar, placeholder **"חפש ספק או מוצר…"** (replacing today's "חפש
ספק…"). As the user types, the existing provider list re-filters in place —
no loading state, no debounce, since all data needed is already loaded
client-side (§3).

For each provider still shown after filtering:
- If only the provider's own name matched: render exactly as today, no
  sub-rows.
- If the provider has one or more products whose name matched: render the
  provider row **plus** every matching product as a sub-row underneath it,
  regardless of whether the provider's own name also matched.

A provider appears in the filtered results if its name matches **or** it has
at least one matching product.

Tapping a provider row behaves exactly as it does today (opens that
provider's order screen, no scroll target). Tapping a matched **product**
sub-row also opens that provider's order screen, but additionally scrolls
the product list to that product.

When the search box is empty, the screen is pixel-identical to today's
provider list — no sub-rows, same order, same rows.

## 3. Backend (NestJS)

### New endpoint: `GET /branches/:branchId/products`

Added to `products.controller.ts` as a new `BranchProductsController`,
mirroring the existing `BranchProvidersController` in
`providers.controller.ts`:

- Guards: `JwtAuthGuard`, `BranchAccessGuard`, `RolesGuard` — identical to
  the branch-scoped providers endpoint.
- Resolves `accessibleProviderIds` via the existing
  `PermissionsService.getAccessibleProviderIds(req.user)` — a non-admin user
  never sees a product belonging to a provider they don't have access to,
  same scoping already applied to the providers list.
- Delegates to a new `ProductsService.findActiveByBranch(branchId,
  accessibleProviderIds)`.

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
    select: { id: true, providerId: true, name: true },
  });
}
```

Uses the nested-relation `where` idiom already established in
`orders.service.ts` / `permissions.service.ts` (filtering by a joined
entity's columns without a manual `QueryBuilder` join). `select` trims the
response to just the three fields the client needs — no `unitType`,
`barcode`, or `imageUrl`.

## 4. Mobile (Expo)

### API client

`src/api/products.ts` gains `fetchProductsForBranch(branchId): Promise<ProviderProductSummary[]>`
calling `GET /branches/${branchId}/products`.

`types.ts` gains `ProviderProductSummary = Pick<Product, 'id' | 'name' | 'providerId'>`.

### Search helper — `mobile/src/providers/buildProviderSearchResults.ts` (new)

```ts
interface ProviderSearchResult {
  provider: Provider;
  matchingProducts: ProviderProductSummary[];
}

function buildProviderSearchResults(
  providers: Provider[],
  products: ProviderProductSummary[],
  query: string,
): ProviderSearchResult[]
```

For each provider, `matchingProducts` = products with that `providerId`
whose `name` includes the (trimmed) query. A provider is included if its own
name includes the query, or `matchingProducts.length > 0`. Empty/whitespace
query short-circuits to every provider with `matchingProducts: []`, matching
today's "no search" display exactly. Pure function, no I/O — same shape as
the existing `buildOrderMessage.ts` helper, colocated with a `.test.ts`.

### `app/(app)/index.tsx`

- Second `useQuery` alongside the existing providers query:
  `fetchProductsForBranch(selectedBranch.id)`.
- `filteredResults = useMemo(() => buildProviderSearchResults(providers ?? [], products ?? [], search), [providers, products, search])`.
- If the products query hasn't resolved yet or fails, `products` defaults to
  `[]` — search degrades to provider-name-only matching until it loads; no
  extra loading/error UI, the provider list is already usable without it.
- `renderItem` renders the provider card as today, then — only when
  `matchingProducts.length > 0` — maps them into `Pressable` sub-rows below
  the provider name, each navigating to:
  ```ts
  router.push({
    pathname: '/providers/[providerId]/order',
    params: { providerId: provider.id, providerName: provider.name, scrollToProductId: product.id },
  })
  ```
- Placeholder text: `"חפש ספק או מוצר…"`. Empty-state text updated to mention
  both providers and products.

### `app/(app)/providers/[providerId]/order.tsx`

- Reads an optional `scrollToProductId` param.
- Adds a `FlatList` ref (`listRef`) and a `hasScrolledRef` guard (so the
  scroll only fires once, not on every re-render while `scrollToProductId`
  stays set).
- `useEffect` keyed on `[filteredProducts, scrollToProductId]`: once
  `filteredProducts` is populated and `hasScrolledRef.current` is false,
  finds `filteredProducts.findIndex(p => p.id === scrollToProductId)`; if
  found, calls `listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 })`
  and sets `hasScrolledRef.current = true`.
- Since card heights vary with wrapped product-name text, `scrollToIndex`
  gets an `onScrollToIndexFailed` handler on the `FlatList` (estimates an
  offset from `averageItemLength` and retries) rather than relying on
  `getItemLayout`, which assumes fixed row height.
- No changes to the screen's own local product-search box — it stays empty
  on arrival, so the full product list (not a filtered subset) is what gets
  scrolled within.
- Scroll only — no highlight/flash on the target card, per product decision.

## 5. Testing

**Backend** — `products.service.spec.ts` (extended), covering
`findActiveByBranch`:
- returns only active products from active providers in the given branch
- excludes products from providers in other branches
- excludes inactive products and products belonging to inactive providers
- `accessibleProviderIds: 'ALL'` returns every matching product regardless
  of provider
- a restricted `accessibleProviderIds` list excludes products from
  providers not in that list
- an empty `accessibleProviderIds` list returns no products (no SQL error)

**Mobile** — `mobile/src/providers/buildProviderSearchResults.test.ts` (new):
- provider matched by name only → included, `matchingProducts: []`
- provider matched by product name only (name itself doesn't match) →
  included, `matchingProducts` has the matching product(s)
- provider matched by both → included, both the name match and
  `matchingProducts` populated
- provider with neither matching → excluded
- empty/whitespace query → every provider included, `matchingProducts: []`
  for all

## 6. Out of scope / explicitly deferred

- Debounced server-side search endpoint (rejected — see §1).
- Capping matched products per provider with a "+N more".
- Highlighting/flashing the scrolled-to product on the order screen.
- Reordering the provider list to surface product-matches first.
- Searching inactive products or products from inactive providers.
