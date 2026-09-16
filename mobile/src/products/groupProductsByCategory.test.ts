import { groupProductsByCategory, UNCATEGORIZED_CATEGORY_ID } from './groupProductsByCategory';
import type { Category, Product } from '../api/types';

const product = (id: string, categoryId?: string | null): Product => ({
  id,
  providerId: 'p1',
  name: `Product ${id}`,
  unitType: 'יחידה',
  categoryId,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const category = (id: string, name: string): Category => ({
  id,
  providerId: 'p1',
  name,
  createdAt: '2026-01-01T00:00:00.000Z',
});

describe('groupProductsByCategory', () => {
  it('groups products under their own category, in category order', () => {
    const categories = [category('c1', 'ירקות'), category('c2', 'פירות')];
    const products = [product('1', 'c2'), product('2', 'c1'), product('3', 'c1')];

    const sections = groupProductsByCategory(products, categories);

    expect(sections.map((s) => s.title)).toEqual(['ירקות', 'פירות']);
    expect(sections[0].data.map((p) => p.id)).toEqual(['2', '3']);
    expect(sections[1].data.map((p) => p.id)).toEqual(['1']);
  });

  it('puts uncategorized products (undefined or null categoryId) in a trailing section', () => {
    const categories = [category('c1', 'ירקות')];
    const products = [product('1', 'c1'), product('2', undefined), product('3', null)];

    const sections = groupProductsByCategory(products, categories);

    expect(sections.map((s) => s.title)).toEqual(['ירקות', 'ללא קטגוריה']);
    expect(sections[1].id).toBe(UNCATEGORIZED_CATEGORY_ID);
    expect(sections[1].data.map((p) => p.id)).toEqual(['2', '3']);
  });

  it('omits a category from the sections when none of the given products are in it', () => {
    // The order screen passes an already search-filtered product list, so
    // a category with no matches here must not render an empty section.
    const categories = [category('c1', 'ירקות'), category('c2', 'פירות')];
    const products = [product('1', 'c1')];

    const sections = groupProductsByCategory(products, categories);

    expect(sections.map((s) => s.title)).toEqual(['ירקות']);
  });

  it('omits the uncategorized section entirely when every product has a category', () => {
    const categories = [category('c1', 'ירקות')];
    const products = [product('1', 'c1')];

    const sections = groupProductsByCategory(products, categories);

    expect(sections.some((s) => s.id === UNCATEGORIZED_CATEGORY_ID)).toBe(false);
  });

  it('returns an empty array for no products', () => {
    expect(groupProductsByCategory([], [category('c1', 'ירקות')])).toEqual([]);
  });
});
