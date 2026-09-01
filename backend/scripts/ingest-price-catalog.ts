import 'dotenv/config';
import { gunzipSync } from 'zlib';
import { Client } from 'pg';
import { parsePriceFeed, CatalogRow } from '../src/catalog/parsePriceFeed';
import {
  CERBERUS_CHAINS,
  extractCsrfToken,
  selectPriceFullFiles,
} from '../src/catalog/cerberus';
import { describeTarget } from '../src/database/describeTarget';

/**
 * Fills catalog_items from Israel's retail price-transparency feeds.
 *
 * Chains are required by the 2015 transparency law to publish their full
 * catalogue as gzipped XML, with no key and no authentication worth the name.
 * That is where the Hebrew product names come from — GS1's own registry is
 * member-gated, returns thinner data, and only covers products whose brand
 * owner chose to register them.
 *
 * Reading one chain covered 28% of the shop's catalogue. Reading all of these
 * covers about 60%, because a supplier-facing catalogue looks nothing like any
 * single supermarket's shelf. רמי לוי alone accounts for half of that gain.
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

/** Store files to read per chain. The catalogue saturates well before this. */
const FILES_PER_CHAIN = Number(process.argv[2] ?? 12);

/** Downloads run in parallel within a chain; these are modest hosts. */
const CONCURRENCY = 6;

const SHUFERSAL_CATEGORY_URL =
  'https://prices.shufersal.co.il/FileObject/UpdateCategory?catID=2&storeId=0';
const CERBERUS = 'https://url.publishedprices.co.il';

function inflate(buffer: ArrayBuffer): string {
  return gunzipSync(Buffer.from(buffer)).toString('utf-8');
}

async function inBatches<T>(
  items: T[],
  run: (item: T) => Promise<CatalogRow[]>,
): Promise<CatalogRow[]> {
  const collected: CatalogRow[] = [];
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = await Promise.all(items.slice(i, i + CONCURRENCY).map(run));
    for (const rows of batch) collected.push(...rows);
  }
  return collected;
}

/**
 * Shufersal publishes over plain HTML pages rather than through Cerberus, so
 * it needs its own listing step. The files themselves are identical.
 */
async function readShufersal(): Promise<CatalogRow[]> {
  const links: string[] = [];
  for (let page = 1; page <= 10 && links.length < FILES_PER_CHAIN; page++) {
    const response = await fetch(`${SHUFERSAL_CATEGORY_URL}&page=${page}`);
    if (!response.ok) break;
    const found = [
      ...(await response.text()).matchAll(
        /href="([^"]*PriceFull[^"]*\.gz[^"]*)"/g,
      ),
    ].map((match) => match[1].replaceAll('&amp;', '&'));
    if (found.length === 0) break;
    links.push(...found);
  }

  return inBatches([...new Set(links)].slice(0, FILES_PER_CHAIN), async (url) => {
    const response = await fetch(url);
    if (!response.ok) return [];
    return parsePriceFeed(inflate(await response.arrayBuffer()), 'shufersal');
  });
}

/**
 * Logs into Cerberus for one chain and reads its catalogue.
 *
 * Three things here are easy to get wrong and all of them fail silently: the
 * password is genuinely empty, the CSRF token lives in a meta tag rather than
 * in the form, and the directory listing returns nothing until /file has been
 * fetched on the same session.
 */
async function readCerberusChain(
  username: string,
  source: string,
): Promise<CatalogRow[]> {
  // Keyed by cookie name so the session cookie issued at login replaces the
  // anonymous one from the login page. Built on getSetCookie() rather than
  // headers.get('set-cookie'), which collapses multiple cookies into one
  // string and quietly loses the session — the listing then answers with the
  // login page instead of JSON.
  const jar = new Map<string, string>();
  const remember = (response: Response): void => {
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(';');
      const separator = pair.indexOf('=');
      if (separator > 0) {
        jar.set(pair.slice(0, separator).trim(), pair.slice(separator + 1));
      }
    }
  };
  const cookies = (): string =>
    [...jar].map(([name, value]) => `${name}=${value}`).join('; ');

  const loginPage = await fetch(`${CERBERUS}/login`);
  remember(loginPage);
  const token = extractCsrfToken(await loginPage.text());
  if (!token) throw new Error('no CSRF token on the login page');

  remember(
    await fetch(`${CERBERUS}/login/user`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookies(),
      },
      body: new URLSearchParams({
        r: '',
        username,
        password: '',
        csrftoken: token,
      }),
      redirect: 'manual',
    }),
  );

  // The file page has to be fetched before the listing will return rows — and
  // it also carries a *fresh* CSRF token. The one from the login page is dead
  // by now, and reusing it yields an empty listing rather than an error.
  const filePage = await fetch(`${CERBERUS}/file`, {
    headers: { cookie: cookies() },
  });
  remember(filePage);
  const sessionToken = extractCsrfToken(await filePage.text()) ?? token;

  const listing = await fetch(`${CERBERUS}/file/json/dir`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: cookies(),
    },
    body: new URLSearchParams({
      sEcho: '1',
      iDisplayStart: '0',
      iDisplayLength: '2000',
      cd: '/',
      csrftoken: sessionToken,
    }),
  });
  const rows = (await listing.json()) as { aaData?: { name?: string }[] };
  const files = selectPriceFullFiles(rows.aaData ?? [], FILES_PER_CHAIN);
  if (files.length === 0) throw new Error('no PriceFull files listed');

  return inBatches(files, async (name) => {
    const response = await fetch(
      `${CERBERUS}/file/d/${encodeURIComponent(name)}`,
      { headers: { cookie: cookies() } },
    );
    if (!response.ok) return [];
    return parsePriceFeed(inflate(await response.arrayBuffer()), source);
  });
}

async function upsert(client: Client, rows: CatalogRow[]): Promise<void> {
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
  console.log(`writing to ${describeTarget(process.env.DATABASE_URL)}\n`);

  // Keyed by GTIN so one product read from eight chains becomes one row. The
  // first chain to report it supplies the name, which is why the source order
  // is deliberate rather than alphabetical.
  const byGtin = new Map<string, CatalogRow>();
  const add = (rows: CatalogRow[]): number => {
    let added = 0;
    for (const row of rows) {
      if (!byGtin.has(row.gtin)) {
        byGtin.set(row.gtin, row);
        added++;
      }
    }
    return added;
  };

  const sources: [string, () => Promise<CatalogRow[]>][] = [
    ['shufersal', readShufersal],
    ...CERBERUS_CHAINS.map(
      ({ username, source }): [string, () => Promise<CatalogRow[]>] => [
        source,
        () => readCerberusChain(username, source),
      ],
    ),
  ];

  for (const [label, read] of sources) {
    try {
      const added = add(await read());
      console.log(
        `  ${label.padEnd(14)} +${String(added).padEnd(6)} → ${byGtin.size} products`,
      );
    } catch (error) {
      // One chain being down must not cost the other seven. This catalogue is
      // a convenience, and a partial refresh beats no refresh.
      console.warn(`  ${label.padEnd(14)} skipped: ${(error as Error).message}`);
    }
  }

  const rows = [...byGtin.values()];
  if (rows.length === 0) {
    throw new Error('no products parsed — the feed format has probably moved');
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL === 'true'
        ? { rejectUnauthorized: false }
        : undefined,
  });
  await client.connect();
  try {
    await upsert(client, rows);
    const { rows: counted } = await client.query<{ count: string }>(
      'SELECT count(*) FROM catalog_items',
    );
    console.log(`\ncatalog_items now holds ${counted[0].count} products`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
