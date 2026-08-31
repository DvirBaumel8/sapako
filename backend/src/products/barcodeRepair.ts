import { normalizeGtin } from './gtin';

export interface StoredBarcode {
  id: string;
  barcode: string | null;
}

export interface BarcodeRepair {
  id: string;
  from: string;
  to: string;
}

/**
 * Works out which stored barcodes can be rewritten into their canonical GTIN.
 *
 * Kept apart from the migration that applies it so the decision is testable
 * without a database, and so the same plan can be printed before it is run.
 *
 * A row is only ever rewritten to a *valid* GTIN. Anything unrecoverable is
 * left exactly as it is: it is the only surviving clue to what the product is,
 * and somebody may still recognise a supplier's internal code by eye.
 */
export function planBarcodeRepairs(rows: StoredBarcode[]): BarcodeRepair[] {
  const repairs: BarcodeRepair[] = [];
  for (const { id, barcode } of rows) {
    if (!barcode) continue;
    const normalized = normalizeGtin(barcode);
    if (normalized === null || normalized === barcode) continue;
    repairs.push({ id, from: barcode, to: normalized });
  }
  return repairs;
}
