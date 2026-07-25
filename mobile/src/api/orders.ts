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

export async function removeOrderItem(orderId: string, itemId: string): Promise<void> {
  await apiClient.delete(`/orders/${orderId}/items/${itemId}`);
}

export async function publishOrder(orderId: string): Promise<Order> {
  const response = await apiClient.post<Order>(`/orders/${orderId}/publish`);
  return response.data;
}

export async function fetchOrdersForBranch(branchId: string): Promise<Order[]> {
  const response = await apiClient.get<Order[]>(`/branches/${branchId}/orders`);
  return response.data;
}
