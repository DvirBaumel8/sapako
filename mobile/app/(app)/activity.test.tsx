import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertProvider } from '../../src/ui/AlertProvider';
import type { Order } from '../../src/api/types';
import ActivityScreen from './activity';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: jest.fn(),
}));

jest.mock('../../src/branch/BranchContext', () => ({
  useBranch: () => ({ selectedBranch: { id: 'branch-1', name: 'הילס' } }),
}));

jest.mock('../../src/api/orders', () => ({
  fetchOrdersForBranch: jest.fn(),
  deleteOrder: jest.fn(),
  confirmOrderSent: jest.fn(),
  revertOrderToDraft: jest.fn(),
}));

import { fetchOrdersForBranch } from '../../src/api/orders';

const order = (id: string, status: Order['status'], providerName: string): Order => ({
  id,
  branchId: 'branch-1',
  providerId: `provider-${id}`,
  createdByUserId: 'u1',
  status,
  createdAt: '2026-01-01T00:00:00.000Z',
  items: [{ id: `item-${id}`, productNameSnapshot: 'חלב', unitType: 'קרטון', quantity: 1 }],
  provider: { id: `provider-${id}`, name: providerName, phone: '0500000000' },
});

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AlertProvider>
        <ActivityScreen />
      </AlertProvider>
    </QueryClientProvider>,
  );
}

describe('ActivityScreen', () => {
  it('renders a Drafts section and a Sent section, each with its own count', async () => {
    (fetchOrdersForBranch as jest.Mock).mockResolvedValue([
      order('1', 'DRAFT', 'ספק א'),
      order('2', 'AWAITING_CONFIRMATION', 'ספק ב'),
      order('3', 'PUBLISHED', 'ספק ג'),
    ]);

    renderScreen();

    await waitFor(() => {
      expect(screen.getByText('טיוטות')).toBeTruthy();
      expect(screen.getByText('נשלחו')).toBeTruthy();
    });
    // Two orders (DRAFT + AWAITING_CONFIRMATION) under טיוטות, one under נשלחו.
    expect(screen.getByText('ספק א')).toBeTruthy();
    expect(screen.getByText('ספק ב')).toBeTruthy();
    expect(screen.getByText('ספק ג')).toBeTruthy();
  });

  it('omits the Sent section when nothing has been sent yet', async () => {
    (fetchOrdersForBranch as jest.Mock).mockResolvedValue([order('1', 'DRAFT', 'ספק א')]);

    renderScreen();

    await waitFor(() => expect(screen.getByText('טיוטות')).toBeTruthy());
    expect(screen.queryByText('נשלחו')).toBeNull();
  });
});
