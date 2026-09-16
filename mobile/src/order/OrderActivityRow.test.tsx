import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react-native';
import { AlertProvider } from '../ui/AlertProvider';
import { OrderActivityRow } from './OrderActivityRow';
import type { Order } from '../api/types';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const baseOrder = (status: Order['status']): Order => ({
  id: 'order-1',
  branchId: 'b1',
  providerId: 'p1',
  createdByUserId: 'u1',
  status,
  createdAt: '2026-01-01T00:00:00.000Z',
  items: [{ id: 'i1', productNameSnapshot: 'חלב', unitType: 'קרטון', quantity: 2 }],
  provider: { id: 'p1', name: 'תנובה', phone: '0501234567' },
});

const renderRow = (props: Partial<React.ComponentProps<typeof OrderActivityRow>> = {}) =>
  render(
    <AlertProvider>
      <OrderActivityRow
        order={baseOrder('DRAFT')}
        isExpanded={false}
        onToggleExpand={jest.fn()}
        onDelete={jest.fn()}
        onResolve={jest.fn()}
        {...props}
      />
    </AlertProvider>,
  );

describe('OrderActivityRow', () => {
  afterEach(cleanup);

  it('calls onToggleExpand when the row is pressed', async () => {
    const onToggleExpand = jest.fn();
    await renderRow({ onToggleExpand });

    fireEvent.press(screen.getByText('תנובה'));

    expect(onToggleExpand).toHaveBeenCalled();
  });

  it('calls onDelete without also toggling expand', async () => {
    const onToggleExpand = jest.fn();
    const onDelete = jest.fn();
    await renderRow({ onToggleExpand, onDelete });

    fireEvent.press(screen.getByText('🗑'));

    expect(onDelete).toHaveBeenCalled();
    expect(onToggleExpand).not.toHaveBeenCalled();
  });

  it('shows the yes/no question for an AWAITING_CONFIRMATION order when expanded', async () => {
    await renderRow({ order: baseOrder('AWAITING_CONFIRMATION'), isExpanded: true });

    expect(screen.getByText('נשלחה ההזמנה בוואטסאפ?')).toBeTruthy();
  });

  it('calls onResolve(true) for "כן, נשלחה"', async () => {
    const onResolve = jest.fn();
    await renderRow({ order: baseOrder('AWAITING_CONFIRMATION'), isExpanded: true, onResolve });

    fireEvent.press(screen.getByText('כן, נשלחה'));

    expect(onResolve).toHaveBeenCalledWith(true);
  });

  it('calls onResolve(false) for "לא, עדיין לא"', async () => {
    const onResolve = jest.fn();
    await renderRow({ order: baseOrder('AWAITING_CONFIRMATION'), isExpanded: true, onResolve });

    fireEvent.press(screen.getByText('לא, עדיין לא'));

    expect(onResolve).toHaveBeenCalledWith(false);
  });

  it('shows a continue-editing link, not the yes/no question, for a DRAFT order', async () => {
    await renderRow({ order: baseOrder('DRAFT'), isExpanded: true });

    expect(screen.getByText('המשך עריכת הזמנה ›')).toBeTruthy();
    expect(screen.queryByText('נשלחה ההזמנה בוואטסאפ?')).toBeNull();
  });

  it('offers to start a new draft, not "continue", for a PUBLISHED order', async () => {
    await renderRow({ order: baseOrder('PUBLISHED'), isExpanded: true });

    expect(screen.getByText('פתיחת הזמנה חדשה עם אותם פריטים ›')).toBeTruthy();
  });

  it('has no unread marker by default', async () => {
    await renderRow();

    expect(screen.queryByTestId('unread-dot')).toBeNull();
  });

  it('shows the unread marker when unread is true', async () => {
    await renderRow({ unread: true });

    expect(screen.getByTestId('unread-dot')).toBeTruthy();
  });
});
