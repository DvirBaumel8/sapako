# Sapako PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Sapako as an installable web app (PWA) that replaces the native Android/iOS clients, so every change can be verified on an iPhone via a preview URL before it reaches production.

**Architecture:** The existing Expo/expo-router codebase gains a web target via `expo export --platform web` in SPA mode, wrapped as `npm run build:web` because the emitted `index.html` needs a post-build patch (Expo does not apply `+html.tsx` under `output: 'single'`). That patch supplies RTL direction and PWA install metadata; a conservative service worker caches only content-hashed assets. Three code changes make the app correct in a mobile browser: a real dialog component replacing `Alert`, a JS barcode decoder replacing `expo-camera`, and safe-area/input fixes for iOS. Hosting is Cloudflare Pages with per-branch preview URLs.

**Tech Stack:** Expo SDK 57, expo-router, react-native-web, TypeScript, Jest (jest-expo), `@zxing/browser` + `@zxing/library`, NestJS backend (unchanged apart from CORS), Cloudflare Pages.

**Spec:** `docs/superpowers/specs/2026-08-30-pwa-web-app-design.md`

**Branch:** `pwa-web-app` (already created; the spec commit is on it)

---

## File Structure

### Created

| File | Responsibility |
|---|---|
| `mobile/scripts/patch-html.mjs` | The document shell, applied to `dist/index.html` after export: `dir="rtl"`, viewport, PWA meta/link tags, global CSS, service worker registration |
| `mobile/public/manifest.webmanifest` | PWA manifest (name, standalone display, icons, RTL/Hebrew locale) |
| `mobile/public/sw.js` | Service worker: cache-first for hashed assets, network-first for the shell, pass-through for API |
| `mobile/public/icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | Install icons |
| `mobile/src/ui/alertTypes.ts` | `AlertButton` / `AlertOptions` types shared by the provider and its helper |
| `mobile/src/ui/findCancelHandler.ts` | Pure: which handler runs when a dialog is dismissed without a choice |
| `mobile/src/ui/findCancelHandler.test.ts` | Tests for the above |
| `mobile/src/ui/AlertProvider.tsx` | Context provider + modal dialog; exports `useAlert()` |
| `mobile/src/barcode/createBarcodeReader.ts` | Thin wrapper over ZXing with injectable reader, so scan-once and teardown are testable |
| `mobile/src/barcode/createBarcodeReader.test.ts` | Tests for the above |
| `backend/src/cors.ts` | Pure: `isAllowedOrigin(origin, config)` |
| `backend/src/cors.spec.ts` | Tests for the above |
| `.github/workflows/mobile-ci.yml` | Typecheck + test on `mobile/**` |

### Modified

| File | Change |
|---|---|
| `mobile/app.config.ts` | `name`/`slug` to `sapako`; `web.output: 'single'` |
| `mobile/app/_layout.tsx` | Drop `ensureRTL` and the `isRtlReady` gate; mount `AlertProvider` |
| `mobile/src/barcode/BarcodeScannerModal.tsx` | Internals swap `expo-camera` for `getUserMedia` + ZXing; props unchanged |
| `mobile/src/order/PublishButton.tsx` | Unconditional bottom inset; popup-safe WhatsApp navigation; `useAlert` |
| 15 screen/component files | `Alert.alert` → `useAlert()` (full list in Task 10–13) |
| `backend/src/main.ts` | `enableCors()` → origin allowlist |

### Deleted

| File | Reason |
|---|---|
| `mobile/src/i18n/rtl.ts` | `I18nManager.forceRTL` is a no-op on web; `Updates.reloadAsync()` throws in a browser |

---

## Stage 1 — Web Export, Shell, and Hosting

Goal: a live, installable URL. Dialogs and scanning are still broken at the end of this stage; that is expected and fine.

### Task 0: Remove the native RTL mechanism (blocking prerequisite)

**This must happen before anything else can be verified in a browser.** As
committed, the app reloads itself forever in a production web build:

- `app/_layout.tsx` calls `ensureRTL()` on every mount when `!I18nManager.isRTL`.
- `react-native-web`'s `I18nManager.forceRTL()` is an empty function and its
  `getConstants()` returns a hardcoded `{ isRTL: false }`, so `isRTL` can
  never become `true` on web — the condition is permanently satisfied.
- `ensureRTL()` then calls `Updates.reloadAsync()`, which throws **only** when
  `__DEV__` is true (`expo-updates/build/Updates.js`). In a production
  `expo export` build `__DEV__` is false, so it reaches
  `window.location.reload(true)` and performs a real page reload.

Mount → reload → mount → reload. This is invisible on native, where a restart
genuinely does set `isRTL` to `true` and the loop terminates.

**Files:**
- Delete: `mobile/src/i18n/rtl.ts`
- Modify: `mobile/app/_layout.tsx`

- [ ] **Step 1: Delete the module**

```bash
cd mobile && rm src/i18n/rtl.ts && rmdir src/i18n
```

Direction will come from `dir="rtl"` injected by Task 2's patch script. The
module has no test, so no coverage is lost.

- [ ] **Step 2: Remove its use from the root layout**

Replace the contents of `mobile/app/_layout.tsx` with:

```tsx
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/auth/AuthContext';

const queryClient = new QueryClient();
const screenOptions = { headerShown: false };

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SafeAreaView style={{ flex: 1 }} edges={['top']}>
            <Stack screenOptions={screenOptions} />
          </SafeAreaView>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
```

This drops the `ensureRTL` import, the `I18nManager` import, the `isRtlReady`
state, the `useEffect`, and the `if (!isRtlReady) return null;` guard — so the
app also paints immediately instead of after a state round-trip.

`AlertProvider` is **not** added here; Task 9 adds it once it exists.

- [ ] **Step 3: Verify**

```bash
cd mobile && npx tsc --noEmit && npm test
```

Expected: no type errors; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add mobile/app/_layout.tsx mobile/src
git commit -m "fix(mobile): stop the infinite reload loop in web builds"
```

---

### Task 1: Configure the web export

**Files:**
- Modify: `mobile/app.config.ts`

- [ ] **Step 1: Rename the app and switch web output to SPA mode**

In `mobile/app.config.ts`, change the `name` and `slug` lines (currently the `'mobile'` placeholder):

```ts
  name: 'Sapako',
  slug: 'sapako',
```

and replace the `web` block:

```ts
  web: {
    output: 'single',
    favicon: './assets/favicon.png',
  },
```

Leave the `ios`, `android`, and `plugins` blocks exactly as they are. They are not used by a web export, and they are the rollback path to a native build (spec §10).

- [ ] **Step 2: Verify the export succeeds**

```bash
cd mobile && npm ci && npx expo export --platform web
```

Expected: completes without error and creates `mobile/dist/` containing `index.html` and a `_expo/static/` directory.

- [ ] **Step 3: Verify the app boots in a browser**

```bash
cd mobile && npx serve dist -s -l 8080
```

Open `http://localhost:8080`. Expected: the login screen renders. It will be left-to-right and visually wrong — that is Task 2's job. If it renders *nothing*, check the browser console before continuing; a blank screen here means a bundling problem that every later task depends on.

- [ ] **Step 4: Commit**

```bash
git add mobile/app.config.ts
git commit -m "feat(mobile): enable SPA web export"
```

---

### Task 2: Document shell via a post-build patch

**Establishing fact, verified on this project:** Expo SDK 57 does **not**
apply `app/+html.tsx` under `web.output: 'single'`. The emitted
`dist/index.html` is Expo's bare default template. An earlier attempt created
`app/+html.tsx` and confirmed by grep that none of its content reached the
build.

That makes a post-build patch of `dist/index.html` the only mechanism that
actually works here, and therefore the **single source of truth** for the
document shell. `app/+html.tsx` must be deleted rather than kept alongside it:
an inert file full of authoritative-looking meta tags is a trap for whoever
reads this next.

The template already emits `<title>Sapako</title>` (from `app.config.ts`'s
`name`), so the title needs no injection.

**Files:**
- Delete: `mobile/app/+html.tsx`
- Create/replace: `mobile/scripts/patch-html.mjs`
- Modify: `mobile/package.json`

- [ ] **Step 1: Delete the inert file**

```bash
cd mobile && rm -f app/+html.tsx
```

- [ ] **Step 2: Write the patch script**

Replace the entire contents of `mobile/scripts/patch-html.mjs`:

```js
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
```

Note the service worker registration lives here. `sw.js` itself is created in
Task 4; registering a file that does not exist yet is harmless (the `catch`
swallows the 404), and keeping the whole shell in one file is worth more than
sequencing the two lines apart.

- [ ] **Step 3: Wire up the build script**

In `mobile/package.json`, the `scripts` block must contain:

```json
    "build:web": "expo export --platform web && node scripts/patch-html.mjs",
```

**Every build from here on uses `npm run build:web`, never a bare
`expo export`** — a bare export produces an unpatched `index.html` with no
RTL, no install metadata, and no service worker. This includes Task 7's
Cloudflare build command.

- [ ] **Step 4: Build**

```bash
cd mobile && npm run build:web
```

Expected: export completes, then `patched dist/index.html`.

- [ ] **Step 5: Verify every part of the shell landed**

```bash
cd mobile && for pattern in 'dir="rtl"' 'viewport-fit=cover' 'apple-mobile-web-app-capable' 'manifest.webmanifest' 'apple-touch-icon' 'serviceWorker.register' 'font-size: 16px'; do printf '%-32s %s\n' "$pattern" "$(grep -c -F "$pattern" dist/index.html)"; done
```

Expected: every line prints `1`. A `0` on any line means that part of the
shell is missing — fix it before moving on, because nothing downstream will
tell you it is absent.

- [ ] **Step 6: Verify there are no duplicate or stale tags**

```bash
cd mobile && grep -c -F 'name="viewport"' dist/index.html && grep -c -F 'lang=' dist/index.html && head -2 dist/index.html
```

Expected: exactly `1` viewport tag, exactly `1` `lang=` occurrence, and the
second line reads `<html lang="he" dir="rtl">`.

- [ ] **Step 7: Verify the service worker cache name is stamped**

```bash
cd mobile && grep -n "^const CACHE_VERSION" dist/sw.js public/sw.js
```

Expected: `dist/sw.js` shows a UUID; `public/sw.js` still shows
`'__BUILD_ID__'`. The source keeps the placeholder; only the build output is
stamped. Then rebuild and confirm the UUID *changes*:

```bash
cd mobile && npm run build:web >/dev/null && grep -n "^const CACHE_VERSION" dist/sw.js
```

Expected: a different UUID from the previous run. A constant value here means
the worker's `activate` eviction never fires and superseded bundles accumulate
on the device forever.

- [ ] **Step 8: Verify idempotency**

```bash
cd mobile && node scripts/patch-html.mjs
```

Expected: prints `dist/index.html already patched` and changes nothing.

- [ ] **Step 9: Verify RTL in a browser**

```bash
cd mobile && npx serve dist -s -l 8080
```

Open `http://localhost:8080`. Expected: the login screen renders
right-to-left — the Hebrew labels align to the right edge — and the page loads
exactly once (no reload loop).

- [ ] **Step 10: Commit**

```bash
git add mobile/app mobile/scripts/patch-html.mjs mobile/package.json
git commit -m "feat(mobile): build the PWA document shell in one post-build patch"
```

---


### Task 3: PWA manifest and install icons

**Files:**
- Create: `mobile/public/manifest.webmanifest`
- Create: `mobile/public/icon-192.png`, `mobile/public/icon-512.png`, `mobile/public/apple-touch-icon.png`

- [ ] **Step 1: Generate the icons from the existing app icon**

`mobile/assets/icon.png` is the existing source artwork. On macOS, `sips` is preinstalled and needs no dependency:

```bash
cd mobile && mkdir -p public
sips -Z 512 assets/icon.png --out public/icon-512.png
sips -Z 192 assets/icon.png --out public/icon-192.png
sips -Z 180 assets/icon.png --out public/apple-touch-icon.png
```

Expected: three files created. Verify:

```bash
cd mobile && sips -g pixelWidth -g pixelHeight public/icon-512.png public/icon-192.png public/apple-touch-icon.png
```

Expected: 512×512, 192×192, and 180×180 respectively.

- [ ] **Step 2: Write the manifest**

Create `mobile/public/manifest.webmanifest`:

```json
{
  "name": "Sapako",
  "short_name": "Sapako",
  "description": "ניהול הזמנות מספקים",
  "lang": "he",
  "dir": "rtl",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#ffffff",
  "theme_color": "#ffffff",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

- [ ] **Step 3: Verify Expo copies `public/` to the export root**

```bash
cd mobile && npm run build:web && ls dist/manifest.webmanifest dist/apple-touch-icon.png dist/icon-512.png dist/icon-192.png
```

Expected: all four paths listed, no "No such file" errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/public
git commit -m "feat(mobile): add PWA manifest and install icons"
```

---

### Task 4: Service worker

The single most common PWA failure is pinning users to a stale build forever. That would be especially damaging here, where pushing to `main` deploys live. The strategy below is deliberately narrow: cache only what is provably immutable.

**Files:**
- Create: `mobile/public/sw.js`

- [ ] **Step 1: Write the service worker**

Create `mobile/public/sw.js`:

```js
// __BUILD_ID__ is rewritten to a fresh value on every export by
// scripts/patch-html.mjs, so each deploy gets its own cache name and the
// activate handler below evicts the previous one. Without that rewrite the
// name would be constant, eviction would never fire, and every superseded
// bundle would accumulate on the user's device forever.
const CACHE_VERSION = '__BUILD_ID__';
const CACHE_NAME = `sapako-${CACHE_VERSION}`;

self.addEventListener('install', (event) => {
  // Take over as soon as possible rather than waiting for every tab holding
  // the previous worker to close — in a standalone PWA there is usually only
  // one, and waiting just delays updates.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Only ever touch our own origin. API calls to the Railway backend must
  // reach the network untouched — caching them is explicitly out of scope
  // (spec §9), and intercepting them would break auth error handling.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Content-hashed bundle output: the filename changes whenever the content
  // changes, so a cached copy can never be stale. Safe to serve cache-first.
  if (url.pathname.startsWith('/_expo/') || url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) {
          return cached;
        }
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      })(),
    );
    return;
  }

  // Everything else — the app shell and the manifest — is network-first, so
  // a new deploy is picked up on the next launch. The cache is only a
  // fallback for when the network is unavailable.
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        // Cached under the URL actually navigated to (e.g. /login), not
        // /index.html — the SPA rewrite happens server-side, so the worker
        // never sees that path. A deep link never visited online therefore
        // has no cached entry and fails here, which is the accepted
        // behaviour: offline support is out of scope (spec section 9).
        const cached = await caches.match(request);
        if (cached) {
          return cached;
        }
        throw error;
      }
    })(),
  );
});
```

- [ ] **Step 2: Verify it registers**

```bash
cd mobile && npm run build:web && npx serve dist -s -l 8080
```

Open `http://localhost:8080`, then DevTools → Application → Service Workers. Expected: `sw.js` listed as **activated and running**.

- [ ] **Step 3: Verify it does not pin a stale build**

With the page still open, edit any visible Hebrew string in `app/login.tsx`, then:

```bash
cd mobile && npm run build:web
```

Reload the browser tab twice. Expected: the new string appears. If it does not, the shell is being served cache-first — recheck the `/_expo/` prefix condition in Step 1, because that is the bug this step exists to catch.

- [ ] **Step 4: Commit**

```bash
git add mobile/public/sw.js
git commit -m "feat(mobile): add service worker for app shell caching"
```

---

### Task 5: Backend CORS allowlist

The backend authenticates with a bearer JWT rather than cookies, so CORS is not the security boundary here. The goal is hygiene without breaking preview deployments — which is exactly what a naive single-origin allowlist would do.

**Files:**
- Create: `backend/src/cors.ts`
- Create: `backend/src/cors.spec.ts`
- Modify: `backend/src/main.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/cors.spec.ts`:

```ts
import { isAllowedOrigin } from './cors';

describe('isAllowedOrigin', () => {
  const config = {
    allowlist: ['https://sapako.pages.dev'],
    previewPattern: /^https:\/\/[a-z0-9-]+\.sapako\.pages\.dev$/,
  };

  it('allows the production origin', () => {
    expect(isAllowedOrigin('https://sapako.pages.dev', config)).toBe(true);
  });

  it('allows a preview deployment origin', () => {
    expect(isAllowedOrigin('https://pwa-web-app.sapako.pages.dev', config)).toBe(true);
  });

  it('rejects an unrelated origin', () => {
    expect(isAllowedOrigin('https://evil.example.com', config)).toBe(false);
  });

  it('rejects an origin that merely ends with the preview domain', () => {
    expect(isAllowedOrigin('https://sapako.pages.dev.evil.com', config)).toBe(false);
  });

  it('allows requests with no Origin header', () => {
    // curl, server-to-server calls, and Railway's health checks send no
    // Origin. These are not browser requests, so CORS does not apply.
    expect(isAllowedOrigin(undefined, config)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd backend && npx jest src/cors.spec.ts
```

Expected: FAIL — `Cannot find module './cors'`.

- [ ] **Step 3: Implement**

Create `backend/src/cors.ts`:

```ts
export interface CorsConfig {
  allowlist: string[];
  previewPattern: RegExp;
}

export function isAllowedOrigin(
  origin: string | undefined,
  config: CorsConfig,
): boolean {
  // Non-browser callers (curl, health checks, server-to-server) send no
  // Origin header at all. CORS is a browser mechanism; blocking these would
  // break the Railway health check for no security benefit.
  if (!origin) {
    return true;
  }
  if (config.allowlist.includes(origin)) {
    return true;
  }
  return config.previewPattern.test(origin);
}

export function buildCorsConfig(env: NodeJS.ProcessEnv): CorsConfig {
  const allowlist = (env.WEB_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const project = env.PAGES_PROJECT ?? 'sapako';
  return {
    allowlist,
    // Anchored at both ends so that "sapako.pages.dev.evil.com" cannot match.
    previewPattern: new RegExp(`^https://[a-z0-9-]+\\.${project}\\.pages\\.dev$`),
  };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
cd backend && npx jest src/cors.spec.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Wire it into the app**

In `backend/src/main.ts`, replace `app.enableCors();` with:

```ts
  const corsConfig = buildCorsConfig(process.env);
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      callback(null, isAllowedOrigin(origin, corsConfig));
    },
  });
```

and add the import next to the existing ones:

```ts
import { buildCorsConfig, isAllowedOrigin } from './cors';
```

- [ ] **Step 6: Verify the whole backend suite still passes**

```bash
cd backend && npm run lint && npm test
```

Expected: lint clean, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/cors.ts backend/src/cors.spec.ts backend/src/main.ts
git commit -m "feat(backend): restrict CORS to the web app and its preview origins"
```

- [ ] **Step 8: Set the env vars in Railway**

In the Railway dashboard for the backend service, add:

- `WEB_ORIGINS` = the production web origin (e.g. `https://sapako.pages.dev`, plus any custom domain, comma-separated)
- `PAGES_PROJECT` = the Cloudflare Pages project name chosen in Task 7

**This must be done before Task 7's first deploy**, or the browser will be blocked from calling the API and every screen will show a loading error.

---

### Task 6: CI for the mobile package

The repo has CI for `backend/**` only (`.github/workflows/backend-ci.yml`). Mirror it.

**Files:**
- Create: `.github/workflows/mobile-ci.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/mobile-ci.yml`:

```yaml
name: mobile-ci

on:
  pull_request:
    paths:
      - 'mobile/**'
      - '.github/workflows/mobile-ci.yml'

jobs:
  typecheck-and-test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: mobile
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: mobile/package-lock.json
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm test
```

- [ ] **Step 2: Verify both commands pass locally first**

```bash
cd mobile && npx tsc --noEmit && npm test
```

Expected: no type errors; all tests pass. Fix anything broken here before committing — a workflow that fails on its first run tells you nothing you could not have learned in five seconds locally.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/mobile-ci.yml
git commit -m "ci: typecheck and test the mobile package"
```

---

### Task 7: Cloudflare Pages deployment

This task is done in the Cloudflare dashboard, not in code.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin pwa-web-app
```

- [ ] **Step 2: Create the Pages project**

Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → select the Sapako repo. Settings:

| Setting | Value |
|---|---|
| Project name | `sapako` (must match `PAGES_PROJECT` from Task 5 Step 8) |
| Production branch | `main` |
| Framework preset | None |
| Build command | `npm run build:web` |
| Build output directory | `dist` |
| Root directory | `mobile` |

Environment variables (apply to **both** Production and Preview):

- `API_BASE_URL` = `https://sapako-backend-production.up.railway.app`

- [ ] **Step 3: Add the SPA rewrite**

Create `mobile/public/_redirects` with:

```
/*    /index.html   200
```

Without this, refreshing on a deep link like `/providers/3/order` returns 404 instead of booting the app. Commit it:

```bash
git add mobile/public/_redirects
git commit -m "feat(mobile): add SPA rewrite for Cloudflare Pages"
git push
```

- [ ] **Step 4: Verify the preview deployment**

Cloudflare builds `pwa-web-app` to `https://pwa-web-app.sapako.pages.dev`. Open it in a desktop browser.

Expected: login screen, rendered right-to-left, and a successful login. **If login fails with a network error**, the CORS env vars from Task 5 Step 8 are missing or the origin does not match — check the browser console for a CORS message before changing anything else.

- [ ] **Step 5: Verify installation on the iPhone**

Open the preview URL in Safari on the iPhone → Share → Add to Home Screen. Launch from the home screen.

Expected: correct icon, the name "Sapako", and **no Safari address bar or toolbar**. Visible browser chrome means `apple-mobile-web-app-capable` is not reaching the served HTML — return to Task 2 Step 3.

At this point Stage 1 is done: the app is installable and usable, with known-broken confirmation dialogs and barcode scanning.

---

## Stage 2 — Replace `Alert` with a Real Dialog

`react-native-web`'s `Alert` is a `window.alert` shim with no multi-button support. Every two-button confirmation in the app currently loses its Cancel branch on web — including five destructive or irreversible actions. This is a data-loss bug, not a cosmetic one.

There are 32 call sites across 15 files. Single-button calls migrate too, so `Alert` is no longer imported anywhere.

### Task 8: The dismiss-handler helper

The codebase's testing convention is to unit-test pure functions and leave components untested (there is no React testing library installed, and adding one is out of scope). So the dialog's one piece of real logic is extracted and tested on its own.

**Files:**
- Create: `mobile/src/ui/alertTypes.ts`
- Create: `mobile/src/ui/findCancelHandler.ts`
- Create: `mobile/src/ui/findCancelHandler.test.ts`

- [ ] **Step 1: Write the types**

Create `mobile/src/ui/alertTypes.ts`:

```ts
export interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface AlertOptions {
  title: string;
  message?: string;
  buttons?: AlertButton[];
}
```

The shape deliberately mirrors `Alert.alert`'s so migrating 32 call sites is mechanical rather than a redesign.

- [ ] **Step 2: Write the failing test**

Create `mobile/src/ui/findCancelHandler.test.ts`:

```ts
import { findCancelHandler } from './findCancelHandler';

describe('findCancelHandler', () => {
  it('returns the cancel button handler when one exists', () => {
    const onCancel = jest.fn();
    const handler = findCancelHandler([
      { text: 'ביטול', style: 'cancel', onPress: onCancel },
      { text: 'מחיקה', style: 'destructive', onPress: jest.fn() },
    ]);
    handler?.();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('returns undefined when the cancel button has no handler', () => {
    expect(
      findCancelHandler([
        { text: 'ביטול', style: 'cancel' },
        { text: 'מחיקה', style: 'destructive', onPress: jest.fn() },
      ]),
    ).toBeUndefined();
  });

  it('returns undefined when there is no cancel button', () => {
    expect(findCancelHandler([{ text: 'אישור', onPress: jest.fn() }])).toBeUndefined();
  });

  it('returns undefined for a single-button dialog with no buttons array', () => {
    expect(findCancelHandler(undefined)).toBeUndefined();
  });

  it('never returns a destructive handler', () => {
    // Backstop against the worst possible bug in this file: dismissing a
    // delete confirmation by tapping outside it must not perform the delete.
    const onDelete = jest.fn();
    const handler = findCancelHandler([
      { text: 'מחיקה', style: 'destructive', onPress: onDelete },
    ]);
    handler?.();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

```bash
cd mobile && npx jest src/ui/findCancelHandler.test.ts
```

Expected: FAIL — `Cannot find module './findCancelHandler'`.

- [ ] **Step 4: Implement**

Create `mobile/src/ui/findCancelHandler.ts`:

```ts
import type { AlertButton } from './alertTypes';

// What runs when the dialog is dismissed without an explicit choice (tapping
// the backdrop, or Android's back gesture). Matches native Alert behaviour:
// only an explicit `cancel` button is treated as the dismissal action, so
// dismissing a delete confirmation can never perform the delete.
export function findCancelHandler(
  buttons: AlertButton[] | undefined,
): (() => void) | undefined {
  return buttons?.find((button) => button.style === 'cancel')?.onPress;
}
```

- [ ] **Step 5: Run the test and confirm it passes**

```bash
cd mobile && npx jest src/ui/findCancelHandler.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/ui/alertTypes.ts mobile/src/ui/findCancelHandler.ts mobile/src/ui/findCancelHandler.test.ts
git commit -m "feat(mobile): add dismiss-handler resolution for the alert dialog"
```

---

### Task 9: The `AlertProvider` component

**Files:**
- Create: `mobile/src/ui/AlertProvider.tsx`
- Modify: `mobile/app/_layout.tsx`

- [ ] **Step 1: Write the provider**

Create `mobile/src/ui/AlertProvider.tsx`:

```tsx
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { findCancelHandler } from './findCancelHandler';
import type { AlertButton, AlertOptions } from './alertTypes';

const DEFAULT_BUTTONS: AlertButton[] = [{ text: 'אישור' }];

interface AlertContextValue {
  showAlert: (options: AlertOptions) => void;
}

const AlertContext = createContext<AlertContextValue | undefined>(undefined);

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<AlertOptions | null>(null);

  const showAlert = useCallback((options: AlertOptions) => {
    setCurrent(options);
  }, []);

  const buttons = current?.buttons?.length ? current.buttons : DEFAULT_BUTTONS;

  const dismiss = (onPress?: () => void) => {
    // Close first, then run the handler. Several handlers navigate away or
    // open another dialog, and leaving this one mounted while that happens
    // strands a modal on screen.
    setCurrent(null);
    onPress?.();
  };

  const value = useMemo(() => ({ showAlert }), [showAlert]);

  return (
    <AlertContext.Provider value={value}>
      {children}
      <Modal
        visible={current !== null}
        transparent
        animationType="fade"
        onRequestClose={() => dismiss(findCancelHandler(current?.buttons))}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => dismiss(findCancelHandler(current?.buttons))}
        >
          {/* Stops a tap inside the dialog from reaching the backdrop. */}
          <Pressable style={styles.dialog} onPress={() => {}}>
            <Text style={styles.title}>{current?.title}</Text>
            {current?.message ? <Text style={styles.message}>{current.message}</Text> : null}
            <View style={styles.buttonRow}>
              {/* Index in the key, not just the label: the provider-match
                  prompt builds its buttons from provider names, which are
                  not guaranteed distinct from each other or from 'ביטול'. */}
              {buttons.map((button, index) => (
                <Pressable
                  key={`${index}-${button.text}`}
                  style={styles.button}
                  onPress={() => dismiss(button.onPress)}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      button.style === 'destructive' && styles.destructiveText,
                      button.style === 'cancel' && styles.cancelText,
                    ]}
                  >
                    {button.text}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </AlertContext.Provider>
  );
}

export function useAlert(): AlertContextValue['showAlert'] {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context.showAlert;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    gap: 8,
  },
  title: { fontSize: 17, fontWeight: '700', textAlign: 'right', color: '#1a1a1a' },
  message: { fontSize: 15, textAlign: 'right', color: '#444', lineHeight: 21 },
  buttonRow: { flexDirection: 'row', justifyContent: 'flex-start', gap: 8, marginTop: 12 },
  button: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  buttonText: { fontSize: 15, fontWeight: '600', color: '#2563eb' },
  destructiveText: { color: '#c0392b' },
  cancelText: { color: '#666' },
});
```

- [ ] **Step 2: Mount it in the root layout**

In `mobile/app/_layout.tsx`, add the import:

```tsx
import { AlertProvider } from '../src/ui/AlertProvider';
```

and wrap the tree inside `AuthProvider` (so a dialog can be raised from any screen, and from `AuthProvider`'s consumers):

```tsx
        <AuthProvider>
          <AlertProvider>
            <SafeAreaView style={{ flex: 1 }} edges={['top']}>
              <Stack screenOptions={screenOptions} />
            </SafeAreaView>
          </AlertProvider>
        </AuthProvider>
```

- [ ] **Step 3: Verify it typechecks**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/ui/AlertProvider.tsx mobile/app/_layout.tsx
git commit -m "feat(mobile): add AlertProvider dialog to replace react-native Alert"
```

---

### Task 10: Migrate the destructive confirmations

These five are the reason this stage exists — on web today they lose their Cancel button. Do them first.

**Files:**
- Modify: `mobile/app/(app)/activity.tsx:59-66`
- Modify: `mobile/app/(app)/products/[productId]/edit.tsx:51-58`
- Modify: `mobile/app/(app)/providers/[providerId]/edit.tsx:95-102`
- Modify: `mobile/app/(app)/admin/users/index.tsx:29-36`
- Modify: `mobile/app/(app)/departments/[departmentId]/edit.tsx:54-61`
- Modify: `mobile/app/(app)/departments/[departmentId]/providers.tsx:49-56`

- [ ] **Step 1: Apply the same mechanical change in each file**

In every file listed above:

1. Remove `Alert` from the `react-native` import (leave the other imports on that line intact).
2. Add the `useAlert` import. The relative prefix differs per file — use exactly these:

| File | Import |
|---|---|
| `app/(app)/activity.tsx` | `import { useAlert } from '../../src/ui/AlertProvider';` |
| `app/(app)/products/[productId]/edit.tsx` | `import { useAlert } from '../../../../src/ui/AlertProvider';` |
| `app/(app)/providers/[providerId]/edit.tsx` | `import { useAlert } from '../../../../src/ui/AlertProvider';` |
| `app/(app)/admin/users/index.tsx` | `import { useAlert } from '../../../../src/ui/AlertProvider';` |
| `app/(app)/departments/[departmentId]/edit.tsx` | `import { useAlert } from '../../../../src/ui/AlertProvider';` |
| `app/(app)/departments/[departmentId]/providers.tsx` | `import { useAlert } from '../../../../src/ui/AlertProvider';` |
3. Inside the component body, add `const showAlert = useAlert();`.
4. Replace each `Alert.alert(title, message, buttons)` with `showAlert({ title, message, buttons })`.

Worked example — `mobile/app/(app)/activity.tsx`, replacing lines 59–66:

```tsx
    showAlert({
      title: 'מחיקת הזמנה',
      message: `למחוק את ההזמנה עבור ${order.provider.name}? לא ניתן לשחזר פעולה זו.`,
      buttons: [
        { text: 'ביטול', style: 'cancel' },
        { text: 'מחיקה', style: 'destructive', onPress: () => removeOrder.mutate(order.id) },
      ],
    });
```

The other five follow exactly the same shape. Their existing titles, messages, and button arrays are correct as written — carry them across verbatim, changing only the call syntax. Do not reword any Hebrew string.

Note that `activity.tsx` also has two single-button calls (an error alert, and `Alert.alert(item.productNameSnapshot)` used as a row's `onPress`). Migrate those in this pass too:

```tsx
    showAlert({ title: 'שגיאה', message: 'מחיקת ההזמנה נכשלה. יש לנסות שוב.' });
```

and

```tsx
    onPress={() => showAlert({ title: item.productNameSnapshot })}
```

- [ ] **Step 2: Verify no `Alert` import remains in these files, and that they typecheck**

```bash
cd mobile && grep -n "Alert" "app/(app)/activity.tsx" "app/(app)/products/[productId]/edit.tsx" "app/(app)/providers/[providerId]/edit.tsx" "app/(app)/admin/users/index.tsx" "app/(app)/departments/[departmentId]/edit.tsx" "app/(app)/departments/[departmentId]/providers.tsx" | grep -v "showAlert\|useAlert"
```

Expected: no output.

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "mobile/app/(app)"
git commit -m "fix(mobile): restore Cancel on destructive confirmations via AlertProvider"
```

---

### Task 11: Migrate the remaining multi-button prompts

**Files:**
- Modify: `mobile/app/(app)/index.tsx:70-82`
- Modify: `mobile/app/(app)/providers/[providerId]/order.tsx:101-116, 163-170`

- [ ] **Step 1: Migrate `app/(app)/index.tsx`**

Apply the same four mechanical steps as Task 10. The provider-choice prompt at lines 70–82 becomes:

```tsx
    showAlert({
      title: 'המוצר נמצא אצל כמה ספקים',
      message: isTruncated
        ? `לאיזה ספק לפתוח את ההזמנה? (מוצגים 2 מתוך ${matches.length} ספקים)`
        : 'לאיזה ספק לפתוח את ההזמנה?',
      buttons: [
        { text: 'ביטול', style: 'cancel' as const },
        ...visibleMatches.map((match) => ({
          text: match.providerName,
          onPress: () => navigateToMatch(match),
        })),
      ],
    });
```

Also migrate the two single-button calls in this file:

```tsx
    showAlert({ title: 'שגיאה', message: 'לא ניתן לטעון את נתוני הספקים והמוצרים כרגע. יש לנסות שוב.' });
```

```tsx
    showAlert({ title: 'לא נמצא מוצר תואם', message: 'לא נמצא מוצר עם ברקוד זה אצל אף ספק בסניף.' });
```

- [ ] **Step 2: Migrate `app/(app)/providers/[providerId]/order.tsx`**

The resume-draft prompt at lines 101–116:

```tsx
    showAlert({
      title: 'יש הזמנה פתוחה לספק זה',
      message: 'יש לך הזמנה שטרם הושלמה לספק הזה. להמשיך אותה?',
      buttons: [
        { text: 'לא, התחל חדש', style: 'cancel' },
        {
          text: 'כן, המשך',
          onPress: () => {
            setOrder(resumable);
            setItemsByProductId(
              Object.fromEntries(resumable.items.map((item) => [item.productId, item])),
            );
          },
        },
      ],
    });
```

The unknown-barcode prompt at lines 163–170:

```tsx
      showAlert({
        title: 'לא נמצא מוצר תואם',
        message: `לא נמצא מוצר עם ברקוד ${barcode} בקטלוג של הספק הזה.`,
        buttons: [
          { text: 'ביטול', style: 'cancel' },
          { text: 'הוספת מוצר חדש', onPress: () => setUnknownBarcode(barcode) },
        ],
      });
```

- [ ] **Step 3: Verify**

```bash
cd mobile && npx tsc --noEmit && npm test
```

Expected: no type errors; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add "mobile/app/(app)/index.tsx" "mobile/app/(app)/providers/[providerId]/order.tsx"
git commit -m "feat(mobile): migrate multi-button prompts to AlertProvider"
```

---

### Task 12: Migrate the remaining single-button alerts

**Files:**
- Modify: `mobile/app/(app)/admin/users/new.tsx`
- Modify: `mobile/app/(app)/admin/providers/new.tsx`
- Modify: `mobile/app/(app)/admin/branches/new.tsx`
- Modify: `mobile/app/(app)/departments/new.tsx`
- Modify: `mobile/app/(app)/departments/[departmentId]/add-provider.tsx`
- Modify: `mobile/src/order/AddUnknownProductModal.tsx`

- [ ] **Step 1: Apply the same mechanical change**

Each of these files has exactly one `Alert.alert(title, message)` call. Apply the four steps from Task 10, converting each to:

```tsx
showAlert({ title: 'שגיאה', message: '<the file's existing message, unchanged>' });
```

The existing messages are, respectively: `'יצירת המשתמש נכשלה. יש לנסות שוב.'`, `'יצירת הספק נכשלה. יש לנסות שוב.'`, `'יצירת הסניף נכשלה. יש לנסות שוב.'`, `'יצירת המחלקה נכשלה. יש לנסות שוב.'`, `'הוספת הספק למחלקה נכשלה. יש לנסות שוב.'`, `'הוספת המוצר נכשלה. יש לנסות שוב.'`.

Note `app/(app)/products/[productId]/edit.tsx` and `app/(app)/providers/[providerId]/edit.tsx` also each have two single-button error alerts alongside the destructive one already migrated in Task 10 — migrate those here if Task 10 did not already cover them.

**The per-task file lists above are not exhaustive; the 32-call-site total is.** These were found during implementation and are not called out in any task's worked examples:

- `src/order/PublishButton.tsx` — three single-button calls. Not listed in Task 10, 11, or 12 (Task 16 Step 3 mentions it only as a fallback). Migrate it here.
- `app/(app)/admin/users/index.tsx:21` and `:23` — two single-button alerts colocated with the destructive one Task 10 lists.
- `app/(app)/providers/[providerId]/order.tsx:160` — a single-button variant of the unknown-barcode alert, for non-admins.

Reconcile against the total: if your migrated count is under 32, keep looking.

- [ ] **Step 2: Verify `Alert` is gone from the app entirely**

```bash
cd mobile && grep -rn "Alert\.alert" app src; grep -rln "Alert" app src | xargs grep -l "from 'react-native'" | xargs grep -n "Alert" | grep "from 'react-native'"
```

Expected: no output from either command — no `Alert.alert` call survives, and
no file still imports `Alert` from `react-native`. This is the check that the
migration is actually complete rather than complete-looking.

Do not grep for a bare `\bAlert\b`: `src/ui/findCancelHandler.ts` legitimately
mentions "native Alert behaviour" in a comment, so that pattern reports a
false positive forever.

- [ ] **Step 3: Verify**

```bash
cd mobile && npx tsc --noEmit && npm test
```

Expected: no type errors; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add mobile
git commit -m "feat(mobile): finish migrating Alert.alert to AlertProvider"
```

---

## Stage 3 — Barcode Scanner

`expo-camera`'s web scanning path depends on the browser's `BarcodeDetector` API, which iOS Safari does not implement. A JS/WASM decoder works identically in both mobile browsers.

### Task 13: Barcode reader wrapper

**Files:**
- Create: `mobile/src/barcode/createBarcodeReader.ts`
- Create: `mobile/src/barcode/createBarcodeReader.test.ts`
- Modify: `mobile/package.json`

- [ ] **Step 1: Add the dependencies**

```bash
cd mobile && npm install @zxing/browser @zxing/library
```

Expected: both added to `dependencies` in `mobile/package.json`.

- [ ] **Step 2: Write the failing test**

Create `mobile/src/barcode/createBarcodeReader.test.ts`:

```ts
import { createBarcodeReader } from './createBarcodeReader';

describe('createBarcodeReader', () => {
  const makeFakeZxing = () => {
    const stop = jest.fn();
    let emit: (text: string) => void = () => {};
    const decodeFromVideoDevice = jest.fn(
      (_deviceId: string | undefined, _video: unknown, callback: (result: { getText: () => string } | undefined) => void) => {
        emit = (text) => callback({ getText: () => text });
        return Promise.resolve({ stop });
      },
    );
    return { controls: { decodeFromVideoDevice }, stop, emitScan: (text: string) => emit(text) };
  };

  it('forwards a decoded barcode to onScanned', async () => {
    const fake = makeFakeZxing();
    const onScanned = jest.fn();
    const reader = createBarcodeReader({ reader: fake.controls as never, onScanned });
    await reader.start({} as never);

    fake.emitScan('7290000066318');

    expect(onScanned).toHaveBeenCalledWith('7290000066318');
  });

  it('forwards only the first scan, even when many frames decode', async () => {
    // ZXing's callback fires once per decoded frame, not once per scan. With
    // a barcode held in view it fires many times before the modal closes.
    // Without this guard the same product is added repeatedly.
    const fake = makeFakeZxing();
    const onScanned = jest.fn();
    const reader = createBarcodeReader({ reader: fake.controls as never, onScanned });
    await reader.start({} as never);

    fake.emitScan('7290000066318');
    fake.emitScan('7290000066318');
    fake.emitScan('7290000066318');

    expect(onScanned).toHaveBeenCalledTimes(1);
  });

  it('stops the camera controls on stop()', async () => {
    // A leaked stream leaves the phone's camera indicator lit after the
    // modal closes.
    const fake = makeFakeZxing();
    const reader = createBarcodeReader({ reader: fake.controls as never, onScanned: jest.fn() });
    await reader.start({} as never);

    reader.stop();

    expect(fake.stop).toHaveBeenCalledTimes(1);
  });

  it('stops the camera when stop() is called before start() resolves', async () => {
    // The widest window for this is while the OS permission prompt is up: the
    // user taps cancel, cleanup runs stop(), and only then does ZXing hand
    // back the controls. Nothing else holds a reference to them, so if start()
    // does not stop them here the stream stays live and the phone's camera
    // indicator stays lit after the scanner is gone.
    const stop = jest.fn();
    let resolveStart: (controls: { stop: () => void }) => void = () => {};
    const controls = {
      decodeFromVideoDevice: jest.fn(
        () => new Promise((resolve) => {
          resolveStart = resolve as (c: { stop: () => void }) => void;
        }),
      ),
    };
    const reader = createBarcodeReader({ reader: controls as never, onScanned: jest.fn() });

    const startPromise = reader.start({} as never);
    reader.stop();
    resolveStart({ stop });
    await startPromise;

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('tolerates stop() before start()', async () => {
    const fake = makeFakeZxing();
    const reader = createBarcodeReader({ reader: fake.controls as never, onScanned: jest.fn() });

    expect(() => reader.stop()).not.toThrow();
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

```bash
cd mobile && npx jest src/barcode/createBarcodeReader.test.ts
```

Expected: FAIL — `Cannot find module './createBarcodeReader'`.

- [ ] **Step 4: Implement**

Create `mobile/src/barcode/createBarcodeReader.ts`:

```ts
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

interface CreateBarcodeReaderOptions {
  onScanned: (barcode: string) => void;
  // Injectable so the scan-once guard and teardown can be tested without a
  // real camera.
  reader?: BrowserMultiFormatReader;
}

export interface BarcodeReader {
  start: (video: HTMLVideoElement) => Promise<void>;
  stop: () => void;
}

// The same formats the native scanner was configured for. Restricting the
// set makes decoding faster and avoids false positives from formats that
// never appear on grocery packaging.
const FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
];

export function createBarcodeReader({
  onScanned,
  reader,
}: CreateBarcodeReaderOptions): BarcodeReader {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS);
  const zxing = reader ?? new BrowserMultiFormatReader(hints);

  let controls: IScannerControls | null = null;
  // Not state: the decode callback fires once per frame, and a state update
  // would not have applied before the next frame arrives.
  let hasScanned = false;
  // start() is async, so stop() can land while getUserMedia and ZXing are
  // still negotiating — most often when the user dismisses the scanner with
  // the OS permission prompt still up. Without this flag that stop() is a
  // no-op (controls is still null), and the controls that arrive afterwards
  // are never stopped by anyone: the stream stays live and the phone's
  // camera indicator stays lit after the scanner is gone.
  let stopped = false;

  return {
    async start(video: HTMLVideoElement) {
      hasScanned = false;
      stopped = false;
      const started = await zxing.decodeFromVideoDevice(undefined, video, (result) => {
        if (!result || hasScanned) {
          return;
        }
        hasScanned = true;
        onScanned(result.getText());
      });
      if (stopped) {
        started.stop();
        return;
      }
      controls = started;
    },
    stop() {
      stopped = true;
      controls?.stop();
      controls = null;
    },
  };
}
```

- [ ] **Step 5: Run the test and confirm it passes**

```bash
cd mobile && npx jest src/barcode/createBarcodeReader.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/barcode/createBarcodeReader.ts mobile/src/barcode/createBarcodeReader.test.ts mobile/package.json mobile/package-lock.json
git commit -m "feat(mobile): add ZXing barcode reader wrapper"
```

---

### Task 14: Rewrite `BarcodeScannerModal`

**Its props (`visible`, `onScanned`, `onClose`) do not change**, so its consumer in `app/(app)/providers/[providerId]/order.tsx` is untouched.

**Files:**
- Modify: `mobile/src/barcode/BarcodeScannerModal.tsx`

- [ ] **Step 1: Replace the component**

Replace the entire contents of `mobile/src/barcode/BarcodeScannerModal.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { createBarcodeReader } from './createBarcodeReader';

interface BarcodeScannerModalProps {
  visible: boolean;
  onScanned: (barcode: string) => void;
  onClose: () => void;
}

type Status = 'starting' | 'scanning' | 'denied' | 'unavailable';

// Manual entry, for exercising the scan flow where no usable camera exists:
// a desktop browser, or a device that denied permission. Previously
// __DEV__-only; a browser build has more legitimate no-camera cases, so it is
// now reachable whenever the camera cannot be used.
function ManualBarcodeEntry({
  onScanned,
  onRetryCamera,
}: {
  onScanned: (barcode: string) => void;
  onRetryCamera: () => void;
}) {
  const [value, setValue] = useState('');
  return (
    <View style={styles.devContainer}>
      <Text style={styles.devTitle}>הזנת ברקוד ידנית</Text>
      <TextInput
        style={styles.devEntryInput}
        placeholder="ברקוד"
        value={value}
        onChangeText={setValue}
        keyboardType="number-pad"
        autoFocus
      />
      <Pressable
        style={styles.devEntryButton}
        disabled={!value}
        onPress={() => onScanned(value)}
      >
        <Text style={styles.devEntryButtonText}>אישור</Text>
      </Pressable>
      <Pressable style={styles.devSwitchButton} onPress={onRetryCamera}>
        <Text style={styles.devSwitchButtonText}>מעבר למצלמה</Text>
      </Pressable>
    </View>
  );
}

export function BarcodeScannerModal({ visible, onScanned, onClose }: BarcodeScannerModalProps) {
  const [status, setStatus] = useState<Status>('starting');
  const [useManualEntry, setUseManualEntry] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Both call sites pass a fresh closure for these on every render, so
  // depending on them directly would tear down and restart the camera
  // whenever the parent screen re-renders — including on the React Query
  // refetch that the permission prompt's own focus change can trigger,
  // right as the stream is coming up. Read them through a ref instead.
  const handlersRef = useRef({ onScanned, onClose });
  handlersRef.current = { onScanned, onClose };
  const readerRef = useRef<ReturnType<typeof createBarcodeReader> | null>(null);

  useEffect(() => {
    if (!visible || useManualEntry) {
      return;
    }
    let cancelled = false;
    setStatus('starting');

    const reader = createBarcodeReader({
      onScanned: (barcode) => {
        reader.stop();
        handlersRef.current.onScanned(barcode);
        handlersRef.current.onClose();
      },
    });
    readerRef.current = reader;

    (async () => {
      const video = videoRef.current;
      if (!video) {
        return;
      }
      try {
        await reader.start(video);
        if (!cancelled) {
          setStatus('scanning');
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        // NotAllowedError is a denied permission prompt; anything else
        // (no camera, insecure context) is not something the user can grant.
        const name = (error as { name?: string })?.name;
        setStatus(name === 'NotAllowedError' ? 'denied' : 'unavailable');
      }
    })();

    return () => {
      cancelled = true;
      // Must run on every close, or the phone's camera indicator stays lit.
      reader.stop();
      readerRef.current = null;
    };
  }, [visible, useManualEntry]);

  useEffect(() => {
    if (visible) {
      setUseManualEntry(false);
    }
  }, [visible]);

  if (!visible) {
    return null;
  }

  if (useManualEntry) {
    return (
      <Modal visible transparent>
        <View style={styles.centered}>
          <ManualBarcodeEntry
            onScanned={(barcode) => {
              onScanned(barcode);
              onClose();
            }}
            onRetryCamera={() => setUseManualEntry(false)}
          />
          <Pressable onPress={onClose} style={styles.button}>
            <Text>ביטול</Text>
          </Pressable>
        </View>
      </Modal>
    );
  }

  if (status === 'denied' || status === 'unavailable') {
    return (
      <Modal visible transparent>
        <View style={styles.centered}>
          <Text style={styles.statusText}>
            {status === 'denied'
              ? 'נדרשת גישה למצלמה כדי לסרוק ברקודים. יש לאשר את ההרשאה בהגדרות הדפדפן.'
              : 'לא נמצאה מצלמה זמינה במכשיר זה.'}
          </Text>
          <Pressable onPress={() => setUseManualEntry(true)} style={styles.button}>
            <Text>הזנת ברקוד ידנית</Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.button}>
            <Text>ביטול</Text>
          </Pressable>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible>
      <View style={styles.cameraContainer}>
        {/* playsInline and muted are both required for inline playback in
            iOS Safari — without them the video takes over the whole screen
            in the native player and the decoder never sees a frame. */}
        <video
          ref={videoRef}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          playsInline
          muted
          autoPlay
        />
        {status === 'starting' ? (
          <Text style={styles.startingText}>מפעיל את המצלמה…</Text>
        ) : null}
      </View>
      <Pressable onPress={() => setUseManualEntry(true)} style={styles.manualButton}>
        <Text style={styles.closeButtonText}>הזנה ידנית</Text>
      </Pressable>
      <Pressable onPress={onClose} style={styles.closeButton}>
        <Text style={styles.closeButtonText}>ביטול</Text>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: 'white',
    padding: 24,
  },
  statusText: { textAlign: 'center', fontSize: 15, color: '#444', lineHeight: 21 },
  cameraContainer: { flex: 1, backgroundColor: 'black' },
  startingText: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    color: 'white',
    fontSize: 15,
  },
  button: { padding: 12, borderWidth: 1, borderRadius: 8 },
  closeButton: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
  },
  manualButton: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
  },
  closeButtonText: { fontWeight: '600' },
  devContainer: { width: '85%', gap: 10, alignItems: 'stretch' },
  devTitle: { textAlign: 'center', color: '#666', fontSize: 13 },
  devEntryInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  devEntryButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  devEntryButtonText: { color: 'white', fontWeight: '600' },
  devSwitchButton: { paddingVertical: 10, alignItems: 'center' },
  devSwitchButtonText: { color: '#2563eb', fontWeight: '600' },
});
```

- [ ] **Step 2: Verify `expo-camera` is no longer imported anywhere**

```bash
cd mobile && grep -rn "expo-camera" app src
```

Expected: no output.

- [ ] **Step 3: Verify**

```bash
cd mobile && npx tsc --noEmit && npm test
```

Expected: no type errors; all tests pass.

**If `tsc` rejects the `<video>` element**, React Native's JSX types do not include DOM elements. Add `"dom"` to `compilerOptions.lib` in `mobile/tsconfig.json` and re-run. Do not suppress the error with `any` — the ref type is what makes the ZXing call site correct.

- [ ] **Step 4: Verify on a real device**

Push the branch and open the Cloudflare preview URL on the iPhone (installed to the home screen). Tap "סריקת ברקוד" on a provider's order screen.

Expected: permission prompt, then a live camera preview inline (not fullscreen), and a real product barcode decodes and matches. Test the manual-entry fallback too.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/barcode/BarcodeScannerModal.tsx mobile/tsconfig.json
git commit -m "feat(mobile): scan barcodes with ZXing so scanning works in iOS Safari"
```

---

## Stage 4 — RTL Cleanup, Safe Areas, and Polish

Grouped last because these are driven by what the device checklist actually reveals on hardware.

### Task 15: Remove the native RTL mechanism

**Already done in Task 0.** This work was pulled forward to the start of
Stage 1 after it turned out to cause an infinite reload loop that blocked
every browser verification step. See Task 0 for the full reasoning.

- [ ] **Step 1: Confirm it is actually gone**

```bash
cd mobile && ls src/i18n 2>&1; grep -rn "ensureRTL\|I18nManager\|isRtlReady" app src
```

Expected: `src/i18n` does not exist, and the grep returns no output. If either
check fails, do Task 0 now.

---

### Task 16: Fix the publish button on iPhone

Two separate bugs in the same file, both specific to a browser target.

**Files:**
- Modify: `mobile/src/order/PublishButton.tsx`

- [ ] **Step 1: Apply the bottom inset unconditionally**

`Platform.OS === 'android'` evaluates to `false` on web, so today the app's single most important action renders underneath the iPhone home indicator. Replace:

```ts
  const androidBottomInset = Platform.OS === 'android' ? insets.bottom : 0;
```

with:

```ts
  // The root layout's SafeAreaView only reserves the top edge, so nothing
  // pads this button away from the bottom of the screen — the iPhone home
  // indicator on an installed PWA, or Android's gesture bar. Applied
  // unconditionally: the inset is zero on devices that have no such area.
  const bottomInset = insets.bottom;
```

and update the style reference from `androidBottomInset` to `bottomInset`. Remove the now-unused `Platform` import.

- [ ] **Step 2: Make the WhatsApp hand-off popup-safe**

`Linking.openURL` maps to `window.open` on web, and Safari blocks `window.open` when it is not synchronous with a user gesture. The current code `await`s `Linking.canOpenURL(url)` first, which breaks the gesture chain — so publishing would silently do nothing on iPhone.

Replace the `canOpenURL` check and `openURL` call in `handlePublish`:

```ts
      const message = buildOrderMessage({ ...order, items });
      const phoneDigitsOnly = toWhatsAppPhoneNumber(order.provider.phone);
      const url = `https://wa.me/${phoneDigitsOnly}?text=${encodeURIComponent(message)}`;
      // Hand off in a separate browsing context rather than navigating this
      // one. Assigning location.href would begin unloading the page, and the
      // browser cancels in-flight requests on unload — so the publishOrder
      // call below would never complete and the order would stay a draft
      // even though the message was sent, inviting a duplicate send.
      //
      // Called synchronously, before this function's first await: Safari
      // blocks window.open once the user-gesture chain is broken, which is
      // also why the old canOpenURL check is gone. wa.me redirects to the
      // WhatsApp app on mobile and to web.whatsapp.com on desktop, so there
      // is nothing left to feature-detect.
      const handedOff = window.open(url, '_blank');
      if (!handedOff) {
        // Blocked anyway. Navigating this tab always works, at the cost of
        // losing the publishOrder call — better than not sending the order.
        window.location.href = url;
      }
```

Delete the now-unreachable `'לא ניתן לפתוח את WhatsApp'` alert branch that the `canOpenURL` check guarded, and remove the `Linking` import. Keep the outer `try/catch` and the `'ההודעה נשלחה, אך סימון ההזמנה נכשל'` alert — both are still reachable.

- [ ] **Step 3: Migrate this file's remaining alerts**

If not already done in Stage 2, convert this file's `Alert.alert` calls to `useAlert()` following Task 10's pattern, and confirm `Alert` is no longer imported.

- [ ] **Step 4: Verify**

```bash
cd mobile && npx tsc --noEmit && npm test
```

Expected: no type errors; all tests pass. `buildOrderMessage.test.ts` and `whatsappPhone.test.ts` cover the message and phone formatting, which this task does not change.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/order/PublishButton.tsx
git commit -m "fix(mobile): keep publish button clear of the home indicator and popup-safe"
```

---

### Task 17: Input zoom and safe-area verification on hardware

This task is verification-driven: the fixes are conditional on what the device actually shows.

- [ ] **Step 1: Deploy and install**

```bash
git push
```

Open the Cloudflare preview URL on the iPhone in Safari, Add to Home Screen, and launch from there. **Safe-area insets resolve differently in a Safari tab than in standalone mode**, so testing in a tab proves nothing about this.

- [ ] **Step 2: Check input zoom**

Tap a text input on the login screen and on the product-edit screen.

Expected: the viewport does **not** zoom. The `input, textarea, select { font-size: 16px }` rule from Task 2 should cover this. If a field still zooms, it is a React Native `TextInput` whose inline `fontSize` beats the stylesheet — most likely `quantityInput` in `app/(app)/providers/[providerId]/order.tsx` (currently `fontSize: 15`). Raise that specific style to `16`.

- [ ] **Step 3: Check safe areas**

Expected: no content sits under the notch at the top, and the publish button on an order screen is fully visible and tappable above the home indicator.

If content is clipped at the top, `react-native-safe-area-context` is reporting zero insets on web. Fall back to CSS by adding to the `<style>` block in `mobile/scripts/patch-html.mjs`:

```css
  body {
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
  }
```

and change `app/_layout.tsx`'s `<SafeAreaView style={{ flex: 1 }} edges={['top']}>` to a plain `<View style={{ flex: 1 }}>`, removing the now-unused `SafeAreaView` import. Do not apply both mechanisms at once — that double-pads the top.

- [ ] **Step 4: Commit whatever the device required**

```bash
git add mobile
git commit -m "fix(mobile): correct input zoom and safe-area insets on iOS"
```

---

### Task 18: Full device checklist

Run against the preview URL, on an iPhone with the app **installed to the home screen**, and once on an Android phone. This is spec §7's checklist and it is the acceptance gate for the whole project.

- [ ] Install to home screen — correct icon, correct name, launches standalone with no browser chrome
- [ ] Log in; force-quit the app; relaunch — still logged in
- [ ] Every screen renders right-to-left with correct alignment: login, branch select, providers list, order, activity, departments, all admin screens
- [ ] Product search returns results and the Hebrew keyboard behaves
- [ ] Tapping any text input does **not** zoom the viewport
- [ ] Barcode scan opens the camera, decodes a real product barcode, and matches it
- [ ] Scan an unknown barcode — the two-button prompt appears with a working Cancel
- [ ] Delete an order and a product — the confirmation shows both buttons, and Cancel actually cancels
- [ ] Build and publish an order — WhatsApp opens with the correct message and recipient
- [ ] The publish button is fully visible and tappable, not under the home indicator
- [ ] Pull down on a scrollable screen — no rubber-band or refresh gesture
- [ ] Deploy a change, relaunch the app — the new version loads (no stale build)

- [ ] **Merge when the checklist is green**

```bash
git checkout main && git merge pwa-web-app && git push
```

Per `CLAUDE.md`, pushing to `main` deploys production — so this push is the release. Cloudflare builds `main` to the production URL.

---

## Post-Merge: Cutover

Not code. Tracked here so it does not get lost (spec §10).

- [ ] Send the supermarket owner the production URL with Hebrew install instructions. **Emphasise installing to the home screen rather than bookmarking**: an installed PWA is exempt from Safari's 7-day unused-storage eviction, but a Safari tab is not, so a bookmarked app silently logs him out after a week of inactivity.
- [ ] Both apps work in parallel — the Play Store build talks to the same backend and keeps working. There is no forced cutover moment.
- [ ] Confirm he is using the PWA daily with no regressions.
- [ ] **After roughly two weeks of the PWA being the real client**: unpublish the Play Store listing, delete `mobile/eas.json`, remove the `ios` / `android` / native-plugin blocks from `mobile/app.config.ts`, and uninstall `expo-camera`, `expo-secure-store`, and `expo-updates`. Until this step, a native build remains one `eas build` away.
