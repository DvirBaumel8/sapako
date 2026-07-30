import 'dotenv/config';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { Client } from 'pg';

const SUPPLIERS_CSV = '/Users/dvir.baumel/Downloads/all suplluiers with phones and names .csv';

interface SupplierPhoneRow {
  'קוד ספק': string;
  'שם ספק': string;
  'שם הסוכן + טלפון': string;
}

function readCsv<T>(path: string): T[] {
  const raw = readFileSync(path);
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  }) as T[];
}

async function main() {
  const rows = readCsv<SupplierPhoneRow>(SUPPLIERS_CSV).filter(
    (row) => row['שם הסוכן + טלפון']?.trim(),
  );
  console.log(`Parsed ${rows.length} suppliers with a phone/agent value.`);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    let updated = 0;
    let notFound = 0;
    for (const row of rows) {
      const name = row['שם ספק']?.trim();
      const phone = row['שם הסוכן + טלפון']?.trim();
      if (!name || !phone) continue;

      const result = await client.query('UPDATE providers SET phone = $1 WHERE name = $2', [
        phone,
        name,
      ]);
      if (result.rowCount && result.rowCount > 0) {
        updated += result.rowCount;
      } else {
        notFound++;
        console.log(`No matching provider for "${name}"`);
      }
    }

    console.log(`Updated ${updated} providers, ${notFound} names had no match.`);
    await client.query('COMMIT');
    console.log('Update committed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update failed, rolled back:', err);
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
