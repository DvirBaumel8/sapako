import type { Provider, ProviderProductSummary } from '../api/types';
import { matchScore, tokenize } from '../utils/fuzzySearch';

export interface ProviderSearchResult {
  provider: Provider;
  matchingProducts: ProviderProductSummary[];
}

// A query of only digits is treated as a barcode as well as a name: barcodes
// are matched on a prefix so a partially typed number narrows down, but never
// mid-string — barcodes share long digit runs, and matching those would make
// nearly every query return nearly everything.
const DIGITS_ONLY = /^\d+$/;

function matchesBarcode(product: ProviderProductSummary, query: string): boolean {
  const trimmed = query.trim();
  if (!DIGITS_ONLY.test(trimmed)) return false;
  return !!product.barcode && product.barcode.startsWith(trimmed);
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
      .map((product) => {
        // A barcode hit outranks name scoring: if the user typed a barcode
        // they know exactly which product they want.
        if (matchesBarcode(product, query)) {
          return { product, score: Number.MAX_SAFE_INTEGER };
        }
        return { product, score: matchScore(product.name, queryTokens) };
      })
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
