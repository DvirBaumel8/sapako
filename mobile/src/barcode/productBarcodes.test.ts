import { productBarcodes, productMatchesBarcode } from './productBarcodes';

describe('productBarcodes', () => {
  it('lists the main barcode first, then the additional ones, skipping blanks', () => {
    expect(productBarcodes({ barcode: '1', additionalBarcodes: ['2', ''] })).toEqual(['1', '2']);
    expect(productBarcodes({ barcode: undefined, additionalBarcodes: undefined })).toEqual([]);
  });
});

describe('productMatchesBarcode', () => {
  const product = { barcode: '7290000000534', additionalBarcodes: ['7290003706020', '27'] };

  it('matches the main barcode', () => {
    expect(productMatchesBarcode(product, '7290000000534')).toBe(true);
  });

  it('matches an additional GTIN, including with a scanner prefix', () => {
    expect(productMatchesBarcode(product, '7290003706020')).toBe(true);
    expect(productMatchesBarcode(product, ']E07290003706020')).toBe(true);
  });

  it('matches a short supplier code exactly, not by prefix', () => {
    expect(productMatchesBarcode(product, '27')).toBe(true);
    expect(productMatchesBarcode(product, '2')).toBe(false);
  });

  it('matches nothing for a product with no barcodes', () => {
    expect(productMatchesBarcode({ barcode: undefined }, '27')).toBe(false);
  });
});
