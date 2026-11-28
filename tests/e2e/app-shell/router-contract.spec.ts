import { expect, test, type Page } from '@playwright/test';

import en from '../../../messages/en.json';
import { installDesktopRailRuntime, mountDesktopVault } from '../desktop-rail-arrival-harness';
import { waitForPageSettled } from '../settle';

/**
 * What the router owes every screen, whichever router it is: an address keeps its bytes when a screen
 * opens on it, moving between screens loads no document, the title and a live region follow each move,
 * Back returns to the screen before, and the language switch changes only the first path segment.
 * Written against the router's behaviour, not its implementation, so a change of router cannot hide a regression.
 */

const HANGUL = '%ED%95%9C%EA%B8%80';

/** Addresses scripts, agents and tests write: `%20` forms, Hangul, text that looks like a number, a hash. */
const OPENED_AS_WRITTEN = [
  '/en/agents/?tab=mcp&note=a%20b&workbench=edit',
  `/ko/library/?tab=wiki&guides=off&q=${HANGUL}%20x`,
  '/en/projects/?p=1&guides=off',
  `/en/architecture/?role=${HANGUL}&guides=off#h`,
  '/en/topology/?p=capability%3Aa%20b&workbench=edit',
  '/en/library/?q=a+b&p=a%2Fb',
  '/en/agents/?tag=a&tab=mcp&tag=b',
];

function countDocumentRequests(page: Page) {
  let count = 0;
  page.on('request', (request) => {
    if (request.resourceType() === 'document') count += 1;
  });
  return () => count;
}

async function openDesktopApp(page: Page, locale: 'en' | 'ko' = 'en') {
  await installDesktopRailRuntime(page);
  await mountDesktopVault(page, locale);
}

test.describe('router contract', () => {
  test('an address opened as written is left byte for byte, with no history entry added', async ({ page }) => {
    await openDesktopApp(page);
    for (const address of OPENED_AS_WRITTEN) {
      await page.goto(address);
      const lengthOnArrival = await page.evaluate(() => history.length);
      await waitForPageSettled(page);
      expect(page.url(), address).toBe(new URL(address, page.url()).href);
      expect(await page.evaluate(() => history.length), `${address}: history grew`).toBe(lengthOnArrival);
    }
  });

  test('a rail press loads no document, retitles the page and announces it, and Back returns', async ({ page }) => {
    await openDesktopApp(page);
    await page.goto('/en/projects/?guides=off');
    await waitForPageSettled(page);
    const documents = countDocumentRequests(page);
    // The title is set when the screen mounts, after the document settles.
    await expect.poll(() => page.title()).toContain(en.metadata.pages.projects);
    const titleBefore = await page.title();

    await page.getByTestId('app-nav-rail-item-automations').click();
    await expect(page).toHaveURL((url) => url.pathname === '/en/automations/');
    await expect.poll(() => page.title()).toContain(en.automations.title);
    expect(await page.title()).not.toBe(titleBefore);
    await expect
      .poll(() => page.locator('[aria-live]').allInnerTexts(), { message: 'a live region reads the new title' })
      .toContainEqual(await page.title());

    await page.goBack();
    await expect(page).toHaveURL((url) => url.pathname === '/en/projects/');
    await expect.poll(() => page.title()).toBe(titleBefore);
    expect(documents(), 'a rail press and Back each stayed in the document').toBe(0);
  });

  test('the language switch changes the first path segment and keeps query and hash byte for byte', async ({ page }) => {
    await openDesktopApp(page);
    await page.goto(`/en/projects/?q=${HANGUL}%20x&guides=off#h`);
    await waitForPageSettled(page);
    const documents = countDocumentRequests(page);

    await page.locator('[data-testid="app-settings-trigger"]:visible').click();
    await page.getByRole('radio', { name: 'KO 한국어' }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/ko/projects/');
    expect(new URL(page.url()).search).toBe(`?q=${HANGUL}%20x&guides=off`);
    expect(new URL(page.url()).hash).toBe('#h');
    expect(documents(), 'the switch stayed in the document').toBe(0);
  });
});
