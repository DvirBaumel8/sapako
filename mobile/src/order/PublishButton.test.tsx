/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import type { Order, OrderItem } from '../api/types';
import { AlertProvider } from '../ui/AlertProvider';
import { PublishButton } from './PublishButton';

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('../api/orders', () => ({ handOffOrder: jest.fn() }));

import { handOffOrder } from '../api/orders';

const order: Order = {
  id: 'order-1',
  branchId: 'branch-1',
  providerId: 'provider-1',
  createdByUserId: 'user-1',
  status: 'DRAFT',
  createdAt: '2026-08-31T09:00:00.000Z',
  items: [],
  provider: { id: 'provider-1', name: 'תנובה', phone: '0501234567' },
};

const items: OrderItem[] = [
  { id: 'i1', productNameSnapshot: 'חלב', unitType: 'קרטון', quantity: 2 },
];

let openSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  (handOffOrder as jest.Mock).mockResolvedValue({ ...order, status: 'AWAITING_CONFIRMATION' });
  openSpy = jest.spyOn(window, 'open').mockReturnValue({} as Window);
});

afterEach(() => {
  openSpy.mockRestore();
});

const renderButton = (props = {}) =>
  render(
    <AlertProvider>
      <PublishButton order={order} items={items} {...props} />
    </AlertProvider>,
  );

describe('PublishButton', () => {
  it('opens WhatsApp with the order message', async () => {
    await renderButton();

    await fireEvent.press(screen.getByText('פרסום לוואטסאפ'));

    await waitFor(() => expect(openSpy).toHaveBeenCalled());
    const [url] = openSpy.mock.calls[0];
    expect(url).toContain('wa.me/972501234567');
  });

  it('records a handoff, not a send', async () => {
    // The app cannot observe whether the message left the device, so this
    // must not be the thing that marks the order as sent.
    await renderButton();

    await fireEvent.press(screen.getByText('פרסום לוואטסאפ'));

    await waitFor(() => expect(handOffOrder).toHaveBeenCalledWith('order-1'));
  });

  it('opens WhatsApp before awaiting anything, so Safari does not block it', async () => {
    // Safari blocks window.open once the user-gesture chain is broken by an
    // await, which is why the call is made synchronously in the handler.
    const onBeforeMarkPublished = jest.fn().mockResolvedValue(undefined);
    await renderButton({ onBeforeMarkPublished });

    await fireEvent.press(screen.getByText('פרסום לוואטסאפ'));

    expect(openSpy).toHaveBeenCalled();
  });

  it('flushes pending quantity writes before handing off', async () => {
    // A quantity changed a moment ago may still be queued; handing off first
    // would lock the order with that change unsaved.
    const order2: string[] = [];
    const onBeforeMarkPublished = jest.fn(async () => {
      order2.push('flush');
    });
    (handOffOrder as jest.Mock).mockImplementation(async () => {
      order2.push('handoff');
      return order;
    });
    await renderButton({ onBeforeMarkPublished });

    await fireEvent.press(screen.getByText('פרסום לוואטסאפ'));

    await waitFor(() => expect(order2).toEqual(['flush', 'handoff']));
  });

  it('does nothing at all when the order is empty', async () => {
    await render(
      <AlertProvider>
        <PublishButton order={order} items={[]} />
      </AlertProvider>,
    );

    await fireEvent.press(screen.getByText('פרסום לוואטסאפ'));

    expect(openSpy).not.toHaveBeenCalled();
    expect(handOffOrder).not.toHaveBeenCalled();
  });

  it('tells the user the order is still a draft when the handoff fails', async () => {
    // The message may well have been sent by hand from WhatsApp, so the copy
    // must not tell them to send it again.
    (handOffOrder as jest.Mock).mockRejectedValue(new Error('offline'));
    await renderButton();

    await fireEvent.press(screen.getByText('פרסום לוואטסאפ'));

    await waitFor(() => {
      expect(screen.getByText(/אין צורך לשלוח שוב/)).toBeTruthy();
    });
  });
});
