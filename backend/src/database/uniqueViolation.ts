import { QueryFailedError } from 'typeorm';

/** Postgres's error code for a unique-constraint violation. */
const UNIQUE_VIOLATION = '23505';

/**
 * True for the race a check-then-insert can't close on its own: two
 * requests both pass a "does this name already exist?" check before either
 * has inserted, so the database — not the application — is what actually
 * catches the second one. Callers wrap the insert in a transaction and use
 * this to turn that into the same conflict response the check already gives
 * the non-racing case, instead of an unhandled 500.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error as QueryFailedError & { code?: string }).code === UNIQUE_VIOLATION
  );
}
