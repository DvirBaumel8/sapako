import { apiClient } from './client';
import type { Category } from './types';

export async function fetchCategoriesForProvider(providerId: string): Promise<Category[]> {
  const response = await apiClient.get<Category[]>(`/providers/${providerId}/categories`);
  return response.data;
}

export async function createCategory(
  providerId: string,
  input: { name: string },
): Promise<Category> {
  const response = await apiClient.post<Category>(`/providers/${providerId}/categories`, input);
  return response.data;
}

export async function updateCategory(
  id: string,
  input: { name: string },
): Promise<Category> {
  const response = await apiClient.patch<Category>(`/categories/${id}`, input);
  return response.data;
}

export async function deleteCategory(id: string): Promise<void> {
  await apiClient.delete(`/categories/${id}`);
}
