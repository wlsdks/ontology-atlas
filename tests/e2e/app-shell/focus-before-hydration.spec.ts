import { expect, test, type Page } from '@playwright/test';

import en from '../../../messages/en.json';
import { installDesktopRailRuntime, mountDesktopVault } from '../desktop-rail-arrival-harness';

/**
 * Off `/`, the screen waits for the message catalog chunk, so the document stands with the loading
 * picture of `index.html` as its stand-in for as long as that chunk takes. Holding the chunk opens
 * that window on purpose instead of waiting for a slow runner to open it.
 */
async function holdCatalogChunk(page: Page) {
  const catalogText = en.library.questionDesk.title;
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let held = false;
  await page.route('**/assets/*.js', async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes(catalogText)) {
      held = true;
      await released;
    }
    await route.fulfill({ response, body });
  });
  return { release, wasHeld: () => held };
}

test('focus placed on the loading stand-in before hydration moves to the screen that replaces it', async ({ page }) => {
  test.skip(!process.env.PLAYWRIGHT_STATIC, 'only the built folder serves the stand-in as the page HTML');
  await installDesktopRailRuntime(page);
  await mountDesktopVault(page);
  const catalog = await holdCatalogChunk(page);
  await page.goto('/en/library/?guides=off', { waitUntil: 'domcontentloaded' });

  const standIn = page.locator('main[data-route-loading]');
  await expect(standIn).toBeVisible();
  await standIn.focus();
  await expect(standIn).toBeFocused();
  await expect.poll(catalog.wasHeld, 'the screen should be waiting on the catalog chunk').toBe(true);

  catalog.release();
  const library = page.getByTestId('library-page');
  await expect(library).toBeVisible();
  await expect(library).toBeFocused();
  // Chunks the page goes on to load would otherwise still be in the handler at teardown.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});
