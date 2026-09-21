import { expect, test } from '@playwright/test';

// Hold the real lazy analysis chunk: the destination and navigation must stay
// usable before the expensive analysis implementation can even be evaluated.
for (const leaveWhileLoading of [false, true]) {
  test(`analysis paints a destination before loading its code${leaveWhileLoading ? ' and can be left' : ''}`, async ({ page }) => {
    await page.goto('/ko/automations/?guides=off');
    await expect(page.getByTestId('automations')).toBeVisible();
    let release!: () => void;
    let held!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const requested = new Promise<void>((resolve) => { held = resolve; });
    await page.route('**/_next/static/chunks/**', async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      if (body.includes('insights-core-switch')) {
        held();
        await barrier;
      }
      await route.fulfill({ response, body });
    });
    try {
      await page.getByTestId('app-nav-rail-item-insights').click();
      await requested;
      await expect(page.getByTestId('insights-loading')).toBeVisible();
      await expect(page.getByTestId('insights-loading')).toHaveAttribute('aria-busy', 'true');
      await expect(page.getByTestId('insights-loading').getByRole('status')).toBeVisible();
      await expect(page.getByTestId('insights-core-switch')).toHaveCount(0);
      if (leaveWhileLoading) {
        await page.getByTestId('app-nav-rail-item-automations').click();
        await expect(page.getByTestId('automations')).toBeVisible();
      }
      release();
      if (leaveWhileLoading) {
        await expect(page.getByTestId('insights-loading')).toHaveCount(0);
        await expect(page.getByTestId('insights-core-switch')).toHaveCount(0);
      } else {
        await expect(page.getByTestId('insights-core-switch')).toBeVisible();
        await expect(page.getByTestId('insights-loading')).toHaveCount(0);
      }
    } finally {
      release();
      await page.unrouteAll({ behavior: 'wait' });
    }
  });
}
