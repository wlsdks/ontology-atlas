import { existsSync } from 'node:fs';

import { defineConfig, type Project } from '@playwright/test';

import { POST_MERGE_SPECS } from './tests/e2e/post-merge-specs';
import { WEBSITE_SPECS } from './tests/e2e/website-specs';
import { APP_FOLDER, SITE_FOLDER } from './scripts/lib/web/built-folders.mjs';
import { foreignServer } from './scripts/lib/ci/playwright-server-owner.mjs';

const servesBuiltFolders = Boolean(process.env.PLAYWRIGHT_STATIC);
const isCI = process.env.CI === 'true' || process.env.CI === '1';
// The built folders get their own ports so they never reuse a dev server left on 3100.
const baseURL = process.env.PLAYWRIGHT_BASE_URL || (servesBuiltFolders ? 'http://127.0.0.1:3110' : 'http://127.0.0.1:3100');
const appOrigin = new URL(baseURL);
// Against the dev server one origin serves both surfaces. Against the built folders the website host and the
// installed app are two servers, so they are two origins: the site folder one port above the app folder, unless named.
const siteOrigin = process.env.PLAYWRIGHT_SITE_BASE_URL
  ? new URL(process.env.PLAYWRIGHT_SITE_BASE_URL)
  : servesBuiltFolders
    ? new URL(`${appOrigin.protocol}//${appOrigin.hostname}:${Number(appOrigin.port || 80) + 1}`)
    : appOrigin;
// `PLAYWRIGHT_SURFACE=app|site` serves and runs one surface alone at `PLAYWRIGHT_BASE_URL`, for a machine whose
// sessions each own one port; unset, a run serves both.
const onlySurface = servesBuiltFolders ? process.env.PLAYWRIGHT_SURFACE || undefined : undefined;
if (onlySurface !== undefined && onlySurface !== 'app' && onlySurface !== 'site') {
  throw new Error(`PLAYWRIGHT_SURFACE is "${onlySurface}"; expected "app" or "site".`);
}
if (onlySurface === 'site') siteOrigin.port = appOrigin.port;
const runsApp = onlySurface !== 'site';
const runsSite = onlySurface !== 'app';
// Vite binds `localhost` to 127.0.0.1 alone, but Node-side requests (`route.fetch`, `page.request`) try ::1 first.
const hostFor = (origin: URL) => (origin.hostname === 'localhost' ? '::1' : origin.hostname);

// Locally Playwright reuses whatever already listens on the port; refuse one
// that another worktree or project started.
for (const origin of new Set([appOrigin, siteOrigin])) {
  const foreignServerMessage = process.env.CI ? null : foreignServer(origin.hostname, origin.port || '80', process.cwd());
  if (foreignServerMessage) throw new Error(foreignServerMessage);
}
if (!process.env.CI && servesBuiltFolders) {
  const missing = [
    ...(runsApp && !existsSync(`${APP_FOLDER}/index.html`) ? [APP_FOLDER] : []),
    ...(runsSite && !existsSync(`${SITE_FOLDER}/index.html`) ? [SITE_FOLDER] : []),
  ];
  if (missing.length > 0) throw new Error(`PLAYWRIGHT_STATIC=1 serves ${missing.join(' and ')}, which ${missing.length > 1 ? 'are' : 'is'} missing: run \`pnpm build\` first.`);
}

const CI_STATIC_WORKERS = 2;
/** Measured on a 121-test sample: 1 worker 227 s, 2 119 s, 4 75 s; 6 was no faster and failed two. */
const LOCAL_STATIC_WORKERS = 4;

export function resolvePlaywrightWorkers(
  env: Record<string, string | undefined>,
): number {
  const isCI = env.CI === 'true' || env.CI === '1';
  const requested = Number(env.PLAYWRIGHT_WORKERS);
  if (Number.isInteger(requested) && requested > 0) return requested;
  if (env.PLAYWRIGHT_STATIC !== '1') return 1;
  return isCI ? CI_STATIC_WORKERS : LOCAL_STATIC_WORKERS;
}

const globs = (files: readonly string[]) => files.map((file) => `**/${file}`);
const inBoth = POST_MERGE_SPECS.filter((file) => (WEBSITE_SPECS as readonly string[]).includes(file));

function projects(): Project[] {
  const app: Project[] = [
    { name: 'smoke', testIgnore: globs([...POST_MERGE_SPECS, ...WEBSITE_SPECS]), use: { baseURL: appOrigin.origin } },
    {
      name: 'post-merge',
      testMatch: globs(POST_MERGE_SPECS.filter((file) => !inBoth.includes(file))),
      // These specs time frames, so outside CI they do not share the machine with other workers.
      ...(isCI ? {} : { workers: 1 }),
      use: { baseURL: appOrigin.origin },
    },
  ];
  const site: Project[] = [
    { name: 'website', testMatch: globs(WEBSITE_SPECS), testIgnore: globs(POST_MERGE_SPECS), use: { baseURL: siteOrigin.origin } },
    {
      name: 'website-post-merge',
      testMatch: globs(inBoth),
      ...(isCI ? {} : { workers: 1 }),
      use: { baseURL: siteOrigin.origin },
    },
  ];
  return [...(runsApp ? app : []), ...(runsSite ? site : [])];
}

/** What serves each surface: the dev server for both at once, or one static server per built folder. */
function webServers() {
  if (!servesBuiltFolders) {
    return {
      // Runs the predev step (docs vault and messages) before Vite, which the `dev` script does itself.
      command: `pnpm predev && pnpm exec vite --host ${hostFor(appOrigin)} --port ${appOrigin.port} --strictPort`,
      url: appOrigin.origin,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    };
  }
  const serve = (origin: URL, folder: string, fallback: string | null) => ({
    command: `node scripts/web/serve-static-export.mjs --dir=${folder} --host=${hostFor(origin)} --port=${origin.port}${fallback ? ` --fallback=${fallback}` : ''}`,
    url: origin.origin,
    reuseExistingServer: false,
    timeout: 120_000,
  });
  return [
    // Tauri answers a path the app folder lacks with its one document; the website host answers 404.html.
    ...(runsApp ? [serve(appOrigin, APP_FOLDER, 'index.html')] : []),
    ...(runsSite ? [serve(siteOrigin, SITE_FOLDER, null)] : []),
  ];
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
  // The dev server stays sequential because Turbopack compiles routes on demand. The read-only
  // static export has no such race: the two-CPU CI runner takes two workers and adds shards in
  // e2e.yml instead of more, and a local machine takes four.
  workers: resolvePlaywrightWorkers(process.env),
  // CI retries absorb runner variance but remain visible in the report; true regressions fail
  // after every attempt. Local runs keep retries at zero so flakiness is exposed directly.
  retries: isCI ? 2 : 0,
  reporter: [['list']],
  /**
   * Journeys and measurements, each on the surface it reads: four projects, two lists.
   *
   * `tests/e2e/post-merge-specs.ts` draws the boundary between the gate and the measurements (why is
   * documented there), and `tests/e2e/website-specs.ts` the one between the website's pages and the app's
   * screens. Here we only cut the two lists across each other; a new spec in neither list is an app journey
   * in the gate. A website project reads the site folder, the others the app folder.
   *
   * `pnpm exec playwright test` without filters runs every project, as the nightly whole run does in
   * CI. A planned dispatch runs its mapped specs and the merge smoke set
   * (`scripts/ci/merge-smoke-specs.mjs`) by file.
   * Verify wiring is alive via `tests/contract/ci-gates/e2e-suite-split.contract.test.ts`.
   */
  projects: projects(),
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
  // Without webServer, CI cannot connect to baseURL. Locally the dev server is reused when one already
  // listens on the port; the built folders are always served fresh.
  webServer: webServers(),
});
