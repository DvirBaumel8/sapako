import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertProvider } from '../../../../../../src/ui/AlertProvider';
import type { Category, Product } from '../../../../../../src/api/types';
import CategoryProductsScreen from './products';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({
    providerId: 'provider-1',
    categoryId: 'cat-vegetables',
    categoryName: 'ירקות',
  }),
  Stack: { Screen: () => null },
}));

jest.mock('../../../../../../src/auth/useRequireAdmin', () => ({
  useRequireAdmin: jest.fn(),
}));

jest.mock('../../../../../../src/api/products', () => ({
  fetchProductsForProvider: jest.fn(),
  updateProduct: jest.fn(),
}));

jest.mock('../../../../../../src/api/categories', () => ({
  fetchCategoriesForProvider: jest.fn(),
}));

import { fetchProductsForProvider, updateProduct } from '../../../../../../src/api/products';
import { fetchCategoriesForProvider } from '../../../../../../src/api/categories';

const CATEGORIES: Category[] = [
  { id: 'cat-vegetables', providerId: 'provider-1', name: 'ירקות', createdAt: '2024-01-01T00:00:00.000Z' },
  { id: 'cat-fruits', providerId: 'provider-1', name: 'פירות', createdAt: '2024-01-02T00:00:00.000Z' },
];

const TOMATO: Product = {
  id: 'product-tomato',
  providerId: 'provider-1',
  name: 'עגבניה',
  unitType: 'ק"ג',
  isActive: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  categoryId: null,
};

const AVOCADO: Product = {
  id: 'product-avocado',
  providerId: 'provider-1',
  name: 'אבוקדו',
  unitType: 'יחידה',
  isActive: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  categoryId: 'cat-fruits',
};

let activeQueryClient: QueryClient | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  (fetchProductsForProvider as jest.Mock).mockResolvedValue([TOMATO, AVOCADO]);
  (fetchCategoriesForProvider as jest.Mock).mockResolvedValue(CATEGORIES);
});

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
        <CategoryProductsScreen />
      </AlertProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByText('עגבניה')).toBeTruthy());
}

describe('CategoryProductsScreen', () => {
  it('shows a product currently in a different category with a hint of where', async () => {
    await renderScreen();

    expect(screen.getByText('כרגע תחת: פירות')).toBeTruthy();
  });

  it('shows exactly one hint — the uncategorized product carries none', async () => {
    await renderScreen();

    // Only the avocado (already in a different category) gets a hint; the
    // uncategorized tomato renders with none.
    expect(screen.getAllByText(/כרגע תחת/)).toHaveLength(1);
  });

  it('assigns a product to this category on toggle', async () => {
    (updateProduct as jest.Mock).mockResolvedValue({ ...TOMATO, categoryId: 'cat-vegetables' });
    await renderScreen();

    await fireEvent.press(screen.getByLabelText('עגבניה'));

    await waitFor(() =>
      expect(updateProduct).toHaveBeenCalledWith('product-tomato', { categoryId: 'cat-vegetables' }),
    );
  });

  it('moves a product from its current category when toggled here', async () => {
    (updateProduct as jest.Mock).mockResolvedValue({ ...AVOCADO, categoryId: 'cat-vegetables' });
    await renderScreen();

    await fireEvent.press(screen.getByLabelText('אבוקדו'));

    await waitFor(() =>
      expect(updateProduct).toHaveBeenCalledWith('product-avocado', { categoryId: 'cat-vegetables' }),
    );
  });

  it('un-assigns a product from this category on toggle-off', async () => {
    const inThisCategory: Product = { ...TOMATO, categoryId: 'cat-vegetables' };
    (fetchProductsForProvider as jest.Mock).mockResolvedValue([inThisCategory, AVOCADO]);
    (updateProduct as jest.Mock).mockResolvedValue({ ...inThisCategory, categoryId: null });
    await renderScreen();

    await fireEvent.press(screen.getByLabelText('עגבניה'));

    await waitFor(() =>
      expect(updateProduct).toHaveBeenCalledWith('product-tomato', { categoryId: null }),
    );
  });

  it('reverts the toggle and alerts on a failed write', async () => {
    (updateProduct as jest.Mock).mockRejectedValue(new Error('offline'));
    await renderScreen();

    await fireEvent.press(screen.getByLabelText('עגבניה'));

    await waitFor(() =>
      expect(screen.getByText('עדכון הקטגוריה נכשל. יש לנסות שוב.')).toBeTruthy(),
    );
  });

  it('filters the product list by search', async () => {
    await renderScreen();

    await fireEvent.changeText(screen.getByPlaceholderText('חפש מוצר'), 'אבוקדו');

    await waitFor(() => expect(screen.queryByText('עגבניה')).toBeNull());
    expect(screen.getByText('אבוקדו')).toBeTruthy();
  });
});
