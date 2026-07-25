import type { Order } from '../api/types';

export function buildOrderMessage(order: Order): string {
  const lines = order.items.map(
    (item) => `- ${item.productNameSnapshot}: ${item.quantity} ${item.unitType}`,
  );
  return [`הזמנה עבור ${order.provider.name}:`, ...lines].join('\n');
}
