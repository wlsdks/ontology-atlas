import { expect, test } from '@playwright/test';
import { installDesktopRailRuntime, mountDesktopVault } from '../desktop-rail-arrival-harness';

test.use({ viewport: { width: 2560, height: 1440 } });

test('the missing-project portrait stays centred over its title where the workbench zooms', async ({ page }) => {
  await installDesktopRailRuntime(page);
  await mountDesktopVault(page, 'ko');
  await page.goto('/ko/project/fallback/?slug=missing-project&guides=off');
  const portrait = page.locator('[data-brand-portrait="curious"]');
  await expect(portrait).toBeVisible();
  const offsets = await portrait.evaluate((box) => {
    const mark = box.querySelector('[data-testid="brand-waiting-mark"]')!.getBoundingClientRect();
    const frame = box.getBoundingClientRect();
    const title = box.closest('main')!.querySelector('h1, h2')!.getBoundingClientRect();
    return {
      zoom: getComputedStyle(box.closest('.topology-ui-scale')!).zoom,
      markFromTitleCentre: Math.abs(mark.left + mark.width / 2 - (title.left + title.width / 2)),
      spareBelowMark: Math.abs(frame.bottom - mark.bottom),
    };
  });
  expect(offsets.zoom, 'the workbench must be zoomed for this width to prove anything').not.toBe('1');
  expect(offsets.markFromTitleCentre).toBeLessThan(1);
  expect(offsets.spareBelowMark).toBeLessThan(1);
});
