const ISRAEL_COUNTRY_CODE = '972';

/**
 * Normalizes an Israeli phone number into the digits-only international
 * format WhatsApp's wa.me links require (country code, no leading 0, no
 * separators). Provider phones are stored in local format (e.g. "050-1234567")
 * so this must run before building a wa.me URL.
 */
export function toWhatsAppPhoneNumber(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  if (!digits) {
    return '';
  }
  if (digits.startsWith(ISRAEL_COUNTRY_CODE)) {
    return digits;
  }
  if (digits.startsWith('0')) {
    return `${ISRAEL_COUNTRY_CODE}${digits.slice(1)}`;
  }
  return `${ISRAEL_COUNTRY_CODE}${digits}`;
}
