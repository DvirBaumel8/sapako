import { planBarcodeRepairs } from './barcodeRepair';

describe('planBarcodeRepairs', () => {
  it('leaves a barcode that is already canonical alone', () => {
    expect(
      planBarcodeRepairs([{ id: 'a', barcode: '7290000060071' }]),
    ).toEqual([]);
  });

  it('pads a UPC-A that lost its leading zero', () => {
    expect(planBarcodeRepairs([{ id: 'a', barcode: '16000185517' }])).toEqual([
      { id: 'a', from: '16000185517', to: '016000185517' },
    ]);
  });

  it('strips a scanner symbology prefix', () => {
    expect(
      planBarcodeRepairs([{ id: 'a', barcode: ']C17290019721024' }]),
    ).toEqual([{ id: 'a', from: ']C17290019721024', to: '7290019721024' }]);
  });

  it('leaves unrecoverable junk untouched rather than clearing it', () => {
    // 451 products hold something that is not a barcode. Blanking them would
    // destroy the only clue to what the product actually is, and a human may
    // still be able to read "668108" as a supplier's internal code.
    const junk = [
      { id: 'a', barcode: '140' },
      { id: 'b', barcode: '#NAME?' },
      { id: 'c', barcode: 'tukuuhz ndi' },
      { id: 'd', barcode: '7290119358607' },
    ];

    expect(planBarcodeRepairs(junk)).toEqual([]);
  });

  it('ignores products that have no barcode at all', () => {
    expect(planBarcodeRepairs([{ id: 'a', barcode: null }])).toEqual([]);
  });

  it('returns one entry per repairable row and skips the rest', () => {
    const rows = [
      { id: 'a', barcode: '7290000060071' },
      { id: 'b', barcode: '16000185517' },
      { id: 'c', barcode: '#NAME?' },
      { id: 'd', barcode: ']C17290019721024' },
    ];

    expect(planBarcodeRepairs(rows).map((r) => r.id)).toEqual(['b', 'd']);
  });
});
