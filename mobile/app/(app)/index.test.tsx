import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertProvider } from '../../src/ui/AlertProvider';
import HomeScreen from './index';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

jest.mock('../../src/branch/BranchContext', () => ({
  useBranch: () => ({
    selectedBranch: { id: 'branch-1', name: 'סניף בדיקה', createdAt: '2024-01-01T00:00:00.000Z' },
  }),
}));

let mockCanEditProducts = false;
jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ canEditProducts: mockCanEditProducts }),
}));

jest.mock('../../src/ui/SecondaryNavButton', () => ({ SecondaryNavButton: () => null }));

jest.mock('../../src/barcode/BarcodeScannerModal', () => {
  const { Pressable, Text } = require('react-native');
  return {
    BarcodeScannerModal: ({ onScanned }: { onScanned: (code: string) => void }) => (
      <Pressable testID="fake-scan" onPress={() => onScanned('7290003706020')}>
        <Text>scan</Text>
      </Pressable>
    ),
  };
});

jest.mock('../../src/api/providers', () => ({
  fetchProvidersForBranch: jest.fn(),
}));
jest.mock('../../src/api/products', () => ({
  fetchProductsForBranch: jest.fn(),
}));

import { fetchProvidersForBranch } from '../../src/api/providers';
import { fetchProductsForBranch } from '../../src/api/products';

let activeQueryClient: QueryClient | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  mockCanEditProducts = false;
  (fetchProvidersForBranch as jest.Mock).mockResolvedValue([
    { id: 'prov-1', name: 'ספק א', phone: '0500000000' },
  ]);
  (fetchProductsForBranch as jest.Mock).mockResolvedValue([]);
});

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient = null;
});

async function scanUnknownBarcode() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  activeQueryClient = queryClient;
  await render(
    <QueryClientProvider client={queryClient}>
      <AlertProvider>
        <HomeScreen />
      </AlertProvider>
    </QueryClientProvider>,
  );
  await screen.findByText('ספק א');
  await fireEvent.press(screen.getByTestId('fake-scan'));
  await waitFor(() => expect(fetchProductsForBranch).toHaveBeenCalled());
}

describe('home screen scan of an unknown barcode', () => {
  it('offers adding the product to a user who can edit products', async () => {
    mockCanEditProducts = true;
    await scanUnknownBarcode();
    expect(await screen.findByText('הוספת מוצר חדש')).toBeTruthy();
  });

  it('does not offer it to plain staff', async () => {
    await scanUnknownBarcode();
    expect(await screen.findByText('לא נמצא מוצר עם ברקוד זה אצל אף ספק בסניף.')).toBeTruthy();
    expect(screen.queryByText('הוספת מוצר חדש')).toBeNull();
  });
});
