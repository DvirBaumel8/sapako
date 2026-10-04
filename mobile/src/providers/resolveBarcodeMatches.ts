import type { Provider, ProviderProductSummary } from '../api/types';
import { productMatchesBarcode } from '../barcode/productBarcodes';

export interface BarcodeMatch {
  providerId: string;
  providerName: string;
  productId: string;
}

export function resolveBarcodeMatches(
  providers: Provider[],
  products: ProviderProductSummary[],
  barcode: string,
): BarcodeMatch[] {
  const providersById = new Map(providers.map((provider) => [provider.id, provider]));
  const matches: BarcodeMatch[] = [];
  for (const product of products) {
    if (!productMatchesBarcode(product, barcode)) continue;
    const provider = providersById.get(product.providerId);
    if (!provider) continue;
    matches.push({ providerId: provider.id, providerName: provider.name, productId: product.id });
  }
  return matches;
}
