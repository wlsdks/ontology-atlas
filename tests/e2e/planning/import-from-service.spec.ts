import { expect, test, type Page } from '@playwright/test';

import { FIRST_RUN_SEEN_ENTRIES } from '../first-run-seed';
import { installServiceSaveFixture } from '../library/service-save-desktop-fixture';
import { startSampling, stopSampling, type MotionRecording } from '../motion-sampler';

const GUIDE_SEEN_KEY = 'atlas.library.guide-seen';
const LONG_FOLDER_PATH = '/Users/someone/side-project/a-rather-long-project-name/docs/ontology/atlas/planning';

// The bridge is isolated in-memory fixture data. No OS keychain or service is called.
async function openPlanningHome(page: Page, options: { locale?: 'en' | 'ja'; guideSeen?: boolean } = {}) {
  await installServiceSaveFixture(page);
  await page.addInitScript(({ entries, guideKey, guideSeen }) => {
    const target = window as unknown as {
      __roundsStubFiles: Record<string, string>;
      __TAURI_INTERNALS__: { invoke: (command: string, args?: unknown) => Promise<unknown> };
    };
    target.__roundsStubFiles['planning/roadmap.md'] = '# Roadmap\n';
    const bridge = target.__TAURI_INTERNALS__;
    const invoke = bridge.invoke.bind(bridge);
    bridge.invoke = (command, args) => (command === 'planning_supported' ? Promise.resolve(true) : invoke(command, args));
    for (const [key, value] of entries) if (guideSeen || key !== guideKey) window.localStorage.setItem(key, value);
  }, { entries: FIRST_RUN_SEEN_ENTRIES, guideKey: GUIDE_SEEN_KEY, guideSeen: options.guideSeen ?? true });
  await page.goto('/en/');
  await page.getByRole('button', { name: /Open.*folder/i }).first().click();
  await expect(page.getByRole('heading', { name: 'Map' })).toBeVisible();
  await page.goto(`/${options.locale ?? 'en'}/planning/`);
  await expect(page.locator('[data-planning-import]')).toBeVisible();
}

test('Planning opens the service import for its own folder and the dialog names planning/notion', async ({ page }) => {
  await openPlanningHome(page);

  await page.locator('[data-planning-import]').click();

  await expect(page).toHaveURL(/\/en\/library\//);
  const dialog = page.getByTestId('library-import-dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('[data-testid="library-import-service"][data-service="notion"]').click();
  await dialog.getByTestId('library-import-token').fill('fixture_value');
  await dialog.getByTestId('library-import-connect').click();
  await expect(dialog.getByTestId('library-import-what')).toBeFocused();
  await expect(dialog).toContainText('planning/notion');
  await expect(dialog).not.toContainText('sources/notion');
});

test('closing the import opened from Planning returns there, and the Library guide waits for a later visit', async ({ page }) => {
  await openPlanningHome(page, { guideSeen: false });

  await page.locator('[data-planning-import]').click();

  const dialog = page.getByTestId('library-import-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('library-guide-popover')).toHaveCount(0);
  await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await dialog.getByTestId('library-import-close').click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/en\/planning\//);
  await expect(page.locator('[data-planning-import]')).toBeVisible();

  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page.getByTestId('library-guide-popover')).toBeVisible();
  await expect(page.getByTestId('library-import-dialog')).toHaveCount(0);
});

const HANDOFF_TRACKS = [
  { name: 'dialog', selector: '[data-testid="library-import-dialog"]' },
  { name: 'crossfade', selector: 'html.route-crossfade' },
];

/** Frames in which the dialog and the route crossfade were on screen together. */
function overlappingFrames(recording: MotionRecording): number {
  return recording.tracks.dialog.filter((value, index) => value !== null && recording.tracks.crossfade[index] !== null).length;
}

test('the import opened from Planning arrives after the route crossfade and leaves before the one back', async ({ page }) => {
  await openPlanningHome(page);
  const dialog = page.getByTestId('library-import-dialog');

  await startSampling(page, { tracks: HANDOFF_TRACKS });
  await page.locator('[data-planning-import]').click();
  await expect(dialog).toHaveCSS('opacity', '1');
  const arriving = await stopSampling(page);
  expect(arriving.tracks.crossfade.some((value) => value !== null), 'the pane crossfades from Planning to Library').toBe(true);
  expect(overlappingFrames(arriving), 'the dialog rises only once the pane has settled').toBe(0);

  await startSampling(page, { tracks: HANDOFF_TRACKS });
  await dialog.getByTestId('library-import-close').click();
  await expect(page.locator('[data-planning-import]')).toBeVisible();
  await expect(page.locator('html.route-crossfade')).toHaveCount(0);
  const leaving = await stopSampling(page);
  const opacities = leaving.tracks.dialog.flatMap((value) => (value ? [value.opacity] : []));
  expect(Math.min(...opacities), 'the dialog fades out instead of vanishing at full opacity').toBeLessThan(1);
  expect(leaving.tracks.crossfade.some((value) => value !== null), 'the pane crossfades back to Planning').toBe(true);
  expect(overlappingFrames(leaving), 'the route changes only after the dialog has left').toBe(0);
});

for (const locale of ['en', 'ja'] as const) {
  for (const width of [1040, 1280]) {
    test(`the ${locale} Planning header keeps every chip inside a ${width} wide app window with a long folder path`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await openPlanningHome(page, { locale });
      await expect(page.locator('[data-planning-choose]')).toBeVisible();
      await page.locator('[data-planning-folder-path]').evaluate((node, path) => { node.textContent = path; }, LONG_FOLDER_PATH);

      const row = page.locator('[data-page-header-row]');
      expect(await row.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(0);
      const lastChip = await page.locator('[data-planning-choose]').boundingBox();
      expect(lastChip!.x + lastChip!.width).toBeLessThanOrEqual(width);
    });
  }
}
