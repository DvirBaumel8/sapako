import type { Category, Product } from '../api/types';

export const UNCATEGORIZED_CATEGORY_ID = 'uncategorized';
const UNCATEGORIZED_TITLE = 'ללא קטגוריה';

export interface ProductCategorySection {
  id: string;
  title: string;
  data: Product[];
}

/**
 * Groups a provider's products into one section per category, in the order
 * categories were created, plus a trailing "ללא קטגוריה" section for
 * anything unassigned — every existing product, until an admin sorts it.
 *
 * A category with no products in the current (possibly search-filtered)
 * list is left out entirely, same reasoning as groupOrdersForActivity: an
 * empty section here is not offering anything to order, just clutter.
 */
export function groupProductsByCategory(
  products: Product[],
  categories: Category[],
): ProductCategorySection[] {
  const byCategoryId = new Map<string, Product[]>();
  const uncategorized: Product[] = [];

  for (const product of products) {
    if (product.categoryId) {
      const bucket = byCategoryId.get(product.categoryId);
      if (bucket) {
        bucket.push(product);
      } else {
        byCategoryId.set(product.categoryId, [product]);
      }
    } else {
      uncategorized.push(product);
    }
  }

  const sections: ProductCategorySection[] = [];
  for (const category of categories) {
    const data = byCategoryId.get(category.id);
    if (data && data.length > 0) {
      sections.push({ id: category.id, title: category.name, data });
    }
  }
  if (uncategorized.length > 0) {
    sections.push({
      id: UNCATEGORIZED_CATEGORY_ID,
      title: UNCATEGORIZED_TITLE,
      data: uncategorized,
    });
  }
  return sections;
}
