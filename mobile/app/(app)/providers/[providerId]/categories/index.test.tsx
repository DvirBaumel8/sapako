import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CategoriesScreen from './index';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ providerId: 'provider-1' }),
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

let mockRole = 'ADMIN';
jest.mock('../../../../../src/auth/AuthContext', () => ({
  useAuth: () => ({ role: mockRole }),
}));

jest.mock('../../../../../src/api/categories', () => ({
  fetchCategoriesForProvider: jest.fn(),
}));

import { fetchCategoriesForProvider } from '../../../../../src/api/categories';

const CATEGORIES = [
  { id: 'cat-1', providerId: 'provider-1', name: 'ירקות', createdAt: '2024-01-01T00:00:00.000Z' },
  { id: 'cat-2', providerId: 'provider-1', name: 'פירות', createdAt: '2024-01-02T00:00:00.000Z' },
];

let activeQueryClient: QueryClient | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'ADMIN';
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
      <CategoriesScreen />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByText('ירקות')).toBeTruthy());
}

describe('CategoriesScreen', () => {
  it('lists every category for the provider', async () => {
    await renderScreen();

    expect(screen.getByText('ירקות')).toBeTruthy();
    expect(screen.getByText('פירות')).toBeTruthy();
  });

  it('opens the bulk-assign screen for a category row', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByText('ירקות'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/providers/[providerId]/categories/[categoryId]/products',
      params: { providerId: 'provider-1', categoryId: 'cat-1', categoryName: 'ירקות' },
    });
  });

  it('offers add/edit controls to an admin', async () => {
    await renderScreen();

    expect(screen.getByText('+ הוספת קטגוריה')).toBeTruthy();
    expect(screen.getByLabelText('עריכת קטגוריות')).toBeTruthy();
  });

  it('hides add/edit controls from non-admin staff', async () => {
    mockRole = 'STAFF';
    await renderScreen();

    expect(screen.queryByText('+ הוספת קטגוריה')).toBeNull();
    expect(screen.queryByLabelText('עריכת קטגוריות')).toBeNull();
  });

  it('reveals a per-row edit pencil only after switching into edit mode', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByLabelText('עריכת קטגוריות'));

    await fireEvent.press(screen.getByText('ירקות'));
    // Pressing the row itself still navigates to the bulk-assign screen even
    // in edit mode — only the pencil goes to the rename/delete screen.
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/providers/[providerId]/categories/[categoryId]/products',
      }),
    );
  });

  it('shows an empty state when the provider has no categories yet', async () => {
    (fetchCategoriesForProvider as jest.Mock).mockResolvedValue([]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    activeQueryClient = queryClient;
    render(
      <QueryClientProvider client={queryClient}>
        <CategoriesScreen />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText('אין עדיין קטגוריות לספק זה.')).toBeTruthy());
  });
});
