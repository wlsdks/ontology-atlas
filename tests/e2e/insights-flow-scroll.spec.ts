import { expect, test } from '@playwright/test';

test('long Flow requests keep the handoff below their content at laptop width', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/ko/ontology/insights/?tab=flow&guides=off');
  await expect(page.getByRole('heading', { name: '비즈니스 흐름', exact: true })).toBeVisible();
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
