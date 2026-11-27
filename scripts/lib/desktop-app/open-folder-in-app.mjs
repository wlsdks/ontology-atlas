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
