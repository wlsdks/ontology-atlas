import { expect, test } from '@playwright/test';
import { inspectGrayArea, installGrayAreaHarness } from './harness';
import { waitForAnimationsDone } from '../settle';

test.use({ launchOptions: { args: ['--blink-settings=defaultFontSize=32,defaultFixedFontSize=26'] } });

for (const [width, height] of [[600, 900], [1040, 900], [1512, 900], [2560, 1440]]) {
  test(`enlarged text preserves result arrival, complete labels and reachable actions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await installGrayAreaHarness(page);
    await inspectGrayArea(page);
    const panel = page.getByTestId('gray-area-inspector');
    await waitForAnimationsDone(panel);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('32px');
    await expect(panel.getByRole('group', { name: 'What needs a closer look' })).toBeFocused();
    await expect.poll(() => page.getByTestId('gray-area-body').evaluate(el => el.scrollTop)).toBe(0);
    const arrangement = await panel.evaluate(el => {
      const r = el.getBoundingClientRect();
      const bar = document.querySelector('[data-tabbar="primary"]');
      const barRect = bar?.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, navTop: barRect && barRect.height > 0 ? barRect.top : innerHeight };
    });
    expect(arrangement.top).toBeGreaterThanOrEqual(0);
    expect(arrangement.bottom).toBeLessThanOrEqual(arrangement.navTop);
    const label = page.getByTestId('gray-area-missing-link').getByRole('button', { expanded: true }).first();
    expect(await label.evaluate(el => [...el.querySelectorAll('span')].every(span => span.scrollWidth <= span.clientWidth + 1))).toBe(true);
    for (const name of ['Compare concepts on map', 'Fold for this inspection', 'Scope, limits and permissions']) {
      const control = panel.getByRole('button', { name, exact: true }).first();
      await control.scrollIntoViewIfNeeded();
      await expect.poll(() => control.evaluate(el => {
        const r = el.getBoundingClientRect();
        const panel = el.closest('[data-testid="gray-area-inspector"]')!.getBoundingClientRect();
        return r.left >= panel.left && r.right <= panel.right && el.scrollWidth <= el.clientWidth + 1 && el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      })).toBe(true);
    }
  });
}
