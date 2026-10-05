import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { AppState, Text } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './AuthContext';
import { getToken } from './tokenStorage';
import { fetchMe } from '../api/auth';

jest.mock('./tokenStorage', () => ({
  getToken: jest.fn(),
  setToken: jest.fn(),
  clearToken: jest.fn(),
}));
jest.mock('../api/client', () => ({ setUnauthorizedHandler: jest.fn() }));
jest.mock('../api/auth', () => ({ login: jest.fn(), fetchMe: jest.fn() }));
jest.mock('jwt-decode', () => ({
  jwtDecode: (token: string) => JSON.parse(token),
}));

let activeQueryClient: QueryClient | null = null;

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient = null;
});

function Probe() {
  const { isLoading, canEditProducts, isCapabilityLoading } = useAuth();
  return (
    <>
      <Text testID="probe">{isLoading ? 'loading' : String(canEditProducts)}</Text>
      <Text testID="capLoading">{String(isCapabilityLoading)}</Text>
    </>
  );
}

async function renderProvider(token: string | null) {
  (getToken as jest.Mock).mockResolvedValue(token);
  const queryClient = new QueryClient();
  activeQueryClient = queryClient;
  await render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('probe').props.children).not.toBe('loading'));
}

// Let any in-flight /auth/me query land inside the test, not after it.
const settle = () => waitFor(() => expect(activeQueryClient!.isFetching()).toBe(0));

beforeEach(() => jest.clearAllMocks());

describe('AuthProvider canEditProducts', () => {
  it('is false for staff until /auth/me resolves true', async () => {
    let resolveMe: (value: unknown) => void = () => {};
    (fetchMe as jest.Mock).mockReturnValue(new Promise((resolve) => (resolveMe = resolve)));
    await renderProvider(JSON.stringify({ sub: 'u1', role: 'STAFF' }));
    expect(screen.getByTestId('probe').props.children).toBe('false');

    expect(screen.getByTestId('capLoading').props.children).toBe('true');
    await act(async () => {
      resolveMe({ userId: 'u1', username: 'x', role: 'STAFF', canEditProducts: true });
    });
    await waitFor(() => expect(screen.getByTestId('probe').props.children).toBe('true'));
  });

  // The admin value must not depend on the fetch: it is true on the first
  // render after the token loads, before /auth/me can have resolved.
  it('is true for an admin without waiting', async () => {
    (fetchMe as jest.Mock).mockResolvedValue({ canEditProducts: true });
    await renderProvider(JSON.stringify({ sub: 'u1', role: 'ADMIN' }));
    expect(screen.getByTestId('probe').props.children).toBe('true');
    expect(screen.getByTestId('capLoading').props.children).toBe('false');
    await settle();
  });

  it('is false when logged out', async () => {
    await renderProvider(null);
    expect(screen.getByTestId('probe').props.children).toBe('false');
    expect(screen.getByTestId('capLoading').props.children).toBe('false');
    expect(fetchMe).not.toHaveBeenCalled();
  });

  it('stays false when /auth/me fails', async () => {
    (fetchMe as jest.Mock).mockRejectedValue(new Error('404'));
    await renderProvider(JSON.stringify({ sub: 'u1', role: 'STAFF' }));
    await settle();
    expect(fetchMe).toHaveBeenCalled();
    expect(screen.getByTestId('probe').props.children).toBe('false');
  });
});

describe('AuthProvider app-foreground refetch', () => {
  it('does not fetch /auth/me on foreground while logged out', async () => {
    let handler: ((state: string) => void) | undefined;
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _type: string,
      listener: (state: string) => void,
    ) => {
      handler = listener;
      return { remove: jest.fn() };
    }) as never);
    await renderProvider(null);
    await act(async () => {
      handler?.('active');
    });
    expect(handler).toBeDefined();
    expect(fetchMe).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
