import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

/** Opens a fixture from the first-run screen and waits for its map before another route. */
export async function openFolderFromFirstRun(page: Page, locale: string = 'en') {
  await page.goto(`/${locale}/`);
  const door = page.getByTestId('first-run-open');
  await expect(door, 'waiting for the open-folder door').toBeVisible();
  await door.click();
  await expect(
    page.getByRole('heading', { name: (JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8')) as { navRail: { map: string } }).navRail.map, level: 1 }),
    'the folder is open once its map heading arrives',
  ).toBeVisible({ timeout: 30_000 });
}
