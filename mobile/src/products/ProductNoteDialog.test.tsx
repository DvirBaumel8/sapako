import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import type { Product } from '../api/types';
import { ProductNoteDialog } from './ProductNoteDialog';

jest.mock('../api/products', () => ({
  updateProductNote: jest.fn(),
}));
import { updateProductNote } from '../api/products';

const BASE: Product = {
  id: 'product-1',
  providerId: 'provider-1',
  name: 'חלב 3%',
  unitType: 'קרטון',
  isActive: true,
  createdAt: '2024-01-01T00:00:00.000Z',
};
const WITH_NOTE: Product = { ...BASE, note: 'לבקש תאריך ארוך' };

const onSaved = jest.fn();
const onClose = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (updateProductNote as jest.Mock).mockImplementation(
    async (_providerId: string, _productId: string, note: string | null) => ({ ...BASE, note }),
  );
});

async function renderDialog(product: Product) {
  return await render(<ProductNoteDialog product={product} onSaved={onSaved} onClose={onClose} />);
}

it('shows the product name and prefills the existing note with its length', async () => {
  await renderDialog(WITH_NOTE);
  expect(screen.getByText('הערה למוצר')).toBeTruthy();
  expect(screen.getByText('חלב 3%')).toBeTruthy();
  expect(screen.getByTestId('note-input').props.value).toBe('לבקש תאריך ארוך');
  expect(screen.getByTestId('note-counter')).toHaveTextContent(`${'לבקש תאריך ארוך'.length}/200`);
});

it('saves the trimmed text and reports it as saved', async () => {
  await renderDialog(BASE);
  await fireEvent.changeText(screen.getByTestId('note-input'), '  להזמין רק ביום ראשון  ');
  await fireEvent.press(screen.getByTestId('note-save'));

  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(updateProductNote).toHaveBeenCalledWith('provider-1', 'product-1', 'להזמין רק ביום ראשון');
  expect(onSaved.mock.calls[0][1]).toBe('saved');
});

it('deletes the note when saving an empty box on a product that has one', async () => {
  await renderDialog(WITH_NOTE);
  await fireEvent.changeText(screen.getByTestId('note-input'), '   ');
  await fireEvent.press(screen.getByTestId('note-save'));

  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(updateProductNote).toHaveBeenCalledWith('provider-1', 'product-1', null);
  expect(onSaved.mock.calls[0][1]).toBe('deleted');
});

it('just closes, with no request, when saving an empty box on a product with no note', async () => {
  await renderDialog(BASE);
  await fireEvent.press(screen.getByTestId('note-save'));

  expect(updateProductNote).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('offers "delete note" only when the product has a note', async () => {
  const { unmount } = await renderDialog(BASE);
  expect(screen.queryByTestId('note-delete')).toBeNull();
  await unmount();

  await renderDialog(WITH_NOTE);
  expect(screen.getByTestId('note-delete')).toBeTruthy();
});

it('deletes immediately from the delete link', async () => {
  await renderDialog(WITH_NOTE);
  await fireEvent.press(screen.getByTestId('note-delete'));

  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(updateProductNote).toHaveBeenCalledWith('provider-1', 'product-1', null);
  expect(onSaved.mock.calls[0][1]).toBe('deleted');
});

it('keeps the dialog and the typed text when the save fails, and shows why', async () => {
  (updateProductNote as jest.Mock).mockRejectedValueOnce(new Error('network down'));
  await renderDialog(BASE);
  await fireEvent.changeText(screen.getByTestId('note-input'), 'טקסט חשוב');
  await fireEvent.press(screen.getByTestId('note-save'));

  await waitFor(() =>
    expect(screen.getByTestId('note-error')).toHaveTextContent(
      'ההערה לא נשמרה. בדקו את החיבור ונסו שוב.',
    ),
  );
  expect(screen.getByTestId('note-input').props.value).toBe('טקסט חשוב');
  expect(onSaved).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});

it('sends only one request when Save is tapped twice quickly', async () => {
  let resolve: (p: Product) => void = () => {};
  (updateProductNote as jest.Mock).mockReturnValueOnce(
    new Promise<Product>((r) => {
      resolve = r;
    }),
  );
  await renderDialog(BASE);
  await fireEvent.changeText(screen.getByTestId('note-input'), 'x');
  await fireEvent.press(screen.getByTestId('note-save'));
  await fireEvent.press(screen.getByTestId('note-save'));
  resolve({ ...BASE, note: 'x' });

  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(updateProductNote).toHaveBeenCalledTimes(1);
});

it('closes without saving on cancel', async () => {
  await renderDialog(WITH_NOTE);
  await fireEvent.changeText(screen.getByTestId('note-input'), 'שינוי שלא נשמר');
  await fireEvent.press(screen.getByTestId('note-cancel'));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(updateProductNote).not.toHaveBeenCalled();
});

it('closes without saving when the backdrop is tapped', async () => {
  await renderDialog(WITH_NOTE);
  await fireEvent.press(screen.getByTestId('note-backdrop'));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(updateProductNote).not.toHaveBeenCalled();
});
