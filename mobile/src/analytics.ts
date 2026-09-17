// Imported once from app/_layout.tsx. Unlike src/instrument.ts, timing
// relative to other imports doesn't matter here — this just starts an
// analytics client, it doesn't need to patch anything.
import posthog from 'posthog-js';
import Constants from 'expo-constants';

const apiKey = Constants.expoConfig?.extra?.posthogApiKey as string | undefined;
const host = Constants.expoConfig?.extra?.posthogHost as string | undefined;

if (apiKey) {
  // Autocapture (pageviews, clicks) is on by default — this app has no
  // custom event calls, by design, to keep this at "low effort".
  posthog.init(apiKey, { api_host: host });
} else {
  // No-op rather than throwing when unconfigured, same as src/instrument.ts.
  console.debug('POSTHOG_API_KEY unset; analytics disabled');
}
