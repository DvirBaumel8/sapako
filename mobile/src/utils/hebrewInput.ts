// Allows Hebrew letters, digits, whitespace, and punctuation commonly used in
// Hebrew business names / unit abbreviations (e.g. ק"ג, מ.ד, בע"מ).
const ALLOWED_CHAR = /[א-ת0-9\s'"().,\-/]/;

export function sanitizeHebrewInput(text: string): string {
  return Array.from(text)
    .filter((char) => ALLOWED_CHAR.test(char))
    .join('');
}
