import { toWhatsAppPhoneNumber } from './whatsappPhone';

describe('toWhatsAppPhoneNumber', () => {
  it('converts a local Israeli mobile number to international format', () => {
    expect(toWhatsAppPhoneNumber('0501234567')).toBe('972501234567');
  });

  it('strips separators from a local number before converting', () => {
    expect(toWhatsAppPhoneNumber('050-123-4567')).toBe('972501234567');
    expect(toWhatsAppPhoneNumber('050 123 4567')).toBe('972501234567');
  });

  it('leaves an already-international number unchanged (digits only)', () => {
    expect(toWhatsAppPhoneNumber('+972501234567')).toBe('972501234567');
    expect(toWhatsAppPhoneNumber('972501234567')).toBe('972501234567');
  });

  it('adds the country code when the leading 0 is missing', () => {
    expect(toWhatsAppPhoneNumber('501234567')).toBe('972501234567');
  });

  it('returns an empty string for an empty/non-numeric input', () => {
    expect(toWhatsAppPhoneNumber('')).toBe('');
    expect(toWhatsAppPhoneNumber('N/A')).toBe('');
  });
});
