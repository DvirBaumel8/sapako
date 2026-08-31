import { apiClient } from './client';
import type { Order, OrderItem } from './types';

export async function createDraftOrder(branchId: string, providerId: string): Promise<Order> {
  const response = await apiClient.post<Order>('/orders', { branchId, providerId });
  return response.data;
}

export async function addOrderItem(
  orderId: string,
  input: { productId?: string; productNameSnapshot?: string; unitType?: string; quantity: number },
): Promise<OrderItem> {
  const response = await apiClient.post<OrderItem>(`/orders/${orderId}/items`, input);
  return response.data;
}

export async function updateOrderItemQuantity(
  orderId: string,
  itemId: string,
  quantity: number,
): Promise<OrderItem> {
  const response = await apiClient.patch<OrderItem>(`/orders/${orderId}/items/${itemId}`, { quantity });
  return response.data;
}

/**
 * Changes the unit for one line of this order only. The product's catalogue
 * unit is left alone, so other branches and future orders are unaffected.
 */
export async function updateOrderItemUnit(
  orderId: string,
  itemId: string,
  unitType: string,
): Promise<OrderItem> {
  const response = await apiClient.patch<OrderItem>(`/orders/${orderId}/items/${itemId}`, { unitType });
  return response.data;
}

export async function removeOrderItem(orderId: string, itemId: string): Promise<void> {
  await apiClient.delete(`/orders/${orderId}/items/${itemId}`);
}

/**
 * Records that WhatsApp was opened. The order is not sent yet as far as the
 * system is concerned — confirmOrderSent or revertOrderToDraft decides that.
 */
export async function handOffOrder(orderId: string): Promise<Order> {
  const response = await apiClient.post<Order>(`/orders/${orderId}/handoff`);
  return response.data;
}

/** The user confirmed the WhatsApp message actually went out. */
export async function confirmOrderSent(orderId: string): Promise<Order> {
  const response = await apiClient.post<Order>(`/orders/${orderId}/confirm`);
  return response.data;
}

/** The user says it never went out; the order becomes an editable draft again. */
export async function revertOrderToDraft(orderId: string): Promise<Order> {
  const response = await apiClient.post<Order>(`/orders/${orderId}/revert`);
  return response.data;
}

export async function fetchOrdersAwaitingConfirmation(branchId: string): Promise<Order[]> {
  const response = await apiClient.get<Order[]>(
    `/branches/${branchId}/orders/awaiting-confirmation`,
  );
  return response.data;
}

export async function fetchOrdersForBranch(branchId: string): Promise<Order[]> {
  const response = await apiClient.get<Order[]>(`/branches/${branchId}/orders`);
  return response.data;
}

export async function deleteOrder(orderId: string): Promise<void> {
  await apiClient.delete(`/orders/${orderId}`);
}
