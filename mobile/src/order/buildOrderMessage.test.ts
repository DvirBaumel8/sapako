import { buildOrderMessage } from './buildOrderMessage';
import type { Order } from '../api/types';

describe('buildOrderMessage', () => {
  it('formats the provider name and each item on its own line, in Hebrew', () => {
    const order: Order = {
      id: 'o1',
      branchId: 'b1',
      providerId: 'p1',
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
      status: 'PUBLISHED',
      createdAt: '2026-07-23T10:00:00.000Z',
      provider: { id: 'p1', name: 'ירקות השדה', phone: '+972507654321' },
      items: [{ id: 'i1', productId: 'pr1', productNameSnapshot: 'עגבניות', unitType: 'ארגז', quantity: 3 }],
    };

    const message = buildOrderMessage(order);

    expect(message).toBe('הזמנה עבור ירקות השדה:\n- עגבניות: 3 ארגז');
  });
});
