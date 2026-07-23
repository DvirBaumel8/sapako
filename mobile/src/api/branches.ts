import { apiClient } from './client';
import type { Branch } from './types';

export async function fetchAccessibleBranches(): Promise<Branch[]> {
  const response = await apiClient.get<Branch[]>('/branches');
  return response.data;
}
