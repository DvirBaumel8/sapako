/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Order } from '../api/types';
import { SendConfirmationPrompt } from './SendConfirmationPrompt';

jest.mock('../branch/BranchContext', () => ({
  useBranch: () => ({
    selectedBranch: { id: 'branch-1', name: 'סניף בדיקה', createdAt: '2024-01-01T00:00:00.000Z' },
    isRestoring: false,
    selectBranch: jest.fn(),
    clearBranch: jest.fn(),
  }),
}));

jest.mock('../api/orders', () => ({
  fetchOrdersAwaitingConfirmation: jest.fn(),
  confirmOrderSent: jest.fn(),
  revertOrderToDraft: jest.fn(),
}));

import {
  fetchOrdersAwaitingConfirmation,
  confirmOrderSent,
  revertOrderToDraft,
} from '../api/orders';

const awaitingOrder: Order = {
  id: 'order-1',
  branchId: 'branch-1',
  providerId: 'provider-1',
  createdByUserId: 'user-1',
  status: 'AWAITING_CONFIRMATION',
  createdAt: '2026-08-31T09:00:00.000Z',
  handedOffAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  items: [
    { id: 'i1', productNameSnapshot: 'חלב', unitType: 'קרטון', quantity: 2 },
    { id: 'i2', productNameSnapshot: 'גבינה', unitType: 'ק"ג', quantity: 1 },
  ],
  provider: { id: 'provider-1', name: 'תנובה', phone: '0501234567' },
};

let activeQueryClient: QueryClient | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  (fetchOrdersAwaitingConfirmation as jest.Mock).mockResolvedValue([awaitingOrder]);
  (confirmOrderSent as jest.Mock).mockResolvedValue({ ...awaitingOrder, status: 'PUBLISHED' });
  (revertOrderToDraft as jest.Mock).mockResolvedValue({ ...awaitingOrder, status: 'DRAFT' });
});

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient = null;
});

async function renderPrompt() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  activeQueryClient = queryClient;
  await render(
    <QueryClientProvider client={queryClient}>
      <SendConfirmationPrompt />
    </QueryClientProvider>,
  );
}

describe('SendConfirmationPrompt', () => {
  it('asks about an order that is waiting, naming the provider', async () => {
    await renderPrompt();

    await waitFor(() => {
      expect(screen.getByText('נשלחה ההזמנה לתנובה?')).toBeTruthy();
    });
  });

  it('says how long ago WhatsApp was opened', async () => {
    // Distinguishes an order just sent from one abandoned yesterday, which is
    // the difference between answering confidently and guessing.
    await renderPrompt();

    await waitFor(() => {
      expect(screen.getByText(/לפני 5 דקות/)).toBeTruthy();
    });
  });

  it('confirms the order when the user says it was sent', async () => {
    await renderPrompt();
    await waitFor(() => expect(screen.getByText('כן, נשלחה')).toBeTruthy());

    await fireEvent.press(screen.getByText('כן, נשלחה'));

    await waitFor(() => expect(confirmOrderSent).toHaveBeenCalledWith('order-1'));
    expect(revertOrderToDraft).not.toHaveBeenCalled();
  });

  it('returns the order to a draft when the user says it was not sent', async () => {
    await renderPrompt();
    await waitFor(() => expect(screen.getByText('לא, עדיין לא')).toBeTruthy());

    await fireEvent.press(screen.getByText('לא, עדיין לא'));

    await waitFor(() => expect(revertOrderToDraft).toHaveBeenCalledWith('order-1'));
    expect(confirmOrderSent).not.toHaveBeenCalled();
  });

  it('resolves nothing when the user defers', async () => {
    // "אחר כך" must not guess. The order stays awaiting so it is asked again,
    // which is the entire reason the state exists.
    await renderPrompt();
    await waitFor(() => expect(screen.getByText('אחר כך')).toBeTruthy());

    await fireEvent.press(screen.getByText('אחר כך'));

    expect(confirmOrderSent).not.toHaveBeenCalled();
    expect(revertOrderToDraft).not.toHaveBeenCalled();
  });

  it('stops asking about an order the user deferred', async () => {
    await renderPrompt();
    await waitFor(() => expect(screen.getByText('אחר כך')).toBeTruthy());

    await fireEvent.press(screen.getByText('אחר כך'));

    await waitFor(() => {
      expect(screen.queryByText('נשלחה ההזמנה לתנובה?')).toBeNull();
    });
  });

  it('moves on to the next waiting order after one is answered', async () => {
    const second: Order = {
      ...awaitingOrder,
      id: 'order-2',
      provider: { id: 'provider-2', name: 'שטראוס', phone: '0507654321' },
    };
    (fetchOrdersAwaitingConfirmation as jest.Mock).mockResolvedValue([
      awaitingOrder,
      second,
    ]);
    await renderPrompt();
    await waitFor(() => expect(screen.getByText('אחר כך')).toBeTruthy());

    await fireEvent.press(screen.getByText('אחר כך'));

    await waitFor(() => {
      expect(screen.getByText('נשלחה ההזמנה לשטראוס?')).toBeTruthy();
    });
  });

  it('shows nothing when no order is waiting', async () => {
    (fetchOrdersAwaitingConfirmation as jest.Mock).mockResolvedValue([]);

    await renderPrompt();

    await waitFor(() => expect(fetchOrdersAwaitingConfirmation).toHaveBeenCalled());
    expect(screen.queryByText('כן, נשלחה')).toBeNull();
  });

  it('re-checks when the app becomes visible again', async () => {
    // Returning from WhatsApp is not a navigation the router can see, so
    // without this the prompt would not appear until something else refetched.
    await renderPrompt();
    await waitFor(() => expect(fetchOrdersAwaitingConfirmation).toHaveBeenCalledTimes(1));

    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() =>
      expect(fetchOrdersAwaitingConfirmation).toHaveBeenCalledTimes(2),
    );
  });
});
