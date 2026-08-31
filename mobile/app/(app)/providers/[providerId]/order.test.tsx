import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertProvider } from '../../../../src/ui/AlertProvider';
import type { Order, Product } from '../../../../src/api/types';
import OrderBuilderScreen from './order';

// Two quick taps on "+" used to send the same quantity twice, leaving 1
// instead of 2, because each tap read state that had not updated yet — and
// every tap awaited a round-trip before the number moved at all. These tests
// exercise the real stepper and its real createQuantityWriter, mocking only
// the API module (per the plan: the writer's coalescing is part of what is
// under test here).

const mockUseLocalSearchParams = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock('../../../../src/branch/BranchContext', () => ({
  useBranch: () => ({
    selectedBranch: { id: 'branch-1', name: 'סניף בדיקה', createdAt: '2024-01-01T00:00:00.000Z' },
    isRestoring: false,
    selectBranch: jest.fn(),
    clearBranch: jest.fn(),
  }),
}));

jest.mock('../../../../src/auth/AuthContext', () => ({
  useAuth: () => ({
    isLoading: false,
    userId: 'user-1',
    role: 'STAFF',
    login: jest.fn(),
    logout: jest.fn(),
  }),
}));

// The safe area provider has no default insets without a mounted provider;
// react-native-safe-area-context ships a jest mock for exactly this.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

jest.mock('../../../../src/api/products', () => ({
  fetchProductsForProvider: jest.fn(),
  fetchProductsForBranch: jest.fn(),
  createProduct: jest.fn(),
  updateProduct: jest.fn(),
  deleteProduct: jest.fn(),
}));

jest.mock('../../../../src/api/orders', () => ({
  createDraftOrder: jest.fn(),
  addOrderItem: jest.fn(),
  updateOrderItemQuantity: jest.fn(),
  removeOrderItem: jest.fn(),
  publishOrder: jest.fn(),
  fetchOrdersForBranch: jest.fn(),
  deleteOrder: jest.fn(),
}));

import { fetchProductsForProvider } from '../../../../src/api/products';
import {
  createDraftOrder,
  addOrderItem,
  updateOrderItemQuantity,
  removeOrderItem,
  fetchOrdersForBranch,
} from '../../../../src/api/orders';

const PROVIDER_ID = 'provider-1';

const CARTON_PRODUCT: Product = {
  id: 'product-carton',
  providerId: PROVIDER_ID,
  name: 'קרטון חלב',
  unitType: 'קרטון',
  isActive: true,
  createdAt: '2024-01-01T00:00:00.000Z',
};

const WEIGHT_PRODUCT: Product = {
  id: 'product-weight',
  providerId: PROVIDER_ID,
  name: 'גבינה צהובה',
  unitType: 'ק"ג',
  isActive: true,
  createdAt: '2024-01-01T00:00:00.000Z',
};

const FIXTURE_ORDER: Order = {
  id: 'order-1',
  branchId: 'branch-1',
  providerId: PROVIDER_ID,
  createdByUserId: 'user-1',
  status: 'DRAFT',
  createdAt: '2024-01-01T00:00:00.000Z',
  items: [],
  provider: { id: PROVIDER_ID, name: 'ספק בדיקה', phone: '0500000000' },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({
    providerId: PROVIDER_ID,
    providerName: 'ספק בדיקה',
  });
  (fetchProductsForProvider as jest.Mock).mockResolvedValue([CARTON_PRODUCT, WEIGHT_PRODUCT]);
  (fetchOrdersForBranch as jest.Mock).mockResolvedValue([]);
  (createDraftOrder as jest.Mock).mockResolvedValue(FIXTURE_ORDER);
  (addOrderItem as jest.Mock).mockImplementation(
    async (_orderId: string, input: { productId?: string; quantity: number }) => ({
      id: `item-${input.productId}`,
      productId: input.productId,
      productNameSnapshot: 'מוצר',
      unitType: 'קרטון',
      quantity: input.quantity,
    }),
  );
  (updateOrderItemQuantity as jest.Mock).mockImplementation(
    async (_orderId: string, itemId: string, quantity: number) => ({
      id: itemId,
      productNameSnapshot: 'מוצר',
      unitType: 'קרטון',
      quantity,
    }),
  );
  (removeOrderItem as jest.Mock).mockResolvedValue(undefined);
});

let activeQueryClient: QueryClient | null = null;

// React Query keeps a garbage-collection timer alive per query (default
// gcTime is 5 minutes, and it is not unref'd), which otherwise leaves Jest's
// process unable to exit on its own after the run finishes.
afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient = null;
});

async function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  activeQueryClient = queryClient;
  await render(
    <QueryClientProvider client={queryClient}>
      <AlertProvider>
        <OrderBuilderScreen />
      </AlertProvider>
    </QueryClientProvider>,
  );

  await waitFor(() => {
    expect(screen.getByTestId(`quantity-${CARTON_PRODUCT.id}`)).toBeTruthy();
  });
}

it('shows 2 after two taps on + in succession', async () => {
  await renderScreen();
  const increment = screen.getByTestId(`increment-${CARTON_PRODUCT.id}`);

  // Each tap is awaited (a full render commits before the next), but
  // neither waits for a network round-trip — the old, broken version read
  // the quantity from the server's copy, which does not arrive until the
  // write resolves, so a second tap made before that read the same stale
  // value and silently overwrote the first instead of advancing it.
  await fireEvent.press(increment);
  await fireEvent.press(increment);

  expect(screen.getByTestId(`quantity-${CARTON_PRODUCT.id}`).props.value).toBe('2');

  // Wait for the debounced write to settle before the test ends — otherwise
  // its pending timer fires mid-way through a later test (createQuantityWriter
  // has no unmount cleanup) and pollutes that test's call counts.
  await waitFor(() => expect(addOrderItem).toHaveBeenCalledTimes(1), { timeout: 2000 });
});

it('collapses rapid taps into a single write carrying the final value', async () => {
  await renderScreen();
  const increment = screen.getByTestId(`increment-${CARTON_PRODUCT.id}`);

  await fireEvent.press(increment);
  await fireEvent.press(increment);

  expect(screen.getByTestId(`quantity-${CARTON_PRODUCT.id}`).props.value).toBe('2');

  // createQuantityWriter debounces for 400ms; wait past that so the
  // coalesced write actually fires.
  await waitFor(
    () => {
      expect(addOrderItem).toHaveBeenCalledTimes(1);
    },
    { timeout: 2000 },
  );

  expect(addOrderItem).toHaveBeenCalledWith(FIXTURE_ORDER.id, {
    productId: CARTON_PRODUCT.id,
    quantity: 2,
  });
  // Never sent quantity 1 first, and never fell back to the update path —
  // both would mean a tap escaped the coalescing.
  expect(updateOrderItemQuantity).not.toHaveBeenCalled();
});

it('steps a weight product by 0.5 and a carton product by 1', async () => {
  await renderScreen();

  await fireEvent.press(screen.getByTestId(`increment-${WEIGHT_PRODUCT.id}`));
  expect(screen.getByTestId(`quantity-${WEIGHT_PRODUCT.id}`).props.value).toBe('0.5');

  await fireEvent.press(screen.getByTestId(`increment-${CARTON_PRODUCT.id}`));
  expect(screen.getByTestId(`quantity-${CARTON_PRODUCT.id}`).props.value).toBe('1');

  // Wait for both debounced writes to settle so neither leaks into a later test.
  await waitFor(() => expect(addOrderItem).toHaveBeenCalledTimes(2), { timeout: 2000 });
});

it('reverts the displayed quantity when the write fails', async () => {
  await renderScreen();
  (addOrderItem as jest.Mock).mockRejectedValueOnce(new Error('network down'));

  await fireEvent.press(screen.getByTestId(`increment-${CARTON_PRODUCT.id}`));

  expect(screen.getByTestId(`quantity-${CARTON_PRODUCT.id}`).props.value).toBe('1');

  await waitFor(
    () => {
      expect(addOrderItem).toHaveBeenCalledTimes(1);
    },
    { timeout: 2000 },
  );

  await waitFor(() => {
    expect(screen.getByTestId(`quantity-${CARTON_PRODUCT.id}`).props.value).toBe('0');
  });
});
