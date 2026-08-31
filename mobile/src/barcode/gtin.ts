/**
 * GTIN parsing for the barcodes this app stores.
 *
 * A scanned barcode and a typed one reach us in more shapes than the product
 * table suggests: with a scanner's symbology prefix attached, with the leading
 * zero of a UPC-A eaten by a spreadsheet, or as free text somebody pasted into
 * the wrong column. Comparing those with `===` silently fails to find products
 * that are really there, so every barcode is put through here first.
 *
 * Mirrored in backend/src/products/gtin.ts. There is no shared package between
 * the two, so the pair must be changed together — same arrangement as
 * unit-types.ts.
 */

/** The lengths the GS1 standard actually defines. */
const GTIN_LENGTHS = [8, 12, 13, 14];

/**
 * AIM symbology identifiers. A scanner configured to report which symbology it
 * read prepends one of these; it is not part of the barcode.
 */
const AIM_PREFIXES = [']C1', ']E0', ']E4', ']d2', ']Q3'];

/**
 * The GS1 mod-10 check digit, computed right-aligned. Leading zeros cannot
 * change the result, which is what lets a zero-stripped code be padded back.
 */
function hasValidCheckDigit(digits: string): boolean {
  const values = [...digits].map(Number);
  const check = values[values.length - 1];
  const body = values.slice(0, -1).reverse();
  const sum = body.reduce((acc, v, i) => acc + v * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * Reduces a raw barcode to its canonical GTIN, or null when it is not one.
 *
 * Null means "this is not a barcode" — free text, a truncated code, a typo
 * that breaks the check digit. Callers must treat it as no-match rather than
 * falling back to the raw string, or the normalisation buys nothing.
 */
export function normalizeGtin(raw: string): string | null {
  if (!raw) return null;

  let value = raw.trim();
  for (const prefix of AIM_PREFIXES) {
    if (value.startsWith(prefix)) {
      value = value.slice(prefix.length);
      break;
    }
  }

  // Anything left that is not a digit means this was never a barcode. Stripping
  // the stray characters instead would invent a code out of "#NAME?".
  if (!/^\d+$/.test(value)) return null;

  if (GTIN_LENGTHS.includes(value.length)) {
    return hasValidCheckDigit(value) ? value : null;
  }

  // A code between the defined lengths is a GTIN that lost its leading zeros.
  // Padding up to the next defined length restores it; the check digit then
  // confirms whether that guess was right.
  const target = GTIN_LENGTHS.find((length) => length > value.length);
  if (target === undefined) return null;
  const padded = value.padStart(target, '0');
  return hasValidCheckDigit(padded) ? padded : null;
}

/**
 * The form to compare two barcodes on: a valid GTIN padded to 14 digits.
 *
 * GTIN-8, UPC-A and EAN-13 are the same identifier at different widths, so the
 * widest one is the only representation in which equality is meaningful.
 */
export function gtinMatchKey(raw: string): string | null {
  const normalized = normalizeGtin(raw);
  return normalized === null ? null : normalized.padStart(14, '0');
}
