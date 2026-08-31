import {
  DEFAULT_UNIT_TYPE,
  UNIT_TYPES,
  isWeightUnit,
  quantityStep,
} from './unit-types';

describe('unit types', () => {
  it('defaults to קרטון', () => {
    expect(DEFAULT_UNIT_TYPE).toBe('קרטון');
    expect(UNIT_TYPES).toContain(DEFAULT_UNIT_TYPE);
  });

  it('offers the carton, the unit, and the measured units a catalogue reports', () => {
    expect([...UNIT_TYPES]).toEqual([
      'קרטון',
      'יחידה',
      'ק"ג',
      'ליטר',
      'גרם',
      'מיליליטר',
    ]);
  });

  describe('isWeightUnit', () => {
    it('is true for kilos', () => {
      expect(isWeightUnit('ק"ג')).toBe(true);
    });

    it('is true for litres', () => {
      expect(isWeightUnit('ליטר')).toBe(true);
    });

    it('is false for countable units', () => {
      expect(isWeightUnit('קרטון')).toBe(false);
      expect(isWeightUnit('יחידה')).toBe(false);
    });

    it('is false for the fine-grained measures', () => {
      // A gram and a millilitre are already small enough that half of one is
      // never what somebody meant to order, so they stay whole.
      expect(isWeightUnit('גרם')).toBe(false);
      expect(isWeightUnit('מיליליטר')).toBe(false);
    });

    it('is false for anything unrecognised', () => {
      // Products created before the fixed list existed carry free text. They
      // must be treated as countable rather than silently allowing fractions.
      expect(isWeightUnit("יח'")).toBe(false);
      expect(isWeightUnit('')).toBe(false);
    });
  });

  describe('quantityStep', () => {
    it('steps by half for the coarse measures', () => {
      expect(quantityStep('ק"ג')).toBe(0.5);
      expect(quantityStep('ליטר')).toBe(0.5);
    });

    it('steps by one for countable units', () => {
      expect(quantityStep('קרטון')).toBe(1);
      expect(quantityStep('יחידה')).toBe(1);
      expect(quantityStep('גרם')).toBe(1);
      expect(quantityStep('מיליליטר')).toBe(1);
      expect(quantityStep("יח'")).toBe(1);
    });
  });
});
