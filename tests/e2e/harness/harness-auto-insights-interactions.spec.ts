import { expect, test } from '@playwright/test';

import { box } from './harness-auto-insights-harness';
import { installHarnessRuntime, mountHarnessVault } from '../harness-tab-fixture';
import { installDesktopBridge } from '../rounds-desktop-bridge';

test.describe('Architecture toolbar', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await installHarnessRuntime(page);
    await mountHarnessVault(page);
  });

  test('below xl choosing a role scrolls its pane into view', async ({ page }) => {
    await page.setViewportSize({ width: 1040, height: 720 });
    await page.goto('/ko/architecture/?view=architecture&guides=off');
    const role = page.getByTestId('architecture-role-views');
    await expect(role).toBeVisible({ timeout: 30_000 });
    await role.click();
    const detail = page.getByTestId('architecture-role-detail');
    await expect(detail).toHaveAttribute('data-role', 'views');
    await expect
      .poll(async () => (await detail.boundingBox())?.y ?? Infinity, { message: 'the role pane stayed under the fold' })
      .toBeLessThan(720 - 40);
  });
});

test.describe('Automations remove confirm', () => {
  test('the question replaces the row, takes focus, and Escape gives it back', async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await installDesktopBridge(page, { seedRounds: true });
    await page.goto('/en/');
    await page.getByRole('button', { name: /Open.*folder/i }).first().click();
    await expect(page.getByTestId('app-nav-rail')).toBeVisible();
    await page.goto('/ko/automations/?guides=off&kind=documents');
    const remove = page.getByTestId('automations-remove').filter({ visible: true }).first();
    await expect(remove).toBeVisible({ timeout: 30_000 });
    const trigger = await box(remove);
    await remove.click();
    const confirm = page.getByTestId('automations-confirm-remove').filter({ visible: true }).first();
    await expect(confirm).toBeVisible();
    const group = await box(page.getByTestId('automations-remove-confirm').filter({ visible: true }).first());
    /* 59px lower and under a divider before: the question stands where the row stood. */
    expect(Math.abs(group.y - trigger.y), 'the confirm opened away from its trigger').toBeLessThanOrEqual(8);
    await expect(page.getByRole('button', { name: '취소', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);
    await expect(page.getByTestId('automations-remove').filter({ visible: true }).first()).toBeFocused();
  });
});
