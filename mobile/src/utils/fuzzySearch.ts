export function tokenize(text: string): string[] {
  return text.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Scores how well `candidate` matches `queryTokens`, or returns null if it
 * doesn't match at all. A candidate matches when every query token appears
 * *somewhere* in it, independent of word order — so a query of "חלב ביצה"
 * also finds a product named "ביצה חלב". Higher score = more relevant:
 * exact matches and whole-word matches outrank a token that's merely
 * buried mid-word, and shorter/more specific candidates rank above longer
 * ones that happen to contain the same tokens.
 */
export function matchScore(candidate: string, queryTokens: string[]): number | null {
  const normalized = candidate.trim().toLowerCase();
  if (queryTokens.some((token) => !normalized.includes(token))) {
    return null;
  }

  const words = normalized.split(/\s+/);
  let score = 0;
  if (normalized === queryTokens.join(' ')) score += 100;
  for (const token of queryTokens) {
    if (words.includes(token)) score += 10;
    else if (words.some((word) => word.startsWith(token))) score += 5;
  }
  score -= normalized.length * 0.01;
  return score;
}

/** Filters+sorts `items` by fuzzy relevance of `getText(item)` against `query`. Empty query returns `items` unchanged. */
export function fuzzySearch<T>(items: T[], query: string, getText: (item: T) => string): T[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return items;

  return items
    .map((item) => ({ item, score: matchScore(getText(item), queryTokens) }))
    .filter((entry): entry is { item: T; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
}
