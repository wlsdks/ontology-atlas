import { expect, test } from '@playwright/test';
import { waitForBoxStill } from './settle';

for (const [width, height] of [[1512, 900], [1040, 720]]) {
  test.describe(`Analysis keeps the selected question and evidence reachable at ${width}`, () => {
    test.use({ viewport: { width, height } });
    test('shows a relation and its document before scrolling, without map gestures', async ({ page }) => {
      await page.goto('/ko/ontology/insights/?guides=off');
      const evidence = page.getByTestId('analysis-evidence');
      await expect(evidence).toBeVisible();
      await expect(evidence.getByRole('link').first()).toBeInViewport({ ratio: 1 });
      await expect(page.getByTestId('analysis-witness').first()).toBeInViewport({ ratio: 1 });
      await expect(page.getByTestId('analysis-dependency-diagram')).toBeInViewport();
      await expect(page.locator('main canvas, main select')).toHaveCount(0);
      const widthFits = await page.locator('main').evaluate(node => node.scrollWidth <= node.clientWidth);
      expect(widthFits).toBe(true);
    });
    test('section navigation stays put and a legacy repair link opens evidence in place', async ({ page }) => {
      await page.goto('/ko/ontology/insights/?guides=off');
      const tabs = page.getByTestId('insights-core-switch');
      const before = (await tabs.boundingBox())!.y;
      await page.getByTestId('insights-core-brief').click();
      await expect(page.locator('[data-insights-panel="brief"]')).toBeVisible();
      await page.getByTestId('insights-core-ontology').click();
      await waitForBoxStill(tabs);
      expect(Math.abs((await tabs.boundingBox())!.y - before)).toBeLessThanOrEqual(1);
      await page.goto('/ko/ontology/insights/?guides=off&tab=do-next');
      await expect(page.getByTestId('analysis-claim').first()).toBeVisible();
      await expect(page.getByTestId('analysis-evidence')).toBeVisible();
      await expect(page.getByTestId('insights-census-strip')).toHaveCount(0);
      await expect(page.getByTestId('do-next-list')).toHaveCount(0);
    });
  });
}
