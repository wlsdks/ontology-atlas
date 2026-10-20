import { expect, test } from "@playwright/test";

import { installHarnessRuntime, mountHarnessVault } from "../harness-tab-fixture";

test.describe("Harness tab layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await installHarnessRuntime(page);
  });

  test('At a glance fits the window: the page never scrolls and the column heads pin over the rows', async ({ page }) => {
    await installHarnessRuntime(page, { includeOverflowDomains: true });
    await mountHarnessVault(page);
    await page.setViewportSize({ width: 1040, height: 720 });
    await page.goto('/ko/architecture/?view=overview&guides=off');
    const scroller = page.getByTestId('harness-overview-scroll');
    await expect(scroller).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => scroller.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(0);

    await scroller.evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }));
    const gap = () =>
      page.evaluate(() => {
        const top = document.querySelector('[data-testid="harness-overview-scroll"]')!.getBoundingClientRect().top;
        const head = document.querySelector('[data-harness-head]')!.getBoundingClientRect().top;
        return Math.round(head - top);
      });
    await expect.poll(gap).toBe(0);
    expect(await page.evaluate(() => ({ x: scrollX, y: scrollY, overflow: document.documentElement.scrollWidth - innerWidth }))).toEqual({ x: 0, y: 0, overflow: 0 });
  });

  test('At a glance has no horizontal overflow at 600px', async ({ page }) => {
    await installHarnessRuntime(page);
    await mountHarnessVault(page);
    await page.setViewportSize({ width: 600, height: 900 });
    await page.goto('/ko/architecture/?view=overview&guides=off');
    await expect(page.getByTestId('harness-overview-scroll')).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    expect(
      await page.getByTestId('harness-overview-scroll').evaluate((el) => el.scrollWidth - el.clientWidth),
    ).toBeLessThanOrEqual(0);
  });
});
