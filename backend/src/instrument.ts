// Imported first in main.ts, before any other module — Sentry's NestJS SDK
// needs to patch modules as they're required, so this file (and the DSN it
// depends on) must run before AppModule or anything else is loaded.
import 'dotenv/config';
import * as Sentry from '@sentry/nestjs';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
  });
} else {
  // No-op rather than throwing when unconfigured, same as the Resend
  // integration — local dev and CI never set this.
  // eslint-disable-next-line no-console
  console.debug('SENTRY_DSN unset; error reporting disabled');
}
