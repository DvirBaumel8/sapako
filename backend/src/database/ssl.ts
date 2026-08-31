export type DatabaseSsl = false | { rejectUnauthorized: boolean };

/**
 * Whether to open the Postgres connection over TLS.
 *
 * Managed providers (Neon, Supabase, Render's own Postgres) require TLS and
 * present publicly trusted certificates. A local Homebrew or docker Postgres
 * serves no TLS at all, so this must stay off unless asked for — otherwise
 * every developer machine breaks.
 *
 * Set DATABASE_SSL=true in a deployed environment, or no-verify for a
 * provider using a self-signed certificate. Any other value is treated as
 * off rather than guessed at.
 */
export function buildDatabaseSsl(env: NodeJS.ProcessEnv): DatabaseSsl {
  if (env.DATABASE_SSL === 'true') {
    return { rejectUnauthorized: true };
  }
  if (env.DATABASE_SSL === 'no-verify') {
    return { rejectUnauthorized: false };
  }
  return false;
}
