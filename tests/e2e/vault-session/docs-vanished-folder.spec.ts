import { expect, test } from '@playwright/test';

import { installDesktopRailRuntime, seedKnownDesktopFolders } from '../desktop-rail-arrival-harness';

/**
 * The folder the app last had open was moved or deleted while it was closed, and it is the only
 * folder the app knows. `/docs` must then offer the chooser with that folder marked as gone, as
 * the launch chooser does, not stay on its loading frame for good.
 */

const VANISHED = '/Users/probe/moved-away-folder';

test('/docs offers the chooser and marks the only known folder as gone', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1512, height: 945 });
  // The folders option makes a command naming a path it does not serve fail as a vanished folder does.
  await installDesktopRailRuntime(page, {}, undefined, { replaceFixture: true, folders: {} });
  await seedKnownDesktopFolders(page, [{ path: VANISHED, hoursAgo: 3 }]);

  await page.goto('/en/docs/?guides=off', { waitUntil: 'domcontentloaded' });

  const gone = page.getByTestId('recent-vault-missing-group');
  await expect(gone).toBeVisible({ timeout: 60_000 });
  await expect(gone).toHaveAttribute('data-count', '1');
  await expect(page.getByText('Loading this screen…')).toHaveCount(0);

  // The app has no sample documents to show, so the banner that promises them stays away.
  await expect(page.getByText(/Showing sample documents/)).toHaveCount(0);
  // The folder is named in the review the line opens, where it can be located again or forgotten.
  await page.getByTestId('recent-vault-missing-toggle').click();
  await expect(page.getByTestId('recent-vault-locate')).toBeVisible();
  await expect(page.getByTestId('recent-vault-name')).toHaveText('moved-away-folder');
});
