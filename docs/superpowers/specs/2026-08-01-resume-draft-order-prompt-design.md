# Resume Draft Order Prompt — Design

## Problem

A user opens the products screen for a provider from the provider list (`app/(app)/index.tsx`). If they already started (but never published) an order for that provider, the screen has no memory of it: it silently starts a brand-new empty draft the first time a quantity changes, leaving the old draft orphaned in the backend and the user's earlier progress invisible.

## Goal

When a user enters a provider's products screen directly from the provider list, and they personally have an unfinished (`DRAFT`, non-empty) order for that provider, prompt them to continue it instead of starting fresh.

Scoping is per-user: if a different user opens the same provider's screen, they must not be prompted about another user's draft.

## Non-goals

- No backend changes. No new endpoint, no schema change.
- No change to the Activity screen's existing explicit resume/continue flow (`sourceOrder` param) — this feature only fills the gap for the *other* entry path.
- Declining the prompt does not delete or otherwise mutate the old draft. It's simply left as-is and may be offered again on a future visit.

## Design

### Data source

Reuse the existing `GET /branches/:branchId/orders` endpoint (`fetchOrdersForBranch`), already consumed by the Activity screen via the react-query key `['orders', branchId]`. `order.tsx` will use the same query key, so the fetch is cache-shared when the user was recently on Activity, and otherwise incurs one lightweight branch-scoped fetch.

No new backend endpoint is added: at this app's scale, filtering the existing branch order list client-side is simpler than adding and maintaining a dedicated `draft-order` lookup endpoint, and avoids extra backend surface area (route, service method, guard wiring, tests) for a convenience prompt.

### Matching logic

Extract a pure helper, `src/order/findResumableDraft.ts`:

```ts
function findResumableDraft(
  orders: Order[],
  providerId: string,
  userId: string,
): Order | undefined
```

Selects the most recent order (orders already arrive sorted `createdAt DESC` from the backend) where:
- `order.providerId === providerId`
- `order.createdByUserId === userId`
- `order.status === 'DRAFT'`
- `order.items.length > 0` (ignore empty/orphaned drafts — same convention the Activity screen already applies)

Unit tested directly (happy path: match found; no match: different provider / different user / published / empty items; multiple matches: most recent wins), following the pattern of `buildOrderMessage.ts` / `whatsappPhone.ts`.

### Screen flow (`order.tsx`)

Only runs when the screen was entered **without** a `sourceOrder` param (i.e. direct entry from the provider list — the Activity screen's explicit resume/continue flow is untouched).

1. On mount, fetch branch orders (`useQuery(['orders', branchId], fetchOrdersForBranch)`), enabled only when there's no `sourceOrder`.
2. Run `findResumableDraft(orders, providerId, userId)` (`userId` from `useAuth()`).
3. If a match is found, show a native `Alert.alert` (consistent with existing usage in this file and `PublishButton.tsx`):
   - Title: "יש הזמנה פתוחה לספק זה" (There's an open order for this provider)
   - Message: prompts the user to continue the existing draft or start a new one.
   - Buttons: "כן, המשך" (Yes, continue) / "לא, התחל חדש" (No, start new).
4. **Yes** → load the matched draft into state via the same path the existing `sourceOrder?.status === 'DRAFT'` branch already uses (`setOrder` + populate `itemsByProductId` from `order.items`).
5. **No** → no-op. Screen proceeds exactly as today's fresh-entry behavior (empty state, draft created lazily via `ensureOrder` on first quantity change). The old draft is untouched and may be offered again on a future visit.
6. If the orders fetch fails, fail silently — treat as "no draft found." This is a convenience prompt, not a critical path, and must never block or interrupt product browsing.

### Out of scope / explicitly rejected alternatives

- **Dedicated backend endpoint** (e.g. `GET /branches/:branchId/providers/:providerId/draft-order`) — rejected for now; would require controller route, service method, guard wiring, and backend tests for something the existing branch-orders endpoint already answers client-side.
- **Deleting the declined draft** — rejected; destructive and irreversible for a "no" tap, and inconsistent with how the rest of the app treats drafts (they're only ever removed by being published or by removing all items).
- **Session-scoped dismissal (don't re-prompt this session)** — rejected as unnecessary complexity for a first version; can be added later if repeated prompting turns out to annoy users.

## Testing

- `findResumableDraft.ts`: unit tests covering match found, no match (wrong provider, wrong user, published status, empty items), and multiple-drafts-pick-most-recent.
- `order.tsx` itself is a React Native screen (JSX/UI wiring) — no unit tests required per project convention; the logic worth testing is isolated in the pure helper above.
