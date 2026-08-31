import { matchesBarcode } from './matchesBarcode';

describe('matchesBarcode', () => {
  it('matches two spellings of the same GTIN', () => {
    expect(matchesBarcode('016000185517', '16000185517')).toBe(true);
  });

  it('matches a stored code that kept its scanner prefix', () => {
    expect(matchesBarcode(']C17290019721024', '7290019721024')).toBe(true);
  });

  it('does not match two different GTINs', () => {
    expect(matchesBarcode('7290000060071', '7290000060163')).toBe(false);
  });

  it('matches a supplier internal code exactly', () => {
    // Several hundred products carry a code no check digit will validate. It
    // is still the identifier that shop uses, so an exact hit must count.
    expect(matchesBarcode('668108', '668108')).toBe(true);
  });

  it('does not match two different unreadable codes', () => {
    expect(matchesBarcode('#NAME?', 'tukuuhz ndi')).toBe(false);
  });

  it('does not match an empty stored barcode against an empty scan', () => {
    expect(matchesBarcode('', '')).toBe(false);
  });
});
