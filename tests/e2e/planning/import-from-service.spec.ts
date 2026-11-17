import { expect, test, type Page } from '@playwright/test';

import { FIRST_RUN_SEEN_ENTRIES } from '../first-run-seed';
import { installServiceSaveFixture } from '../library/service-save-desktop-fixture';

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

test('a first Library visit through the chip shows the import dialog alone and the guide only after it closes', async ({ page }) => {
  await openPlanningHome(page, { guideSeen: false });

  await page.locator('[data-planning-import]').click();

  const dialog = page.getByTestId('library-import-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('library-guide-popover')).toHaveCount(0);
  await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await dialog.getByTestId('library-import-close').click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('library-guide-popover')).toBeVisible();
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
