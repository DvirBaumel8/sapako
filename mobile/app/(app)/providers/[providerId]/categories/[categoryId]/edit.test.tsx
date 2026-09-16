import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import { AlertProvider } from '../../../../../../src/ui/AlertProvider';
import EditCategoryScreen from './edit';

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
  useLocalSearchParams: () => ({
    providerId: 'provider-1',
    categoryId: 'cat-1',
    categoryName: 'ירקות',
  }),
  router: { back: (...args: unknown[]) => mockBack(...args) },
}));

jest.mock('../../../../../../src/auth/useRequireAdmin', () => ({
  useRequireAdmin: jest.fn(),
}));

jest.mock('../../../../../../src/api/categories', () => ({
  updateCategory: jest.fn(),
  deleteCategory: jest.fn(),
}));

import { updateCategory, deleteCategory } from '../../../../../../src/api/categories';

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
        <EditCategoryScreen />
      </AlertProvider>
    </QueryClientProvider>,
  );
}

describe('EditCategoryScreen', () => {
  it('prefills the current category name', async () => {
    await renderScreen();

    expect(screen.getByPlaceholderText('שם הקטגוריה').props.value).toBe('ירקות');
  });

  it('renames the category and navigates back', async () => {
    (updateCategory as jest.Mock).mockResolvedValue({
      id: 'cat-1',
      providerId: 'provider-1',
      name: 'ירקות טריות',
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    await renderScreen();

    await fireEvent.changeText(screen.getByPlaceholderText('שם הקטגוריה'), 'ירקות טריות');
    await fireEvent.press(screen.getByText('שמירה'));

    await waitFor(() =>
      expect(updateCategory).toHaveBeenCalledWith('cat-1', { name: 'ירקות טריות' }),
    );
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('shows a conflict-specific error when renaming collides with another category', async () => {
    (updateCategory as jest.Mock).mockRejectedValue(conflictError());
    await renderScreen();

    await fireEvent.changeText(screen.getByPlaceholderText('שם הקטגוריה'), 'פירות');
    await fireEvent.press(screen.getByText('שמירה'));

    await waitFor(() =>
      expect(
        screen.getByText('כבר קיימת קטגוריה בשם זה אצל ספק זה. יש לבחור שם אחר.'),
      ).toBeTruthy(),
    );
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('asks for confirmation, reassuring that products only become uncategorized', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByText('מחיקת קטגוריה'));

    await waitFor(() =>
      expect(
        screen.getByText(
          'למחוק את הקטגוריה "ירקות"? המוצרים בה לא יימחקו, הם רק יעברו למצב "ללא קטגוריה". לא ניתן לשחזר פעולה זו.',
        ),
      ).toBeTruthy(),
    );
  });

  it('deletes the category and invalidates both categories and products on confirm', async () => {
    (deleteCategory as jest.Mock).mockResolvedValue(undefined);
    const invalidateSpy = jest.spyOn(QueryClient.prototype, 'invalidateQueries');
    await renderScreen();

    await fireEvent.press(screen.getByText('מחיקת קטגוריה'));
    await waitFor(() => expect(screen.getByText('מחיקה')).toBeTruthy());
    await fireEvent.press(screen.getByText('מחיקה'));

    await waitFor(() => expect(deleteCategory).toHaveBeenCalledWith('cat-1'));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['categories', 'provider-1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['products', 'provider-1'] });
    invalidateSpy.mockRestore();
  });
});
