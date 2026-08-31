import { buildDatabaseSsl } from './ssl';

describe('buildDatabaseSsl', () => {
  it('is off by default, so a local Postgres still connects', () => {
    // Homebrew and docker Postgres do not serve TLS at all; defaulting this
    // on would break every developer machine.
    expect(buildDatabaseSsl({})).toBe(false);
  });

  it('verifies the certificate when enabled', () => {
    // Neon and other managed providers present publicly trusted certs, so
    // verification should stay on.
    expect(buildDatabaseSsl({ DATABASE_SSL: 'true' })).toEqual({
      rejectUnauthorized: true,
    });
  });

  it('allows opting out of verification for self-signed certificates', () => {
    expect(buildDatabaseSsl({ DATABASE_SSL: 'no-verify' })).toEqual({
      rejectUnauthorized: false,
    });
  });

  it('treats any other value as off rather than guessing', () => {
    expect(buildDatabaseSsl({ DATABASE_SSL: 'yes' })).toBe(false);
    expect(buildDatabaseSsl({ DATABASE_SSL: '' })).toBe(false);
  });
});
