import { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * Web-only configuration.
 *
 * Sapako ships as a PWA on Cloudflare Pages; there is no iOS or Android build.
 * So there is no native section, no EAS project, and no expo-camera plugin —
 * the barcode scanner is @zxing/browser driving getUserMedia, which needs a
 * browser camera permission rather than a declared native one.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Sapako',
  slug: 'sapako',
  version: '1.0.0',
  userInterfaceStyle: 'light',
  icon: './assets/icon.png',
  web: {
    output: 'single',
    favicon: './assets/favicon.png',
  },
  plugins: ['expo-router', 'expo-status-bar', 'expo-secure-store'],
  extra: {
    ...config.extra,
    apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000',
  },
});
