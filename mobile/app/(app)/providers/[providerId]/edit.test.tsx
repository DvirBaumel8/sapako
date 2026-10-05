import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertProvider } from '../../../../src/ui/AlertProvider';
import EditProviderScreen from './edit';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ providerId: 'prov-1' }),
}));

jest.mock('../../../../src/auth/useRequireAdmin', () => ({
  useRequireAdmin: jest.fn(),
}));

jest.mock('../../../../src/branch/BranchContext', () => ({
  useBranch: () => ({
    selectedBranch: { id: 'branch-1', name: 'הילס', createdAt: '2024-01-01T00:00:00.000Z' },
  }),
}));

jest.mock('../../../../src/api/providers', () => ({
  fetchAllProvidersForBranch: jest.fn(),
  updateProvider: jest.fn(),
  deleteProvider: jest.fn(),
}));

jest.mock('../../../../src/api/departments', () => ({
  fetchDepartments: jest.fn(),
}));

import { fetchAllProvidersForBranch } from '../../../../src/api/providers';
import { fetchDepartments } from '../../../../src/api/departments';

const EMPTY_MESSAGE = 'אין מחלקות בסניף הזה. יש להוסיף מחלקה קודם.';

const provider = {
  id: 'prov-1',
  name: 'תנובה',
  phone: '0501234567',
  branchId: 'branch-1',
  departments: [],
};

let activeQueryClient: QueryClient | null = null;

async function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  activeQueryClient = queryClient;
  await render(
    <QueryClientProvider client={queryClient}>
      <AlertProvider>
        <EditProviderScreen />
      </AlertProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByPlaceholderText('שם הספק')).toBeTruthy());
}

beforeEach(() => {
  jest.clearAllMocks();
  (fetchAllProvidersForBranch as jest.Mock).mockResolvedValue([provider]);
});

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient = null;
});

describe('EditProviderScreen — departments', () => {
  it('explains that a department must be added first when the branch has none', async () => {
    (fetchDepartments as jest.Mock).mockResolvedValue([]);
    await renderScreen();

    await waitFor(() => expect(screen.getByText(EMPTY_MESSAGE)).toBeTruthy());
  });

  it('explains the same when every department is inactive', async () => {
    (fetchDepartments as jest.Mock).mockResolvedValue([
      { id: 'd1', name: 'חלב', isActive: false },
    ]);
    await renderScreen();

    await waitFor(() => expect(screen.getByText(EMPTY_MESSAGE)).toBeTruthy());
  });

  it('shows no message when there are active departments', async () => {
    (fetchDepartments as jest.Mock).mockResolvedValue([
      { id: 'd1', name: 'חלב', isActive: true },
    ]);
    await renderScreen();

    await waitFor(() => expect(screen.getByText('חלב')).toBeTruthy());
    expect(screen.queryByText(EMPTY_MESSAGE)).toBeNull();
  });
});
