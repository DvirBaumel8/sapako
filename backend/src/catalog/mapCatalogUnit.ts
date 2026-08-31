import { UnitType } from '../products/unit-types';

/**
 * Translates the unit a price feed reports into one this app offers.
 *
 * The feed and the app name some units differently — קילוגרם against ק"ג,
 * יחידות against יחידה — and a catalogue that stored both spellings would put
 * two versions of one unit in front of whoever adds a product.
 *
 * Null means the feed's unit has no counterpart here (מטרים, for cling film).
 * The caller leaves the unit alone in that case; guessing would mislabel the
 * product, and the unit matters because it decides whether a quantity may be
 * fractional.
 */
const FEED_UNITS: Record<string, UnitType> = {
  'קילוגרם': 'ק"ג',
  'ק"ג': 'ק"ג',
  'יחידות': 'יחידה',
  'יחידה': 'יחידה',
  'ליטר': 'ליטר',
  'גרם': 'גרם',
  'מיליליטר': 'מיליליטר',
};

export function mapCatalogUnit(unitQty: string | undefined): UnitType | null {
  if (!unitQty) return null;
  return FEED_UNITS[unitQty.trim()] ?? null;
}
