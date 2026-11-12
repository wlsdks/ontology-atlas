import { expect, test } from '@playwright/test';
import planning from '../../../messages/ko/planning.json';
import { installDesktopRailRuntime } from '../desktop-rail-arrival-harness';

test('unproven browser access stays unavailable at narrow and desktop widths', async ({ page }) => {
  for (const width of [320, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/ko/planning/');
    await expect(page.getByRole('heading', { name: planning.title })).toBeVisible();
    await expect(page.getByText(planning.browserUnavailable)).toBeVisible();
    await expect(page.getByRole('button', { name: planning.chooseFolder })).toHaveCount(0);
    await expect(page.getByTestId('planning-get-app')).toHaveAttribute('href', /\/download\//);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});

for (const response of ['unsupported', 'failed', 'malformed'] as const) {
  test(`native capability ${response} keeps the picker unavailable`, async ({ page }) => {
    await installDesktopRailRuntime(page);
    await page.addInitScript((mode) => {
      const win = window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }; planningPickerCalls: number };
      const original = win.__TAURI_INTERNALS__.invoke;
      win.planningPickerCalls = 0;
      win.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
        if (cmd === 'planning_supported') {
          if (mode === 'failed') throw new Error('unsupported command');
          return mode === 'malformed' ? 'true' : false;
        }
        if (cmd === 'planning_pick_folder') win.planningPickerCalls++;
        return original(cmd, args);
      };
    }, response);
    await page.goto('/ko/planning/');
    await expect(page.getByText(planning.browserUnavailable)).toBeVisible();
    await expect(page.getByRole('button', { name: planning.chooseFolder })).toHaveCount(0);
    await expect(page.getByTestId('planning-get-app'), 'the app never offers its own download').toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { planningPickerCalls: number }).planningPickerCalls)).toBe(0);
  });
}
