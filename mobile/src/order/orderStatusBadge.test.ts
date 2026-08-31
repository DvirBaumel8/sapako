import { orderStatusBadge } from './orderStatusBadge';

describe('orderStatusBadge', () => {
  it('labels a published order as sent', () => {
    expect(orderStatusBadge('PUBLISHED')).toEqual({ label: 'נשלחה', tone: 'sent' });
  });

  it('labels a draft as a draft', () => {
    expect(orderStatusBadge('DRAFT')).toEqual({ label: 'טיוטה', tone: 'draft' });
  });

  it('distinguishes an order awaiting confirmation from both', () => {
    // The bug this replaced: a ternary on `=== PUBLISHED` labelled an
    // awaiting order "טיוטה", hiding the fact that a message had been sent.
    const badge = orderStatusBadge('AWAITING_CONFIRMATION');

    expect(badge.label).toBe('ממתינה לאישור');
    expect(badge.label).not.toBe('טיוטה');
    expect(badge.tone).toBe('awaiting');
  });

  it('gives every status its own tone', () => {
    const tones = (['DRAFT', 'AWAITING_CONFIRMATION', 'PUBLISHED'] as const).map(
      (status) => orderStatusBadge(status).tone,
    );

    expect(new Set(tones).size).toBe(3);
  });
});
