import { expect, test } from '@playwright/test';

import { seedFirstRunSeen } from './first-run-seed';

test('the browser Git example stays readable at wide widths and changes its detail', async ({ page }) => {
  await seedFirstRunSeen(page);
  const ratios: number[] = [];

  for (const width of [1280, 1680, 1920, 2560]) {
    await page.setViewportSize({ width, height: 950 });
    await page.goto('/ko/git/?guides=off');
    const example = page.getByTestId('web-git-example');
    await expect(example).toBeVisible();
    const panels = example.locator(':scope > section');
    await expect(panels).toHaveCount(2);
    const detail = await panels.nth(1).boundingBox();
    expect(detail?.height, `${width}px: Git detail collapsed`).toBeGreaterThan(50);
    ratios.push(detail!.width / detail!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }

  expect(ratios, 'Git detail was never measured').toHaveLength(4);
  expect(Math.max(...ratios), 'Git detail stretched into a ribbon').toBeLessThanOrEqual(3.2);

  const example = page.getByTestId('web-git-example');
  const detail = example.locator(':scope > section').nth(1);
  const before = await detail.innerText();
  await example.getByTestId('web-git-row-1').click();
  await expect(detail).not.toHaveText(before);
});
