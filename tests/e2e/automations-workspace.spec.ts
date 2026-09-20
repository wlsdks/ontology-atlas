import { expect, test } from '@playwright/test';

test.describe('Automations workspace', () => {
  test('exposes both lanes and a valid tabpanel in the browser no-vault state', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/ko/automations/?guides=off', { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('app-nav-rail-item-automations')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('automations-tab-ontology')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[role="tabpanel"]')).toHaveAttribute('id', 'automations-tabpanel-ontology');
    await expect(page.getByText('자동화는 맥 앱에서 돕니다')).toBeVisible();

    await page.getByTestId('automations-tab-documents').click();
    await expect(page).toHaveURL(/\/ko\/automations\/\?guides=off&kind=documents$/);
    await expect(page.getByTestId('automations-tab-documents')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[role="tabpanel"]')).toHaveAttribute('id', 'automations-tabpanel-documents');
  });

  test('keeps the lane strip and no-vault stage inside a narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/automations/?guides=off&kind=documents', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('automations')).toBeVisible();
    const overflow = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  });
});
