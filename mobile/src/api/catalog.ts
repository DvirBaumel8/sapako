import { apiClient } from './client';

export interface CatalogItem {
  name: string;
  brand?: string;
  /** Already one of UNIT_TYPES, or null when the source had no counterpart. */
  unitType?: string | null;
}

/**
 * Looks a barcode up in the reference catalogue.
 *
 * Answers null rather than throwing when nothing matches — most scans of an
 * unknown product miss, and the endpoint reports that as an ordinary 200.
 */
export async function lookupCatalogItem(barcode: string): Promise<CatalogItem | null> {
  const response = await apiClient.get<{ item: CatalogItem | null }>(
    `/catalog/lookup/${encodeURIComponent(barcode)}`,
  );
  return response.data.item;
}
