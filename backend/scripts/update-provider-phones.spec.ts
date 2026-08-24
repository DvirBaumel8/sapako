import { extractPhoneNumber } from './update-provider-phones';

describe('extractPhoneNumber', () => {
  it('extracts a mobile number when the name comes first', () => {
    expect(extractPhoneNumber('גל 0502290989')).toBe('0502290989');
  });

  it('extracts a mobile number when the name comes last', () => {
    expect(extractPhoneNumber('0543319864 - רוני')).toBe('0543319864');
  });

  it('extracts a mobile number with no separator', () => {
    expect(extractPhoneNumber('חיים0544537061')).toBe('0544537061');
  });

  it('extracts a valid 07x number', () => {
    expect(extractPhoneNumber('שלומי 0723911324')).toBe('0723911324');
  });

  it('returns null when the phone is missing its leading zero', () => {
    expect(extractPhoneNumber('543009909')).toBeNull();
  });

  it('returns null for an ambiguous run of extra digits', () => {
    expect(extractPhoneNumber('רימונה 05206670521')).toBeNull();
  });

  it('returns null when no phone-like substring exists', () => {
    expect(extractPhoneNumber('הזמנות דגים - 050749450')).toBeNull();
  });
});
