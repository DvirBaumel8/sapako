import { apiClient } from './client';
import type { Provider } from './types';

export async function fetchProvidersForBranch(branchId: string): Promise<Provider[]> {
  const response = await apiClient.get<Provider[]>(`/branches/${branchId}/providers`);
  return response.data;
}

export async function fetchAllProvidersForBranch(branchId: string): Promise<Provider[]> {
  const response = await apiClient.get<Provider[]>(`/branches/${branchId}/providers/all`);
  return response.data;
}

export async function createProvider(
  branchId: string,
  input: { name: string; phone: string; departmentIds: string[] },
): Promise<Provider> {
  const response = await apiClient.post<Provider>(`/branches/${branchId}/providers`, input);
  return response.data;
}

export async function updateProvider(
  id: string,
  input: {
    name?: string;
    phone?: string;
    isActive?: boolean;
    departmentIds?: string[];
  },
): Promise<Provider> {
  const response = await apiClient.patch<Provider>(`/providers/${id}`, input);
  return response.data;
}

export async function deleteProvider(id: string): Promise<void> {
  await apiClient.delete(`/providers/${id}`);
}
