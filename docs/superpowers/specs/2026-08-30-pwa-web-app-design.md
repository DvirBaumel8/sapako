# Sapako as an Installable Web App (PWA) — Design

## 1. Purpose & Scope

Sapako today ships as a native app through the Play Store and App Store.
Development started on Android because it was the free path, but the primary
developer uses an iPhone. The result is that no one can fully exercise the
app before it reaches the supermarket owner who uses it daily — he discovers
bugs the developer had no way to see first.

This design replaces the native clients with a single installable web app
(PWA), served from a URL and added to the phone's home screen, where it
launches standalone and feels like a native app. The same phone, the same
screens, the same code — but every change gets a preview URL the developer
can open on their own iPhone before it reaches `main`.

The existing Expo codebase already has `react-native-web` and `expo-router`
(`mobile/package.json`), so `expo export --platform web` builds a web SPA
from the current source. This is a port, not a rewrite.

**In scope:** web export configuration, the PWA shell (manifest, icons,
service worker, install metadata), static hosting with per-branch preview
URLs, and the code changes required for the app to behave correctly in
mobile Safari and Chrome.

**Out of scope:** offline data (see §8), any change to the backend's domain
logic or database, any change to the app's feature set or visual design
beyond what mobile-browser correctness requires, and deleting the native
build configuration (see §9 — deliberately deferred as a rollback path).

## 2. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Native vs. web | Web fully replaces native | Solves the untestable-iPhone problem at its root; one client to keep correct instead of three |
| Barcode scanning | JS/WASM decoder (`@zxing/browser`) | `BarcodeDetector` is absent in iOS Safari; a JS decoder keeps the feature working on the developer's own device |
| Hosting | Cloudflare Pages, git-connected | Free static hosting with a unique preview URL per branch — the mechanism that makes pre-release device testing possible. Chosen over Vercel because its preview URLs are predictable (`<branch>.<project>.pages.dev`) and so can be matched by a CORS pattern (§5); Vercel's are hash-based |
| Offline | Shell caching only | Small and predictable; no queued-mutation or conflict-resolution complexity. Data operations require the network |
| Cutover | Soft | The Play Store build keeps working against the same backend, so nothing breaks the moment the PWA deploys |

## 3. Web Export & Document Shell

### `app.config.ts`

The `web` block becomes:

```ts
web: {
  output: 'single',
  favicon: './assets/favicon.png',
}
```

`output: 'single'` is SPA mode — one `index.html`, client-side routing
through expo-router. This suits an auth-gated app where no route is
publicly meaningful and there is nothing to pre-render.

Native config (`ios`, `android`, `plugins`) stays in the file unchanged.
It costs nothing at web-export time and preserves the ability to build a
native binary if the web version has to be rolled back.

Also update `name` and `slug` from the placeholder `'mobile'` to `'sapako'`.

### `mobile/scripts/patch-html.mjs` (new)

**Expo SDK 57 does not apply `app/+html.tsx` under `output: 'single'`** —
verified on this project: the emitted `dist/index.html` is Expo's bare
default template, and a `+html.tsx` containing the tags below produced none
of them in the build. A post-build patch of `dist/index.html` is therefore
the only mechanism that works, and is the single source of truth for the
document shell. It is wired up as `npm run build:web`
(`expo export --platform web && node scripts/patch-html.mjs`), which replaces
a bare export everywhere including the hosting build command.

The script is idempotent (guarded by a marker comment) and rewrites rather
than appends, so the template's own `lang` and viewport tags are replaced
instead of duplicated. It solves four concerns:

1. **RTL** — rewrites the opening tag to `<html lang="he" dir="rtl">`. This
   is the actual mechanism for right-to-left on the web, replacing
   `I18nManager.forceRTL` (§4.1).
2. **Notch handling** — replaces the template's viewport tag with one
   carrying `viewport-fit=cover`, which is what makes CSS
   `env(safe-area-inset-*)` resolve to non-zero values on iPhone (§4.4).
3. **Install metadata** — `<link rel="manifest">`,
   `<link rel="apple-touch-icon">`, `apple-mobile-web-app-capable`,
   `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`,
   and `theme-color`. Without these, "Add to Home Screen" on iOS produces a
   Safari bookmark that opens with browser chrome visible, not a standalone
   app. The template already emits `<title>Sapako</title>` from
   `app.config.ts`'s `name`, so the title needs no injection.
4. **Global CSS and service worker registration** — the mobile-browser
   polish of §4.5, and the `navigator.serviceWorker.register('/sw.js')` call.

### `mobile/public/` (new)

Expo copies this directory verbatim to the export root.

- **`manifest.webmanifest`** — `name: "Sapako"`, `short_name: "Sapako"`,
  `display: "standalone"`, `dir: "rtl"`, `lang: "he"`, `start_url: "/"`,
  `background_color` and `theme_color` matching the app's existing palette,
  and icon entries pointing at the files below.
- **`icon-512.png`** — 512×512, `purpose: "any maskable"`, derived from the
  existing `assets/icon.png`.
- **`icon-192.png`** — 192×192, same source.
- **`apple-touch-icon.png`** — 180×180. iOS ignores the manifest's icons for
  home-screen installation and reads only this file.
- **`sw.js`** — the service worker (§3.1).

### 3.1 Service Worker Strategy

Deliberately conservative, because the most common PWA failure mode is
pinning users to a stale build forever — which would be especially bad
here, where pushing to `main` deploys live.

- **Content-hashed bundle assets** (`/_expo/static/**`): cache-first. These
  filenames change on every build, so a cached copy can never be stale.
- **`index.html` and the manifest**: network-first, falling back to cache
  only when offline. A new deploy is therefore picked up on the next launch.
- **API requests** (anything to the Railway origin): not intercepted at all.
  They pass straight through to the network.

Old caches are deleted in the `activate` handler, keyed by a build-stamped
cache name.

## 4. Client Code Changes

### 4.1 RTL

Delete `src/i18n/rtl.ts` and its invocation in `app/_layout.tsx`. Direction
is set declaratively in `+html.tsx` instead.

**This is a blocking prerequisite, not cleanup.** As committed, the pair
causes an infinite reload loop in a production web build:
`react-native-web`'s `I18nManager.forceRTL()` is an empty function and its
`getConstants()` returns a hardcoded `{ isRTL: false }`, so `_layout.tsx`'s
`if (!I18nManager.isRTL)` guard is permanently true; `ensureRTL()` then
reaches `Updates.reloadAsync()`, which throws only when `__DEV__` is true and
otherwise calls `window.location.reload(true)`. Mount reloads the page, which
mounts again. The loop is invisible on native, where a restart genuinely does
set `isRTL` and terminates it.

This also removes the `isRtlReady` state gate in `RootLayout`, which
currently returns `null` on the first render pass. With direction fixed at
the document level there is nothing to wait for, so the app paints
immediately.

**Expected impact on layout: small.** The screens use physical
`textAlign: 'right'` (`app/(app)/index.tsx`, `app/(app)/activity.tsx`,
`app/(app)/providers/[providerId]/order.tsx`, and ~12 other sites) and plain
`flexDirection: 'row'`. Under `dir="rtl"` the browser resolves both the same
way React Native does with `forceRTL` active, so most layout should be
correct without change. This still requires a screen-by-screen visual check
(§7), but it is not expected to be a rewrite.

### 4.2 Replacing `Alert.alert`

`react-native-web`'s `Alert` is a thin `window.alert` shim with no
multi-button support. There are 32 `Alert.alert` call sites across 15 files;
the multi-button ones are the ones that actually break, and they are the
destructive ones. Losing the "Cancel" branch of a delete confirmation is a
data-loss bug, not a cosmetic one.

**New: `src/ui/AlertProvider.tsx`** — a context provider mounted in
`app/_layout.tsx` inside `AuthProvider`, exposing:

```ts
showAlert(options: {
  title: string;
  message?: string;
  buttons?: Array<{
    text: string;
    style?: 'default' | 'cancel' | 'destructive';
    onPress?: () => void;
  }>;
}): void
```

The option shape intentionally mirrors `Alert.alert`'s so that migrating
call sites is mechanical rather than a redesign. It renders a React Native
`Modal` (which `react-native-web` supports) styled to match the app, with
`cancel` buttons rendered neutrally and `destructive` ones in the existing
`#c0392b`. Dismissing without choosing runs the `cancel` button's handler if
one exists, matching native behaviour.

Confirmed multi-button call sites requiring migration:

| Site | Prompt |
|---|---|
| `app/(app)/activity.tsx:61` | Delete an order (irreversible) |
| `app/(app)/products/[productId]/edit.tsx:53` | Delete a product (irreversible) |
| `app/(app)/providers/[providerId]/order.tsx:103` | Resume an unfinished draft order |
| `app/(app)/providers/[providerId]/order.tsx:165` | Unrecognised barcode — add product or cancel |
| `app/(app)/index.tsx:74` | Choose which provider to open an order for |

Single-button `Alert.alert` calls migrate to the same helper for
consistency, so `Alert` is no longer imported anywhere in the app.

### 4.3 Barcode Scanner

`src/barcode/BarcodeScannerModal.tsx` is rewritten internally. **Its props
(`visible`, `onScanned`, `onClose`) do not change**, so its consumer in
`app/(app)/providers/[providerId]/order.tsx` is untouched.

- `expo-camera`'s `CameraView` is replaced by `getUserMedia({ video: {
  facingMode: 'environment' } })` rendered into a `<video>` element with
  `playsinline` and `muted` set — both are required for inline playback in
  iOS Safari rather than a fullscreen takeover.
- Decoding uses `@zxing/browser` + `@zxing/library`, which decode in JS/WASM
  and therefore work identically in iOS Safari and Android Chrome. The
  browser's native `BarcodeDetector` is not used, because iOS Safari does
  not implement it.
- The camera stream and the decoder are both torn down on close and on
  unmount. A leaked camera stream leaves the phone's camera indicator lit.
- Permission denial renders an explanatory message in Hebrew with a retry
  affordance, replacing `useCameraPermissions`.
- The existing dev-only manual-entry path is kept, and its gate widened from
  `__DEV__` to also cover the case where no camera is available. This makes
  the scan flow testable in a desktop browser.

Camera access requires HTTPS, which both hosting options provide.

`expo-camera`'s `cameraPermission` string in `app.config.ts` becomes
irrelevant to the web build but is left in place with the rest of the native
config.

### 4.4 Safe Areas

`react-native-safe-area-context` documents web support that reads CSS
`env(safe-area-inset-*)`, which the `viewport-fit=cover` meta tag (§3)
enables. If that works, `SafeAreaView` in `app/_layout.tsx` needs no change.
**This must be verified on a real iPhone**, installed to the home screen —
insets resolve differently in a Safari tab than in standalone mode. If it
reports zeros, the fallback is a CSS-driven root padding in `+html.tsx`
using `env()` custom properties, and removing the RN-side safe-area handling.

Independent of that outcome, `src/order/PublishButton.tsx` has a definite
bug for this target:

```ts
const androidBottomInset = Platform.OS === 'android' ? insets.bottom : 0;
```

On web this evaluates to `0`, so the publish button — the app's single most
important action — renders underneath the iPhone home indicator. The
platform guard is removed and the inset applied unconditionally.

The same file has a second browser-specific defect. `Linking.openURL` maps to
`window.open` on web, and Safari blocks `window.open` unless it is
synchronous with a user gesture. `handlePublish` currently `await`s
`Linking.canOpenURL(url)` before opening, which breaks the gesture chain — so
on iPhone, tapping publish would silently do nothing. The fix is to navigate
in the same tab (`window.location.href = url`) and drop the `canOpenURL`
check entirely: `wa.me` is an ordinary HTTPS URL that redirects to the
WhatsApp app on mobile and to `web.whatsapp.com` on desktop, so there is
nothing to feature-detect. The "WhatsApp is not installed" alert branch that
check guarded becomes unreachable and is removed; the publish-marking failure
alert stays, because it is still reachable.

### 4.5 Mobile Browser Polish

- **Input zoom.** Mobile Safari zooms the viewport whenever a focused
  `input` renders below 16px, and does not zoom back out. The shared `input`
  style repeated across the form screens sets no `fontSize` (inheriting
  `react-native-web`'s smaller default) and `quantityInput` in
  `order.tsx` is explicitly 15px — so today every text field tap would zoom.
  Fix is a 16px floor on all text inputs. **Not** a `maximum-scale=1`
  viewport lock, which would break pinch-zoom accessibility app-wide.
- **Overscroll.** `overscroll-behavior: none` on the root, to remove the
  rubber-band and pull-to-refresh gestures that read as broken in a
  standalone app.
- **Tap highlight.** `-webkit-tap-highlight-color: transparent` and
  `-webkit-touch-callout: none` on interactive elements, to remove the grey
  flash and long-press callout that mark a page as a web page.

### 4.6 Session Persistence

No code change required. `src/auth/tokenStorage.ts` already branches on
`Platform.OS === 'web'` to use `localStorage`, and `tokenStorage.test.ts`
already covers that branch.

One operational note that belongs in the user-facing install instructions:
an **installed** home-screen PWA is exempt from Safari's 7-day unused-storage
eviction, but a plain Safari tab is not. A user who bookmarks the URL
instead of installing it will be silently logged out after a week of
inactivity. "Install it, don't bookmark it" is functional advice.

## 5. Backend Changes

Only one, in `backend/src/main.ts`:

```ts
app.enableCors();   // currently wide open
```

becomes an origin allowlist covering the production web origin plus a
pattern matching the host's preview-deployment subdomains. The backend
authenticates with a bearer JWT rather than cookies, so CORS is not the
security boundary here — this is hygiene, and it should not be allowed to
block preview URLs from working.

No other backend change. No database change. No API change.

## 6. Build & Deploy

**Host:** Cloudflare Pages, connected to the GitHub repo. (Vercel is an
equivalent alternative on every axis except preview-URL predictability, which
§5 depends on.)

| Setting | Value |
|---|---|
| Root directory | `mobile` |
| Build command | `npx expo export --platform web` |
| Output directory | `dist` |
| SPA rewrite | all unmatched paths → `/index.html` |
| Build env | `API_BASE_URL=https://sapako-backend-production.up.railway.app` |

The SPA rewrite is required: without it, a deep link or a page refresh on
`/providers/3/order` returns a 404 instead of booting the app.

`API_BASE_URL` is already read at config-evaluation time in `app.config.ts`
and surfaced through `extra.apiBaseUrl`, so no client code changes to
consume it. It is the same backend URL `mobile/eas.json` already targets.

**Preview URLs are the point of this project.** Every branch builds to
`<branch>.<project>.pages.dev`. The workflow becomes: build locally,
push a branch, open its preview URL on an actual iPhone, verify, then merge
to `main`. This is what replaces the current "ship it and let the friend
find the bugs" loop, and it is compatible with `CLAUDE.md`'s push-to-`main`
deploy model — `main` still deploys production.

**New: `.github/workflows/mobile-ci.yml`.** The repo currently has CI for
`backend/**` only. Mirror it for `mobile/**`: `npm ci`, `npx tsc --noEmit`,
`npm test`.

## 7. Testing

### Automated

The existing unit tests are pure logic and are unaffected by this work:
`fuzzySearch`, `buildOrderMessage`, `whatsappPhone`, `resolveBarcodeMatches`,
`buildProviderSearchResults`, `findResumableDraft`, `departmentIntersection`,
`hebrewInput`, `phoneValidation`. `tokenStorage.test.ts` already covers the
web branch this design relies on.

New tests:
- `AlertProvider` — that each button's `onPress` fires and the dialog
  dismisses; that dismissal without a choice runs the `cancel` handler.
- The barcode decoder wrapper — that a decoded value is forwarded to
  `onScanned` exactly once, and that streams are torn down on close.

`src/i18n/rtl.ts` has no test today, so its deletion removes no coverage.

### Manual device checklist

Run against a preview URL, on an iPhone with the app **installed to the home
screen** (not in a Safari tab), and once on an Android phone:

1. Install to home screen — correct icon, correct name, launches standalone
   with no browser chrome.
2. Log in; force-quit; relaunch — still logged in.
3. Every screen renders right-to-left with correct alignment: login, branch
   select, providers list, order, activity, departments, all admin screens.
4. Product search returns results and the Hebrew keyboard behaves.
5. Tapping any text input does **not** zoom the viewport.
6. Barcode scan opens the camera, decodes a real product barcode, and
   matches it.
7. Scan an unknown barcode — the two-button prompt appears with a working
   Cancel.
8. Delete an order and a product — the confirmation shows both buttons, and
   Cancel actually cancels.
9. Build and publish an order — WhatsApp opens with the correct message and
   recipient.
10. The publish button is fully visible and tappable, not under the home
    indicator.
11. Pull down on a scrollable screen — no rubber-band or refresh gesture.
12. Deploy a change, relaunch the app — the new version loads (service
    worker does not pin a stale build).

## 8. Sequencing

Each stage is independently verifiable on a preview URL, so the app is never
broken for more than one stage at a time.

1. **Web export + shell + hosting** (§3, §5, §6) — first, so there is a live
   URL to test everything else against. At the end of this stage the app is
   installable and reachable, with known-broken dialogs and scanning.
2. **`AlertProvider` and the 32 call-site migration** (§4.2) — the largest
   mechanical change and the one fixing an actual data-loss risk.
3. **Barcode scanner rewrite** (§4.3) — self-contained behind an unchanged
   prop interface.
4. **RTL cleanup, safe areas, and mobile polish** (§4.1, §4.4, §4.5) —
   grouped last because they are driven by what the device checklist (§7)
   actually reveals on hardware.

## 9. Explicitly Deferred

- **Offline data.** No API response caching and no queued mutations. Data
  operations require the network; failures surface as errors and are
  retried by the user. Revisit only if reception in the shop proves to be a
  real problem in practice.
- **Push notifications.** Not a current feature on native either.
- **Removing native dependencies.** `expo-camera`, `expo-secure-store` and
  `expo-updates` stay in `package.json` after their web code paths stop
  using them. They are dropped together with the native config in §9.

## 10. Cutover

The cutover is soft by design. The Play Store build talks to the same
backend and keeps working after the PWA deploys, so there is no moment where
the supermarket owner is without a working app.

1. Deploy the PWA to production; verify §7 on the developer's iPhone.
2. Send the owner the URL with Hebrew install instructions, emphasising
   installing rather than bookmarking (§4.6). Both apps work in parallel.
3. Confirm he is using the PWA daily and reporting no regressions.
4. **After roughly two weeks of the PWA being the real client**, unpublish
   the Play Store listing, delete `mobile/eas.json`, remove the `ios` /
   `android` / native-plugin blocks from `app.config.ts`, and drop
   `expo-camera`, `expo-secure-store` and `expo-updates`.

Step 4 is deliberately last and deliberately delayed. Until it happens, a
native build remains one `eas build` away.
