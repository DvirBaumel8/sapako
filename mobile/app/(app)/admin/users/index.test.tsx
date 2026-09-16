import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertProvider } from '../../../../src/ui/AlertProvider';
import UsersScreen from './index';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

jest.mock('../../../../src/auth/useRequireAdmin', () => ({
  useRequireAdmin: jest.fn(),
}));

jest.mock('../../../../src/api/users', () => ({
  fetchUsers: jest.fn(),
  deleteUser: jest.fn(),
}));

import { fetchUsers } from '../../../../src/api/users';

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AlertProvider>
        <UsersScreen />
      </AlertProvider>
    </QueryClientProvider>,
  );
}

describe('UsersScreen', () => {
  it('shows the resolved access count from the API, not a raw grant-row count', async () => {
    // Regression: this used to read providerAccess.length, a raw
    // user_provider_access row count that silently understated anyone
    // reachable through a department grant instead of a direct one. The
    // count shown must be exactly whatever the server resolved.
    (fetchUsers as jest.Mock).mockResolvedValue([
      { id: 'u1', username: 'Koren', role: 'STAFF', providerAccessCount: 195 },
      { id: 'u2', username: 'Lidor', role: 'STAFF', providerAccessCount: 196 },
    ]);

    renderScreen();

    await waitFor(() => {
      expect(screen.getByText('STAFF · 195 ספקים')).toBeTruthy();
      expect(screen.getByText('STAFF · 196 ספקים')).toBeTruthy();
    });
  });
});
