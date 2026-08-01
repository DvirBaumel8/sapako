import type { Provider, ProviderProductSummary } from '../api/types';

export interface ProviderSearchResult {
  provider: Provider;
  matchingProducts: ProviderProductSummary[];
}

export function buildProviderSearchResults(
  providers: Provider[],
  products: ProviderProductSummary[],
  query: string,
): ProviderSearchResult[] {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return providers.map((provider) => ({ provider, matchingProducts: [] }));
  }

  const results: ProviderSearchResult[] = [];
  for (const provider of providers) {
    const matchingProducts = products.filter(
      (product) => product.providerId === provider.id && product.name.includes(trimmedQuery),
    );
    const providerNameMatches = provider.name.includes(trimmedQuery);
    if (providerNameMatches || matchingProducts.length > 0) {
      results.push({ provider, matchingProducts });
    }
  }
  return results;
}
