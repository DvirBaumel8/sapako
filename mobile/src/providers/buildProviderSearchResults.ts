import type { Provider, ProviderProductSummary } from '../api/types';
import { matchScore, tokenize } from '../utils/fuzzySearch';

export interface ProviderSearchResult {
  provider: Provider;
  matchingProducts: ProviderProductSummary[];
}

export function buildProviderSearchResults(
  providers: Provider[],
  products: ProviderProductSummary[],
  query: string,
): ProviderSearchResult[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return providers.map((provider) => ({ provider, matchingProducts: [] }));
  }

  const scored: (ProviderSearchResult & { score: number })[] = [];
  for (const provider of providers) {
    const scoredProducts = products
      .filter((product) => product.providerId === provider.id)
      .map((product) => ({ product, score: matchScore(product.name, queryTokens) }))
      .filter((entry): entry is { product: ProviderProductSummary; score: number } => entry.score !== null)
      .sort((a, b) => b.score - a.score);

    const providerScore = matchScore(provider.name, queryTokens);
    const bestProductScore = scoredProducts[0]?.score;
    if (providerScore === null && bestProductScore === undefined) continue;

    scored.push({
      provider,
      matchingProducts: scoredProducts.map((entry) => entry.product),
      score: Math.max(providerScore ?? -Infinity, bestProductScore ?? -Infinity),
    });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .map(({ provider, matchingProducts }) => ({ provider, matchingProducts }));
}
