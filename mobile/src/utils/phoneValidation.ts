const MOBILE_PATTERN = /^05\d{8}$/;
const VOIP_PATTERN = /^07[2-9]\d{7}$/;
const LANDLINE_PATTERN = /^0[23489]\d{7}$/;

/**
 * Accepts Israeli mobile (05X), VOIP/desktop lines (07X, e.g. office phones
 * without a physical SIM), and standard landlines (02/03/04/08/09).
 */
export function isValidIsraeliPhone(phone: string): boolean {
  return MOBILE_PATTERN.test(phone) || VOIP_PATTERN.test(phone) || LANDLINE_PATTERN.test(phone);
}

export const PHONE_VALIDATION_ERROR = 'מספר טלפון לא תקין. לדוגמה: 0501234567 או 021234567';
