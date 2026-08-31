import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { AlertProvider } from '../ui/AlertProvider';
import { AddUnknownProductModal } from './AddUnknownProductModal';
import { DEFAULT_UNIT_TYPE } from '../products/unitTypes';

jest.mock('../api/products', () => ({ createProduct: jest.fn() }));
jest.mock('../api/catalog', () => ({ lookupCatalogItem: jest.fn() }));

import { createProduct } from '../api/products';
import { lookupCatalogItem } from '../api/catalog';

const onCreated = jest.fn();
const onClose = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  // The common case: about seven scans in ten are not in the catalogue.
  (lookupCatalogItem as jest.Mock).mockResolvedValue(null);
  (createProduct as jest.Mock).mockResolvedValue({
    id: 'product-new',
    name: 'מוצר חדש',
    unitType: DEFAULT_UNIT_TYPE,
    barcode: '7290000000001',
  });
});

// Rendered conditionally by the order screen with `visible` already true, so
// the mount and the opening are the same moment — which is what made the
// reset effect's behaviour easy to get wrong.
const renderModal = () =>
  render(
    <AlertProvider>
      <AddUnknownProductModal
        visible
        providerId="provider-1"
        barcode="7290000000001"
        onClose={onClose}
        onCreated={onCreated}
      />
    </AlertProvider>,
  );

describe('AddUnknownProductModal', () => {
  it('shows the scanned barcode, so the user can check it before saving', async () => {
    await renderModal();

    expect(screen.getByText('ברקוד: 7290000000001')).toBeTruthy();
  });

  it('opens with the default unit already selected', async () => {
    // It used to open with none selected, which left the submit button
    // disabled with nothing on screen explaining why. The catalogue is
    // ordered by the carton, so that is the right starting point.
    await renderModal();

    expect(
      screen.getByTestId(`unit-option-${DEFAULT_UNIT_TYPE}`).props.accessibilityState
        .selected,
    ).toBe(true);
  });

  it('needs only a name before it can be submitted', async () => {
    await renderModal();

    await fireEvent.changeText(screen.getByPlaceholderText('שם המוצר'), 'קרטון חלב');
    await fireEvent.press(screen.getByText('הוספה והוספה להזמנה'));

    await waitFor(() =>
      expect(createProduct).toHaveBeenCalledWith('provider-1', {
        name: 'קרטון חלב',
        unitType: DEFAULT_UNIT_TYPE,
        barcode: '7290000000001',
      }),
    );
  });

  it('sends the unit the user picked instead of the default', async () => {
    await renderModal();
    await fireEvent.changeText(screen.getByPlaceholderText('שם המוצר'), 'גבינה');

    await fireEvent.press(screen.getByTestId('unit-option-ק"ג'));
    await fireEvent.press(screen.getByText('הוספה והוספה להזמנה'));

    await waitFor(() =>
      expect(createProduct).toHaveBeenCalledWith(
        'provider-1',
        expect.objectContaining({ unitType: 'ק"ג' }),
      ),
    );
  });

  it('does not submit a name with no letters in it', async () => {
    await renderModal();

    await fireEvent.changeText(screen.getByPlaceholderText('שם המוצר'), '12345');
    await fireEvent.press(screen.getByText('הוספה והוספה להזמנה'));

    expect(createProduct).not.toHaveBeenCalled();
  });

  it('explains why a digits-only name is refused', async () => {
    await renderModal();

    await fireEvent.changeText(screen.getByPlaceholderText('שם המוצר'), '12345');

    expect(
      screen.getByText('שם המוצר חייב לכלול אותיות, לא רק מספרים.'),
    ).toBeTruthy();
  });

  it('hands the created product back to the order screen', async () => {
    await renderModal();
    await fireEvent.changeText(screen.getByPlaceholderText('שם המוצר'), 'קרטון חלב');

    await fireEvent.press(screen.getByText('הוספה והוספה להזמנה'));

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'product-new' }),
      ),
    );
  });

  it('keeps the modal open and reports the failure when saving fails', async () => {
    // Closing on failure would lose the typed name and leave the scan
    // unresolved mid-order.
    (createProduct as jest.Mock).mockRejectedValue(new Error('offline'));
    await renderModal();
    await fireEvent.changeText(screen.getByPlaceholderText('שם המוצר'), 'קרטון חלב');

    await fireEvent.press(screen.getByText('הוספה והוספה להזמנה'));

    await waitFor(() =>
      expect(screen.getByText('הוספת המוצר נכשלה. יש לנסות שוב.')).toBeTruthy(),
    );
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('prefilling from the reference catalogue', () => {
  it('fills the name in when the barcode is known', async () => {
    (lookupCatalogItem as jest.Mock).mockResolvedValue({
      name: 'אטריות דקות 400 גרם',
      brand: 'אסם',
      unitType: 'גרם',
    });

    await renderModal();

    await waitFor(() =>
      expect(screen.getByDisplayValue('אטריות דקות 400 גרם')).toBeTruthy(),
    );
  });

  it('selects the unit the catalogue reports', async () => {
    (lookupCatalogItem as jest.Mock).mockResolvedValue({
      name: 'רוטב טבסקו 60 מ"ל',
      unitType: 'מיליליטר',
    });

    await renderModal();

    await waitFor(() =>
      expect(
        screen.getByTestId('unit-option-מיליליטר').props.accessibilityState
          .selected,
      ).toBe(true),
    );
  });

  it('keeps the default unit when the catalogue has no unit for it', async () => {
    (lookupCatalogItem as jest.Mock).mockResolvedValue({
      name: 'ענבים אדומים',
      unitType: null,
    });

    await renderModal();

    await waitFor(() => expect(screen.getByDisplayValue('ענבים אדומים')).toBeTruthy());
    expect(
      screen.getByTestId(`unit-option-${DEFAULT_UNIT_TYPE}`).props
        .accessibilityState.selected,
    ).toBe(true);
  });

  it('leaves the form empty when the barcode is unknown', async () => {
    await renderModal();

    await waitFor(() => expect(lookupCatalogItem).toHaveBeenCalled());
    expect(screen.getByPlaceholderText('שם המוצר').props.value).toBe('');
  });

  it('leaves the form usable when the lookup fails', async () => {
    // A prefill is a convenience. Losing the network must not stop somebody
    // adding a product in the middle of an order.
    (lookupCatalogItem as jest.Mock).mockRejectedValue(new Error('offline'));

    await renderModal();

    await waitFor(() => expect(lookupCatalogItem).toHaveBeenCalled());
    expect(screen.getByPlaceholderText('שם המוצר').props.value).toBe('');
  });

  it('looks the scanned barcode up exactly once', async () => {
    await renderModal();

    await waitFor(() => expect(lookupCatalogItem).toHaveBeenCalledWith('7290000000001'));
    expect(lookupCatalogItem).toHaveBeenCalledTimes(1);
  });
});
