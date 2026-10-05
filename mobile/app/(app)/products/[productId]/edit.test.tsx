import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import { AlertProvider } from '../../../../src/ui/AlertProvider';
import EditProductScreen from './edit';

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
jest.mock('../../../../src/api/products', () => ({
  updateProduct: jest.fn(),
  deleteProduct: jest.fn(),
}));
jest.mock('../../../../src/api/categories', () => ({
  fetchCategoriesForProvider: jest.fn().mockResolvedValue([]),
}));

import { updateProduct } from '../../../../src/api/products';

const baseParams = {
  productId: 'p1',
  productName: 'סלרי ראש',
  unitType: 'CARTON',
  barcode: '7290003706013',
  providerId: 'provider-1',
};

let activeQueryClient: QueryClient | null = null;

// React Query keeps a garbage-collection timer alive per query (default
// gcTime is 5 minutes, and it is not unref'd), which otherwise leaves Jest's
// process unable to exit on its own after the run finishes.
afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient = null;
});

async function renderScreen(extra: Record<string, string> = {}) {
  mockParams = { ...baseParams, ...extra };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  activeQueryClient = queryClient;
  await render(
    <QueryClientProvider client={queryClient}>
      <AlertProvider>
        <EditProductScreen />
      </AlertProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());

describe('EditProductScreen', () => {
  it('lists additional barcodes under the main one', async () => {
    await renderScreen({ additionalBarcodes: '7290003706020,27' });
    expect(screen.getByText('ברקודים נוספים: 7290003706020, 27')).toBeTruthy();
  });

  it('shows no additional-barcodes line when there are none', async () => {
    await renderScreen({ additionalBarcodes: '' });
    expect(screen.queryByText(/ברקודים נוספים/)).toBeNull();
  });

  it('explains a duplicate name on 409', async () => {
    (updateProduct as jest.Mock).mockRejectedValue(err(409));
    await renderScreen();
    await fireEvent.press(screen.getByText('שמירה'));
    expect(await screen.findByText('מוצר בשם הזה כבר קיים אצל הספק.')).toBeTruthy();
  });

  it('shows the permission message on 403', async () => {
    (updateProduct as jest.Mock).mockRejectedValue(err(403));
    await renderScreen();
    await fireEvent.press(screen.getByText('שמירה'));
    expect(await screen.findByText('אין לך הרשאה לערוך מוצרים אצל ספק זה.')).toBeTruthy();
  });

  it('keeps the generic message for other failures', async () => {
    (updateProduct as jest.Mock).mockRejectedValue(err());
    await renderScreen();
    await fireEvent.press(screen.getByText('שמירה'));
    expect(await screen.findByText('שמירת המוצר נכשלה. יש לנסות שוב.')).toBeTruthy();
  });
});
