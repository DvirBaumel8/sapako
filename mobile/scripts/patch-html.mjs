// Expo's `output: 'single'` export does not apply app/+html.tsx (verified on
// SDK 57: the emitted dist/index.html is Expo's bare default template). This
// script is therefore the single source of truth for the document shell —
// RTL direction, viewport, PWA install metadata, global CSS, and the service
// worker registration. It runs after every export, via `npm run build:web`.
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const MARKER = '<!-- sapako-shell -->';
const path = new URL('../dist/index.html', import.meta.url);
let html = readFileSync(path, 'utf8');

// Idempotent: a second run over an already-patched file is a no-op rather
// than a double injection.
if (html.includes(MARKER)) {
  console.log('dist/index.html already patched');
  process.exit(0);
}

// Rewrite the opening tag wholesale rather than appending attributes, so the
// template's lang="en" is replaced instead of duplicated.
html = html.replace(/<html[^>]*>/i, '<html lang="he" dir="rtl">');

// Drop every viewport tag the template emitted. Ours is the only one carrying
// viewport-fit=cover, and leaving a losing duplicate behind makes this file
// confusing to debug later.
html = html.replace(/<meta[^>]*name=["']viewport["'][^>]*>/gi, '');

const head = `${MARKER}
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <link rel="manifest" href="/manifest.webmanifest">
    <meta name="theme-color" content="#ffffff">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <meta name="apple-mobile-web-app-title" content="Sapako">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <style>
      /* Removes the rubber-band scroll and pull-to-refresh gestures, which
         read as broken inside a standalone home-screen app. */
      body { overscroll-behavior: none; }
      * { -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; }
      /* Mobile Safari zooms the viewport whenever a focused input renders
         below 16px, and never zooms back out. A font-size floor is the fix;
         a maximum-scale viewport lock would also work but would disable
         pinch-zoom for everyone, which is an accessibility regression. */
      input, textarea, select { font-size: 16px; }
    </style>
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
          navigator.serviceWorker.register('/sw.js').catch(function () {
            // A failed registration must never block the app: the service
            // worker is a launch-speed optimisation, not a dependency.
          });
        });
      }
    </script>
`;

html = html.replace('</head>', `${head}  </head>`);

writeFileSync(path, html);
console.log('patched dist/index.html');

// Give this build its own service worker cache name. sw.js ships with a
// __BUILD_ID__ placeholder; stamping it here is what makes the worker's
// activate handler evict the previous build's cache instead of letting
// superseded bundles accumulate on the device indefinitely.
const swPath = new URL('../dist/sw.js', import.meta.url);
const sw = readFileSync(swPath, 'utf8');
// Anchored on the assignment, not the bare token: the surrounding comment in
// sw.js also names the placeholder, and a plain string replace would rewrite
// that first occurrence and silently leave the actual constant untouched.
const placeholder = /^const CACHE_VERSION = '__BUILD_ID__';$/m;
if (!placeholder.test(sw)) {
  throw new Error('dist/sw.js has no CACHE_VERSION placeholder to stamp');
}
writeFileSync(swPath, sw.replace(placeholder, `const CACHE_VERSION = '${randomUUID()}';`));
console.log('stamped dist/sw.js');
