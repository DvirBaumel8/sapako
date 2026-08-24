import { hasLetter, sanitizeHebrewInput } from './hebrewInput';

describe('hasLetter', () => {
  it('accepts a Hebrew name', () => {
    expect(hasLetter('סניף הילס')).toBe(true);
  });

  it('accepts a Latin name', () => {
    expect(hasLetter('IKEA')).toBe(true);
  });

  it('rejects a digits-only string', () => {
    expect(hasLetter('0502516633')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(hasLetter('')).toBe(false);
  });
});

describe('sanitizeHebrewInput', () => {
  it('keeps Hebrew letters, digits, and common punctuation', () => {
    expect(sanitizeHebrewInput('מ.ד אטיאס בע"מ')).toBe('מ.ד אטיאס בע"מ');
  });

  it('strips disallowed characters like emoji', () => {
    expect(sanitizeHebrewInput('ספק 🎉!')).toBe('ספק ');
  });
});
