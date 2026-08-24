import { apiClient } from './client';
import type { Product, ProviderProductSummary } from './types';

export async function fetchProductsForProvider(providerId: string): Promise<Product[]> {
  const response = await apiClient.get<Product[]>(`/providers/${providerId}/products`);
  return response.data;
}

export async function fetchProductsForBranch(branchId: string): Promise<ProviderProductSummary[]> {
  const response = await apiClient.get<ProviderProductSummary[]>(`/branches/${branchId}/products`);
  return response.data;
}

export async function createProduct(
  providerId: string,
  input: { name: string; unitType: string; barcode?: string },
): Promise<Product> {
  const response = await apiClient.post<Product>(`/providers/${providerId}/products`, input);
  return response.data;
}

export async function updateProduct(
  id: string,
  input: { name?: string; unitType?: string; barcode?: string },
): Promise<Product> {
  const response = await apiClient.patch<Product>(`/products/${id}`, input);
  return response.data;
}

export async function deleteProduct(id: string): Promise<void> {
  await apiClient.delete(`/products/${id}`);
}
