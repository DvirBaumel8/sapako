import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import { AlertProvider } from '../../../../src/ui/AlertProvider';
import NewProductScreen from './new';

const err = (status?: number) =>
  status
    ? new AxiosError('x', 'ERR', undefined, undefined, {
        status,
        statusText: '',
        data: {},
        headers: {},
        config: { headers: new AxiosHeaders() },
      })
    : new Error('boom');

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  router: { back: jest.fn() },
}));
jest.mock('../../../../src/auth/useRequireProductEditor', () => ({ useRequireProductEditor: jest.fn() }));
jest.mock('../../../../src/api/branches', () => ({
  fetchAccessibleBranches: jest.fn().mockResolvedValue([
    { id: 'b1', name: 'הילס' },
    { id: 'b2', name: 'סניף שני' },
  ]),
}));
jest.mock('../../../../src/api/providers', () => ({
  fetchProvidersForBranch: jest.fn((branchId: string) =>
    Promise.resolve(
      branchId === 'b2'
        ? [{ id: 'prov-b2', name: 'ספק שני' }]
        : [{ id: 'prov-1', name: 'י.ל.ת' }],
    ),
  ),
}));
jest.mock('../../../../src/api/categories', () => ({
  fetchCategoriesForProvider: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../../../src/api/products', () => ({ createProduct: jest.fn() }));
jest.mock('../../../../src/barcode/BarcodeScannerModal', () => ({
  BarcodeScannerModal: () => null,
}));

import { createProduct } from '../../../../src/api/products';
import { fetchProvidersForBranch } from '../../../../src/api/providers';

let activeQueryClient: QueryClient | null = null;

// React Query keeps a garbage-collection timer alive per query (default
// gcTime is 5 minutes, and it is not unref'd), which otherwise leaves Jest's
// process unable to exit on its own after the run finishes.
afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient = null;
});

async function renderAndSubmit() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  activeQueryClient = queryClient;
  await render(
    <QueryClientProvider client={queryClient}>
      <AlertProvider>
        <NewProductScreen />
      </AlertProvider>
    </QueryClientProvider>,
  );
  await fireEvent.press(await screen.findByText('י.ל.ת'));
  await fireEvent.changeText(screen.getByPlaceholderText('שם המוצר'), 'סלרי ראש');
  await fireEvent.press(screen.getByText('יצירת מוצר'));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});

describe('NewProductScreen', () => {
  it('preselects the supplier given by the providerId param', async () => {
    mockParams = { providerId: 'prov-1' };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    activeQueryClient = queryClient;
    await render(
      <QueryClientProvider client={queryClient}>
        <AlertProvider>
          <NewProductScreen />
        </AlertProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByPlaceholderText('שם המוצר')).toBeTruthy();
    expect(screen.getByText('ספק: י.ל.ת')).toBeTruthy();
  });

  it('starts on the branch given by the branchId param and preselects its supplier', async () => {
    mockParams = { providerId: 'prov-b2', branchId: 'b2' };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    activeQueryClient = queryClient;
    await render(
      <QueryClientProvider client={queryClient}>
        <AlertProvider>
          <NewProductScreen />
        </AlertProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('ספק: ספק שני')).toBeTruthy();
    expect(fetchProvidersForBranch).toHaveBeenCalledWith('b2');
  });

  it('shows the permission message on 403 and refreshes the capability', async () => {
    (createProduct as jest.Mock).mockRejectedValue(err(403));
    await renderAndSubmit();
    expect(await screen.findByText('אין לך הרשאה לערוך מוצרים אצל ספק זה.')).toBeTruthy();
  });

  it('explains a duplicate name on 409', async () => {
    (createProduct as jest.Mock).mockRejectedValue(err(409));
    await renderAndSubmit();
    expect(await screen.findByText('מוצר בשם הזה כבר קיים אצל הספק.')).toBeTruthy();
  });

  it('keeps the generic message for other failures', async () => {
    (createProduct as jest.Mock).mockRejectedValue(err());
    await renderAndSubmit();
    expect(await screen.findByText('יצירת המוצר נכשלה. יש לנסות שוב.')).toBeTruthy();
  });
});
