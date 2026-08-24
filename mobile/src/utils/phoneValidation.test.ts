import { isValidIsraeliPhone } from './phoneValidation';

describe('isValidIsraeliPhone', () => {
  it('accepts a standard mobile number', () => {
    expect(isValidIsraeliPhone('0501234567')).toBe(true);
  });

  it('accepts a 07x VOIP/desktop line', () => {
    expect(isValidIsraeliPhone('0723911324')).toBe(true);
  });

  it('accepts a standard landline', () => {
    expect(isValidIsraeliPhone('021234567')).toBe(true);
  });

  it('rejects a number with a name still attached', () => {
    expect(isValidIsraeliPhone('0502290989 גל')).toBe(false);
  });

  it('rejects a number missing its leading zero', () => {
    expect(isValidIsraeliPhone('501234567')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidIsraeliPhone('')).toBe(false);
  });
});
