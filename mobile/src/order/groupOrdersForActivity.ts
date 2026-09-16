import type { Order } from '../api/types';

export interface OrderSection {
  title: string;
  data: Order[];
}

/**
 * Splits the activity list into "טיוטות" (drafts) and "נשלחו" (sent).
 *
 * AWAITING_CONFIRMATION sorts inside "טיוטות", above plain drafts: the
 * order has already been handed to WhatsApp, but nobody has answered
 * whether it actually went out, which is a pending question rather than
 * finished work — closer to a draft than to something sent. Each bucket
 * otherwise keeps the order given to it (the backend returns createdAt
 * DESC), and an empty bucket is left out entirely rather than rendered
 * with nothing under it.
 */
export function groupOrdersForActivity(orders: Order[]): OrderSection[] {
  const awaiting = orders.filter((order) => order.status === 'AWAITING_CONFIRMATION');
  const draft = orders.filter((order) => order.status === 'DRAFT');
  const sent = orders.filter((order) => order.status === 'PUBLISHED');

  return [
    ...(awaiting.length + draft.length > 0
      ? [{ title: 'טיוטות', data: [...awaiting, ...draft] }]
      : []),
    ...(sent.length > 0 ? [{ title: 'נשלחו', data: sent }] : []),
  ];
}
