import { expect, test } from '@playwright/test';

test('Flow request keeps a named keyboard scroll target and an unfaded focus frame', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1040, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/ko/ontology/insights/?tab=flow&guides=off');
  const request = page.getByTestId('flow-request-text');
  await expect(request).toHaveRole('region');
  await expect(request).toHaveAccessibleName(await page.getByTestId('flow-request').getByRole('heading', { level: 3 }).innerText());
  await page.evaluate(() => document.fonts.ready);
  await page.getByTestId('flow-copy').focus();
  await page.keyboard.press('Tab');
  await expect(request).toBeFocused();
  await page.keyboard.press('End');
  await expect.poll(() => request.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThanOrEqual(1);
  const measured = await request.evaluate((element) => {
    const frame = element.parentElement!;
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
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('insights-handoff-row').getByRole('button')).toBeFocused();
});

test('long Flow requests keep the handoff below their content at the app minimum', async ({ page }) => {
  await page.setViewportSize({ width: 1040, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/ko/ontology/insights/?tab=flow&guides=off');
  // The panel's heading is the tab's own name, and the questions were renamed when a reader could
  // not tell which of the three cores a tab counted (2026-09-19). This waited fifteen seconds for
  // the old name and failed three times in a row in CI, while passing wherever the name is unread.
  await expect(page.getByRole('heading', { name: '제품 흐름', exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const footer = page.getByTestId('insights-handoff-row');
  await footer.scrollIntoViewIfNeeded();
  const measured = await footer.evaluate((element) => {
    const panel = document.querySelector('[role="tabpanel"]')!;
    const button = element.querySelector('button')!;
    const frame = button.getBoundingClientRect();
    const hit = document.elementFromPoint(frame.x + frame.width / 2, frame.y + frame.height / 2);
    return {
      gap: element.getBoundingClientRect().top - panel.getBoundingClientRect().bottom,
      reachable: button === hit || button.contains(hit),
      overflow: document.documentElement.scrollWidth - innerWidth,
      bottomClearance: element.closest('main')!.getBoundingClientRect().bottom - element.getBoundingClientRect().bottom,
    };
  });
  expect(measured.gap).toBeGreaterThanOrEqual(0);
  expect(measured.reachable).toBe(true);
  expect(measured.overflow).toBe(0);
  expect(measured.bottomClearance).toBeGreaterThanOrEqual(40);
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
      const grids = [...main.querySelectorAll('[role="tabpanel"] .grid')]
        .filter((element) => element.className.includes('/insights:grid-cols-'));
      return grids.length > 0 && grids.every((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length === 1);
    }), { message: `${tab} should stack inside the narrower Analysis column` }).toBe(true);
  }
});
