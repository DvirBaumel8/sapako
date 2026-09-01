/**
 * Names the database a script is about to write to, safely enough to print.
 *
 * Scripts here take DATABASE_URL from the environment and fall back to .env,
 * which means a missing prefix silently sends a production import to localhost
 * — or, worse, the reverse. Printing the target turns that into something you
 * notice in the first line of output instead of the row count at the end.
 *
 * Deliberately drops both the password and the user name. The user is half a
 * credential, and a line that looks safe to paste into a chat should be safe
 * to paste into a chat.
 */
export function describeTarget(connectionString: string | undefined): string {
  if (!connectionString) return 'an unconfigured database';
  try {
    const url = new URL(connectionString);
    const database = url.pathname.replace(/^\//, '') || 'an unnamed database';
    return `${database} on ${url.hostname}`;
  } catch {
    return 'an unrecognised database';
  }
}
