# Provider & Product Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the branch providers screen (`app/(app)/index.tsx`) search by product name as well as provider name, showing matching products as tappable sub-rows under their provider, and deep-link into the order screen scrolled to the tapped product.

**Architecture:** One new branch-scoped, permission-scoped backend endpoint (`GET /branches/:branchId/products`) returns a trimmed product list, fetched once alongside the existing providers query and filtered entirely client-side (no debounce, no per-keystroke network calls) — matching the pattern already used everywhere else in this app. A new pure helper groups matching providers with their matching products; the order screen gains a one-time scroll-to-index on arrival.

**Tech Stack:** NestJS + TypeORM (backend), Expo/React Native + `@tanstack/react-query` (mobile), Jest for both.

**Design doc:** `docs/superpowers/specs/2026-08-01-provider-product-search-design.md`

---

## Task 1: Backend — `ProductsService.findActiveByBranch`

**Files:**
- Modify: `backend/src/products/products.service.ts`
- Test: `backend/src/products/products.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add these `describe('findActiveByBranch', ...)` cases to `backend/src/products/products.service.spec.ts`, inside the existing top-level `describe('ProductsService', ...)` block (after the `findActiveByProvider` test, before `findById`):

```ts
  describe('findActiveByBranch', () => {
    it('lists active products for a branch when the caller has ALL access', async () => {
      mockRepo.find.mockResolvedValue([
        { id: 'pr1', providerId: 'p1', name: 'Tomatoes' },
      ]);

      const products = await service.findActiveByBranch('b1', 'ALL');

      expect(mockRepo.find).toHaveBeenCalledWith({
        where: { isActive: true, provider: { branchId: 'b1', isActive: true } },
        select: { id: true, providerId: true, name: true },
      });
      expect(products).toHaveLength(1);
    });

    it('filters products by the accessible-provider-ids list when not ALL', async () => {
      mockRepo.find.mockResolvedValue([
        { id: 'pr1', providerId: 'p1', name: 'Tomatoes' },
      ]);

      const products = await service.findActiveByBranch('b1', ['p1']);

      expect(mockRepo.find).toHaveBeenCalledWith({
        where: {
          isActive: true,
          provider: { branchId: 'b1', isActive: true, id: In(['p1']) },
        },
        select: { id: true, providerId: true, name: true },
      });
      expect(products).toHaveLength(1);
    });

    it('returns an empty list without querying when accessibleProviderIds is empty', async () => {
      const products = await service.findActiveByBranch('b1', []);

      expect(mockRepo.find).not.toHaveBeenCalled();
      expect(products).toEqual([]);
    });
  });
```

Add `In` to the existing typeorm import at the top of the file:

```ts
import { In } from 'typeorm';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest products.service.spec.ts`
Expected: FAIL — `service.findActiveByBranch is not a function`

- [ ] **Step 3: Implement `findActiveByBranch`**

In `backend/src/products/products.service.ts`, add the `In` import and the new method. The full updated file:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Product } from './product.entity';
import { ProvidersService } from '../providers/providers.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    private readonly providersService: ProvidersService,
  ) {}

  async create(
    providerId: string,
    input: { name: string; unitType: string; barcode?: string },
  ): Promise<Product> {
    // Confirm the provider exists before inserting — otherwise an invalid
    // providerId escapes as an unhandled FK-violation 500 instead of a
    // clean 404 (same failure mode already fixed for grantAccess).
    await this.providersService.findById(providerId);
    const entity = this.productsRepo.create({ providerId, ...input });
    return this.productsRepo.save(entity);
  }

  findActiveByProvider(providerId: string): Promise<Product[]> {
    return this.productsRepo.find({ where: { providerId, isActive: true } });
  }

  findActiveByBranch(
    branchId: string,
    accessibleProviderIds: string[] | 'ALL',
  ): Promise<Product[]> {
    // TypeORM's `In([])` isn't guaranteed to short-circuit to zero rows
    // across versions/drivers — return early rather than risk a bad query
    // for a user with zero accessible providers.
    if (accessibleProviderIds !== 'ALL' && accessibleProviderIds.length === 0) {
      return Promise.resolve([]);
    }
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

  async findById(id: string): Promise<Product> {
    const product = await this.productsRepo.findOneBy({ id });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async update(
    id: string,
    input: {
      name?: string;
      unitType?: string;
      barcode?: string;
      isActive?: boolean;
    },
  ): Promise<Product> {
    const product = await this.findById(id);
    Object.assign(product, input);
    return this.productsRepo.save(product);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest products.service.spec.ts`
Expected: PASS, all tests including the 3 new ones

- [ ] **Step 5: Commit**

```bash
git add backend/src/products/products.service.ts backend/src/products/products.service.spec.ts
git commit -m "feat(backend): add ProductsService.findActiveByBranch"
```

---

## Task 2: Backend — `GET /branches/:branchId/products` endpoint

**Files:**
- Modify: `backend/src/products/products.controller.ts`
- Modify: `backend/src/products/products.module.ts`

- [ ] **Step 1: Add the controller**

In `backend/src/products/products.controller.ts`, add `Req` to the `@nestjs/common` import, add imports for `BranchAccessGuard` and `PermissionsService`, and add a new `BranchProductsController` class. Full updated file:

```ts
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../users/role.enum';
import { ProviderAccessGuard } from '../permissions/provider-access.guard';
import { BranchAccessGuard } from '../permissions/branch-access.guard';
import { PermissionsService } from '../permissions/permissions.service';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './product.entity';

@Controller('providers/:providerId/products')
@UseGuards(JwtAuthGuard, ProviderAccessGuard, RolesGuard)
export class ProviderProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findForProvider(@Param('providerId') providerId: string): Promise<Product[]> {
    return this.productsService.findActiveByProvider(providerId);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(
    @Param('providerId') providerId: string,
    @Body() dto: CreateProductDto,
  ): Promise<Product> {
    return this.productsService.create(providerId, dto);
  }
}

@Controller('branches/:branchId/products')
@UseGuards(JwtAuthGuard, BranchAccessGuard, RolesGuard)
export class BranchProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get()
  async findForBranch(
    @Req() req: any,
    @Param('branchId') branchId: string,
  ): Promise<Product[]> {
    const accessibleProviderIds =
      await this.permissionsService.getAccessibleProviderIds(req.user);
    return this.productsService.findActiveByBranch(
      branchId,
      accessibleProviderIds,
    );
  }
}

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductAdminController {
  constructor(private readonly productsService: ProductsService) {}

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<Product> {
    return this.productsService.update(id, dto);
  }
}
```

- [ ] **Step 2: Register the controller in the module**

In `backend/src/products/products.module.ts`, add `BranchProductsController` to the import and to `controllers`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './product.entity';
import { ProductsService } from './products.service';
import {
  ProviderProductsController,
  BranchProductsController,
  ProductAdminController,
} from './products.controller';
import { PermissionsModule } from '../permissions/permissions.module';
import { ProvidersModule } from '../providers/providers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product]),
    PermissionsModule,
    ProvidersModule,
  ],
  providers: [ProductsService],
  controllers: [
    ProviderProductsController,
    BranchProductsController,
    ProductAdminController,
  ],
  exports: [ProductsService, TypeOrmModule],
})
export class ProductsModule {}
```

- [ ] **Step 3: Verify the backend builds and existing tests still pass**

Run: `cd backend && npx tsc --noEmit && npx jest`
Expected: no type errors, all test suites PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/products/products.controller.ts backend/src/products/products.module.ts
git commit -m "feat(backend): add GET /branches/:branchId/products endpoint"
```

---

## Task 3: Mobile — API client and types for branch products

**Files:**
- Modify: `mobile/src/api/types.ts`
- Modify: `mobile/src/api/products.ts`

- [ ] **Step 1: Add the `ProviderProductSummary` type**

In `mobile/src/api/types.ts`, add this new type directly after the `Product` interface (after line 28):

```ts
export type ProviderProductSummary = Pick<Product, 'id' | 'name' | 'providerId'>;
```

- [ ] **Step 2: Add `fetchProductsForBranch`**

In `mobile/src/api/products.ts`, add the import and new function. Full updated file:

```ts
import { apiClient } from './client';
import type { Product, ProviderProductSummary } from './types';

export async function fetchProductsForProvider(providerId: string): Promise<Product[]> {
  const response = await apiClient.get<Product[]>(`/providers/${providerId}/products`);
  return response.data;
}

export async function fetchProductsForBranch(branchId: string): Promise<ProviderProductSummary[]> {
  const response = await apiClient.get<ProviderProductSummary[]>(`/branches/${branchId}/products`);
  return response.data;
}

export async function createProduct(
  providerId: string,
  input: { name: string; unitType: string; barcode?: string },
): Promise<Product> {
  const response = await apiClient.post<Product>(`/providers/${providerId}/products`, input);
  return response.data;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add mobile/src/api/types.ts mobile/src/api/products.ts
git commit -m "feat(mobile): add fetchProductsForBranch API client"
```

---

## Task 4: Mobile — `buildProviderSearchResults` pure helper

**Files:**
- Create: `mobile/src/providers/buildProviderSearchResults.ts`
- Test: `mobile/src/providers/buildProviderSearchResults.test.ts`

- [ ] **Step 1: Write the failing test**

Create `mobile/src/providers/buildProviderSearchResults.test.ts`:

```ts
import { buildProviderSearchResults } from './buildProviderSearchResults';
import type { Provider, ProviderProductSummary } from '../api/types';

const provider = (id: string, name: string): Provider => ({
  id,
  branchId: 'b1',
  name,
  phone: '+972501234567',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const product = (id: string, providerId: string, name: string): ProviderProductSummary => ({
  id,
  providerId,
  name,
});

describe('buildProviderSearchResults', () => {
  const providers = [provider('p1', 'יוסי סבג פירות וירקות'), provider('p2', 'ירקות השדה')];
  const products = [
    product('pr1', 'p1', 'עגבניה שרי'),
    product('pr2', 'p1', 'מלפפון'),
    product('pr3', 'p2', 'עגבניה מקושקשת'),
  ];

  it('returns every provider with no matching products for an empty query', () => {
    const results = buildProviderSearchResults(providers, products, '');

    expect(results).toEqual([
      { provider: providers[0], matchingProducts: [] },
      { provider: providers[1], matchingProducts: [] },
    ]);
  });

  it('returns every provider with no matching products for a whitespace-only query', () => {
    const results = buildProviderSearchResults(providers, products, '   ');

    expect(results.every((r) => r.matchingProducts.length === 0)).toBe(true);
    expect(results).toHaveLength(2);
  });

  it('includes a provider matched by its own name, with no matching products', () => {
    const results = buildProviderSearchResults(providers, products, 'השדה');

    expect(results).toEqual([{ provider: providers[1], matchingProducts: [] }]);
  });

  it('includes a provider matched only via a product name, with that product listed', () => {
    const results = buildProviderSearchResults(providers, products, 'מלפפון');

    expect(results).toEqual([{ provider: providers[0], matchingProducts: [products[1]] }]);
  });

  it('includes a provider matched by both name and product, listing the matching products', () => {
    const results = buildProviderSearchResults(providers, products, 'עגבניה');

    expect(results).toEqual([
      { provider: providers[0], matchingProducts: [products[0]] },
      { provider: providers[1], matchingProducts: [products[2]] },
    ]);
  });

  it('excludes a provider that matches neither its name nor any product', () => {
    const results = buildProviderSearchResults(providers, products, 'בשר');

    expect(results).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd mobile && npx jest src/providers/buildProviderSearchResults.test.ts`
Expected: FAIL — cannot find module `./buildProviderSearchResults`

- [ ] **Step 3: Implement the helper**

Create `mobile/src/providers/buildProviderSearchResults.ts`:

```ts
import type { Provider, ProviderProductSummary } from '../api/types';

export interface ProviderSearchResult {
  provider: Provider;
  matchingProducts: ProviderProductSummary[];
}

export function buildProviderSearchResults(
  providers: Provider[],
  products: ProviderProductSummary[],
  query: string,
): ProviderSearchResult[] {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return providers.map((provider) => ({ provider, matchingProducts: [] }));
  }

  const results: ProviderSearchResult[] = [];
  for (const provider of providers) {
    const matchingProducts = products.filter(
      (product) => product.providerId === provider.id && product.name.includes(trimmedQuery),
    );
    const providerNameMatches = provider.name.includes(trimmedQuery);
    if (providerNameMatches || matchingProducts.length > 0) {
      results.push({ provider, matchingProducts });
    }
  }
  return results;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd mobile && npx jest src/providers/buildProviderSearchResults.test.ts`
Expected: PASS, all 6 tests

- [ ] **Step 5: Commit**

```bash
git add mobile/src/providers/buildProviderSearchResults.ts mobile/src/providers/buildProviderSearchResults.test.ts
git commit -m "feat(mobile): add buildProviderSearchResults helper"
```

---

## Task 5: Mobile — wire search into the providers screen

**Files:**
- Modify: `mobile/app/(app)/index.tsx`

- [ ] **Step 1: Replace the file contents**

Full updated `mobile/app/(app)/index.tsx`:

```tsx
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchProvidersForBranch } from '../../src/api/providers';
import { fetchProductsForBranch } from '../../src/api/products';
import { useBranch } from '../../src/branch/BranchContext';
import { buildProviderSearchResults } from '../../src/providers/buildProviderSearchResults';

export default function HomeScreen() {
  const { selectedBranch } = useBranch();
  const [search, setSearch] = useState('');
  const { data: providers, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['providers', selectedBranch!.id],
    queryFn: () => fetchProvidersForBranch(selectedBranch!.id),
  });
  const { data: products } = useQuery({
    queryKey: ['branch-products', selectedBranch!.id],
    queryFn: () => fetchProductsForBranch(selectedBranch!.id),
  });

  const searchResults = useMemo(
    () => buildProviderSearchResults(providers ?? [], products ?? [], search),
    [providers, products, search],
  );

  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.push('/select-branch')} style={styles.branchRow}>
        <Text style={styles.branchName}>{selectedBranch!.name} ▾</Text>
      </Pressable>
      <Pressable onPress={() => router.push('/activity')} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>פעילות אחרונה</Text>
      </Pressable>

      <TextInput
        style={styles.search}
        placeholder="חפש ספק או מוצר…"
        value={search}
        onChangeText={setSearch}
      />

      {isLoading && <Text style={styles.statusText}>טוען ספקים…</Text>}
      {error && <Text style={styles.statusText}>לא ניתן לטעון ספקים. יש למשוך לרענון.</Text>}

      <FlatList
        refreshing={isRefetching}
        onRefresh={refetch}
        data={searchResults}
        keyExtractor={(result) => result.provider.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Pressable
              style={styles.providerRow}
              onPress={() =>
                router.push({
                  pathname: '/providers/[providerId]/order',
                  params: { providerId: item.provider.id, providerName: item.provider.name },
                })
              }
            >
              <Text style={styles.cardText}>{item.provider.name}</Text>
            </Pressable>
            {item.matchingProducts.map((product) => (
              <Pressable
                key={product.id}
                style={styles.productRow}
                onPress={() =>
                  router.push({
                    pathname: '/providers/[providerId]/order',
                    params: {
                      providerId: item.provider.id,
                      providerName: item.provider.name,
                      scrollToProductId: product.id,
                    },
                  })
                }
              >
                <Text style={styles.productRowText}>{product.name}</Text>
              </Pressable>
            ))}
          </View>
        )}
        ListEmptyComponent={
          !isLoading ? (
            <Text style={styles.statusText}>
              {search.trim() ? 'לא נמצאו ספקים או מוצרים תואמים לחיפוש.' : 'אין עדיין ספקים לסניף זה.'}
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', paddingTop: 16 },
  branchRow: { paddingHorizontal: 16, marginBottom: 8 },
  branchName: { fontSize: 20, fontWeight: '700' },
  secondaryButton: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  secondaryButtonText: { color: '#2563eb', fontWeight: '600', fontSize: 14 },
  search: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    textAlign: 'right',
    fontSize: 15,
  },
  statusText: { textAlign: 'center', marginTop: 12, color: '#666' },
  list: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardText: { fontSize: 16, fontWeight: '600', textAlign: 'right', color: '#1a1a1a' },
  providerRow: { width: '100%' },
  productRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  productRowText: { fontSize: 14, textAlign: 'right', color: '#2563eb' },
});
```

Note: the provider name `Pressable` and the outer `card` `View` are now separate — the card itself is a plain `View` (no longer directly pressable) so the product sub-rows can be sibling `Pressable`s inside it without nesting a `Pressable` inside a `Pressable`.

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Run the full mobile test suite**

Run: `cd mobile && npx jest`
Expected: PASS, all suites (this screen has no dedicated test file — no RN component-testing harness exists in this repo, consistent with every other screen)

- [ ] **Step 4: Commit**

```bash
git add mobile/app/\(app\)/index.tsx
git commit -m "feat(mobile): search providers screen by product name"
```

---

## Task 6: Mobile — scroll to product on the order screen

**Files:**
- Modify: `mobile/app/(app)/providers/[providerId]/order.tsx`

- [ ] **Step 1: Add the `scrollToProductId` param, a `FlatList` ref, and the scroll effect**

In `mobile/app/(app)/providers/[providerId]/order.tsx`:

Change the `useLocalSearchParams` destructuring (around line 13) from:

```tsx
  const { providerId, providerName, sourceOrder } = useLocalSearchParams<{
    providerId: string;
    providerName?: string;
    sourceOrder?: string;
  }>();
```

to:

```tsx
  const { providerId, providerName, sourceOrder, scrollToProductId } = useLocalSearchParams<{
    providerId: string;
    providerName?: string;
    sourceOrder?: string;
    scrollToProductId?: string;
  }>();
```

Add `useEffect` and `useRef` to the React import (line 1) — it already imports `useEffect, useMemo, useRef, useState`, so no change needed there.

Add a `FlatList` type import at the top, next to the existing `react-native` import (line 2):

```tsx
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
```

(already imports `FlatList` — no change needed, just confirming.)

After the `orderCreationRef` declaration (currently line 23: `const orderCreationRef = useRef<Promise<Order> | null>(null);`), add:

```tsx
  const listRef = useRef<FlatList<Product>>(null);
  const hasScrolledRef = useRef(false);
```

After the `filteredProducts` `useMemo` block (currently ends around line 35), add a new effect:

```tsx
  useEffect(() => {
    if (!scrollToProductId || hasScrolledRef.current || !filteredProducts) {
      return;
    }
    const index = filteredProducts.findIndex((product) => product.id === scrollToProductId);
    if (index === -1) {
      return;
    }
    hasScrolledRef.current = true;
    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
  }, [filteredProducts, scrollToProductId]);
```

Update the `FlatList` element (currently starting at line 138) to attach the ref and an `onScrollToIndexFailed` handler — change:

```tsx
      <FlatList
        data={filteredProducts}
        keyExtractor={(product) => product.id}
        contentContainerStyle={styles.list}
```

to:

```tsx
      <FlatList
        ref={listRef}
        data={filteredProducts}
        keyExtractor={(product) => product.id}
        contentContainerStyle={styles.list}
        onScrollToIndexFailed={(info) => {
          listRef.current?.scrollToOffset({
            offset: info.averageItemLength * info.index,
            animated: true,
          });
          setTimeout(
            () => listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 }),
            100,
          );
        }}
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Run the full mobile test suite**

Run: `cd mobile && npx jest`
Expected: PASS, all suites

- [ ] **Step 4: Commit**

```bash
git add mobile/app/\(app\)/providers/\[providerId\]/order.tsx
git commit -m "feat(mobile): scroll order screen to the tapped search result product"
```

---

## Task 7: Manual verification

Not automatable — this app has no RN component-testing harness and the project's testing policy is unit tests only, no e2e (per project convention). Verify live using the `run` skill or `npm run android`/`npm run ios` against the local backend:

- [ ] **Step 1: Start backend + mobile, open the providers screen for a branch with providers that have products**
- [ ] **Step 2: Type a product name (not a provider name) into the search box** — confirm the matching provider(s) appear with the product listed as a sub-row underneath, and providers with no match disappear
- [ ] **Step 3: Type a provider name with no matching product** — confirm that provider appears with no sub-rows (unchanged from before this feature)
- [ ] **Step 4: Tap a matched product sub-row** — confirm it opens that provider's order screen and scrolls to the product (product should end up roughly centered in view)
- [ ] **Step 5: Tap the provider row itself (not a product)** — confirm it opens the order screen with no scrolling (same as before this feature)
- [ ] **Step 6: Clear the search box** — confirm the list returns to exactly today's plain provider list with no sub-rows

---

## Self-Review Notes

- **Spec coverage:** §3 (backend endpoint + service method) → Tasks 1–2. §4 mobile API client/type → Task 3. Search helper → Task 4. Screen wiring + placeholder text → Task 5. Scroll-to-product → Task 6. §5 testing → embedded in Tasks 1 and 4 (backend and mobile unit tests respectively; no controller-spec or RN-component-test convention exists in this repo to extend). §6 out-of-scope items are not implemented anywhere in this plan, as intended.
- **Type consistency:** `ProviderProductSummary` (Task 3) is used identically in `buildProviderSearchResults` (Task 4), `fetchProductsForBranch`'s return type (Task 3), and the `useQuery` in `index.tsx` (Task 5). `scrollToProductId` param name is identical between the `router.push` call in Task 5 and the `useLocalSearchParams` destructuring in Task 6.
- **No placeholders:** every step has complete, copy-pasteable code.
