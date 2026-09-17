// Imported first in app/_layout.tsx, so Sentry's global error/rejection
// handlers are registered before anything else in the app runs.
import * as Sentry from '@sentry/react';
import Constants from 'expo-constants';

const dsn = Constants.expoConfig?.extra?.sentryDsn as string | undefined;

if (dsn) {
  Sentry.init({ dsn });
} else {
  // No-op rather than throwing when unconfigured, same as the backend's
  // instrument.ts — local dev and CI never set this.
  console.debug('SENTRY_DSN unset; error reporting disabled');
}
