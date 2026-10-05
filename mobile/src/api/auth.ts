import { apiClient } from './client';
import type { Me } from './types';

export async function login(username: string, password: string): Promise<string> {
  const response = await apiClient.post<{ accessToken: string }>('/auth/login', { username, password });
  return response.data.accessToken;
}

export async function fetchMe(): Promise<Me> {
  const response = await apiClient.get<Me>('/auth/me');
  return response.data;
}
