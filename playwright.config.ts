import { existsSync } from 'node:fs';

import { defineConfig } from '@playwright/test';

import { POST_MERGE_SPECS } from './tests/e2e/post-merge-specs';
import { foreignServer } from './scripts/lib/ci/playwright-server-owner.mjs';

const servesStaticExport = Boolean(process.env.PLAYWRIGHT_STATIC);
const isCI = process.env.CI === 'true' || process.env.CI === '1';
// The static export gets its own port so it never reuses a dev server left on 3100.
const baseURL = process.env.PLAYWRIGHT_BASE_URL || (servesStaticExport ? 'http://127.0.0.1:3110' : 'http://127.0.0.1:3100');
const webServerOrigin = new URL(baseURL).origin;
const webServerPort = new URL(baseURL).port || '3100';

// Locally Playwright reuses whatever already listens on the port; refuse one
// that another worktree or project started.
const foreignServerMessage = process.env.CI ? null : foreignServer(new URL(baseURL).hostname, webServerPort, process.cwd());
if (foreignServerMessage) throw new Error(foreignServerMessage);
if (!process.env.CI && servesStaticExport && !existsSync('out/index.html')) {
  throw new Error('PLAYWRIGHT_STATIC=1 serves the static export in out/, which is missing: run `pnpm build` first.');
}

export function resolvePlaywrightWorkers(
  env: Record<string, string | undefined>,
): number {
  const isCI = env.CI === 'true' || env.CI === '1';
  return isCI && env.PLAYWRIGHT_STATIC === '1' ? 2 : 1;
}

export default defineConfig({
  testDir: './tests/e2e',
  // Relative to dev (Turbopack), the first route entry waits for on-demand compilation —
  // global-setup pre-compiles the main routes, and we absorb remaining variance with a
  // 15-second expect timeout (it failed sporadically at 10 seconds).
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  forbidOnly: isCI,
  // Local/dev stays sequential because Turbopack compiles routes on demand; CI's read-only static
  // export has no such race, so it runs two workers. Not four: the suite is CPU-bound, and four
  // workers made each test about 44% slower for a 10% total gain. Add shards in e2e.yml instead.
  workers: resolvePlaywrightWorkers(process.env),
  // CI retries absorb runner variance but remain visible in the report; true regressions fail
  // after every attempt. Local runs keep retries at zero so flakiness is exposed directly.
  retries: isCI ? 2 : 0,
  reporter: [['list']],
  /**
   * PR gate / post-merge sweep — two projects, one list.
   *
   * The source of truth for the boundary is `tests/e2e/post-merge-specs.ts` (why that boundary
   * is chosen is also documented there). Here we only split the list into its complement (smoke) and
   * the post-merge list — new specs not in the list are **automatically smoke**, i.e., run in PRs.
   * The direction of error is «PR slows down» rather than «gate loss».
   *
   * `pnpm exec playwright test` without filters runs both projects —
   * local and main push behavior remains unchanged pre-split. Only PRs use `--project=smoke`.
   * Verify wiring is alive via `tests/contract/ci-gates/e2e-suite-split.contract.test.ts`.
   */
  projects: [
    { name: 'smoke', testIgnore: POST_MERGE_SPECS.map((file) => `**/${file}`) },
    { name: 'post-merge', testMatch: POST_MERGE_SPECS.map((file) => `**/${file}`) },
  ],
  outputDir: 'output/playwright/test-results',
  use: {
    baseURL,
    /*
     * Fail a press that never lands in 15 s, naming what it waited for; the default action timeout is
     * 0 (unlimited). 15 s equals `expect.timeout` and absorbs on-demand compilation locally (10 s
     * failed sporadically). A slower step says so at its call site.
     */
    actionTimeout: 15_000,
    headless: true,
    trace: isCI ? 'on-first-retry' : 'off',
    video: 'off',
    screenshot: 'off',
  },
  // R11 #24 — Automatically start the dev server when running e2e in CI. Locally, reuse the already
  // started dev (3100). Without webServer, CI cannot connect to baseURL.
  webServer: {
    // pnpm entry point that also runs the predev hook (docs-vault build). With `PLAYWRIGHT_STATIC=1`,
    // serve the built static export: some specs measure layers absent in dev, e.g. same-route
    // navigation that only fails in production.
    command: servesStaticExport
      ? `node scripts/web/serve-static-export.mjs --port=${webServerPort}`
      : `pnpm dev -p ${webServerPort}`,
    url: webServerOrigin,
    reuseExistingServer: !process.env.CI && !servesStaticExport,
    timeout: 120_000,
  },
});
