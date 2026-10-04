import type { Product } from '../api/types';

// Product rows have a known height, measured from the running app. Declaring
// it lets the list jump straight to any row: without it, scrollToIndex cannot
// reach a row outside the rendered window, and its own averageItemLength
// estimate reads ~82 against a real pitch of 104 — so every retry recomputed
// the same wrong offset and the scroll stopped ~80 rows short.
export const ROW_HEIGHT = 104;

// A product with a note renders one extra line under its name: the card's
// 10px gap plus a 16px line, pinned to one line (numberOfLines={1}) so this
// stays exact. Must match styles.productNote in the order screen.
export const NOTE_LINE_HEIGHT = 26;

// Same reasoning as ROW_HEIGHT: an exact height lets the category SectionList
// jump straight to any row instead of guessing from an unmeasured average.
export const SECTION_HEADER_HEIGHT = 44;

type HasNoteField = Pick<Product, 'note'>;

export function hasNote(product: HasNoteField): boolean {
  return !!product.note?.trim();
}

export function rowHeightFor(product: HasNoteField): number {
  return hasNote(product) ? ROW_HEIGHT + NOTE_LINE_HEIGHT : ROW_HEIGHT;
}

/**
 * Precomputed so getItemLayout is a lookup: it is called for many indexes on
 * every scroll, and summing row heights per call would be quadratic on a
 * large catalogue.
 */
export interface ItemLayoutTable {
  lengths: number[];
  offsets: number[];
  total: number;
}

function pushSlot(table: ItemLayoutTable, length: number): void {
  table.lengths.push(length);
  table.offsets.push(table.total);
  table.total += length;
}

export function buildFlatLayout(products: readonly HasNoteField[]): ItemLayoutTable {
  const table: ItemLayoutTable = { lengths: [], offsets: [], total: 0 };
  for (const product of products) pushSlot(table, rowHeightFor(product));
  return table;
}

/** Treats headers and rows as one flat sequence: [header, ...rows] per section. */
export function buildSectionLayout(
  sections: readonly { data: readonly HasNoteField[] }[],
): ItemLayoutTable {
  const table: ItemLayoutTable = { lengths: [], offsets: [], total: 0 };
  for (const section of sections) {
    pushSlot(table, SECTION_HEADER_HEIGHT);
    for (const product of section.data) pushSlot(table, rowHeightFor(product));
  }
  return table;
}

export function layoutAt(
  table: ItemLayoutTable,
  index: number,
): { length: number; offset: number; index: number } {
  if (index < table.lengths.length) {
    return { length: table.lengths[index], offset: table.offsets[index], index };
  }
  return { length: ROW_HEIGHT, offset: table.total, index };
}
