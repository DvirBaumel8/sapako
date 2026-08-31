import 'dotenv/config';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { Client } from 'pg';

// Taken as an argument rather than hardcoded, for the same reason as
// import-friend-data.ts.
const SUPPLIERS_CSV = process.argv[2];

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

const PHONE_PATTERN = /05\d{8}|07[2-9]\d{7}/;
// The same numbers as they appear when a spreadsheet stored the cell as a
// number and ate the leading zero. Anchored against neighbouring digits so a
// run that merely contains nine digits is not padded into a phone number.
const MISSING_LEADING_ZERO_PATTERN = /(?<!\d)(5\d{8}|7[2-9]\d{7})(?!\d)/;

/**
 * The source column mixes an agent name with the phone number in no fixed
 * order (e.g. "גל 0502290989", "0543319864 - רוני"). Extract just the phone
 * number and drop the name. Returns null when no unambiguous match is found
 * (e.g. a stray digit touching the match suggests a typo in the source data)
 * so callers can flag the row for manual review instead of writing bad data.
 */
export function extractPhoneNumber(raw: string): string | null {
  const match = raw.match(PHONE_PATTERN);
  if (match && match.index !== undefined) {
    const before = raw[match.index - 1];
    const after = raw[match.index + match[0].length];
    if ((before && /\d/.test(before)) || (after && /\d/.test(after))) {
      // A stray digit touching the match means the source is malformed and
      // there is more than one way to read it. Do not fall through to the
      // recovery below — guessing here sends someone's order to a stranger.
      return null;
    }
    return match[0];
  }

  const missingZero = raw.match(MISSING_LEADING_ZERO_PATTERN);
  return missingZero ? `0${missingZero[1]}` : null;
}

async function main() {
  if (!SUPPLIERS_CSV) {
    console.error(
      'Usage: ts-node scripts/update-provider-phones.ts <suppliers-with-phones.csv>',
    );
    process.exit(1);
  }
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
    let skipped = 0;
    for (const row of rows) {
      const name = row['שם ספק']?.trim();
      const rawPhone = row['שם הסוכן + טלפון']?.trim();
      if (!name || !rawPhone) continue;

      const phone = extractPhoneNumber(rawPhone);
      if (!phone) {
        skipped++;
        console.log(`Could not extract a phone number for "${name}" from "${rawPhone}"`);
        continue;
      }

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

    console.log(
      `Updated ${updated} providers, ${notFound} names had no match, ${skipped} skipped (unparseable phone).`,
    );
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

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
