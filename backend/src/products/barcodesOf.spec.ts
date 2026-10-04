import { barcodesOf } from './barcodesOf';

describe('barcodesOf', () => {
  it('lists the main barcode first, then the additional ones', () => {
    expect(
      barcodesOf({ barcode: '1', additionalBarcodes: ['2', '3'] }),
    ).toEqual(['1', '2', '3']);
  });

  it('skips a missing main barcode and tolerates a missing array', () => {
    expect(
      barcodesOf({ barcode: undefined, additionalBarcodes: ['2'] }),
    ).toEqual(['2']);
    expect(barcodesOf({ barcode: '1' } as never)).toEqual(['1']);
  });
});
