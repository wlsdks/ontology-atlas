import { expect, test } from '@playwright/test';

import { box, hintPanel } from './harness-auto-insights-harness';
import { installHarnessRuntime, mountHarnessVault } from './harness-tab-fixture';
import { installDesktopBridge } from './rounds-desktop-bridge';

test.describe('Harness hints', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await installHarnessRuntime(page);
    await mountHarnessVault(page);
  });

  test('a hint panel can be hovered into and Escape dismisses it', async ({ page }) => {
    await page.goto('/ko/architecture/?view=coverage&guides=off');
    const button = page.getByRole('button', { name: '말해둔 것', exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    const panel = await hintPanel(page, button);
    const trigger = await box(button);
    const x = trigger.x + trigger.width / 2;
    await page.mouse.move(x, trigger.y + trigger.height / 2);
    await expect(panel).toHaveCSS('opacity', '1');
    const rect = await box(panel);
    /* Through the gap between button and panel, then into the panel itself. */
    await page.mouse.move(x, (trigger.y + trigger.height + rect.y) / 2, { steps: 3 });
    // measurement window: the claim is that the panel stays open for a stretch with the pointer in the gap.
    await page.waitForTimeout(400);
    await expect(panel, 'the panel vanished in the gap under its button').toHaveCSS('opacity', '1');
    await page.mouse.move(x, rect.y + 10, { steps: 3 });
    // measurement window: the claim is that the panel stays open for a stretch once the pointer is on it.
    await page.waitForTimeout(400);
    await expect(panel, 'the panel vanished before the pointer reached it').toHaveCSS('opacity', '1');

    await page.mouse.move(2, 2);
    await button.focus();
    await expect(panel).toHaveCSS('opacity', '1');
    await page.keyboard.press('Escape');
    await expect(panel, 'Escape did not dismiss the hint').toHaveCSS('opacity', '0');
    await expect(button).toBeFocused();
  });
});

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

test.describe('Harness hints stay whole', () => {
  test.beforeEach(async ({ page }) => {
    await installHarnessRuntime(page);
    await mountHarnessVault(page);
  });

  test('Escape closes the hint and leaves the cell detail under it open', async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await page.goto('/ko/architecture/?view=coverage&guides=off');
    const cell = page.locator('[data-harness-cell="told"]').first();
    await expect(cell).toBeVisible({ timeout: 30_000 });
    await cell.click();
    const detail = page.getByTestId('harness-coverage-detail');
    await expect(detail).toBeVisible();
    const button = page.getByRole('button', { name: '말해둔 것', exact: true });
    await button.hover();
    const panel = await hintPanel(page, button);
    await expect(panel).toHaveCSS('opacity', '1');
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCSS('opacity', '0');
    /* Both closed on one press before. */
    await expect(detail, 'one Escape closed the hint and the detail').toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(detail).toHaveCount(0);
  });

  test('a hint dismissed with Escape comes back when the pointer returns', async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await page.goto('/ko/architecture/?view=coverage&guides=off');
    const button = page.getByRole('button', { name: '말해둔 것', exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    const panel = await hintPanel(page, button);
    await button.focus();
    await button.hover();
    await expect(panel).toHaveCSS('opacity', '1');
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCSS('opacity', '0');
    await page.mouse.move(2, 2);
    await button.hover();
    /* It stayed at 0 until the button blurred before. */
    await expect(panel, 'hover no longer reopens a dismissed hint').toHaveCSS('opacity', '1');
    await expect(button).toBeFocused();
  });
});

test.describe('Surfaces below xl', () => {
  test('below xl the evidence rail brings its panel on screen', async ({ page }) => {
    await installHarnessRuntime(page);
    await mountHarnessVault(page);
    for (const [width, height] of [[1040, 720]] as const) {
      await page.setViewportSize({ width, height });
      await page.goto('/ko/architecture/?view=architecture&guides=off');
      const rail = page.getByTestId('architecture-evidence-rail');
      await expect(rail).toBeVisible({ timeout: 30_000 });
      await rail.click();
      await expect(rail).toHaveAttribute('aria-expanded', 'true');
      const close = page.getByTestId('architecture-evidence-close');
      /* Before: the panel opened below the fold and nothing moved (measured at 900×900). */
      await expect
        .poll(async () => {
          const rect = await close.boundingBox();
          return rect ? rect.y >= 0 && rect.y + rect.height <= height : false;
        }, { message: `${width}×${height}: the evidence close stayed off-screen` })
        .toBe(true);
      await expect
        .poll(() => close.evaluate((node) => {
          const r = node.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !!hit && node.contains(hit);
        }))
        .toBe(true);
    }
  });
});
