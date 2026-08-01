import { apiClient } from './client';
import type { Department } from './types';

export async function fetchDepartments(branchId: string): Promise<Department[]> {
  const response = await apiClient.get<Department[]>(`/branches/${branchId}/departments`);
  return response.data;
}

export async function createDepartment(
  branchId: string,
  input: { name: string },
): Promise<Department> {
  const response = await apiClient.post<Department>(`/branches/${branchId}/departments`, input);
  return response.data;
}

export async function updateDepartment(
  id: string,
  input: { name?: string; isActive?: boolean },
): Promise<Department> {
  const response = await apiClient.patch<Department>(`/departments/${id}`, input);
  return response.data;
}
