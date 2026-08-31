import type { OrderStatus } from '../api/types';

export interface OrderStatusBadge {
  label: string;
  tone: 'sent' | 'draft' | 'awaiting';
}

/**
 * The label and tone for an order's status.
 *
 * Extracted from the activity screen when a third status arrived: the badge
 * was a ternary on `=== 'PUBLISHED'`, which silently labelled anything else
 * "טיוטה" — so an order waiting to be confirmed would have read as an
 * untouched draft, which is exactly the confusion the new state exists to
 * remove.
 */
export function orderStatusBadge(status: OrderStatus): OrderStatusBadge {
  switch (status) {
    case 'PUBLISHED':
      return { label: 'נשלחה', tone: 'sent' };
    case 'AWAITING_CONFIRMATION':
      return { label: 'ממתינה לאישור', tone: 'awaiting' };
    case 'DRAFT':
    default:
      return { label: 'טיוטה', tone: 'draft' };
  }
}
