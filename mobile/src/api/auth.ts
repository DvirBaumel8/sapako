import { apiClient } from './client';

export async function login(username: string, password: string): Promise<string> {
  const response = await apiClient.post<{ accessToken: string }>('/auth/login', { username, password });
  return response.data.accessToken;
}
