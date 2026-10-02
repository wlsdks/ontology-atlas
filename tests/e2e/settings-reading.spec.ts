import { expect, test } from '@playwright/test';
import { installDesktopRailRuntime } from './desktop-rail-arrival-harness';

// The app's window floor and a common desktop window; phone and tablet widths are not a
// target (owner direction, 2026-09-27).
for (const width of [1040, 1440]) {
  test.describe(`settings at ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });
    test('notification choices leave their explanation readable', async ({ page }) => {
      await installDesktopRailRuntime(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/ko/?guides=off');
  await page.getByTestId('first-run-open').click();
      await page.locator('[data-testid="app-settings-trigger"]:visible').click();
      const panel = page.getByTestId('app-settings-popover');
      await panel.getByRole('button', { name: '알림', exact: true }).click();
      const row = page.getByTestId('app-settings-agent-notification-kinds');
      await expect(row.getByRole('switch')).toHaveCount(6);
      const geometry = await row.evaluate(el => {
        const row = el.getBoundingClientRect();
        const caption = el.querySelectorAll('p')[1].getBoundingClientRect();
        const buttons = [...el.querySelectorAll('button')].map(button => button.getBoundingClientRect().toJSON());
        return { row: row.toJSON(), caption: caption.toJSON(), buttons };
      });
      expect(geometry.caption.width / geometry.row.width, 'caption squeezed beside the controls').toBeGreaterThan(0.8);
      for (const button of geometry.buttons) {
        expect(button.top).toBeGreaterThanOrEqual(geometry.caption.bottom);
        expect(button.right).toBeLessThanOrEqual(geometry.row.right);
      }
    });

    test('expanded map controls fit the pane and remain reachable', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/ko/ontology/insights/?guides=off');
      await page.locator('[data-testid="app-settings-trigger"]:visible').click();
      for (const section of ['expand', 'footprint']) {
        await page.getByTestId(`app-settings-nav-${section}`).click();
        await page.getByTestId(`app-settings-${section}-detail-toggle`).click();
        const pane = page.getByTestId(`app-settings-pane-${section}`);
        const sliders = await pane.getByRole('slider').all();
        expect(sliders.length).toBeGreaterThan(0);
        for (const slider of sliders) {
          await slider.scrollIntoViewIfNeeded();
          const geometry = await slider.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const pane = element.closest('[data-testid^="app-settings-pane-"]')!;
            const bounds = pane.getBoundingClientRect();
            return {
              left: rect.left, right: rect.right, boundsLeft: bounds.left, boundsRight: bounds.right,
              overflow: pane.scrollWidth - pane.clientWidth,
              reachable: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === element,
            };
          });
          expect(geometry.overflow).toBeLessThanOrEqual(1);
          expect(geometry.left).toBeGreaterThanOrEqual(geometry.boundsLeft);
          expect(geometry.right).toBeLessThanOrEqual(geometry.boundsRight);
          expect(geometry.reachable).toBe(true);
        }
      }
    });
  });
}
