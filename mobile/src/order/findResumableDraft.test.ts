import { findResumableDraft } from './findResumableDraft';
import type { Order } from '../api/types';

const baseOrder: Order = {
  id: 'order-1',
  branchId: 'branch-1',
  providerId: 'provider-1',
  createdByUserId: 'user-1',
  status: 'DRAFT',
  createdAt: '2026-08-01T10:00:00.000Z',
  items: [{ id: 'item-1', productId: 'product-1', productNameSnapshot: 'Milk', unitType: 'unit', quantity: 2 }],
  provider: { id: 'provider-1', name: 'Provider One', phone: '972500000000' },
};

function makeOrder(overrides: Partial<Order>): Order {
  return { ...baseOrder, ...overrides };
}

describe('findResumableDraft', () => {
  it('returns the matching draft for this provider and user', () => {
    const orders = [makeOrder({})];
    expect(findResumableDraft(orders, 'provider-1', 'user-1')).toEqual(orders[0]);
  });

  it('returns undefined when there is no order for this provider', () => {
    const orders = [makeOrder({ providerId: 'provider-2' })];
    expect(findResumableDraft(orders, 'provider-1', 'user-1')).toBeUndefined();
  });

  it('returns undefined when the draft belongs to a different user', () => {
    const orders = [makeOrder({ createdByUserId: 'user-2' })];
    expect(findResumableDraft(orders, 'provider-1', 'user-1')).toBeUndefined();
  });

  it('returns undefined when the order is already published', () => {
    const orders = [makeOrder({ status: 'PUBLISHED' })];
    expect(findResumableDraft(orders, 'provider-1', 'user-1')).toBeUndefined();
  });

  it('returns undefined when the draft has no items', () => {
    const orders = [makeOrder({ items: [] })];
    expect(findResumableDraft(orders, 'provider-1', 'user-1')).toBeUndefined();
  });

  it('returns the most recently created match when multiple drafts qualify', () => {
    const older = makeOrder({ id: 'order-old', createdAt: '2026-07-01T10:00:00.000Z' });
    const newer = makeOrder({ id: 'order-new', createdAt: '2026-08-01T10:00:00.000Z' });
    expect(findResumableDraft([older, newer], 'provider-1', 'user-1')).toEqual(newer);
    expect(findResumableDraft([newer, older], 'provider-1', 'user-1')).toEqual(newer);
  });
});
