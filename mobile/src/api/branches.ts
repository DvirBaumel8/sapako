import { apiClient } from './client';
import type { Branch } from './types';

export async function fetchAccessibleBranches(): Promise<Branch[]> {
  const response = await apiClient.get<Branch[]>('/branches');
  return response.data;
}

export async function createBranch(input: { name: string; address?: string }): Promise<Branch> {
  const response = await apiClient.post<Branch>('/branches', input);
  return response.data;
}
