# Cloudflare Render Keepalive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the free Render API awake by calling its existing `/health` endpoint from a free Cloudflare Worker Cron Trigger every five minutes.

**Architecture:** A dedicated Worker under `keepalive/` exposes only a `scheduled()` handler. The handler delegates the outgoing health request to an exported, dependency-injected function so success and failures can be tested without reaching production. A separate GitHub Actions workflow deploys this Worker with the Cloudflare credentials the existing Pages workflow already uses.

**Tech Stack:** Cloudflare Workers, Wrangler JSON configuration, TypeScript, Vitest with Cloudflare's Vitest plugin, GitHub Actions, Node.js 22.

**Spec:** `docs/superpowers/specs/2026-09-16-cloudflare-render-keepalive-design.md`

## Global Constraints

- Remain within Cloudflare Workers Free: one Cron Trigger and at most 288 invocations each day.
- Ping exactly `https://sapako-backend.onrender.com/health` every five minutes using `*/5 * * * *`.
- Do not add a public HTTP handler, database access, API key, or a backend change.
- Log only non-2xx responses and network failures; successful pings must stay quiet.
- Do not retry within one scheduled invocation and do not add notifications.
- Deploy with the existing `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` GitHub secrets.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `keepalive/src/index.ts` | Defines the private health-check function and Worker `scheduled()` handler. |
| `keepalive/src/index.test.ts` | Exercises successful, non-2xx, and rejected outgoing requests without calling production. |
| `keepalive/wrangler.jsonc` | Names the Worker and declares the five-minute Cron Trigger. |
| `keepalive/vitest.config.ts` | Runs tests in the Cloudflare Workers runtime. |
| `keepalive/tsconfig.json` | Type-checks Worker and test source with strict TypeScript options. |
| `keepalive/package.json` / `keepalive/package-lock.json` | Pins Worker build, test, deploy, and Worker type tooling. |
| `keepalive/.gitignore` | Keeps the Worker package's local `node_modules/` out of version control. |
| `.github/workflows/deploy-keepalive.yml` | Tests and deploys only this Worker when its files change. |

### Task 1: Create the Isolated Worker Toolchain

**Files:**
- Create: `keepalive/package.json`
- Create: `keepalive/tsconfig.json`
- Create: `keepalive/vitest.config.ts`
- Create: `keepalive/wrangler.jsonc`
- Create: `keepalive/.gitignore`
- Create: `keepalive/package-lock.json`

**Interfaces:**
- Produces: a `keepalive/` package whose `npm test`, `npm run typecheck`, and `npm run deploy` commands can be used independently of the mobile and backend packages.
- Consumes: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` only when `npm run deploy` is run.

- [ ] **Step 1: Create `keepalive/package.json` with isolated scripts and tooling**

  Use a private ESM package with Node 22 as the minimum runtime. Define these scripts:

  ```json
  {
    "scripts": {
      "test": "vitest run",
      "typecheck": "tsc --noEmit",
      "deploy": "wrangler deploy"
    }
  }
  ```

  Install the four required development dependencies with this command. The
  generated lockfile in Step 4 pins their resolved versions:

  ```bash
  npm install --save-dev wrangler typescript vitest @cloudflare/vitest-plugin @cloudflare/workers-types
  ```

- [ ] **Step 2: Create the TypeScript and Vitest configuration**

  Configure `tsconfig.json` with strict type checking, no output directory,
  ES module syntax, and Cloudflare Worker types. Configure
  `vitest.config.ts` to use `cloudflareTest` from
  `@cloudflare/vitest-plugin` and point the Worker configuration at
  `./wrangler.jsonc`:

  ```ts
  import { defineWorkersConfig } from '@cloudflare/vitest-plugin/config';

  export default defineWorkersConfig({
    test: {
      poolOptions: {
        workers: { wrangler: { configPath: './wrangler.jsonc' } },
      },
    },
  });
  ```

- [ ] **Step 3: Create `keepalive/wrangler.jsonc` without routes or bindings**

  The configuration must use the installed Wrangler schema and declare the
  production schedule as source-controlled configuration:

  ```jsonc
  {
    "$schema": "./node_modules/wrangler/config-schema.json",
    "name": "sapako-keepalive",
    "main": "src/index.ts",
    "compatibility_date": "2026-09-16",
    "workers_dev": false,
    "triggers": {
      "crons": ["*/5 * * * *"]
    }
  }
  ```

- [ ] **Step 4: Ignore the package-local dependency directory**

  Create `keepalive/.gitignore` with this exact content:

  ```gitignore
  node_modules/
  ```

- [ ] **Step 5: Install dependencies and create the lockfile**

  Run: `npm install --package-lock-only`

  Expected: `keepalive/package-lock.json` is created and records exactly the
  compatible package versions selected in Step 1.


- [ ] **Step 6: Validate the dependency installation before adding application code**

  Run: `npm ci`

  Expected: PASS. Type checking begins in Task 2 because this task intentionally
  creates no TypeScript source files.

- [ ] **Step 7: Commit the toolchain**

  ```bash
  git add keepalive/.gitignore keepalive/package.json keepalive/package-lock.json keepalive/tsconfig.json keepalive/vitest.config.ts keepalive/wrangler.jsonc
  git commit -m "chore: add keepalive Worker toolchain"
  ```

### Task 2: Implement and Test the Scheduled Health Ping

**Files:**
- Create: `keepalive/src/index.ts`
- Create: `keepalive/src/index.test.ts`

**Interfaces:**
- Produces: `pingRenderHealth(fetcher, logger): Promise<void>` and a default
  Worker handler with `scheduled(controller, env, ctx): Promise<void>`.
- Consumes: an injected `fetch`-compatible function and error-only logger in
  tests; the global `fetch` and `console` in production.

- [ ] **Step 1: Write failing tests for the health-check contract**

  Add tests that pass fakes directly to the exported function. The success
  case verifies the URL and confirms `logger.error` was not called. The other
  two cases verify concise error logging:

  ```ts
  it('keeps Render awake when health succeeds', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const logger = { error: vi.fn() };

    await pingRenderHealth(fetcher, logger);

    expect(fetcher).toHaveBeenCalledWith('https://sapako-backend.onrender.com/health');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs a non-2xx response without retrying', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    const logger = { error: vi.fn() };

    await pingRenderHealth(fetcher, logger);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Sapako keepalive health check returned HTTP 503',
    );
  });

  it('logs a rejected health request without retrying', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('connection reset'));
    const logger = { error: vi.fn() };

    await pingRenderHealth(fetcher, logger);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Sapako keepalive health check failed: connection reset',
    );
  });
  ```

- [ ] **Step 2: Run the new tests and verify they fail**

  Run: `npm test -- src/index.test.ts`

  Expected: FAIL because `../src/index` and `pingRenderHealth` do not yet
  exist.

- [ ] **Step 3: Implement the minimum testable health check**

  Create the constants and types explicitly, then implement one fetch with no
  retry loop:

  ```ts
  export const RENDER_HEALTH_URL = 'https://sapako-backend.onrender.com/health';

  type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  type ErrorLogger = Pick<Console, 'error'>;

  export async function pingRenderHealth(
    fetcher: Fetcher = fetch,
    logger: ErrorLogger = console,
  ): Promise<void> {
    try {
      const response = await fetcher(RENDER_HEALTH_URL);
      if (!response.ok) {
        logger.error(`Sapako keepalive health check returned HTTP ${response.status}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Sapako keepalive health check failed: ${message}`);
    }
  }
  ```

  Export this Worker handler. Its only public Worker lifecycle entrypoint is
  `scheduled`; it schedules the ping with `ctx.waitUntil` so the Cron Trigger
  waits for the request to finish:

  ```ts
  export default {
    scheduled(_controller: ScheduledController, _env: unknown, ctx: ExecutionContext) {
      ctx.waitUntil(pingRenderHealth());
    },
  } satisfies ExportedHandler;
  ```

- [ ] **Step 4: Run the focused tests and type check**

  Run: `npm test -- src/index.test.ts && npm run typecheck`

  Expected: PASS. The three test cases prove success stays silent and each
  failure logs once without retrying.

- [ ] **Step 5: Validate the Worker configuration without deploying**

  Run: `npx wrangler deploy --dry-run`

  Expected: PASS. Wrangler recognizes `src/index.ts` and reports the
  `*/5 * * * *` Cron Trigger. No Cloudflare resource is changed.

- [ ] **Step 6: Commit the Worker implementation**

  ```bash
  git add keepalive/src/index.ts keepalive/src/index.test.ts
  git commit -m "feat: add Render keepalive Worker"
  ```

### Task 3: Deploy the Worker Independently of the PWA

**Files:**
- Create: `.github/workflows/deploy-keepalive.yml`

**Interfaces:**
- Consumes: a passing `keepalive/` package and the existing
  `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` GitHub secrets.
- Produces: a deployed `sapako-keepalive` Worker whose schedule is exactly
  the trigger in `keepalive/wrangler.jsonc`.

- [ ] **Step 1: Add the workflow path and branch triggers**

  The workflow must run on every branch so non-main changes can be validated,
  but only when Worker code or its workflow changes:

  ```yaml
  on:
    push:
      branches: ['**']
      paths:
        - 'keepalive/**'
        - '.github/workflows/deploy-keepalive.yml'
  workflow_dispatch:
  ```

- [ ] **Step 2: Add the Node 22 verification job**

  Set `defaults.run.working-directory: keepalive`, use `actions/checkout@v4`
  and `actions/setup-node@v4`, then run these commands in order:

  ```yaml
  - run: npm ci
  - run: npm test
  - run: npm run typecheck
  ```

  This puts a test and type-check gate before deploy, matching the repository's
  Pages workflow behaviour.

- [ ] **Step 3: Add the Cloudflare deployment step**

  Deploy only after verification, only from `main`, and pass the existing
  repository secrets as environment variables. A Worker has one shared name,
  so deploying a feature branch would replace the production scheduler:

  ```yaml
  - name: Deploy keepalive Worker
    if: github.ref == 'refs/heads/main'
    env:
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    run: npm run deploy
  ```

- [ ] **Step 4: Review the workflow's target and diff**

  Run: `sed -n '1,220p' .github/workflows/deploy-keepalive.yml && git diff --check`

  Expected: the workflow has no mobile path, deploys from `keepalive/` only
  on `main`, and contains no copied credential values.

- [ ] **Step 5: Run the complete local verification suite**

  Run: `npm ci && npm test && npm run typecheck && npx wrangler deploy --dry-run`

  Expected: PASS. This is the final local proof that the Worker can be built,
  tested, and recognized as a scheduled Worker before GitHub deploys it.

- [ ] **Step 6: Commit the deployment workflow**

  ```bash
  git add .github/workflows/deploy-keepalive.yml
  git commit -m "ci: deploy Render keepalive Worker"
  ```

### Task 4: Production Verification After the Approved Push

**Files:**
- Modify: none

**Interfaces:**
- Consumes: the deployed `sapako-keepalive` Worker and Render's existing
  `/health` endpoint.
- Produces: evidence that the production scheduler has a successful run and
  prevents Render cold starts.

- [ ] **Step 1: Confirm the GitHub workflow deployment completed successfully**

  Inspect the `deploy-keepalive` workflow for the pushed commit.

  Expected: its test, typecheck, and deploy steps are all green.

- [ ] **Step 2: Manually invoke the deployed Cron Trigger once**

  In Cloudflare Dashboard → Workers & Pages → `sapako-keepalive` → Triggers,
  invoke the Cron Trigger and inspect the invocation log.

  Expected: a successful invocation with no error log.

- [ ] **Step 3: Verify no cold start after the idle threshold**

  After more than 15 minutes with no ordinary Sapako use, request
  `https://sapako-backend.onrender.com/health` and inspect Render events.

  Expected: the request returns promptly and Render does not record a new
  spin-up immediately before it. If it fails, inspect the Cloudflare
  invocation log first, then the Render event log; do not add retries or
  change the endpoint without that evidence.
