import { expect, test } from '@playwright/test';

import { box } from './harness-auto-insights-harness';
import { installHarnessRuntime, mountHarnessVault } from '../harness-tab-fixture';
import { installDesktopBridge } from '../rounds-desktop-bridge';
import { waitForAnimationsDone } from '../settle';

test.describe('Architecture toolbar', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await installHarnessRuntime(page);
    await mountHarnessVault(page);
  });

  test('below xl a pressed role scrolls to its answer and the rules stay reachable', async ({ page }) => {
    await page.setViewportSize({ width: 1040, height: 720 });
    await page.goto('/ko/architecture/?view=architecture&guides=off');
    const box0 = page.getByTestId('architecture-graph-box-views');
    await expect(box0).toBeVisible({ timeout: 30_000 });
    await box0.click();
    const detail = page.getByTestId('architecture-role-detail-motion');
    await expect(detail).toBeAttached();
    await expect
      .poll(async () => (await detail.boundingBox())?.y ?? Infinity, { message: 'the role detail stayed under the fold' })
      .toBeLessThan(720 - 40);

    const toggle = page.getByTestId('architecture-inspector-toggle');
    await expect(toggle, 'no control reaches the rules below xl').toBeVisible();
    await toggle.click();
    await expect
      .poll(async () => (await page.getByTestId('architecture-blueprint').boundingBox())?.y ?? Infinity)
      .toBeLessThan(720 - 40);
  });
});

test.describe('Automations remove confirm', () => {
  test('the question stands under its row, takes focus, and Escape gives it back', async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await installDesktopBridge(page, { seedRounds: true });
    await page.goto('/en/');
    await page.getByRole('button', { name: /Open.*folder/i }).first().click();
    await expect(page.getByTestId('app-nav-rail')).toBeVisible();
    await page.goto('/ko/automations/?guides=off&kind=documents');
    const row = page.locator('[data-schedule-row]').filter({ visible: true }).first();
    const menu = row.getByTestId('automations-row-menu');
    await expect(menu).toBeVisible({ timeout: 30_000 });
    const rowBox = await box(row);
    await menu.click();
    const rowMenu = page.getByRole('menu');
    // A click sent while the menu still opens makes the driver scroll the page under it.
    await waitForAnimationsDone(rowMenu);
    await rowMenu.getByTestId('automations-remove').click();
    const confirm = page.getByTestId('automations-confirm-remove').filter({ visible: true }).first();
    await expect(confirm).toBeVisible();
    const group = await box(page.getByTestId('automations-remove-confirm').filter({ visible: true }).first());
    /* The question belongs to the row it asks about: no divider or other row between them. */
    expect(group.y - (rowBox.y + rowBox.height), 'the confirm opened away from its row').toBeLessThanOrEqual(16);
    expect(group.y, 'the confirm covered its row').toBeGreaterThanOrEqual(rowBox.y + rowBox.height);
    expect((await box(row)).y, 'the row moved when the question opened').toBe(rowBox.y);
    await expect(page.getByRole('button', { name: '취소', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);
    await expect(menu).toBeFocused();
  });
});
