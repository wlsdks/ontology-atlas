import { expect, test } from '@playwright/test';
import { installDesktopRailRuntime } from './desktop-rail-arrival-harness';

for (const width of [390, 768, 1040, 1440]) {
  test.describe(`settings at ${width}`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width < 1024 });
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
        if (width < 1024) expect(Math.min(button.width, button.height)).toBeGreaterThanOrEqual(44);
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

test('each accent preview matches its actual palette under either selected accent', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installDesktopRailRuntime(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/ko/?guides=off');
      await page.getByTestId('first-run-open').click();
  await page.locator('[data-testid="app-settings-trigger"]:visible').click();
  const read = () => page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    const normalize = (value: string) => { ctx.fillStyle = value.trim(); return ctx.fillStyle; };
    const root = getComputedStyle(document.documentElement);
    const swatch = (name: string) => [...document.querySelectorAll(`[data-accent-preview="${name}"] > span`)].map(el => normalize(getComputedStyle(el).backgroundColor));
    return { root: ['brand', 'accent', 'a24'].map(name => normalize(root.getPropertyValue(`--color-indigo-${name}`))), indigo: swatch('indigo'), ember: swatch('ember') };
  });
  const initial = await read();
  expect(initial.indigo).toHaveLength(3);
  expect(initial.ember).toHaveLength(3);
  expect(initial.indigo).toEqual(initial.root);
  expect(initial.ember).not.toEqual(initial.indigo);
  await page.getByTestId('app-settings-accent-ember').click();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'ember');
  const copper = await read();
  expect(copper.ember).toEqual(copper.root);
  expect(copper.indigo).toEqual(initial.indigo);
  expect(copper.ember).toEqual(initial.ember);
  await page.getByTestId('app-settings-accent-indigo').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-accent');
  expect((await read()).indigo).toEqual(initial.indigo);
});
