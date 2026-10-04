import { collapseOrderLinesForContinue } from './collapseOrderLinesForContinue';

const line = (id: string, productId: string | undefined, unitType: string, quantity: number) =>
  ({ id, productId, productNameSnapshot: 'x', unitType, quantity }) as any;

describe('collapseOrderLinesForContinue', () => {
  it('sums lines of the same product and unit', () => {
    const out = collapseOrderLinesForContinue([line('1', 'p', 'קרטון', 2), line('2', 'p', 'קרטון', 3)]);
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(5);
  });

  it('leaves different products untouched', () => {
    const out = collapseOrderLinesForContinue([line('1', 'a', 'קרטון', 2), line('2', 'b', 'קרטון', 3)]);
    expect(out.map((i) => i.quantity)).toEqual([2, 3]);
  });

  it('keeps only the first unit when a product has several', () => {
    const out = collapseOrderLinesForContinue([
      line('1', 'p', 'קרטון', 2),
      line('2', 'p', 'ק"ג', 1),
      line('3', 'p', 'קרטון', 1),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].unitType).toBe('קרטון');
    expect(out[0].quantity).toBe(3);
  });

  it('keeps weight quantities numeric', () => {
    const out = collapseOrderLinesForContinue([line('1', 'p', 'ק"ג', 2.5), line('2', 'p', 'ק"ג', 1.5)]);
    expect(out[0].quantity).toBe(4);
    expect(typeof out[0].quantity).toBe('number');
  });

  it('passes lines without a product through', () => {
    const out = collapseOrderLinesForContinue([line('1', undefined, 'קרטון', 1), line('2', undefined, 'קרטון', 1)]);
    expect(out).toHaveLength(2);
  });
});
