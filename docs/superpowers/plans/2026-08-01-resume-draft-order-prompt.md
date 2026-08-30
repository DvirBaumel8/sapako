# Resume Draft Order Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user opens a provider's products screen directly from the provider list and already has an unfinished draft order of their own for that provider, prompt them (yes/no) to continue it instead of silently starting a new one.

**Architecture:** No backend changes. The mobile order screen (`mobile/app/(app)/providers/[providerId]/order.tsx`) fetches the branch's orders (an endpoint it doesn't currently call, but the Activity screen already does) and runs a new pure helper, `findResumableDraft`, to find the current user's own non-empty draft for this provider. If found — and only when the screen was entered without an explicit `sourceOrder` (i.e. not via the Activity screen's existing resume/continue flow) — a native `Alert.alert` offers to resume it.

**Tech Stack:** React Native (Expo Router), TypeScript, `@tanstack/react-query`, Jest (`jest-expo` preset).

**Reference spec:** `docs/superpowers/specs/2026-08-01-resume-draft-order-prompt-design.md`

---

### Task 1: Add `createdByUserId` to the mobile `Order` type

The backend's `Order` entity (`backend/src/orders/order.entity.ts:35-40`) has a `createdByUserId` column and it's returned as-is in every order JSON response (no serialization exclusion is configured anywhere in the backend). The mobile `Order` type just doesn't declare the field yet. It's needed to determine "does *this* user own this draft."

**Files:**
- Modify: `mobile/src/api/types.ts:40-49`

- [ ] **Step 1: Add the field to the `Order` interface**

In `mobile/src/api/types.ts`, the `Order` interface currently reads:

```ts
export interface Order {
  id: string;
  branchId: string;
  providerId: string;
  status: OrderStatus;
  createdAt: string;
  publishedAt?: string;
  items: OrderItem[];
  provider: Pick<Provider, 'id' | 'name' | 'phone'>;
}
```

Change it to:

```ts
export interface Order {
  id: string;
  branchId: string;
  providerId: string;
  createdByUserId: string;
  status: OrderStatus;
  createdAt: string;
  publishedAt?: string;
  items: OrderItem[];
  provider: Pick<Provider, 'id' | 'name' | 'phone'>;
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile/src/api/types.ts
git commit -m "feat(mobile): add createdByUserId to Order type"
```

---

### Task 2: `findResumableDraft` helper

Pure function that decides which (if any) order should be offered for resume. Kept independent of React Native/react-query so it's directly unit-testable.

**Files:**
- Create: `mobile/src/order/findResumableDraft.ts`
- Test: `mobile/src/order/findResumableDraft.test.ts`

- [ ] **Step 1: Write the failing test**

Create `mobile/src/order/findResumableDraft.test.ts`:

```ts
import { findResumableDraft } from './findResumableDraft';
import type { Order } from '../api/types';

const baseOrder: Order = {
  id: 'order-1',
  branchId: 'branch-1',
  providerId: 'provider-1',
  createdByUserId: 'user-1',
  status: 'DRAFT',
  createdAt: '2026-08-01T10:00:00.000Z',
  items: [{ id: 'item-1', productId: 'product-1', productNameSnapshot: 'Milk', unitType: 'unit', quantity: 2 }],
  provider: { id: 'provider-1', name: 'Provider One', phone: '972500000000' },
};

function makeOrder(overrides: Partial<Order>): Order {
  return { ...baseOrder, ...overrides };
}

describe('findResumableDraft', () => {
  it('returns the matching draft for this provider and user', () => {
    const orders = [makeOrder({})];
    expect(findResumableDraft(orders, 'provider-1', 'user-1')).toEqual(orders[0]);
  });

  it('returns undefined when there is no order for this provider', () => {
    const orders = [makeOrder({ providerId: 'provider-2' })];
    expect(findResumableDraft(orders, 'provider-1', 'user-1')).toBeUndefined();
  });

  it('returns undefined when the draft belongs to a different user', () => {
    const orders = [makeOrder({ createdByUserId: 'user-2' })];
    expect(findResumableDraft(orders, 'provider-1', 'user-1')).toBeUndefined();
  });

  it('returns undefined when the order is already published', () => {
    const orders = [makeOrder({ status: 'PUBLISHED' })];
    expect(findResumableDraft(orders, 'provider-1', 'user-1')).toBeUndefined();
  });

  it('returns undefined when the draft has no items', () => {
    const orders = [makeOrder({ items: [] })];
    expect(findResumableDraft(orders, 'provider-1', 'user-1')).toBeUndefined();
  });

  it('returns the most recently created match when multiple drafts qualify', () => {
    const older = makeOrder({ id: 'order-old', createdAt: '2026-07-01T10:00:00.000Z' });
    const newer = makeOrder({ id: 'order-new', createdAt: '2026-08-01T10:00:00.000Z' });
    expect(findResumableDraft([older, newer], 'provider-1', 'user-1')).toEqual(newer);
    expect(findResumableDraft([newer, older], 'provider-1', 'user-1')).toEqual(newer);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd mobile && npx jest src/order/findResumableDraft.test.ts`
Expected: FAIL — `Cannot find module './findResumableDraft'`

- [ ] **Step 3: Write the implementation**

Create `mobile/src/order/findResumableDraft.ts`:

```ts
import type { Order } from '../api/types';

export function findResumableDraft(
  orders: Order[],
  providerId: string,
  userId: string,
): Order | undefined {
  const candidates = orders.filter(
    (order) =>
      order.providerId === providerId &&
      order.createdByUserId === userId &&
      order.status === 'DRAFT' &&
      order.items.length > 0,
  );

  if (candidates.length === 0) {
    return undefined;
  }

  return candidates.reduce((latest, order) =>
    new Date(order.createdAt) > new Date(latest.createdAt) ? order : latest,
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd mobile && npx jest src/order/findResumableDraft.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add mobile/src/order/findResumableDraft.ts mobile/src/order/findResumableDraft.test.ts
git commit -m "feat(mobile): add findResumableDraft helper"
```

---

### Task 3: Wire the prompt into the order screen

**Files:**
- Modify: `mobile/app/(app)/providers/[providerId]/order.tsx`

- [ ] **Step 1: Update imports**

In `mobile/app/(app)/providers/[providerId]/order.tsx`, the top of the file currently reads:

```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchProductsForProvider } from '../../../../src/api/products';
import { createDraftOrder, addOrderItem, updateOrderItemQuantity, removeOrderItem } from '../../../../src/api/orders';
import { useBranch } from '../../../../src/branch/BranchContext';
import type { Order, OrderItem, Product } from '../../../../src/api/types';
import { PublishButton } from '../../../../src/order/PublishButton';
import { BarcodeScannerModal } from '../../../../src/barcode/BarcodeScannerModal';
```

Change the `api/orders` import to include `fetchOrdersForBranch`, and add imports for `useAuth` and `findResumableDraft`:

```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchProductsForProvider } from '../../../../src/api/products';
import { createDraftOrder, addOrderItem, updateOrderItemQuantity, removeOrderItem, fetchOrdersForBranch } from '../../../../src/api/orders';
import { useBranch } from '../../../../src/branch/BranchContext';
import { useAuth } from '../../../../src/auth/AuthContext';
import type { Order, OrderItem, Product } from '../../../../src/api/types';
import { PublishButton } from '../../../../src/order/PublishButton';
import { BarcodeScannerModal } from '../../../../src/barcode/BarcodeScannerModal';
import { findResumableDraft } from '../../../../src/order/findResumableDraft';
```

- [ ] **Step 2: Add auth, a "don't prompt twice" ref, and the branch-orders query**

The component currently starts:

```tsx
export default function OrderBuilderScreen() {
  const { providerId, providerName, sourceOrder } = useLocalSearchParams<{
    providerId: string;
    providerName?: string;
    sourceOrder?: string;
  }>();
  const { selectedBranch } = useBranch();
  const [order, setOrder] = useState<Order | null>(null);
  const [itemsByProductId, setItemsByProductId] = useState<Record<string, OrderItem>>({});
  const [isScannerVisible, setIsScannerVisible] = useState(false);
  const [search, setSearch] = useState('');
  const orderCreationRef = useRef<Promise<Order> | null>(null);

  const { data: products } = useQuery({
    queryKey: ['products', providerId],
    queryFn: () => fetchProductsForProvider(providerId),
  });
```

Add `useAuth()`, a ref to guard against re-prompting, and a query for the branch's orders (only enabled when there's no explicit `sourceOrder` — that path is the Activity screen's own resume/continue flow and already loads the right order directly):

```tsx
export default function OrderBuilderScreen() {
  const { providerId, providerName, sourceOrder } = useLocalSearchParams<{
    providerId: string;
    providerName?: string;
    sourceOrder?: string;
  }>();
  const { selectedBranch } = useBranch();
  const { userId } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [itemsByProductId, setItemsByProductId] = useState<Record<string, OrderItem>>({});
  const [isScannerVisible, setIsScannerVisible] = useState(false);
  const [search, setSearch] = useState('');
  const orderCreationRef = useRef<Promise<Order> | null>(null);
  const hasPromptedResumeRef = useRef(false);

  const { data: products } = useQuery({
    queryKey: ['products', providerId],
    queryFn: () => fetchProductsForProvider(providerId),
  });

  const { data: branchOrders } = useQuery({
    queryKey: ['orders', selectedBranch?.id],
    queryFn: () => fetchOrdersForBranch(selectedBranch!.id),
    enabled: !sourceOrder && !!selectedBranch,
  });
```

- [ ] **Step 3: Add the resume-prompt effect**

Directly after the existing `useEffect` that handles `sourceOrder` parsing (the one ending at `}, [providerId]);` around line 70), add a new effect:

```tsx
  useEffect(() => {
    if (sourceOrder || !branchOrders || !userId || hasPromptedResumeRef.current) return;
    const resumable = findResumableDraft(branchOrders, providerId, userId);
    if (!resumable) return;

    hasPromptedResumeRef.current = true;
    Alert.alert(
      'יש הזמנה פתוחה לספק זה',
      'יש לך הזמנה שטרם הושלמה לספק הזה. להמשיך אותה?',
      [
        { text: 'לא, התחל חדש', style: 'cancel' },
        {
          text: 'כן, המשך',
          onPress: () => {
            setOrder(resumable);
            setItemsByProductId(
              Object.fromEntries(resumable.items.map((item) => [item.productId, item])),
            );
          },
        },
      ],
    );
  }, [sourceOrder, branchOrders, userId, providerId]);
```

This mirrors exactly how the existing `sourceOrder?.status === 'DRAFT'` branch above already loads a draft into state (`setOrder` + `itemsByProductId` from `order.items`), so behavior for ad-hoc items (no `productId`) is unchanged from what the codebase already does elsewhere.

- [ ] **Step 4: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add "mobile/app/(app)/providers/[providerId]/order.tsx"
git commit -m "feat(mobile): prompt to resume an existing draft order"
```

---

### Task 4: Manual verification

This is a UI change with no automated screen-level test (per project convention, pure frontend/JSX changes don't require tests — the decision logic itself is already unit-tested in Task 2). Verify by hand in the running app:

- [ ] **Step 1: Start the backend and mobile app**

Follow the existing local dev setup (backend `npm run start:dev`, mobile `npm run android` or `npm run ios`, with `adb reverse tcp:3000 tcp:3000` if using the Android emulator).

- [ ] **Step 2: Verify the prompt appears for the same user**

As one user: open a provider from the provider list, add at least one item (so a non-empty draft is created), then navigate back to the provider list without publishing. Tap the same provider again. Expected: the "יש הזמנה פתוחה לספק זה" alert appears. Tap "כן, המשך" — expected: the previously added item(s) and quantities are shown. Re-open the same provider again and tap "לא, התחל חדש" — expected: the screen opens empty, and the old draft is unaffected (confirm via the Activity screen that it's still listed as a draft with its items intact).

- [ ] **Step 3: Verify no prompt appears for a different user**

Log out and log in as a different user with access to the same provider. Open that provider's screen. Expected: no prompt, since the existing draft belongs to the first user.

- [ ] **Step 4: Verify the Activity screen's resume/continue flow is unaffected**

From the Activity screen, tap an existing draft or published order. Expected: it opens directly (as before), with no resume prompt in between.
