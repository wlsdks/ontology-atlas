import { expect, type Page } from '@playwright/test';

export async function openSwitcher(page: Page) {
  await page.getByTestId('vault-switch-rail-tile').click();
  const popover = page.getByTestId('vault-switch-popover');
  await expect(popover).toBeVisible();
  await expect
    .poll(() => popover.evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBe(1);
  return popover;
}
