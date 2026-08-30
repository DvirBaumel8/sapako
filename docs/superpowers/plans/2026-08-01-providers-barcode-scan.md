# Barcode Scan from Providers List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a barcode-scan entry point to the providers list screen that, on a match, opens the matched provider's order screen with the product scrolled-to and highlighted.

**Architecture:** A new `GET /branches/:branchId/products` endpoint returns every active product across the branch's accessible providers (including `barcode`, unlike the untouched provider-scoped endpoint). The providers screen scans a barcode, matches it client-side against that branch-wide list via a new pure helper, and navigates to the matched provider's order screen with a `highlightProductId` param; the order screen scrolls to and highlights that product.

**Tech Stack:** NestJS + TypeORM (backend), Expo Router + React Query + `expo-camera` via the existing `BarcodeScannerModal` (mobile). Follows this repo's existing conventions: mocked-repository Jest unit tests on the backend, colocated pure-function + `.test.ts` unit tests on mobile, no e2e.

**Spec:** `docs/superpowers/specs/2026-08-01-providers-barcode-scan-design.md`

---

### Task 1: `ProductsService.findActiveByBranch`

**Files:**
- Modify: `backend/src/products/products.service.ts`
- Test: `backend/src/products/products.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add to `backend/src/products/products.service.spec.ts`, just before the final closing `});` of the `describe` block:

```ts
  it('lists active branch products across accessible providers when ALL', async () => {
    mockRepo.find.mockResolvedValue([
      { id: 'pr1', providerId: 'p1', name: 'Tomatoes', barcode: '111' },
    ]);

    const products = await service.findActiveByBranch('b1', 'ALL');

    expect(mockRepo.find).toHaveBeenCalledWith({
      where: { isActive: true, provider: { branchId: 'b1', isActive: true } },
      select: { id: true, providerId: true, name: true, barcode: true },
    });
    expect(products).toHaveLength(1);
  });

  it('filters branch products by the accessible-ids list when not ALL', async () => {
    mockRepo.find.mockResolvedValue([
      { id: 'pr1', providerId: 'p1', name: 'Tomatoes', barcode: '111' },
    ]);

    const products = await service.findActiveByBranch('b1', ['p1']);

    expect(mockRepo.find).toHaveBeenCalledWith({
      where: {
        isActive: true,
        provider: { branchId: 'b1', isActive: true, id: In(['p1']) },
      },
      select: { id: true, providerId: true, name: true, barcode: true },
    });
    expect(products).toHaveLength(1);
  });

  it('queries with an empty In() when the accessible-ids list is empty', async () => {
    mockRepo.find.mockResolvedValue([]);

    const products = await service.findActiveByBranch('b1', []);

    expect(mockRepo.find).toHaveBeenCalledWith({
      where: {
        isActive: true,
        provider: { branchId: 'b1', isActive: true, id: In([]) },
      },
      select: { id: true, providerId: true, name: true, barcode: true },
    });
    expect(products).toEqual([]);
  });
```

Add `In` to the existing `typeorm` import at the top of the file:

```ts
import { In } from 'typeorm';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npm test -- products/products.service.spec.ts`
Expected: FAIL — `service.findActiveByBranch is not a function`

- [ ] **Step 3: Implement `findActiveByBranch`**

In `backend/src/products/products.service.ts`, update the imports at the top:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { Product } from './product.entity';
import { Provider } from '../providers/provider.entity';
import { ProvidersService } from '../providers/providers.service';
```

Add this method to `ProductsService`, directly after `findActiveByProvider`:

```ts
  findActiveByBranch(
    branchId: string,
    accessibleProviderIds: string[] | 'ALL',
  ): Promise<Product[]> {
    const providerWhere: FindOptionsWhere<Provider> = {
      branchId,
      isActive: true,
    };
    if (accessibleProviderIds !== 'ALL') {
      providerWhere.id = In(accessibleProviderIds);
    }
    return this.productsRepo.find({
      where: { isActive: true, provider: providerWhere },
      select: { id: true, providerId: true, name: true, barcode: true },
    });
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npm test -- products/products.service.spec.ts`
Expected: PASS, all tests including the 3 new ones

- [ ] **Step 5: Commit**

```bash
git add backend/src/products/products.service.ts backend/src/products/products.service.spec.ts
git commit -m "feat(backend): add ProductsService.findActiveByBranch"
```

---

### Task 2: `GET /branches/:branchId/products` endpoint

**Files:**
- Modify: `backend/src/products/products.controller.ts`
- Modify: `backend/src/products/products.module.ts`

No new test file for this task — mirrors the existing `BranchProvidersController`, which likewise has no controller-level spec in this codebase; the scoping logic it delegates to is already covered by Task 1's `ProductsService` tests.

- [ ] **Step 1: Add `BranchProductsController`**

In `backend/src/products/products.controller.ts`, update the imports at the top:

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
```

Add this new controller at the top of the file, before `ProviderProductsController`:

```ts
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

```

(Leave `ProviderProductsController` and `ProductAdminController` below it unchanged.)

- [ ] **Step 2: Register the controller**

In `backend/src/products/products.module.ts`, update the controller import and `controllers` array:

```ts
import {
  BranchProductsController,
  ProviderProductsController,
  ProductAdminController,
} from './products.controller';
```

```ts
  controllers: [
    BranchProductsController,
    ProviderProductsController,
    ProductAdminController,
  ],
```

`PermissionsModule` is already imported in this file, so `PermissionsService` and `BranchAccessGuard` are already available — no other change needed.

- [ ] **Step 3: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: PASS, no regressions (this task adds no new test cases, just wiring)

- [ ] **Step 4: Commit**

```bash
git add backend/src/products/products.controller.ts backend/src/products/products.module.ts
git commit -m "feat(backend): add GET /branches/:branchId/products endpoint"
```

---

### Task 3: Mobile API client and types

**Files:**
- Modify: `mobile/src/api/types.ts`
- Modify: `mobile/src/api/products.ts`

No test file — these are thin type/HTTP-client declarations with no branching logic, consistent with the existing `fetchProductsForProvider`/`fetchProvidersForBranch` functions, which are also untested.

- [ ] **Step 1: Add the `ProviderProductSummary` type**

In `mobile/src/api/types.ts`, add directly after the `Product` interface:

```ts
export type ProviderProductSummary = Pick<Product, 'id' | 'name' | 'providerId' | 'barcode'>;
```

- [ ] **Step 2: Add `fetchProductsForBranch`**

In `mobile/src/api/products.ts`, update the type import at the top:

```ts
import { apiClient } from './client';
import type { Product, ProviderProductSummary } from './types';
```

Add this function anywhere in the file (e.g. directly after `fetchProductsForProvider`):

```ts
export async function fetchProductsForBranch(branchId: string): Promise<ProviderProductSummary[]> {
  const response = await apiClient.get<ProviderProductSummary[]>(`/branches/${branchId}/products`);
  return response.data;
}
```

- [ ] **Step 3: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 4: Commit**

```bash
git add mobile/src/api/types.ts mobile/src/api/products.ts
git commit -m "feat(mobile): add fetchProductsForBranch API client"
```

---

### Task 4: `resolveBarcodeMatches` pure helper

**Files:**
- Create: `mobile/src/providers/resolveBarcodeMatches.ts`
- Test: `mobile/src/providers/resolveBarcodeMatches.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `mobile/src/providers/resolveBarcodeMatches.test.ts`:

```ts
import { resolveBarcodeMatches } from './resolveBarcodeMatches';
import type { Provider, ProviderProductSummary } from '../api/types';

describe('resolveBarcodeMatches', () => {
  const providers: Provider[] = [
    {
      id: 'p1',
      branchId: 'b1',
      name: 'חברת הבשר',
      phone: '+972501234567',
      isActive: true,
      createdAt: '2026-07-23T10:00:00.000Z',
    },
    {
      id: 'p2',
      branchId: 'b1',
      name: 'ירקות השדה',
      phone: '+972507654321',
      isActive: true,
      createdAt: '2026-07-23T10:00:00.000Z',
    },
  ];

  it('returns an empty array when no product matches the barcode', () => {
    const products: ProviderProductSummary[] = [
      { id: 'pr1', providerId: 'p1', name: 'בשר טחון', barcode: '111' },
    ];

    expect(resolveBarcodeMatches(providers, products, '999')).toEqual([]);
  });

  it('returns a single match with the resolved provider name', () => {
    const products: ProviderProductSummary[] = [
      { id: 'pr1', providerId: 'p1', name: 'בשר טחון', barcode: '111' },
      { id: 'pr2', providerId: 'p2', name: 'עגבניות', barcode: '222' },
    ];

    expect(resolveBarcodeMatches(providers, products, '111')).toEqual([
      { providerId: 'p1', providerName: 'חברת הבשר', productId: 'pr1' },
    ]);
  });

  it('returns one match per provider when multiple providers share the same barcode', () => {
    const products: ProviderProductSummary[] = [
      { id: 'pr1', providerId: 'p1', name: 'בשר טחון', barcode: '111' },
      { id: 'pr2', providerId: 'p2', name: 'בשר טחון קפוא', barcode: '111' },
    ];

    expect(resolveBarcodeMatches(providers, products, '111')).toEqual([
      { providerId: 'p1', providerName: 'חברת הבשר', productId: 'pr1' },
      { providerId: 'p2', providerName: 'ירקות השדה', productId: 'pr2' },
    ]);
  });

  it('drops a matching product whose provider is not in the given providers list', () => {
    const products: ProviderProductSummary[] = [
      { id: 'pr1', providerId: 'missing-provider', name: 'בשר טחון', barcode: '111' },
    ];

    expect(resolveBarcodeMatches(providers, products, '111')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd mobile && npm test -- resolveBarcodeMatches`
Expected: FAIL — cannot find module `./resolveBarcodeMatches`

- [ ] **Step 3: Implement `resolveBarcodeMatches`**

Create `mobile/src/providers/resolveBarcodeMatches.ts`:

```ts
import type { Provider, ProviderProductSummary } from '../api/types';

export interface BarcodeMatch {
  providerId: string;
  providerName: string;
  productId: string;
}

export function resolveBarcodeMatches(
  providers: Provider[],
  products: ProviderProductSummary[],
  barcode: string,
): BarcodeMatch[] {
  const providersById = new Map(providers.map((provider) => [provider.id, provider]));
  const matches: BarcodeMatch[] = [];
  for (const product of products) {
    if (product.barcode !== barcode) continue;
    const provider = providersById.get(product.providerId);
    if (!provider) continue;
    matches.push({ providerId: provider.id, providerName: provider.name, productId: product.id });
  }
  return matches;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd mobile && npm test -- resolveBarcodeMatches`
Expected: PASS, all 4 tests

- [ ] **Step 5: Commit**

```bash
git add mobile/src/providers/resolveBarcodeMatches.ts mobile/src/providers/resolveBarcodeMatches.test.ts
git commit -m "feat(mobile): add resolveBarcodeMatches helper"
```

---

### Task 5: Wire up the providers list screen

**Files:**
- Modify: `mobile/app/(app)/index.tsx`

No test file — this is JSX/screen wiring calling the already-tested `resolveBarcodeMatches` helper; the branching logic itself lives in that helper, not here. Consistent with this repo's existing screens (e.g. `order.tsx`'s own `handleBarcodeScanned` has no test either).

- [ ] **Step 1: Update imports**

In `mobile/app/(app)/index.tsx`, replace:

```ts
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchProvidersForBranch } from '../../src/api/providers';
import { useBranch } from '../../src/branch/BranchContext';
```

with:

```ts
import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchProvidersForBranch } from '../../src/api/providers';
import { fetchProductsForBranch } from '../../src/api/products';
import { useBranch } from '../../src/branch/BranchContext';
import { BarcodeScannerModal } from '../../src/barcode/BarcodeScannerModal';
import { resolveBarcodeMatches, type BarcodeMatch } from '../../src/providers/resolveBarcodeMatches';
```

- [ ] **Step 2: Add state, query, and handlers**

Replace:

```ts
  const { selectedBranch } = useBranch();
  const [search, setSearch] = useState('');
  const { data: providers, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['providers', selectedBranch!.id],
    queryFn: () => fetchProvidersForBranch(selectedBranch!.id),
  });

  const filteredProviders = useMemo(() => {
    if (!providers) return providers;
    const query = search.trim();
    if (!query) return providers;
    return providers.filter((provider) => provider.name.includes(query));
  }, [providers, search]);

  return (
```

with:

```ts
  const { selectedBranch } = useBranch();
  const [search, setSearch] = useState('');
  const [isScannerVisible, setIsScannerVisible] = useState(false);
  const { data: providers, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['providers', selectedBranch!.id],
    queryFn: () => fetchProvidersForBranch(selectedBranch!.id),
  });
  const { data: branchProducts } = useQuery({
    queryKey: ['branch-products', selectedBranch!.id],
    queryFn: () => fetchProductsForBranch(selectedBranch!.id),
  });

  const filteredProviders = useMemo(() => {
    if (!providers) return providers;
    const query = search.trim();
    if (!query) return providers;
    return providers.filter((provider) => provider.name.includes(query));
  }, [providers, search]);

  const navigateToMatch = (match: BarcodeMatch) => {
    router.push({
      pathname: '/providers/[providerId]/order',
      params: {
        providerId: match.providerId,
        providerName: match.providerName,
        highlightProductId: match.productId,
      },
    });
  };

  const handleBarcodeScanned = (barcode: string) => {
    const matches = resolveBarcodeMatches(providers ?? [], branchProducts ?? [], barcode);
    if (matches.length === 0) {
      Alert.alert('לא נמצא מוצר תואם', 'לא נמצא מוצר עם ברקוד זה אצל אף ספק בסניף.');
      return;
    }
    if (matches.length === 1) {
      navigateToMatch(matches[0]);
      return;
    }
    Alert.alert('המוצר נמצא אצל כמה ספקים', 'לאיזה ספק לפתוח את ההזמנה?', [
      ...matches.map((match) => ({
        text: match.providerName,
        onPress: () => navigateToMatch(match),
      })),
      { text: 'ביטול', style: 'cancel' as const },
    ]);
  };

  return (
```

- [ ] **Step 3: Add the scan button and modal to the JSX**

Replace:

```tsx
      <Pressable onPress={() => router.push('/activity')} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>פעילות אחרונה</Text>
      </Pressable>

      <TextInput
```

with:

```tsx
      <View style={styles.secondaryButtonRow}>
        <Pressable onPress={() => router.push('/activity')} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>פעילות אחרונה</Text>
        </Pressable>
        <Pressable onPress={() => setIsScannerVisible(true)} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>סריקת ברקוד</Text>
        </Pressable>
      </View>
      <BarcodeScannerModal
        visible={isScannerVisible}
        onScanned={handleBarcodeScanned}
        onClose={() => setIsScannerVisible(false)}
      />

      <TextInput
```

- [ ] **Step 4: Update styles**

Replace:

```ts
  secondaryButton: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
```

with:

```ts
  secondaryButtonRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 12 },
  secondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
```

- [ ] **Step 5: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 6: Commit**

```bash
git add "mobile/app/(app)/index.tsx"
git commit -m "feat(mobile): add barcode scan button to providers list"
```

---

### Task 6: Scroll-to and highlight the matched product on the order screen

**Files:**
- Modify: `mobile/app/(app)/providers/[providerId]/order.tsx`

No test file — same rationale as Task 5; this is FlatList/JSX wiring with no new branching logic worth extracting (a single `findIndex` + a boolean style condition).

- [ ] **Step 1: Read the new `highlightProductId` param**

Replace:

```ts
  const { providerId, providerName, sourceOrder } = useLocalSearchParams<{
    providerId: string;
    providerName?: string;
    sourceOrder?: string;
  }>();
```

with:

```ts
  const { providerId, providerName, sourceOrder, highlightProductId } = useLocalSearchParams<{
    providerId: string;
    providerName?: string;
    sourceOrder?: string;
    highlightProductId?: string;
  }>();
```

- [ ] **Step 2: Add the FlatList ref and the scroll effect**

Replace:

```ts
  const orderCreationRef = useRef<Promise<Order> | null>(null);

  const { data: products } = useQuery({
    queryKey: ['products', providerId],
    queryFn: () => fetchProductsForProvider(providerId),
  });

  const filteredProducts = useMemo(() => {
    if (!products) return products;
    const query = search.trim();
    if (!query) return products;
    return products.filter((product) => product.name.includes(query));
  }, [products, search]);
```

with:

```ts
  const orderCreationRef = useRef<Promise<Order> | null>(null);
  const listRef = useRef<FlatList<Product>>(null);
  const hasScrolledRef = useRef(false);

  const { data: products } = useQuery({
    queryKey: ['products', providerId],
    queryFn: () => fetchProductsForProvider(providerId),
  });

  const filteredProducts = useMemo(() => {
    if (!products) return products;
    const query = search.trim();
    if (!query) return products;
    return products.filter((product) => product.name.includes(query));
  }, [products, search]);

  useEffect(() => {
    if (!highlightProductId || !filteredProducts || hasScrolledRef.current) return;
    const index = filteredProducts.findIndex((product) => product.id === highlightProductId);
    if (index === -1) return;
    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    hasScrolledRef.current = true;
  }, [filteredProducts, highlightProductId]);
```

- [ ] **Step 3: Wire the ref, scroll-failure fallback, and highlight style into the `FlatList`**

Replace:

```tsx
      <FlatList
        data={filteredProducts}
        keyExtractor={(product) => product.id}
        contentContainerStyle={styles.list}
        renderItem={({ item: product }) => {
          const currentQuantity = itemsByProductId[product.id]?.quantity ?? 0;
          return (
            <View style={styles.card}>
```

with:

```tsx
      <FlatList
        ref={listRef}
        data={filteredProducts}
        keyExtractor={(product) => product.id}
        contentContainerStyle={styles.list}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            listRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: true,
            });
          }, 50);
        }}
        renderItem={({ item: product }) => {
          const currentQuantity = itemsByProductId[product.id]?.quantity ?? 0;
          const isHighlighted = product.id === highlightProductId;
          return (
            <View style={[styles.card, isHighlighted && styles.cardHighlighted]}>
```

- [ ] **Step 4: Add the highlight style**

Replace:

```ts
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
```

with:

```ts
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHighlighted: {
    borderWidth: 2,
    borderColor: '#2563eb',
  },
```

- [ ] **Step 5: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 6: Commit**

```bash
git add "mobile/app/(app)/providers/[providerId]/order.tsx"
git commit -m "feat(mobile): scroll to and highlight the barcode-matched product"
```

---

### Task 7: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suites**

Run: `cd backend && npm test`
Expected: PASS, all suites including the new `findActiveByBranch` tests

Run: `cd mobile && npm test`
Expected: PASS, all suites including the new `resolveBarcodeMatches` tests

- [ ] **Step 2: Run the app and exercise the feature end-to-end**

With the backend running (`cd backend && npm run start:dev`) and an emulator/device connected (`adb reverse tcp:3000 tcp:3000` if using the Android emulator, per this project's existing dev setup):

1. Open the app, land on the providers list, confirm the new "סריקת ברקוד" button appears next to "פעילות אחרונה".
2. Tap it, scan a barcode belonging to a product you know exists for exactly one provider in the branch → confirm it navigates directly to that provider's order screen, scrolled to and with a visible highlighted border around the matching product card.
3. Scan a barcode that doesn't match any product in the branch → confirm the "לא נמצא מוצר תואם" alert appears and you stay on the providers list.
4. If two providers in your test data share a barcode (e.g. seed one manually via the admin product form), scan it → confirm the chooser alert lists both providers by name, and tapping one navigates to that provider's order screen with the correct product highlighted.
5. Confirm the existing in-provider scan flow (inside `order.tsx`, scanning while already on a provider's order screen) still works unchanged — it should still just auto-add 1 unit to the scanned product, no highlight.

- [ ] **Step 3: Report results**

Note in the conversation whether each of the 5 scenarios above passed, and paste/describe anything that didn't match expectations before considering the feature done.
