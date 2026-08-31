import { gtinMatchKey, normalizeGtin } from './gtin';

describe('normalizeGtin', () => {
  it('returns a valid EAN-13 unchanged', () => {
    expect(normalizeGtin('7290000060071')).toBe('7290000060071');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeGtin('  7290000060071 ')).toBe('7290000060071');
  });

  it('strips the AIM symbology identifier a scanner prepends', () => {
    // Eight products in the live database are stored as "]C1729..." — the
    // Code-128/GS1-128 identifier leaked through instead of being stripped,
    // so the product can never be found by scanning it again.
    expect(normalizeGtin(']C17290019721024')).toBe('7290019721024');
  });

  it('pads a UPC-A that lost its leading zero', () => {
    // Spreadsheet imports drop the leading zero of a 12-digit UPC-A, which is
    // how 362 of the products in the live database ended up 11 digits long.
    expect(normalizeGtin('16000185517')).toBe('016000185517');
  });

  it('accepts a valid EAN-8', () => {
    expect(normalizeGtin('73513537')).toBe('73513537');
  });

  it('rejects a code whose check digit does not match', () => {
    expect(normalizeGtin('7290119358607')).toBeNull();
  });

  it('rejects a code too short to be padded to any GTIN length', () => {
    expect(normalizeGtin('140')).toBeNull();
  });

  it('rejects free text that reached the barcode column', () => {
    expect(normalizeGtin('tukuuhz ndi')).toBeNull();
  });

  it('rejects the spreadsheet error value', () => {
    expect(normalizeGtin('#NAME?')).toBeNull();
  });

  it('rejects an empty string', () => {
    expect(normalizeGtin('')).toBeNull();
  });
});

describe('gtinMatchKey', () => {
  it('pads a valid GTIN to 14 digits', () => {
    expect(gtinMatchKey('7290000060071')).toBe('07290000060071');
  });

  it('gives a UPC-A and its zero-stripped form the same key', () => {
    // This is the point of the key: the same physical product recorded in two
    // different lengths has to match a single scan.
    expect(gtinMatchKey('16000185517')).toBe(gtinMatchKey('016000185517'));
  });

  it('returns null for a code that is not a valid GTIN', () => {
    expect(gtinMatchKey('140')).toBeNull();
  });
});
