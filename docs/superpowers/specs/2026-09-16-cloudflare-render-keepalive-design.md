# Cloudflare Render Keepalive Design

## Purpose

Keep Sapako's free Render web service awake without a paid scheduler or a
third-party monitoring account. Render spins the service down after inactivity;
a scheduled request to its existing health endpoint prevents that cold start.

This is deliberately a keepalive mechanism, not an availability monitor. It
does not page, email, or otherwise notify anybody about failures.

## Constraints

- The solution must remain within the free tiers already used by Sapako.
- The scheduler must run independently of the Render web service. A timer in
  the Nest process stops when Render spins that process down and cannot wake it.
- It must use the existing lightweight endpoint:
  `https://sapako-backend.onrender.com/health`.
- It must not need a database, API key, new secret, public HTTP route, or
  changes to the backend.
- It must be represented in this repository and deployed through the existing
  Cloudflare credentials in GitHub Actions.

## Architecture

Add a small Cloudflare Worker project under `keepalive/`.

The Worker exposes only a `scheduled()` handler. Cloudflare invokes it every
five minutes. The handler fetches the production `/health` endpoint and treats
any non-2xx response or network error as a failed ping. It writes an error to
Cloudflare's Worker log in those cases. It emits nothing for successful pings
so operational logs remain useful.

The Worker has no public fetch handler and disables the default `workers.dev`
route. It therefore cannot be used as a proxy or externally triggered job.

```
Cloudflare Cron Trigger (every 5 minutes)
  -> keepalive Worker scheduled handler
  -> GET https://sapako-backend.onrender.com/health
  -> Render free web service stays active
```

Five-minute scheduling produces at most 288 Worker invocations per day, well
below Cloudflare Workers Free's daily request limit. The handler does almost no
CPU work; its time is spent waiting for the outgoing request.

## Source and Deployment Layout

- `keepalive/src/index.ts` contains the scheduled handler and its minimal,
  testable health-check function.
- `keepalive/wrangler.jsonc` declares the Worker name, TypeScript entrypoint,
  compatibility date, and `*/5 * * * *` Cron Trigger.
- `keepalive/package.json` contains only the Worker tooling and test commands.
- `keepalive/src/index.test.ts` tests the health-check function with mocked
  `fetch`.
- `.github/workflows/deploy-keepalive.yml` deploys the Worker on pushes that
  change `keepalive/**` or that workflow. It uses the existing
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets.

The web deployment workflow remains unchanged. A Worker deployment is
independent of PWA deployment, which prevents a mobile-only change from
unnecessarily changing the scheduler and prevents a keepalive change from
rebuilding the PWA.

## Failure Behaviour

- A non-2xx status produces an error log containing only the status code and
  target hostname.
- A network exception produces an error log containing the target hostname and
  a safe error message.
- A failed ping does not retry in a loop. The next Cron Trigger performs the
  next attempt. This avoids multiplying traffic during a Render or network
  outage.
- The scheduled event completes after logging; it has no persistent state.

The Cron Trigger is not an alerting system. Operators can inspect Cloudflare
Worker logs when an availability issue is reported. Adding notifications would
be a separately designed feature because it needs an explicit destination and
alert policy.

## Verification

1. Unit tests demonstrate success, non-2xx, and network-failure behaviour.
2. The GitHub deployment workflow deploys the Worker with the existing
   Cloudflare credentials.
3. After production deployment, manually trigger the Worker from Cloudflare
   once and confirm a successful invocation.
4. Leave the PWA idle for more than Render's spin-down threshold, then verify
   the Render service does not show a cold-start delay. If this check fails,
   inspect the Worker invocation and Render event logs before modifying the
   design.

## Out of Scope

- Scheduling catalogue ingestion.
- Database-aware health checks.
- Incident alerts or uptime reporting.
- A NestJS in-process scheduler.
- GitHub Actions as the keepalive scheduler; its scheduled runs may be delayed
  or dropped under load.
