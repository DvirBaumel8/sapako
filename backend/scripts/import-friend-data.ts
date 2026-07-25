import 'dotenv/config';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { Client } from 'pg';

const SUPPLIERS_CSV = '/Users/dvir.baumel/Downloads/all suplluiers.csv';
const PRODUCTS_CSV = '/Users/dvir.baumel/Downloads/all products by provider and his number.csv';
const BRANCH_NAME = 'Hills';
const PLACEHOLDER_PHONE = '0000000000';
const DEFAULT_UNIT_TYPE = "יח'";
const BATCH_SIZE = 500;

interface SupplierRow {
  'קוד ספק': string;
  'שם ספק': string;
}

interface ProductRow {
  'קוד פריט': string;
  'ברקוד': string;
  'תאור פריט': string;
  'שם מחלקה': string;
  'קוד ספק ראשי': string;
  'שם ספק ראשי': string;
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
  const suppliers = readCsv<SupplierRow>(SUPPLIERS_CSV).filter(
    (row) => row['שם ספק'] && row['שם ספק'].trim() !== 'ריק',
  );
  const products = readCsv<ProductRow>(PRODUCTS_CSV);

  console.log(`Parsed ${suppliers.length} suppliers, ${products.length} products.`);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    const branchResult = await client.query<{ id: string }>(
      'INSERT INTO branches (name) VALUES ($1) RETURNING id',
      [BRANCH_NAME],
    );
    const branchId = branchResult.rows[0].id;
    console.log(`Created branch "${BRANCH_NAME}" (${branchId})`);

    const supplierCodeToProviderId = new Map<string, string>();
    for (let i = 0; i < suppliers.length; i += BATCH_SIZE) {
      const batch = suppliers.slice(i, i + BATCH_SIZE);
      const values: string[] = [];
      const params: unknown[] = [];
      batch.forEach((row, idx) => {
        const base = idx * 3;
        values.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
        params.push(branchId, row['שם ספק'].trim(), PLACEHOLDER_PHONE);
      });
      const result = await client.query<{ id: string }>(
        `INSERT INTO providers ("branchId", name, phone) VALUES ${values.join(', ')} RETURNING id`,
        params,
      );
      batch.forEach((row, idx) => {
        supplierCodeToProviderId.set(row['קוד ספק'].trim(), result.rows[idx].id);
      });
    }
    console.log(`Created ${supplierCodeToProviderId.size} providers.`);

    let productsCreated = 0;
    let productsSkipped = 0;
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);
      const values: string[] = [];
      const params: unknown[] = [];
      let batchCount = 0;
      for (const row of batch) {
        const providerId = supplierCodeToProviderId.get(row['קוד ספק ראשי']?.trim());
        const name = row['תאור פריט']?.trim();
        if (!providerId || !name) {
          productsSkipped++;
          continue;
        }
        const barcode = row['ברקוד']?.trim() || null;
        const base = batchCount * 4;
        values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
        params.push(providerId, name, DEFAULT_UNIT_TYPE, barcode);
        batchCount++;
      }
      if (values.length > 0) {
        await client.query(
          `INSERT INTO products ("providerId", name, "unitType", barcode) VALUES ${values.join(', ')}`,
          params,
        );
        productsCreated += batchCount;
      }
    }
    console.log(`Created ${productsCreated} products, skipped ${productsSkipped} (missing supplier match or name).`);

    await client.query('COMMIT');
    console.log('Import committed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Import failed, rolled back:', err);
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
