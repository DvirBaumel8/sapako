// Allows Hebrew letters, digits, whitespace, and punctuation commonly used in
// Hebrew business names / unit abbreviations (e.g. ק"ג, מ.ד, בע"מ).
const ALLOWED_CHAR = /[א-ת0-9\s'"().,\-/]/;

export function sanitizeHebrewInput(text: string): string {
  return Array.from(text)
    .filter((char) => ALLOWED_CHAR.test(char))
    .join('');
}

const LETTER = /[א-תa-zA-Z]/;

// A name made up of only digits/punctuation (e.g. a phone number pasted into
// the wrong field) isn't a real name.
export function hasLetter(text: string): boolean {
  return LETTER.test(text);
}
