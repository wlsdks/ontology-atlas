import { expect, test } from '@playwright/test';

for (const [width, height] of [[390, 844], [1040, 720], [1920, 1080]]) {
  test(`the sample explanation empty state has a balanced reading width and grouped actions at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/ko/ontology/insights/?tab=flow&guides=off');
    const panel = page.getByTestId('flow-no-version');
    const folder = page.getByTestId('flow-open-vault');
    const back = page.getByTestId('analysis-back-to-system');
    await expect(folder).toBeVisible();
    const mainBox = (await page.locator('main').boundingBox())!;
    const panelBox = (await panel.boundingBox())!;
    const folderBox = (await folder.boundingBox())!;
    const areaBox = (await page.getByTestId('flow-tab').boundingBox())!;
    const readingEnd = await page.locator('main').evaluate(node => node.getBoundingClientRect().bottom - parseFloat(getComputedStyle(node).paddingBottom));
    expect(Math.abs(panelBox.x + panelBox.width / 2 - mainBox.x - mainBox.width / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(areaBox.y + areaBox.height - readingEnd)).toBeLessThanOrEqual(1);
    expect(Math.abs(panelBox.y + panelBox.height / 2 - areaBox.y - areaBox.height / 2)).toBeLessThanOrEqual(1);
    expect(folderBox.width).toBeLessThan(panelBox.width / 2);
    await expect(panel.getByTestId('flow-open-vault')).toBeInViewport({ ratio: 1 });
    await expect(panel.getByTestId('analysis-back-to-system')).toHaveCount(1);
    expect(await page.locator('main').evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    await folder.focus();
    await page.keyboard.press('Tab');
    await expect(back).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('analysis-workspace')).toBeVisible();
  });
}
