import { apiClient } from './client';
import type { Order } from './types';

export interface AdminNotificationItem {
  id: string;
  isRead: boolean;
  createdAt: string;
  order: Order;
}

export async function fetchNotifications(
  params: { offset?: number; limit?: number } = {},
): Promise<AdminNotificationItem[]> {
  const response = await apiClient.get<AdminNotificationItem[]>('/notifications', { params });
  return response.data;
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const response = await apiClient.get<{ count: number }>('/notifications/unread-count');
  return response.data.count;
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiClient.patch(`/notifications/${id}/read`);
}

export async function deleteNotification(id: string): Promise<void> {
  await apiClient.delete(`/notifications/${id}`);
}
