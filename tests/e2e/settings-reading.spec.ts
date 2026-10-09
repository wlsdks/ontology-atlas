import { expect, test } from '@playwright/test';
import { installDesktopRailRuntime } from './desktop-rail-arrival-harness';
import { openSettings } from './settings-reading-harness';

// The app's window floor and a common desktop window; phone and tablet widths are not a
// target (owner direction, 2026-09-27).
for (const [width, height] of [[1040, 720], [1440, 900]] as const) {
  test.describe(`settings at ${width}`, () => {
    test.use({ viewport: { width, height } });

    test('⌘, opens the sheet, and on an open sheet focuses search', async ({ page }) => {
      await installDesktopRailRuntime(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/en/?guides=off');
      await page.getByTestId('first-run-open').click();
      await expect(page.locator('[data-testid="app-settings-trigger"]:visible')).toHaveAttribute('aria-expanded', 'false');
      await expect(async () => {
        await page.keyboard.press('ControlOrMeta+Comma');
        await expect(page.getByTestId('app-settings-popover')).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 15_000 });
      await page.keyboard.press('ControlOrMeta+Comma');
      await expect(page.getByTestId('app-settings-search')).toBeFocused();
    });

    for (const [locale, query] of [['en', 'API'], ['ko', '키']] as const) {
      test(`search reaches API keys in one press (${locale})`, async ({ page }) => {
        await openSettings(page, locale);
        await page.getByTestId('app-settings-search').fill(query);
        await expect(page.getByTestId('app-settings-search-results')).toBeVisible();
        await page.getByTestId('app-settings-search').press('Enter');
        await expect(page).toHaveURL(/\/agents\/\?(?:.*&)?tab=models/);
      });
    }

    test('expanded map controls fit the pane and remain reachable', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/ko/ontology/insights/?guides=off');
      await page.locator('[data-testid="app-settings-trigger"]:visible').click();
      for (const section of ['expand', 'footprint']) {
        await page.getByTestId(`app-settings-nav-${section}`).click();
        await page.getByTestId(`app-settings-${section}-detail-toggle`).click();
        const pane = page.getByTestId(`app-settings-pane-${section}`);
        const sliders = await pane.getByRole('slider').all();
        expect(sliders.length).toBeGreaterThan(0);
        for (const slider of sliders) {
          await slider.scrollIntoViewIfNeeded();
          const geometry = await slider.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const pane = element.closest('[data-testid^="app-settings-pane-"]')!;
            const bounds = pane.getBoundingClientRect();
            return {
              left: rect.left, right: rect.right, boundsLeft: bounds.left, boundsRight: bounds.right,
              overflow: pane.scrollWidth - pane.clientWidth,
              reachable: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === element,
            };
          });
          expect(geometry.overflow).toBeLessThanOrEqual(1);
          expect(geometry.left).toBeGreaterThanOrEqual(geometry.boundsLeft);
          expect(geometry.right).toBeLessThanOrEqual(geometry.boundsRight);
          expect(geometry.reachable).toBe(true);
        }
      }
    });
  });
}
