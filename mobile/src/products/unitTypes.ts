/**
 * The units a product can be ordered in.
 *
 * Kept as a fixed list rather than free text so the app can tell a weight
 * unit from a countable one — which it must, to decide whether a fractional
 * quantity is allowed.
 *
 * Mirrored in backend/src/products/unit-types.ts. There is no shared package
 * between the two, so the lists must be changed together.
 */
export const UNIT_TYPES = [
  'קרטון',
  'יחידה',
  'ק"ג',
  'ליטר',
  'גרם',
  'מיליליטר',
] as const;

export type UnitType = (typeof UNIT_TYPES)[number];

export const DEFAULT_UNIT_TYPE: UnitType = 'קרטון';

/**
 * The units that may carry a fraction. A kilo and a litre are ordered in
 * halves; a gram and a millilitre are already fine enough that half of one is
 * never what somebody meant, so they are counted whole.
 */
const WEIGHT_UNITS: readonly string[] = ['ק"ג', 'ליטר'];

/** Whether this unit is measured rather than counted, and so may be fractional. */
export function isWeightUnit(unitType: string): boolean {
  return WEIGHT_UNITS.includes(unitType);
}

/**
 * How much one press of +/- changes the quantity. Anything unrecognised —
 * including the free-text values that predate this list — counts as whole
 * units, so an unknown value can never quietly permit fractions.
 */
export function quantityStep(unitType: string): number {
  return isWeightUnit(unitType) ? 0.5 : 1;
}

/**
 * Renders a quantity for people: whole numbers stay whole, fractions keep
 * only the digits they need. Without this the WhatsApp message and the order
 * history would read "3.00 קרטון" or "2.50 ק"ג".
 */
export function formatQuantity(quantity: number): string {
  return Number.isInteger(quantity) ? String(quantity) : String(Number(quantity.toFixed(2)));
}
