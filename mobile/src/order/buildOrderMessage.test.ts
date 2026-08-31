import { buildOrderMessage } from './buildOrderMessage';
import type { Order } from '../api/types';

describe('buildOrderMessage', () => {
  it('formats the provider name and each item on its own line, in Hebrew', () => {
    const order: Order = {
      id: 'o1',
      branchId: 'b1',
      providerId: 'p1',
      createdByUserId: 'u1',
      status: 'PUBLISHED',
      createdAt: '2026-07-23T10:00:00.000Z',
      publishedAt: '2026-07-23T10:05:00.000Z',
      provider: { id: 'p1', name: 'חברת הבשר', phone: '+972501234567' },
      items: [
        { id: 'i1', productId: 'pr1', productNameSnapshot: 'בשר טחון', unitType: 'ק"ג', quantity: 5 },
        { id: 'i2', productId: undefined, productNameSnapshot: 'צלעות כבש (רזות)', unitType: 'ק"ג', quantity: 2 },
      ],
    };

    const message = buildOrderMessage(order);

    expect(message).toBe(
      'הזמנה עבור חברת הבשר:\n- בשר טחון: 5 ק"ג\n- צלעות כבש (רזות): 2 ק"ג',
    );
  });

  it('handles a single-item order without a trailing newline', () => {
    const order: Order = {
      id: 'o1',
      branchId: 'b1',
      providerId: 'p1',
      createdByUserId: 'u1',
      status: 'PUBLISHED',
      createdAt: '2026-07-23T10:00:00.000Z',
      provider: { id: 'p1', name: 'ירקות השדה', phone: '+972507654321' },
      items: [{ id: 'i1', productId: 'pr1', productNameSnapshot: 'עגבניות', unitType: 'ארגז', quantity: 3 }],
    };

    const message = buildOrderMessage(order);

    expect(message).toBe('הזמנה עבור ירקות השדה:\n- עגבניות: 3 ארגז');
  });

  it('writes a whole quantity without decimals', () => {
    // The column is numeric(10,2), so an untouched value arrives as 3 — but a
    // naive template would print "3.00 קרטון" the moment it arrives as such.
    const message = buildOrderMessage({
      provider: { name: 'אוסם' },
      items: [{ productNameSnapshot: 'קמח', quantity: 3, unitType: 'קרטון' }],
    } as never);
    expect(message).toContain('- קמח: 3 קרטון');
  });

  it('writes a fractional weight as typed', () => {
    const message = buildOrderMessage({
      provider: { name: 'תנובה' },
      items: [{ productNameSnapshot: 'גבינה', quantity: 2.5, unitType: 'ק"ג' }],
    } as never);
    expect(message).toContain('- גבינה: 2.5 ק"ג');
  });
});
