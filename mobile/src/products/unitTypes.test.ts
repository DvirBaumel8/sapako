import { DEFAULT_UNIT_TYPE, UNIT_TYPES, formatQuantity, isWeightUnit, quantityStep } from './unitTypes';

describe('unit types', () => {
  it('defaults to קרטון and offers the same units as the backend', () => {
    expect(DEFAULT_UNIT_TYPE).toBe('קרטון');
    expect([...UNIT_TYPES]).toEqual([
      'קרטון',
      'יחידה',
      'ק"ג',
      'ליטר',
      'גרם',
      'מיליליטר',
    ]);
  });

  it('treats only the coarse measures as weight', () => {
    expect(isWeightUnit('ק"ג')).toBe(true);
    expect(isWeightUnit('ליטר')).toBe(true);
    expect(isWeightUnit('גרם')).toBe(false);
    expect(isWeightUnit('מיליליטר')).toBe(false);
    expect(isWeightUnit('קרטון')).toBe(false);
    expect(isWeightUnit("יח'")).toBe(false);
  });

  it('steps by half for weight and by one otherwise', () => {
    expect(quantityStep('ק"ג')).toBe(0.5);
    expect(quantityStep('ליטר')).toBe(0.5);
    expect(quantityStep('גרם')).toBe(1);
    expect(quantityStep('קרטון')).toBe(1);
    expect(quantityStep('anything else')).toBe(1);
  });

  describe('formatQuantity', () => {
    it('keeps whole numbers whole', () => {
      // The column is numeric(10,2); without this the message would read
      // "3.00 קרטון".
      expect(formatQuantity(3)).toBe('3');
    });

    it('keeps a half', () => {
      expect(formatQuantity(2.5)).toBe('2.5');
    });

    it('trims trailing zeros from a stored decimal', () => {
      expect(formatQuantity(2.5000001)).toBe('2.5');
      expect(formatQuantity(1.1)).toBe('1.1');
    });
  });
});
