import { expect, test, type Page } from '@playwright/test';

import { seedFirstRunSeen } from '../first-run-seed';
import { startSampling, stopSampling } from '../motion-sampler';

const CROSSFADE = [{ name: 'crossfade', selector: 'html.route-crossfade' }];

async function crossfadeRanWhile(page: Page, move: () => Promise<void>, arrived: RegExp): Promise<boolean> {
  await startSampling(page, { tracks: CROSSFADE });
  await move();
  await expect(page).toHaveURL(arrived);
  await expect(page.locator('html.route-crossfade')).toHaveCount(0);
  const recording = await stopSampling(page);
  return recording.tracks.crossfade.some((value) => value !== null);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedFirstRunSeen(page);
});

test('a link inside the pane that leads to another screen crossfades the pane', async ({ page }) => {
  await page.goto('/en/agents/?tab=models&returnTo=changes&guides=off');
  const back = page.locator('[data-app-shell-pane] a[href$="/changes/"]');
  await expect(back).toBeVisible();

  const crossfaded = await crossfadeRanWhile(page, () => back.click(), /\/en\/changes\//);

  expect(crossfaded, 'the pane crossfades from Agents to Changes').toBe(true);
});

test('a destination shortcut crossfades the pane to another screen', async ({ page }) => {
  await page.goto('/en/library/?guides=off');
  const main = page.locator('main').first();
  await main.focus();
  await expect(main).toBeFocused();

  const crossfaded = await crossfadeRanWhile(
    page,
    async () => {
      await page.keyboard.press('g');
      await page.keyboard.press('a');
    },
    /\/en\/agents\//,
  );

  expect(crossfaded, 'the pane crossfades from Library to Agents').toBe(true);
});
