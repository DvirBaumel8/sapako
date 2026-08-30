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

  it('restores a leading zero dropped by a spreadsheet', () => {
    // Previously refused. A nine-digit run that is a valid Israeli mobile
    // without its leading zero has exactly one reading, and the alternative
    // is a provider nobody can send an order to.
    expect(extractPhoneNumber('543009909')).toBe('0543009909');
  });

  it('restores a leading zero on a 05x number stored as a number', () => {
    expect(extractPhoneNumber('504479939')).toBe('0504479939');
  });

  it('does not invent a leading zero for a run that is not a valid prefix', () => {
    expect(extractPhoneNumber('123456789')).toBeNull();
  });

  it('does not restore a leading zero inside a longer run of digits', () => {
    // Digits either side mean the run is not a phone number on its own, so
    // padding it would be guessing.
    expect(extractPhoneNumber('1543009909')).toBeNull();
    expect(extractPhoneNumber('5430099091')).toBeNull();
  });

  it('returns null for an ambiguous run of extra digits', () => {
    expect(extractPhoneNumber('רימונה 05206670521')).toBeNull();
  });

  it('returns null when no phone-like substring exists', () => {
    expect(extractPhoneNumber('הזמנות דגים - 050749450')).toBeNull();
  });
});
