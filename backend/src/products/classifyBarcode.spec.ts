import { classifyBarcode } from './classifyBarcode';

describe('classifyBarcode', () => {
  it('accepts a valid GTIN', () => {
    expect(classifyBarcode('7290000060071')).toBe('ok');
  });

  it('accepts a GTIN that only needs padding', () => {
    expect(classifyBarcode('16000185517')).toBe('ok');
  });

  it('reports a product with no barcode', () => {
    expect(classifyBarcode(null)).toBe('missing');
    expect(classifyBarcode('')).toBe('missing');
  });

  it('reports free text that reached the barcode column', () => {
    expect(classifyBarcode('#NAME?')).toBe('not-numeric');
    expect(classifyBarcode('tukuuhz ndi')).toBe('not-numeric');
  });

  it('reports a code too short to be any GTIN', () => {
    expect(classifyBarcode('140')).toBe('too-short');
    expect(classifyBarcode('668108')).toBe('too-short');
  });

  it('reports a full-length code whose check digit is wrong', () => {
    // The most valuable category: it is the right length and looks entirely
    // plausible, so nobody notices, but a scan of the real product will never
    // produce it. Almost always one mistyped digit.
    expect(classifyBarcode('7290119358607')).toBe('bad-check-digit');
  });
});
