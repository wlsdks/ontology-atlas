import { defineConfig } from '@playwright/test';

import { POST_MERGE_SPECS } from './tests/e2e/post-merge-specs';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3100';
const webServerOrigin = new URL(baseURL).origin;
const webServerPort = new URL(baseURL).port || '3100';

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
  workers: 1,
  // CI faces dev (Turbopack) as a cold start — running the full suite sequentially causes
  // StrictMode double mount/hydration duplicate renders and on-demand re-compilations,
  // leading to sporadic timing failures in this specific spec (not a product defect — individual runs
  // all pass; it's a dev-only artifact absent in static exports). Retries absorb environmental variance
  // but leave flakiness in the report rather than hiding it. True regressions fail even after retries.
  // Local runs (retries 0) expose flakiness directly.
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
