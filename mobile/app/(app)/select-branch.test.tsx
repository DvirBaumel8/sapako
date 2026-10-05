import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SelectBranchScreen from './select-branch';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

jest.mock('../../src/api/branches', () => ({
  fetchAccessibleBranches: jest.fn(),
}));

let mockRole = 'STAFF';
jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ role: mockRole }),
}));

jest.mock('../../src/branch/BranchContext', () => ({
  useBranch: () => ({ selectBranch: jest.fn(), selectedBranch: null }),
}));

import { fetchAccessibleBranches } from '../../src/api/branches';

const STAFF_MESSAGE = 'אין לך עדיין גישה לאף סניף. יש לפנות למנהל כדי לקבל הרשאות.';
const ADMIN_MESSAGE = "אין עדיין סניפים. אפשר להוסיף סניף דרך 'ניהול'.";

let activeQueryClient: QueryClient | null = null;

async function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  activeQueryClient = queryClient;
  await render(
    <QueryClientProvider client={queryClient}>
      <SelectBranchScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'STAFF';
});

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient = null;
});

describe('SelectBranchScreen — empty list', () => {
  it('tells staff to ask a manager when there are no branches', async () => {
    (fetchAccessibleBranches as jest.Mock).mockResolvedValue([]);
    await renderScreen();

    await waitFor(() => expect(screen.getByText(STAFF_MESSAGE)).toBeTruthy());
    expect(screen.queryByText(ADMIN_MESSAGE)).toBeNull();
  });

  it('tells an admin how to add a branch', async () => {
    mockRole = 'ADMIN';
    (fetchAccessibleBranches as jest.Mock).mockResolvedValue([]);
    await renderScreen();

    await waitFor(() => expect(screen.getByText(ADMIN_MESSAGE)).toBeTruthy());
    expect(screen.queryByText(STAFF_MESSAGE)).toBeNull();
    expect(screen.getByText('ניהול')).toBeTruthy();
  });

  it('shows neither message while loading', async () => {
    (fetchAccessibleBranches as jest.Mock).mockReturnValue(new Promise(() => {}));
    await renderScreen();

    expect(screen.getByText('טוען סניפים…')).toBeTruthy();
    expect(screen.queryByText(STAFF_MESSAGE)).toBeNull();
    expect(screen.queryByText(ADMIN_MESSAGE)).toBeNull();
  });

  it('shows neither message alongside an error', async () => {
    (fetchAccessibleBranches as jest.Mock).mockRejectedValue(new Error('boom'));
    await renderScreen();

    await waitFor(() => expect(screen.getByText('לא ניתן לטעון סניפים. יש למשוך לרענון.')).toBeTruthy());
    expect(screen.queryByText(STAFF_MESSAGE)).toBeNull();
    expect(screen.queryByText(ADMIN_MESSAGE)).toBeNull();
  });

  it('shows neither message when there are branches', async () => {
    (fetchAccessibleBranches as jest.Mock).mockResolvedValue([
      { id: 'b1', name: 'הילס', createdAt: '2024-01-01T00:00:00.000Z' },
      { id: 'b2', name: 'מרכז', createdAt: '2024-01-01T00:00:00.000Z' },
    ]);
    await renderScreen();

    await waitFor(() => expect(screen.getByText('הילס')).toBeTruthy());
    expect(screen.queryByText(STAFF_MESSAGE)).toBeNull();
    expect(screen.queryByText(ADMIN_MESSAGE)).toBeNull();
  });
});
