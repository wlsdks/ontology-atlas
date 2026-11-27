import { expect, test, type Page } from '@playwright/test';

import { installDesktopRailRuntime, mountDesktopVault } from '../desktop-rail-arrival-harness';
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
  await installDesktopRailRuntime(page);
  await mountDesktopVault(page);
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
  // A `G` pressed before the shell installs its listener is not heard; the mark says when it is.
  await expect(page.locator('html')).toHaveAttribute('data-destination-shortcuts', 'live');
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

// WebKit stops painting the sticky header and composited children of a scroll container in the
// frame it is named for capture, so the captured box must be one that does not scroll.
test('the route crossfade captures a box that does not scroll', async ({ page }) => {
  await page.addInitScript(() => {
    const start = document.startViewTransition?.bind(document);
    if (!start) return;
    const target = window as unknown as { __capturedOverflow: string[] };
    target.__capturedOverflow = [];
    document.startViewTransition = ((update: () => Promise<void> | void) => {
      for (const element of document.querySelectorAll('body *')) {
        const style = getComputedStyle(element);
        if (style.getPropertyValue('view-transition-name') === 'app-pane') target.__capturedOverflow.push(style.overflowY);
      }
      return start(update);
    }) as typeof document.startViewTransition;
  });
  await page.goto('/en/agents/?guides=off');
  const library = page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Library', exact: true });

  await library.click();
  await expect(page).toHaveURL(/\/en\/library\//);

  const captured = await page.evaluate(() => (window as unknown as { __capturedOverflow?: string[] }).__capturedOverflow ?? []);
  expect(captured, 'one box is named for the crossfade and it is not a scroll container').toEqual(['visible']);
});
