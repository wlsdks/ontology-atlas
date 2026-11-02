import { expect, test } from '@playwright/test';
import { installBriefingRuntime } from './change-briefing-fixture';

test('unconnected desktop keeps Library reachable and repository cancellation returns focus', async ({ page }) => {
  await installBriefingRuntime(page);
  await page.addInitScript(() => {
    const runtime = window as unknown as { __TAURI_INTERNALS__: { invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown> } };
    const original = runtime.__TAURI_INTERNALS__.invoke;
    let choices = 0;
    runtime.__TAURI_INTERNALS__.invoke = async (command, args) => {
      if (command === 'pick_source_directory' && ++choices === 1) return null;
      return original(command, args);
    };
  });
  await page.goto('/en/changes/?guides=off');
  const stage = page.locator('[data-briefing-state="no-repository"]');
  await expect(stage).toBeVisible();
  const choose = page.getByRole('button', { name: 'Choose Git repository', exact: true });
  await choose.click();
  await expect(stage).toBeVisible();
  await expect(choose).toBeFocused();
  const library = page.locator('[data-testid="app-nav-rail"] a[href*="/library"]');
  await expect(library).toBeVisible();
  await library.click();
  await expect(page).toHaveURL(/\/library/);
  await expect(page.locator('[data-library-state="no-folder"]')).toBeVisible();
  await expect(page.getByTestId('library-open-vault')).toBeVisible();
  await expect(page.getByTestId('vault-open-rail-tile')).toBeVisible();
  await page.locator('[data-testid="app-nav-rail"] a[href*="/changes"]').click();
  await expect(stage).toBeVisible();
  await choose.click();
  await expect(stage).toHaveCount(0);
  await expect(page.getByTestId('briefing-prs')).toBeVisible();
});
