import 'dotenv/config';
import { gunzipSync } from 'zlib';
import { Client } from 'pg';
import { parsePriceFeed, CatalogRow } from '../src/catalog/parsePriceFeed';
import { describeTarget } from '../src/database/describeTarget';

/**
 * Fills catalog_items from Israel's retail price-transparency feeds.
 *
 * Chains are required by the 2015 transparency law to publish their full
 * catalogue as gzipped XML, with no key and no authentication. That is where
 * the Hebrew product names come from — GS1's own registry is member-gated,
 * returns thinner data, and only covers products whose brand owner chose to
 * register them.
 *
 * Only names, brands and units are taken. The prices in these files are the
 * consumer shelf price at one branch of one supermarket; they have nothing to
 * do with what a supplier charges this shop, and storing them would invite
 * somebody to believe otherwise.
 *
 * Run on demand — `npm run catalog:ingest` — not on a schedule. Product names
 * change on the order of years, and docs/DEPLOYMENT.md already sets out why
 * this repo does not trust a GitHub Actions cron for timing.
 */

const SOURCE = 'shufersal';
const CATEGORY_URL =
  'https://prices.shufersal.co.il/FileObject/UpdateCategory?catID=2&storeId=0';

/** How many store files to read. The catalogue saturates well before this. */
const MAX_FILES = Number(process.argv[2] ?? 40);

/** Downloads run in parallel; the host is fine with it and it is 40 files. */
const CONCURRENCY = 8;

async function fetchPriceFullLinks(): Promise<string[]> {
  const links: string[] = [];
  for (let page = 1; page <= 10; page++) {
    const response = await fetch(`${CATEGORY_URL}&page=${page}`);
    if (!response.ok) break;
    const html = await response.text();
    const found = [...html.matchAll(/href="([^"]*PriceFull[^"]*\.gz[^"]*)"/g)]
      .map((match) => match[1].replaceAll('&amp;', '&'));
    if (found.length === 0) break;
    links.push(...found);
    if (links.length >= MAX_FILES) break;
  }
  // The same store can appear on more than one page as files are published.
  return [...new Set(links)].slice(0, MAX_FILES);
}

async function fetchRows(url: string): Promise<CatalogRow[]> {
  const response = await fetch(url);
  if (!response.ok) {
    console.warn(`  skipped a file: HTTP ${response.status}`);
    return [];
  }
  const xml = gunzipSync(Buffer.from(await response.arrayBuffer())).toString(
    'utf-8',
  );
  return parsePriceFeed(xml, SOURCE);
}

async function collectRows(links: string[]): Promise<Map<string, CatalogRow>> {
  // Keyed by GTIN, so the same product in twenty stores becomes one row and
  // the first spelling of its name wins.
  const byGtin = new Map<string, CatalogRow>();
  for (let i = 0; i < links.length; i += CONCURRENCY) {
    const batch = await Promise.all(
      links.slice(i, i + CONCURRENCY).map(fetchRows),
    );
    for (const rows of batch) {
      for (const row of rows) {
        if (!byGtin.has(row.gtin)) byGtin.set(row.gtin, row);
      }
    }
    console.log(
      `  ${Math.min(i + CONCURRENCY, links.length)}/${links.length} files → ${byGtin.size} products`,
    );
  }
  return byGtin;
}

async function upsert(client: Client, rows: CatalogRow[]): Promise<void> {
  // One statement per chunk rather than per row: 13k round trips takes
  // minutes, this takes seconds.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values: unknown[] = [];
    const tuples = chunk.map((row, index) => {
      const base = index * 5;
      values.push(row.gtin, row.name, row.brand, row.unitType, row.source);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, now())`;
    });
    await client.query(
      `INSERT INTO catalog_items (gtin, name, brand, "unitType", source, "updatedAt")
       VALUES ${tuples.join(', ')}
       ON CONFLICT (gtin) DO UPDATE SET
         name = EXCLUDED.name,
         brand = EXCLUDED.brand,
         "unitType" = EXCLUDED."unitType",
         source = EXCLUDED.source,
         "updatedAt" = now()`,
      values,
    );
  }
}

async function main(): Promise<void> {
  // Printed before any work, because DATABASE_URL falls back to .env: a
  // forgotten prefix sends a production import to localhost without a word.
  console.log(`writing to ${describeTarget(process.env.DATABASE_URL)}`);

  const links = await fetchPriceFullLinks();
  console.log(`found ${links.length} catalogue files`);

  const byGtin = await collectRows(links);
  const rows = [...byGtin.values()];
  if (rows.length === 0) {
    throw new Error('no products parsed — the feed format has probably moved');
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    await upsert(client, rows);
    const { rows: counted } = await client.query<{ count: string }>(
      'SELECT count(*) FROM catalog_items',
    );
    console.log(`catalog_items now holds ${counted[0].count} products`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
