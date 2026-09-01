/**
 * Helpers for the Cerberus price portal (url.publishedprices.co.il), which
 * publishes the feeds for most Israeli chains other than Shufersal.
 *
 * The login is a per-chain username with an *empty* password. The awkward part
 * is the CSRF token: it appears only in a `<meta>` tag, never as a form input,
 * so a login built by scraping the form posts an empty token and fails in a
 * way that looks like bad credentials.
 */

/** Which chains to read, and the name each is recorded under. */
export const CERBERUS_CHAINS: { username: string; source: string }[] = [
  // Ordered by how much each adds to coverage, measured against the shop's
  // own catalogue: רמי לוי alone is worth more than the other five together.
  { username: 'RamiLevi', source: 'rami-levi' },
  { username: 'TivTaam', source: 'tiv-taam' },
  { username: 'yohananof', source: 'yohananof' },
  { username: 'Keshet', source: 'keshet' },
  { username: 'SalachD', source: 'salach-dabach' },
  { username: 'osherad', source: 'osher-ad' },
  { username: 'freshmarket', source: 'fresh-market' },
];

export function extractCsrfToken(html: string): string | null {
  const match = /name="csrftoken"\s+content="([^"]+)"/.exec(html);
  return match ? match[1] : null;
}

/**
 * Picks the full-catalogue files out of a directory listing.
 *
 * "Price" without "Full" is an hourly delta holding a handful of changed
 * items, and "PromoFull" is discounts rather than the catalogue — taking
 * either would mean thousands of requests for almost no products.
 */
export function selectPriceFullFiles(
  rows: { name?: string }[],
  limit: number,
): string[] {
  return rows
    .map((row) => row.name)
    .filter((name): name is string => !!name && name.startsWith('PriceFull'))
    .slice(0, limit);
}
