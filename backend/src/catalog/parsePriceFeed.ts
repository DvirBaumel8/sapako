import { gtinMatchKey } from '../products/gtin';
import { mapCatalogUnit } from './mapCatalogUnit';

export interface CatalogRow {
  gtin: string;
  name: string;
  brand: string | null;
  unitType: string | null;
  source: string;
}

/**
 * Reads a price-transparency PriceFull file.
 *
 * Israeli retail chains are required to publish their full catalogue as XML,
 * which is where the Hebrew product names come from. The files are generated
 * by machine to a fixed, flat shape — one <Item> per product, no attributes,
 * no nesting past <Items> — so they are read with expressions rather than by
 * adding an XML parser dependency for one script.
 */
const ITEM_PATTERN = /<Item>([\s\S]*?)<\/Item>/g;

function tag(item: string, name: string): string | null {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(item);
  if (!match) return null;
  const value = match[1].trim();
  return value === '' ? null : value;
}

export function parsePriceFeed(xml: string, source: string): CatalogRow[] {
  const rows: CatalogRow[] = [];

  for (const [, item] of xml.matchAll(ITEM_PATTERN)) {
    const code = tag(item, 'ItemCode');
    const name = tag(item, 'ItemName');
    if (!code || !name) continue;

    // Goods weighed in the store carry a short code that means something only
    // inside that chain. They are real products, but no other scanner will
    // ever produce that number, so they are not reference data.
    const gtin = gtinMatchKey(code);
    if (gtin === null) continue;

    rows.push({
      gtin,
      name,
      brand: tag(item, 'ManufactureName'),
      unitType: mapCatalogUnit(tag(item, 'UnitQty') ?? undefined),
      source,
    });
  }

  return rows;
}
