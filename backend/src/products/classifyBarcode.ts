import { normalizeGtin } from './gtin';

export type BarcodeProblem =
  'ok' | 'missing' | 'not-numeric' | 'too-short' | 'bad-check-digit';

/** The shortest GTIN the standard defines. */
const SHORTEST_GTIN = 8;

/**
 * Sorts a stored barcode into why it cannot be matched, for the report that
 * hands the list back to a human.
 *
 * The categories are ordered by how fixable they are, not by how common:
 * `bad-check-digit` is the one worth chasing, because the code is the right
 * length and looks entirely plausible, so nobody notices that a scan of the
 * real product will never match it.
 */
export function classifyBarcode(barcode: string | null): BarcodeProblem {
  if (!barcode) return 'missing';
  if (normalizeGtin(barcode) !== null) return 'ok';
  if (!/^\d+$/.test(barcode.trim())) return 'not-numeric';
  if (barcode.trim().length < SHORTEST_GTIN) return 'too-short';
  return 'bad-check-digit';
}
