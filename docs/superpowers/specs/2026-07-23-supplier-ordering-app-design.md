# Supplier Ordering App — Design

## 1. Purpose & Scope

A mobile app for a supermarket owner (and his employees) to manage ordering from
suppliers ("providers"). The owner runs multiple branches, each with its own set
of providers and product catalogs. Employees build an order for a specific
provider, and publishing the order opens WhatsApp with a pre-filled message
containing the order details — the user still taps send themselves.

**Phase 1** serves a single supermarket (one owner, a handful of employees). No
multi-tenant support, no public app store listing. The goal is a lean, real tool
this specific business can start using immediately, with a data model that
doesn't need to be reworked when phase 2 features (photo upload, GS1 catalog
import) get added.

**UI language:** the entire mobile app is in Hebrew, right-to-left, matching the
reference screenshots. This is not a translation layer over an English app —
there is no English UI in phase 1. This also applies to the WhatsApp message
text the app generates when publishing an order, since that's what a real
Hebrew-speaking supplier receives.

## 2. High-Level Architecture

```
┌─────────────────────┐         ┌──────────────────────┐
│   Mobile App          │  HTTPS  │   NestJS API           │
│   (Expo/React Native) │────────▶│   (Railway)            │
│   iOS + Android        │◀────────│   REST + JWT auth      │
└─────────────────────┘         └───────────┬──────────┘
        │                                     │
        │ deep link                           │ TypeORM
        ▼                                     ▼
┌─────────────────────┐         ┌──────────────────────┐
│   WhatsApp App          │         │   PostgreSQL (Railway) │
│   (pre-filled message) │         │   Branches/Providers/   │
└─────────────────────┘         │   Products/Orders/Users │
                                    └──────────────────────┘
```

- **Mobile app**: Expo (React Native + TypeScript). Talks to the API over REST,
  holds a JWT after login, caches provider product lists client-side via
  TanStack Query.
- **Backend**: NestJS REST API. Owns all business logic, auth, and RBAC
  (branch + provider level permissions).
- **Database**: single PostgreSQL instance on Railway.
- **WhatsApp integration**: no API integration — the app builds a `wa.me` deep
  link (`https://wa.me/<provider phone>?text=<encoded order text>`) and opens
  it. WhatsApp handles the actual send.
- **CI/CD**: Railway auto-deploys the backend on push to `main`; EAS Build
  handles mobile builds and private (non-store) distribution.

### Stack decision record

| Layer | Choice | Why |
|---|---|---|
| Mobile framework | Expo (React Native, TypeScript) | Keeps the whole stack in TypeScript; EAS handles build/sign/distribute without needing Xcode/Android Studio — important since the team is new to mobile. Considered Flutter (rejected: second language, no payoff here) and PWA (rejected: weaker native camera support for phase-2 photo/barcode features, doesn't match the native-app reference screenshots). |
| Backend framework | NestJS | Structured module/guard system maps directly onto the branch+provider permission model. Matches the team's existing backend expertise. |
| Hosting | Railway | Traditional always-on server + managed Postgres, git-push deploys. Considered Vercel/Fluid Compute (rejected for phase 1: adds serverless-adaptation complexity for a NestJS app with no scaling need yet). |
| Caching | Client-side only (TanStack Query) | Catalog sizes are small; a server-side cache (Redis) would be extra ops for no real benefit at this scale. |
| Database | PostgreSQL | Relational data (branches/providers/products/orders/users/permissions) with real integrity constraints. |

## 3. Data Model

```
User
 - id, username, passwordHash, role (ADMIN | STAFF), createdAt

Branch
 - id, name, address?, createdAt

Provider              (fully independent per branch — no cross-branch sharing)
 - id, branchId, name, phone (used to build the WhatsApp deep link),
   isActive, createdAt

Product
 - id, providerId, name, unitType (e.g. "crate", "kg", "unit"),
   barcode (nullable, GTIN — for barcode scanning),
   imageUrl (nullable — reserved for phase 2 photo upload),
   isActive, createdAt

UserProviderAccess     (join table — this is where RBAC lives)
 - userId, providerId

Order
 - id, branchId, providerId, createdByUserId,
   status (DRAFT | PUBLISHED),
   createdAt, publishedAt

OrderItem
 - id, orderId, productId (nullable),
   productNameSnapshot, unitType, quantity
```

Design notes:

- **RBAC is one join table.** A STAFF user's accessible branches are *derived*
  from the distinct branches of the providers they're granted access to — no
  separate branch-permission table. An ADMIN bypasses `UserProviderAccess`
  entirely (sees everything, manages users/permissions via admin-only screens).
- **`OrderItem` snapshots the product name** (`productNameSnapshot`) at order
  time rather than only referencing `productId` live, so history stays
  accurate even if a product is later renamed, deactivated, or its provider is
  deactivated. `productId` is kept (nullable) so the live product can still be
  joined when it still exists.
- **Providers/Products are soft-deleted** (`isActive`) rather than hard-deleted,
  since `Order`/`OrderItem` reference them and history must remain intact.
- **History = `PUBLISHED` orders.** Per the "keep the DB lean but start
  collecting data from day 1" requirement, phase 1 only persists submitted
  orders — no separate audit log of catalog edits. This is deliberately the
  minimum needed to support future features (e.g. spend-per-provider reports)
  without extra infrastructure now.

## 4. Core Flows

**Login & branch switching**
1. User logs in with username/password → API returns a JWT (`userId`, `role`).
2. App fetches accessible branches (derived from `UserProviderAccess`, or all
   branches if ADMIN) and shows a branch switcher.
3. The selected branch scopes every subsequent screen (providers, orders,
   history).

**Managing providers & products**
- STAFF users only see providers they have access to, within the current
  branch.
- ADMIN can create/edit/deactivate providers and products for any branch, and
  manage which STAFF users can access which providers.
- Editing a product does not rewrite past `OrderItem` snapshots.

**Building & publishing an order**
1. User picks an accessible provider → `GET /providers/:id/products`, cached
   client-side (TanStack Query).
2. User adds items with quantity + unit, or an ad-hoc item not in the catalog,
   optionally scanning a barcode to prefill it.
3. The in-progress order is a `DRAFT`, persisted as items are added, so it
   survives the user leaving the screen.
4. On "Publish": order flips to `PUBLISHED`, `publishedAt` is set — durably,
   *before* the app attempts to open WhatsApp — then the app opens the `wa.me`
   deep link with the encoded order text (in Hebrew — this is what the
   supplier actually reads). If opening WhatsApp fails (e.g. not installed),
   the order is still safely saved; the app surfaces a clear error rather
   than losing it.
5. Branch home screen lists recent orders by provider with a status badge
   (draft vs. sent).

**Permission enforcement**
- Every provider/order endpoint checks `UserProviderAccess` (or ADMIN role)
  via a NestJS guard — enforced server-side, not just hidden in the UI.

## 5. Caching, Error Handling, Testing

**Caching**
- TanStack Query caches each provider's product list client-side
  (`staleTime` ~5 min). Pull-to-refresh or re-entering the screen after the
  stale window refetches, so catalog edits show up without a dedicated
  invalidation mechanism.
- No server-side cache in phase 1.

**Error handling**
- Standard REST error responses (validation, 403 on permission denial),
  surfaced as inline errors/toasts.
- Mutations retry with backoff (TanStack Query default) to tolerate patchy
  in-store wifi.
- Publish is the one flow that must be bulletproof: persist `PUBLISHED`
  first, then attempt the WhatsApp deep link, so a "sent" order is never
  lost even if the deep link fails.

**Testing**
- Backend: Jest **unit tests only** (no e2e in phase 1 scope) — services and
  guards, with the heaviest coverage on the `UserProviderAccess` guard (the
  place a bug would leak data across departments) and order state
  transitions (draft → published).
- Mobile: no blanket requirement. The order→WhatsApp-text formatting
  function is pure logic worth a unit test; UI/styling does not need tests.

## 6. CI/CD

**Backend (NestJS on Railway)**
- Push to `main` → Railway auto-builds and deploys.
- GitHub Action on every PR: lint + `npm run test` as a merge gate.
- DB migrations run as a Railway release step before the new version serves
  traffic.
- Secrets (DB connection string, JWT secret) live in Railway's dashboard, not
  in the repo.

**Mobile (Expo/EAS)**
- `eas build --platform all --profile preview` compiles iOS + Android in
  Expo's cloud — no local Xcode/Android Studio needed.
- Distribution via EAS **internal distribution**: a link/QR code installs the
  app directly on the team's phones, no App Store/Play Store review. (iOS
  ad-hoc installs need each device's UDID registered once; Android has no
  such restriction.)
- **EAS Update** pushes JS-only changes over the air to installed apps
  without a rebuild; native changes (e.g. adding the barcode-scanning
  dependency) still need a new build.
- API base URL is injected per build profile via Expo env config.

## 7. Explicitly Deferred (Phase 2+)

- **Photo upload for products.** `Product.imageUrl` exists in the schema now
  so this is additive later; the actual upload UI/storage integration is not
  built in phase 1.
- **GS1 catalog import** (pulling supplier catalogs from GS1 Israel's Uniform
  network). Open question pending confirmation that the actual suppliers in
  use participate in that network; the `barcode` field added for in-app
  scanning also covers this if/when it's pursued.
- **Barcode scanning is in scope for phase 1** (not deferred) — self-contained
  client-side feature using `Product.barcode`, no external dependency.

## 8. Knowledge-Base Docs (for future LLM sessions)

Generated during implementation (documenting what's actually built, not just
planned):

- `CLAUDE.md` (repo root) — project summary, tech stack, monorepo layout,
  links to the docs below.
- `docs/ARCHITECTURE.md` — system diagram and component responsibilities.
- `docs/DATA_MODEL.md` — entity reference, kept in sync as the schema evolves.
- `docs/PERMISSIONS.md` — how `UserProviderAccess` and roles work.
- `docs/DOMAIN_GLOSSARY.md` — plain-language branch/provider/product/order
  terminology, including the Hebrew UI terms from the reference screenshots.

## 9. Open Questions

- Whether draft orders auto-save on every item change or on an explicit
  "save draft" action — small UX detail to settle during implementation.
- Which of the real-world suppliers (if any) participate in GS1 Israel's
  Uniform catalog network — needed before GS1 catalog import can be
  scoped at all.
