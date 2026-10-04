import type { OrderItem as Line } from '../api/types';

/**
 * After a duplicate-product merge a sent order can hold several lines for one
 * product. The builder screen keeps one line per product, so lines for the
 * same product and unit are summed, and if a product still has lines in more
 * than one unit only the first is kept. Lines without a product are ad-hoc
 * and pass through untouched.
 */
export function collapseOrderLinesForContinue(items: Line[]): Line[] {
  const result: Line[] = [];
  const groupByKey = new Map<string, Line>();
  const unitByProduct = new Map<string, string>();

  for (const item of items) {
    if (!item.productId) {
      result.push(item);
      continue;
    }
    const keptUnit = unitByProduct.get(item.productId);
    if (keptUnit === undefined) {
      unitByProduct.set(item.productId, item.unitType);
      const first = { ...item, quantity: Number(item.quantity) };
      groupByKey.set(`${item.productId}\u0000${item.unitType}`, first);
      result.push(first);
    } else if (keptUnit === item.unitType) {
      const group = groupByKey.get(`${item.productId}\u0000${item.unitType}`)!;
      group.quantity += Number(item.quantity);
    }
  }
  return result;
}
