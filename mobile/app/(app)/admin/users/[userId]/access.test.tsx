import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertProvider } from '../../../../../src/ui/AlertProvider';
import UserAccessScreen from './access';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ userId: 'user-1' }),
  router: { push: jest.fn(), replace: jest.fn() },
}));

jest.mock('../../../../../src/auth/useRequireAdmin', () => ({
  useRequireAdmin: jest.fn(),
}));

jest.mock('../../../../../src/api/branches', () => ({
  fetchAccessibleBranches: jest.fn(),
}));

jest.mock('../../../../../src/api/access', () => ({
  fetchAccess: jest.fn(),
  setProviderAccess: jest.fn(),
  setDepartmentAccess: jest.fn(),
  setAllDepartmentsAccess: jest.fn(),
  setBranchAccess: jest.fn(),
}));

import { fetchAccessibleBranches } from '../../../../../src/api/branches';
import {
  fetchAccess,
  setAllDepartmentsAccess,
  setBranchAccess,
  setDepartmentAccess,
} from '../../../../../src/api/access';

const branch = { id: 'branch-1', name: 'הילס', createdAt: '2024-01-01T00:00:00.000Z' };

const accessView = (departmentsGranted: boolean) => ({
  departments: [
    { id: 'dep-1', name: 'חלב', isGranted: departmentsGranted },
    { id: 'dep-2', name: 'ירקות', isGranted: departmentsGranted },
  ],
  providers: [
    { id: 'prov-1', name: 'תנובה', isGranted: departmentsGranted, reason: 'NONE' },
  ],
});

let activeQueryClient: QueryClient | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  (fetchAccessibleBranches as jest.Mock).mockResolvedValue([branch]);
  (fetchAccess as jest.Mock).mockResolvedValue(accessView(false));
  (setAllDepartmentsAccess as jest.Mock).mockResolvedValue(undefined);
  (setBranchAccess as jest.Mock).mockResolvedValue(undefined);
  (setDepartmentAccess as jest.Mock).mockResolvedValue(undefined);
});

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient = null;
});

async function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  activeQueryClient = queryClient;
  await render(
    <QueryClientProvider client={queryClient}>
      <AlertProvider>
        <UserAccessScreen />
      </AlertProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByText('הרשאה לכל המחלקות')).toBeTruthy());
}

describe('UserAccessScreen — granting every department', () => {
  it('offers an all-departments control alongside the per-department rows', async () => {
    await renderScreen();

    expect(screen.getByText('הרשאה לכל המחלקות')).toBeTruthy();
    expect(screen.getByText('חלב')).toBeTruthy();
    expect(screen.getByText('ירקות')).toBeTruthy();
  });

  it('grants every department in the active branch in one call', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByLabelText('הרשאה לכל המחלקות'));

    await waitFor(() =>
      expect(setAllDepartmentsAccess).toHaveBeenCalledWith('user-1', 'branch-1', true),
    );
  });

  it('does not fall through to the branch-wide provider grant', async () => {
    // They are different mechanisms — one writes department rules, the other a
    // direct grant per provider — and only the first covers a provider added
    // later.
    await renderScreen();

    await fireEvent.press(screen.getByLabelText('הרשאה לכל המחלקות'));

    await waitFor(() => expect(setAllDepartmentsAccess).toHaveBeenCalled());
    expect(setBranchAccess).not.toHaveBeenCalled();
  });

  it('does not write each department separately', async () => {
    // 33 departments in the live catalogue; one call, not thirty-three.
    await renderScreen();

    await fireEvent.press(screen.getByLabelText('הרשאה לכל המחלקות'));

    await waitFor(() => expect(setAllDepartmentsAccess).toHaveBeenCalledTimes(1));
    expect(setDepartmentAccess).not.toHaveBeenCalled();
  });

  it('shows as on when every department is already granted', async () => {
    (fetchAccess as jest.Mock).mockResolvedValue(accessView(true));
    await renderScreen();

    expect(
      screen.getByLabelText('הרשאה לכל המחלקות').props.accessibilityState.checked,
    ).toBe(true);
  });

  it('revokes when it is turned off', async () => {
    (fetchAccess as jest.Mock).mockResolvedValue(accessView(true));
    await renderScreen();

    await fireEvent.press(screen.getByLabelText('הרשאה לכל המחלקות'));

    await waitFor(() =>
      expect(setAllDepartmentsAccess).toHaveBeenCalledWith('user-1', 'branch-1', false),
    );
  });

  it('reports a failure rather than leaving the switch looking successful', async () => {
    (setAllDepartmentsAccess as jest.Mock).mockRejectedValue(new Error('offline'));
    await renderScreen();

    await fireEvent.press(screen.getByLabelText('הרשאה לכל המחלקות'));

    await waitFor(() =>
      expect(
        screen.getByText('עדכון ההרשאה למחלקות נכשל. יש לבדוק את החיבור ולנסות שוב.'),
      ).toBeTruthy(),
    );
  });
});

describe('UserAccessScreen — a single department', () => {
  it('grants a department that is currently off', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByLabelText('חלב'));

    await waitFor(() =>
      expect(setDepartmentAccess).toHaveBeenCalledWith('user-1', 'dep-1', true),
    );
  });

  it('revokes a department that is currently on', async () => {
    // Sends the negation of the current value, not the value back again.
    (fetchAccess as jest.Mock).mockResolvedValue(accessView(true));
    await renderScreen();

    await fireEvent.press(screen.getByLabelText('חלב'));

    await waitFor(() =>
      expect(setDepartmentAccess).toHaveBeenCalledWith('user-1', 'dep-1', false),
    );
  });

  it('touches only the department that was tapped', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByLabelText('ירקות'));

    await waitFor(() => expect(setDepartmentAccess).toHaveBeenCalledTimes(1));
    expect(setDepartmentAccess).toHaveBeenCalledWith('user-1', 'dep-2', true);
    expect(setAllDepartmentsAccess).not.toHaveBeenCalled();
  });

  it('reports a failure instead of leaving the switch looking successful', async () => {
    (setDepartmentAccess as jest.Mock).mockRejectedValue(new Error('offline'));
    await renderScreen();

    await fireEvent.press(screen.getByLabelText('חלב'));

    await waitFor(() =>
      expect(
        screen.getByText('עדכון ההרשאה למחלקה נכשל. יש לבדוק את החיבור ולנסות שוב.'),
      ).toBeTruthy(),
    );
  });
});

// The in-flight guards on these toggles are deliberately not covered here.
// They exist for two taps landing within one frame, and this harness cannot
// represent that: awaiting fireEvent.press waits for the handler's write to
// settle, so no in-flight window survives the await, and firing without
// awaiting opens overlapping act() scopes that corrupt every later test in
// the file. A test written either way would pass without exercising the
// guard. See the comment beside departmentInFlightRef in access.tsx.
