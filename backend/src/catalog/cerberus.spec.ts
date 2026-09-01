import { extractCsrfToken, selectPriceFullFiles } from './cerberus';

describe('extractCsrfToken', () => {
  it('reads the token from the meta tag', () => {
    // The login form has no csrftoken input; the token is only in a meta tag,
    // which is what makes a form-scraping login silently post an empty one.
    const html = `<head><meta name="csrftoken" content="8q46gaXz-PaQ4"/></head>`;

    expect(extractCsrfToken(html)).toBe('8q46gaXz-PaQ4');
  });

  it('returns null when the page has no token', () => {
    expect(extractCsrfToken('<head></head>')).toBeNull();
  });
});

describe('selectPriceFullFiles', () => {
  const rows = [
    { name: 'PriceFull7290058140886-001-001-20260901-070016.gz' },
    { name: 'Price7290058140886-001-001-20260901-070016.gz' },
    { name: 'PromoFull7290058140886-001-001-20260901-070016.gz' },
    { name: 'PriceFull7290058140886-001-002-20260901-070016.gz' },
    { name: 'PriceFull7290058140886-001-003-20260901-070016.gz' },
  ];

  it('keeps only the full price files', () => {
    // "Price" without "Full" is an hourly delta holding a handful of items,
    // and "PromoFull" is discounts, not the catalogue.
    expect(selectPriceFullFiles(rows, 10)).toEqual([
      'PriceFull7290058140886-001-001-20260901-070016.gz',
      'PriceFull7290058140886-001-002-20260901-070016.gz',
      'PriceFull7290058140886-001-003-20260901-070016.gz',
    ]);
  });

  it('caps the number of files taken', () => {
    expect(selectPriceFullFiles(rows, 2)).toHaveLength(2);
  });

  it('ignores rows with no name', () => {
    expect(selectPriceFullFiles([{}, { name: undefined }], 10)).toEqual([]);
  });

  it('returns nothing when the listing is empty', () => {
    expect(selectPriceFullFiles([], 10)).toEqual([]);
  });
});
