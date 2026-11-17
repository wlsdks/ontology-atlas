import { expect, test } from '@playwright/test';

import { seedFirstRunSeen } from '../first-run-seed';
import { installServiceSaveFixture } from '../library/service-save-desktop-fixture';

// The bridge is isolated in-memory fixture data. No OS keychain or service is called.
test('Planning opens the service import for its own folder and the dialog names planning/notion', async ({ page }) => {
  await installServiceSaveFixture(page);
  await page.addInitScript(() => {
    (window as unknown as { __roundsStubFiles: Record<string, string> }).__roundsStubFiles['planning/roadmap.md'] = '# Roadmap\n';
  });
  await seedFirstRunSeen(page);
  await page.goto('/en/');
  await page.getByRole('button', { name: /Open.*folder/i }).first().click();
  await expect(page.getByTestId('app-nav-rail')).toBeVisible();
  await page.goto('/en/planning/');

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
