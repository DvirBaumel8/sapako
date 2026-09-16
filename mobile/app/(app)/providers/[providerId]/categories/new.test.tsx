import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import { AlertProvider } from '../../../../../src/ui/AlertProvider';
import NewCategoryScreen from './new';

const conflictError = () =>
  new AxiosError('Conflict', 'ERR', undefined, undefined, {
    status: 409,
    statusText: '',
    data: {},
    headers: {},
    config: { headers: new AxiosHeaders() },
  });

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ providerId: 'provider-1' }),
  router: { back: (...args: unknown[]) => mockBack(...args) },
}));

jest.mock('../../../../../src/auth/useRequireAdmin', () => ({
  useRequireAdmin: jest.fn(),
}));

jest.mock('../../../../../src/api/categories', () => ({
  createCategory: jest.fn(),
}));

import { createCategory } from '../../../../../src/api/categories';

let activeQueryClient: QueryClient | null = null;

beforeEach(() => {
  jest.clearAllMocks();
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
        <NewCategoryScreen />
      </AlertProvider>
    </QueryClientProvider>,
  );
}

describe('NewCategoryScreen', () => {
  it('does not submit while the name field is still empty', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByText('יצירת קטגוריה'));

    expect(createCategory).not.toHaveBeenCalled();
  });

  it('creates the category under this provider and navigates back', async () => {
    (createCategory as jest.Mock).mockResolvedValue({
      id: 'cat-1',
      providerId: 'provider-1',
      name: 'ירקות',
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    await renderScreen();

    await fireEvent.changeText(screen.getByPlaceholderText('שם הקטגוריה'), 'ירקות');
    await fireEvent.press(screen.getByText('יצירת קטגוריה'));

    await waitFor(() =>
      expect(createCategory).toHaveBeenCalledWith('provider-1', { name: 'ירקות' }),
    );
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('shows a conflict-specific error when the name already exists for this provider', async () => {
    (createCategory as jest.Mock).mockRejectedValue(conflictError());
    await renderScreen();

    await fireEvent.changeText(screen.getByPlaceholderText('שם הקטגוריה'), 'ירקות');
    await fireEvent.press(screen.getByText('יצירת קטגוריה'));

    await waitFor(() =>
      expect(
        screen.getByText('כבר קיימת קטגוריה בשם זה אצל ספק זה. יש לבחור שם אחר.'),
      ).toBeTruthy(),
    );
    expect(mockBack).not.toHaveBeenCalled();
  });
});
