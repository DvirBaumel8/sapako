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

// Usernames are typed by an admin, often in English, and are never shown to
// customers — so the Hebrew-only rule that suits product and supplier names
// is wrong here. Latin letters, Hebrew, digits and a few separators only:
// spaces and punctuation invite login trouble that is tedious to diagnose.
const ALLOWED_USERNAME_CHAR = /[א-תa-zA-Z0-9._-]/;

export function sanitizeUsername(text: string): string {
  return Array.from(text)
    .filter((char) => ALLOWED_USERNAME_CHAR.test(char))
    .join('');
}
