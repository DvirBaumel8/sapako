import { gtinMatchKey } from './gtin';

/**
 * Whether a stored barcode is the one that was just scanned.
 *
 * Two barcodes are the same product when they are the same GTIN, whatever
 * width each was written in and whether or not a scanner left its symbology
 * prefix on the front.
 *
 * When the scan is not a GTIN the comparison falls back to exact equality:
 * several hundred products carry a supplier's own internal code, which no
 * check digit will ever validate but which is still that shop's identifier.
 * Codes that both fail to parse are never equal on that basis alone, or every
 * unreadable barcode would match every other one.
 */
export function matchesBarcode(stored: string, scanned: string): boolean {
  if (!stored || !scanned) return false;
  const scannedKey = gtinMatchKey(scanned);
  if (scannedKey === null) return stored === scanned;
  return gtinMatchKey(stored) === scannedKey;
}
