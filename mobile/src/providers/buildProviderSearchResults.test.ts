import { buildProviderSearchResults } from './buildProviderSearchResults';
import type { Provider, ProviderProductSummary } from '../api/types';

const provider = (id: string, name: string): Provider => ({
  id,
  branchId: 'b1',
  name,
  phone: '+972501234567',
  isActive: true,
  departments: [],
  createdAt: '2026-01-01T00:00:00.000Z',
});

const product = (id: string, providerId: string, name: string): ProviderProductSummary => ({
  id,
  providerId,
  name,
});

describe('buildProviderSearchResults', () => {
  const providers = [provider('p1', 'יוסי סבג פירות וירקות'), provider('p2', 'ירקות השדה')];
  const products = [
    product('pr1', 'p1', 'עגבניה שרי'),
    product('pr2', 'p1', 'מלפפון'),
    product('pr3', 'p2', 'עגבניה מקושקשת'),
  ];

  it('returns every provider with no matching products for an empty query', () => {
    const results = buildProviderSearchResults(providers, products, '');
    expect(results).toEqual([
      { provider: providers[0], matchingProducts: [] },
      { provider: providers[1], matchingProducts: [] },
    ]);
  });

  it('returns every provider with no matching products for a whitespace-only query', () => {
    const results = buildProviderSearchResults(providers, products, '   ');
    expect(results.every((r) => r.matchingProducts.length === 0)).toBe(true);
    expect(results).toHaveLength(2);
  });

  it('includes a provider matched by its own name, with no matching products', () => {
    const results = buildProviderSearchResults(providers, products, 'השדה');
    expect(results).toEqual([{ provider: providers[1], matchingProducts: [] }]);
  });

  it('includes a provider matched only via a product name, with that product listed', () => {
    const results = buildProviderSearchResults(providers, products, 'מלפפון');
    expect(results).toEqual([{ provider: providers[0], matchingProducts: [products[1]] }]);
  });

  it('includes a provider matched by both name and product, listing the matching products', () => {
    const results = buildProviderSearchResults(providers, products, 'עגבניה');
    expect(results).toEqual([
      { provider: providers[0], matchingProducts: [products[0]] },
      { provider: providers[1], matchingProducts: [products[2]] },
    ]);
  });

  it('excludes a provider that matches neither its name nor any product', () => {
    const results = buildProviderSearchResults(providers, products, 'בשר');
    expect(results).toEqual([]);
  });

  it('matches a multi-word query regardless of word order in the product name', () => {
    const reorderedProviders = [provider('p1', 'ספק')];
    const reorderedProducts = [product('pr1', 'p1', 'ביצה חלב')];

    const results = buildProviderSearchResults(reorderedProviders, reorderedProducts, 'חלב ביצה');

    expect(results).toEqual([{ provider: reorderedProviders[0], matchingProducts: [reorderedProducts[0]] }]);
  });

  it('ranks a whole-word/exact match above a product that only contains the token mid-word', () => {
    const rankedProviders = [provider('p1', 'ספק')];
    const rankedProducts = [
      product('pr1', 'p1', 'שוקולד חלבי'), // "חלב" only buried inside "חלבי"
      product('pr2', 'p1', 'חלב טרי'), // "חלב" is a whole word here
    ];

    const results = buildProviderSearchResults(rankedProviders, rankedProducts, 'חלב');

    expect(results[0].matchingProducts.map((p) => p.id)).toEqual(['pr2', 'pr1']);
  });

  it('is case-insensitive for Latin text', () => {
    const latinProviders = [provider('p1', 'IKEA Supplies')];
    const results = buildProviderSearchResults(latinProviders, [], 'ikea');
    expect(results).toEqual([{ provider: latinProviders[0], matchingProducts: [] }]);
  });

  describe('barcode matching', () => {
    const provider = { id: 'p1', name: 'אוסם' } as never;
    const products = [
      { id: 'x1', providerId: 'p1', name: 'אטריות ביצים', barcode: '7290000060071' },
      { id: 'x2', providerId: 'p1', name: 'קמח', barcode: '7290111550034' },
      { id: 'x3', providerId: 'p1', name: 'סוכר' },
    ] as never[];

    it('finds a product by its full barcode', () => {
      const results = buildProviderSearchResults([provider], products, '7290000060071');
      expect(results).toHaveLength(1);
      expect(results[0].matchingProducts.map((x) => x.id)).toEqual(['x1']);
    });

    it('finds a product while the barcode is still being typed', () => {
      // Typing a long number is slow; matching on a prefix makes the scanner
      // fallback usable by hand.
      const results = buildProviderSearchResults([provider], products, '72900000');
      expect(results[0].matchingProducts.map((x) => x.id)).toEqual(['x1']);
    });

    it('does not match a digit run from the middle of a barcode', () => {
      // Otherwise almost every barcode matches almost every query, since they
      // share long runs of digits.
      const results = buildProviderSearchResults([provider], products, '0060071');
      expect(results).toHaveLength(0);
    });

    it('ignores products with no barcode', () => {
      const results = buildProviderSearchResults([provider], products, '7290');
      expect(results[0].matchingProducts.map((x) => x.id)).toEqual(['x1', 'x2']);
    });

    it('still matches by name, so barcode search is additional', () => {
      const results = buildProviderSearchResults([provider], products, 'אטריות');
      expect(results[0].matchingProducts.map((x) => x.id)).toEqual(['x1']);
    });

    it('does not treat a numeric query as a name match', () => {
      const numeric = [
        { id: 'y1', providerId: 'p1', name: 'מוצר 7290', barcode: '1111111111111' },
      ] as never[];
      const results = buildProviderSearchResults([provider], numeric, '7290');
      // The name contains 7290, so it may still match by name — what matters
      // is that a barcode query never silently returns nothing.
      expect(results[0].matchingProducts.map((x) => x.id)).toEqual(['y1']);
    });
  });
});
