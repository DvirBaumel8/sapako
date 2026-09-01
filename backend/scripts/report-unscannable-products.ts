import 'dotenv/config';
import { Client } from 'pg';
import { classifyBarcode, BarcodeProblem } from '../src/products/classifyBarcode';
import { describeTarget } from '../src/database/describeTarget';

/**
 * Lists the products a scan can never find, grouped by provider so somebody
 * can walk the shelf with the list and fix them.
 *
 * Read-only. It writes nothing and is safe to run against production.
 *
 * The categories are not equally worth your time, so they are reported in
 * order of how fixable they are rather than how many there are:
 *
 *   bad-check-digit  the right length and entirely plausible, so nobody ever
 *                    notices — but one digit is wrong and the real product
 *                    will never match. Chase these first.
 *   not-numeric      free text in the barcode column. Nothing to salvage;
 *                    needs re-scanning from the physical product.
 *   too-short        usually a supplier's own internal code. Often fine as
 *                    it is, since typing it by hand still matches exactly.
 *   missing          no barcode at all.
 */

const EXPLANATION: Record<Exclude<BarcodeProblem, 'ok'>, string> = {
  'bad-check-digit':
    'right length, wrong check digit — almost certainly one mistyped digit',
  'not-numeric': 'not a number at all — needs re-scanning from the product',
  'too-short': "too short for a GTIN — probably a supplier's internal code",
  missing: 'no barcode recorded',
};

const ORDER: Exclude<BarcodeProblem, 'ok'>[] = [
  'bad-check-digit',
  'not-numeric',
  'too-short',
  'missing',
];

interface Row {
  id: string;
  name: string;
  barcode: string | null;
  providerName: string;
}

async function main(): Promise<void> {
  console.log(`reading ${describeTarget(process.env.DATABASE_URL)}\n`);

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL === 'true'
        ? { rejectUnauthorized: false }
        : undefined,
  });
  await client.connect();

  try {
    const { rows } = await client.query<Row>(`
      SELECT p.id, p.name, p.barcode, pr.name AS "providerName"
      FROM products p
      JOIN providers pr ON pr.id = p."providerId"
      WHERE p."isActive" = true
      ORDER BY pr.name, p.name
    `);

    const byProblem = new Map<BarcodeProblem, Row[]>();
    for (const row of rows) {
      const problem = classifyBarcode(row.barcode);
      if (problem === 'ok') continue;
      const bucket = byProblem.get(problem) ?? [];
      bucket.push(row);
      byProblem.set(problem, bucket);
    }

    let total = 0;
    for (const problem of ORDER) {
      const found = byProblem.get(problem) ?? [];
      if (found.length === 0) continue;
      total += found.length;
      console.log(`\n## ${problem} — ${found.length} products`);
      console.log(`   ${EXPLANATION[problem]}\n`);
      let lastProvider = '';
      for (const row of found) {
        if (row.providerName !== lastProvider) {
          console.log(`  ${row.providerName}`);
          lastProvider = row.providerName;
        }
        console.log(`    ${(row.barcode ?? '(none)').padEnd(18)} ${row.name}`);
      }
    }

    // A barcode on two products is worse than a missing one: a scan finds
    // whichever the list happens to reach first, silently.
    const { rows: duplicates } = await client.query<{
      barcode: string;
      names: string;
    }>(`
      SELECT p.barcode, string_agg(pr.name || ' / ' || p.name, '  |  ') AS names
      FROM products p
      JOIN providers pr ON pr.id = p."providerId"
      WHERE p.barcode IS NOT NULL AND p."isActive" = true
      GROUP BY p.barcode
      HAVING count(*) > 1
    `);

    if (duplicates.length > 0) {
      console.log(
        `\n## duplicate — ${duplicates.length} barcodes on more than one product`,
      );
      console.log(
        '   a scan finds whichever product comes first, with no warning\n',
      );
      for (const duplicate of duplicates) {
        console.log(`    ${duplicate.barcode}  ${duplicate.names}`);
      }
    }

    console.log(
      `\n${total} of ${rows.length} active products cannot be found by their barcode.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
