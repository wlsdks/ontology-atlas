import { expect, test, type Page } from '@playwright/test';
import { FIXTURE_VAULT } from '../fixture-vault';
import { stubDirectoryPicker } from '../vault-picker-stub';
import { seedFirstRunSeen } from '../first-run-seed';

async function openBrowserFolder(page: Page) {
  await stubDirectoryPicker(page, FIXTURE_VAULT);
  await seedFirstRunSeen(page);
  await page.goto('/ko/topology/?guides=off');
  await page.getByTestId('first-run-starter-open').click();
  await page.getByTestId('vault-guide-pick-existing').click();
  await expect(page.getByTestId('first-run-starter')).toHaveCount(0);
  await expect(page.getByTestId('topology-index-panel')).toContainText('온라인 상점');
}

test('Flow request keeps a named keyboard scroll target and an unfaded focus frame', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1040, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBrowserFolder(page);
  await page.goto('/ko/ontology/insights/?tab=flow&guides=off');
  await page.getByTestId('flow-request-open').click();
  const request = page.getByTestId('flow-request-text');
  await expect(request).toHaveRole('region');
  await expect(request).toHaveAccessibleName(await page.getByTestId('flow-request-open').innerText());
  await page.evaluate(() => document.fonts.ready);
  await page.getByTestId('flow-request-open').focus();
  await page.keyboard.press('Tab');
  await expect(request).toBeFocused();
  await page.keyboard.press('End');
  await expect.poll(() => request.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThanOrEqual(1);
  const measured = await request.evaluate((element) => {
    const frame = element as HTMLElement;
    const style = getComputedStyle(frame);
    const textStyle = getComputedStyle(element);
    const rect = frame.getBoundingClientRect();
    const card = frame.parentElement!.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      focusShadow: style.boxShadow,
      focusMask: style.maskImage,
      text: { size: textStyle.fontSize, leading: textStyle.lineHeight, color: textStyle.color },
      surface: style.backgroundColor,
      ringClearance: { left: rect.left - card.left, right: card.right - rect.right, bottom: card.bottom - rect.bottom },
      overflow: document.documentElement.scrollWidth - innerWidth,
      frame: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      scrollTop: element.scrollTop,
      scrollMax: element.scrollHeight - element.clientHeight,
    };
  });
  expect(measured.focusShadow).not.toBe('none');
  expect(measured.focusMask).toBe('none');
  expect(measured.overflow).toBe(0);
  await testInfo.attach('request-keyboard-geometry', { body: JSON.stringify(measured), contentType: 'application/json' });
});

test('analysis cards reflow when a side conversation leaves a narrow content column', async ({ page }) => {
  await page.setViewportSize({ width: 1040, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const tab of ['composition', 'connections', 'boundaries', 'freshness']) {
    await page.goto(`/ko/ontology/insights/?tab=${tab}&guides=off`);
    await page.locator('[role="tabpanel"]').waitFor();
    await page.evaluate(() => {
      const main = document.querySelector('main')!;
      const column = main.parentElement!;
      column.style.flex = 'none';
      column.style.width = '546px';
    });
    await expect.poll(async () => page.evaluate(() => {
      const main = document.querySelector('main')!;
      const grids = [...main.querySelectorAll('[data-testid="analysis-layout"]')];
      return grids.length > 0 && grids.every((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length === 1);
    }), { message: `${tab} should stack inside the narrower Analysis column` }).toBe(true);
  }
});
