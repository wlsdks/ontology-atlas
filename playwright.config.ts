import { defineConfig } from '@playwright/test';

import { POST_MERGE_SPECS } from './tests/e2e/post-merge-specs';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3100';
const webServerOrigin = new URL(baseURL).origin;
const webServerPort = new URL(baseURL).port || '3100';

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
  // Local/dev remains sequential because Turbopack compiles routes on demand. CI's read-only
  // static export has no compilation race or shared writable state, so it uses both runner CPUs.
  // Pre-enable proof (2026-09-01): the same slowest 107-test shard passed with zero retries
  // in 4.4 minutes locally at two workers; its preceding one-worker GitHub run took 9.7 minutes.
  workers: resolvePlaywrightWorkers(process.env),
  // CI retries absorb runner variance but remain visible in the report; true regressions fail
  // after every attempt. Local runs keep retries at zero so flakiness is exposed directly.
  retries: process.env.CI ? 2 : 0,
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
   * Verify wiring is alive via `tests/contract/e2e-suite-split.contract.test.ts`.
   */
  projects: [
    { name: 'smoke', testIgnore: POST_MERGE_SPECS.map((file) => `**/${file}`) },
    { name: 'post-merge', testMatch: POST_MERGE_SPECS.map((file) => `**/${file}`) },
  ],
  outputDir: 'output/playwright/test-results',
  use: {
    baseURL,
    headless: true,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  // R11 #24 — Automatically start the dev server when running e2e in CI. Locally, reuse the already
  // started dev (3100). Without webServer, CI cannot connect to baseURL.
  webServer: {
    // R11 #24 — pnpm entry point that also runs the predev hook (docs-vault build).
    // Verify from cold-start in CI; reuse the already started dev server locally.
    //
    // If `PLAYWRIGHT_STATIC=1`, **serve the built static export**. This is because
    // there are specs measuring layers not present in dev — 2026-07-28 measurement: same-route
    // navigation in the workshop only failed in the production export (paths were identical, only query differed,
    // so it was a no-op at the routing level), while dev succeeded for both regardless of slash presence/mechanism,
    // making it **diagnostically useless** for this defect. A gate running only in dev
    // will forever let this class of regression pass.
    command: process.env.PLAYWRIGHT_STATIC
      ? `node scripts/serve-static-export.mjs --port=${webServerPort}`
      : `pnpm dev -p ${webServerPort}`,
    url: webServerOrigin,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
