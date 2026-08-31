import { apiClient } from './client';
import type { Role, UserWithAccess } from './types';

export async function fetchUsers(): Promise<UserWithAccess[]> {
  const response = await apiClient.get<UserWithAccess[]>('/users');
  return response.data;
}

export async function createUser(input: { username: string; password: string; role: Role }): Promise<UserWithAccess> {
  const response = await apiClient.post<UserWithAccess>('/users', input);
  return response.data;
}

export async function deleteUser(userId: string): Promise<void> {
  await apiClient.delete(`/users/${userId}`);
}
