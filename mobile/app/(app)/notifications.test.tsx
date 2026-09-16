import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertProvider } from '../../src/ui/AlertProvider';
import type { AdminNotificationItem } from '../../src/api/notifications';
import type { Order } from '../../src/api/types';
import NotificationsScreen from './notifications';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

jest.mock('../../src/api/notifications', () => ({
  fetchNotifications: jest.fn(),
  markNotificationRead: jest.fn(),
  deleteNotification: jest.fn(),
}));

jest.mock('../../src/api/orders', () => ({
  confirmOrderSent: jest.fn(),
  revertOrderToDraft: jest.fn(),
}));

import {
  fetchNotifications,
  markNotificationRead,
  deleteNotification,
} from '../../src/api/notifications';

const order = (id: string, status: Order['status'], providerName: string): Order => ({
  id,
  branchId: 'b1',
  providerId: `provider-${id}`,
  createdByUserId: 'u1',
  status,
  createdAt: '2026-01-01T00:00:00.000Z',
  items: [{ id: `item-${id}`, productNameSnapshot: 'חלב', unitType: 'קרטון', quantity: 1 }],
  provider: { id: `provider-${id}`, name: providerName, phone: '0500000000' },
});

const notification = (
  id: string,
  order_: Order,
  isRead: boolean,
): AdminNotificationItem => ({
  id,
  isRead,
  createdAt: '2026-01-01T00:00:00.000Z',
  order: order_,
});

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AlertProvider>
        <NotificationsScreen />
      </AlertProvider>
    </QueryClientProvider>,
  );
}

describe('NotificationsScreen', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(cleanup);

  it('lists notifications, newest first as returned by the API', async () => {
    (fetchNotifications as jest.Mock).mockResolvedValue([
      notification('n1', order('o1', 'AWAITING_CONFIRMATION', 'ספק א'), false),
      notification('n2', order('o2', 'PUBLISHED', 'ספק ב'), true),
    ]);

    await renderScreen();

    await waitFor(() => {
      expect(screen.getByText('ספק א')).toBeTruthy();
      expect(screen.getByText('ספק ב')).toBeTruthy();
    });
  });

  it('marks an unread notification read only once it is opened', async () => {
    (fetchNotifications as jest.Mock).mockResolvedValue([
      notification('n1', order('o1', 'AWAITING_CONFIRMATION', 'ספק א'), false),
    ]);
    (markNotificationRead as jest.Mock).mockResolvedValue(undefined);

    await renderScreen();
    await waitFor(() => expect(screen.getByText('ספק א')).toBeTruthy());
    expect(markNotificationRead).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('ספק א'));

    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith('n1'));
  });

  it('does not mark an already-read notification read again when opened', async () => {
    (fetchNotifications as jest.Mock).mockResolvedValue([
      notification('n1', order('o1', 'PUBLISHED', 'ספק א'), true),
    ]);

    await renderScreen();
    await waitFor(() => expect(screen.getByText('ספק א')).toBeTruthy());

    fireEvent.press(screen.getByText('ספק א'));

    expect(markNotificationRead).not.toHaveBeenCalled();
  });

  it('deletes a notification without touching the underlying order', async () => {
    (fetchNotifications as jest.Mock).mockResolvedValue([
      notification('n1', order('o1', 'DRAFT', 'ספק א'), false),
    ]);
    (deleteNotification as jest.Mock).mockResolvedValue(undefined);

    await renderScreen();
    await waitFor(() => expect(screen.getByText('ספק א')).toBeTruthy());

    fireEvent.press(screen.getByText('🗑'));

    await waitFor(() => expect(deleteNotification).toHaveBeenCalledWith('n1'));
  });

  it('shows an empty state when there are no notifications', async () => {
    (fetchNotifications as jest.Mock).mockResolvedValue([]);

    await renderScreen();

    await waitFor(() => expect(screen.getByText('אין התראות.')).toBeTruthy());
  });

  it('requests the first page with the default page size', async () => {
    (fetchNotifications as jest.Mock).mockResolvedValue([]);

    await renderScreen();

    await waitFor(() =>
      expect(fetchNotifications).toHaveBeenCalledWith({ offset: 0, limit: 20 }),
    );
  });
});
