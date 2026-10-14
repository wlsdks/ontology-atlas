import { expect, test } from '@playwright/test';

for (const locale of ['ko', 'en', 'ja', 'zh']) {
  test(`the analysis heading survives hydration and reload in ${locale}`, async ({ page }) => {
    for (const reload of [false, true]) {
      let release!: () => void;
      const scripts = new Promise<void>(resolve => { release = resolve; });
      await page.route(/\/_next\/static\/.*\.js(?:\?.*)?$/, async route => {
        await scripts;
        await route.continue();
      });
      try {
        if (reload) await page.reload({ waitUntil: 'commit' });
        else await page.goto(`/${locale}/ontology/insights/?guides=off`, { waitUntil: 'commit' });
        const loading = page.getByTestId('insights-loading').filter({ visible: true });
        await expect(loading).toHaveAttribute('aria-busy', 'true');
        const heading = await loading.getByRole('heading', { level: 1 }).innerText();
        const title = await page.title();
        release();
        await expect(page.getByTestId('analysis-workspace')).toBeVisible();
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
        await expect(page).toHaveTitle(title);
      } finally {
        release();
        await page.unrouteAll({ behavior: 'wait' });
      }
    }
  });
}
