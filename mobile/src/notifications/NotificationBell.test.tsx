import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationBell } from './NotificationBell';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }));

jest.mock('../api/notifications', () => ({
  fetchUnreadNotificationCount: jest.fn(),
}));

import { router } from 'expo-router';
import { useAuth } from '../auth/AuthContext';
import { fetchUnreadNotificationCount } from '../api/notifications';

function renderBell() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationBell />
    </QueryClientProvider>,
  );
}

describe('NotificationBell', () => {
  afterEach(cleanup);

  it('renders nothing for a non-admin', async () => {
    (useAuth as jest.Mock).mockReturnValue({ role: 'STAFF' });

    const { toJSON } = await renderBell();

    expect(toJSON()).toBeNull();
    expect(fetchUnreadNotificationCount).not.toHaveBeenCalled();
  });

  it('shows no badge when there are zero unread notifications', async () => {
    (useAuth as jest.Mock).mockReturnValue({ role: 'ADMIN' });
    (fetchUnreadNotificationCount as jest.Mock).mockResolvedValue(0);

    await renderBell();

    expect(await screen.findByText('🔔')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('shows the unread count as a badge', async () => {
    (useAuth as jest.Mock).mockReturnValue({ role: 'ADMIN' });
    (fetchUnreadNotificationCount as jest.Mock).mockResolvedValue(3);

    await renderBell();

    expect(await screen.findByText('3')).toBeTruthy();
  });

  it('caps the displayed count rather than growing the badge unbounded', async () => {
    (useAuth as jest.Mock).mockReturnValue({ role: 'ADMIN' });
    (fetchUnreadNotificationCount as jest.Mock).mockResolvedValue(42);

    await renderBell();

    expect(await screen.findByText('9+')).toBeTruthy();
  });

  it('navigates to /notifications on press', async () => {
    (useAuth as jest.Mock).mockReturnValue({ role: 'ADMIN' });
    (fetchUnreadNotificationCount as jest.Mock).mockResolvedValue(1);

    await renderBell();
    fireEvent.press(await screen.findByText('🔔'));

    expect(router.push).toHaveBeenCalledWith('/notifications');
  });
});
