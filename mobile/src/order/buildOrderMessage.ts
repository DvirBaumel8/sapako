import type { Order } from '../api/types';
import { formatQuantity } from '../products/unitTypes';

export function buildOrderMessage(order: Order): string {
  const lines = order.items.map(
    (item) => `- ${item.productNameSnapshot}: ${formatQuantity(item.quantity)} ${item.unitType}`,
  );
  return [`הזמנה עבור ${order.provider.name}:`, ...lines].join('\n');
}
