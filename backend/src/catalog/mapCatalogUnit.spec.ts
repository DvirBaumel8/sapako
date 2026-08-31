import { mapCatalogUnit } from './mapCatalogUnit';
import { UNIT_TYPES } from '../products/unit-types';

describe('mapCatalogUnit', () => {
  it('folds the feed spelling of a kilo onto the one this app offers', () => {
    // The feed says קילוגרם; the picker says ק"ג. Storing both would put two
    // spellings of one unit in front of whoever adds a product.
    expect(mapCatalogUnit('קילוגרם')).toBe('ק"ג');
  });

  it('folds the feed plural of a unit onto the singular', () => {
    expect(mapCatalogUnit('יחידות')).toBe('יחידה');
  });

  it('passes through the measures spelled the same way', () => {
    expect(mapCatalogUnit('ליטר')).toBe('ליטר');
    expect(mapCatalogUnit('גרם')).toBe('גרם');
    expect(mapCatalogUnit('מיליליטר')).toBe('מיליליטר');
  });

  it('trims surrounding whitespace', () => {
    expect(mapCatalogUnit('  גרם ')).toBe('גרם');
  });

  it('returns null for a unit this app does not offer', () => {
    // The feed also carries מטרים, for cling film and foil. There is nothing
    // sensible to map it to, and inventing one would mislabel the product.
    expect(mapCatalogUnit('מטרים')).toBeNull();
  });

  it('returns null for an empty or missing unit', () => {
    expect(mapCatalogUnit('')).toBeNull();
    expect(mapCatalogUnit(undefined)).toBeNull();
  });

  it('only ever returns a unit the app actually offers', () => {
    const feedUnits = ['קילוגרם', 'יחידות', 'ליטר', 'גרם', 'מיליליטר'];
    for (const unit of feedUnits) {
      expect(UNIT_TYPES).toContain(mapCatalogUnit(unit));
    }
  });
});
