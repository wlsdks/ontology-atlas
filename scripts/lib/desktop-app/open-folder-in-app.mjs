// A measuring tool's way into the installed app's screens from a plain Chromium: the faked app
// runtime the e2e specs install (`installDesktopRailRuntime`), then the folder opened the way a
// person opens it. The website opens no folder, so this is the only way a script sees the map.
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const RAIL_TIMEOUT_MS = 60_000;
let harness;

/** The faked app runtime and its fixtures, loaded from the TypeScript the specs use. */
export async function loadDesktopHarness() {
  if (!harness) {
    register('./extensionless-ts-hooks.mjs', import.meta.url);
    harness = await import(pathToFileURL(path.join(ROOT, 'tests/e2e/desktop-rail-arrival-harness.ts')).href);
  }
  return harness;
}

/**
 * Installs the runtime serving exactly `files` (a `Record<path, text>`) before any script runs,
 * opens `<baseUrl>/<locale>/` and presses the first-run open button until the workbench rail is
 * up. The page then reopens that folder on every later `goto` in the same context.
 */
export async function openFolderInApp(page, files, { baseUrl, locale = 'en' }) {
  const { installDesktopRailRuntime } = await loadDesktopHarness();
  await installDesktopRailRuntime(page, files, undefined, { replaceFixture: true });
  await page.goto(`${baseUrl}/${locale}/?guides=off`, { waitUntil: 'networkidle' });
  await page.getByTestId('first-run-open').click();
  await page.getByTestId('app-nav-rail').waitFor({ timeout: RAIL_TIMEOUT_MS });
}

/** The addresses a plain browser serves as themselves; every other address is a screen of the app. */
const WEBSITE_PAGES = /^\/(?:[a-z]{2}\/)?(?:download|guide|changelog|sample)(?:[/?#]|$)/;
const NOT_FOUND_PAGES = /this-route-does-not-exist/;

/** True when `route` is a page of the website, measured in a plain browser rather than in the app. */
export function isWebsiteRoute(route) {
  return WEBSITE_PAGES.test(route) || NOT_FOUND_PAGES.test(route);
}

/**
 * Two browser contexts over one static export: the website as a visitor sees it and the app with
 * `files` open, each made when its first route arrives. `visit(route)` loads the route in the
 * right one and returns its page; an app route returns once the rail has replaced its placeholder.
 */
export function openSurfaces(browser, { baseUrl, files, locale = 'en', context = {} }) {
  const contexts = [];
  let website;
  let app;
  const newPage = async () => {
    const created = await browser.newContext(context);
    contexts.push(created);
    return created.newPage();
  };
  return {
    async visit(route, { waitUntil = 'networkidle' } = {}) {
      if (isWebsiteRoute(route)) {
        website ??= await newPage();
        await website.goto(`${baseUrl}${route}`, { waitUntil });
        return website;
      }
      if (!app) {
        app = await newPage();
        await openFolderInApp(app, files, { baseUrl, locale });
      }
      await app.goto(`${baseUrl}${route}`, { waitUntil });
      await app.getByTestId('app-nav-rail').waitFor({ timeout: RAIL_TIMEOUT_MS });
      return app;
    },
    async close() {
      for (const open of contexts) await open.close();
    },
  };
}
