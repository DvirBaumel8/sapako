import { apiClient } from './client';
import type { Provider } from './types';

export async function fetchProvidersForBranch(branchId: string): Promise<Provider[]> {
  const response = await apiClient.get<Provider[]>(`/branches/${branchId}/providers`);
  return response.data;
}

export async function createProvider(
  branchId: string,
  input: { name: string; phone: string },
): Promise<Provider> {
  const response = await apiClient.post<Provider>(`/branches/${branchId}/providers`, input);
  return response.data;
}
