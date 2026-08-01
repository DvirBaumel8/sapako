import type { Order } from '../api/types';

export function findResumableDraft(
  orders: Order[],
  providerId: string,
  userId: string,
): Order | undefined {
  const candidates = orders.filter(
    (order) =>
      order.providerId === providerId &&
      order.createdByUserId === userId &&
      order.status === 'DRAFT' &&
      order.items.length > 0,
  );

  if (candidates.length === 0) {
    return undefined;
  }

  return candidates.reduce((latest, order) =>
    new Date(order.createdAt) > new Date(latest.createdAt) ? order : latest,
  );
}
