import { expect, test, type Locator, type Page } from '@playwright/test';

import { seedFirstRunSeen } from './first-run-seed';

const TILES = [
  'topology-fit-control',
  'topology-tour-button',
  'topology-shortcuts-help-button',
  'topology-replay-growth',
] as const;

function tile(page: Page, testId: string): Locator {
  return page
    .locator(`[data-testid="${testId}"]:is(button), [data-testid="${testId}"] button`)
    .first();
}

async function tileGeometry(page: Page) {
  return page.evaluate((ids) => {
    const tileSizeToken = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--chrome-tile-size'),
    );
    return {
      tileSizeToken,
      tiles: ids.map((id) => {
        const host = document.querySelector(`[data-testid="${id}"]`)!;
        const button = host.tagName === 'BUTTON' ? host : host.querySelector('button')!;
        const rect = button.getBoundingClientRect();
        return { id, width: rect.width, height: rect.height };
      }),
    };
  }, TILES as unknown as string[]);
}

test.describe('map utility rail — fixed icon controls', () => {
  test.beforeEach(async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/en/topology?guides=off&e2e=1');
    await expect(page.getByTestId('topology-replay-growth')).toBeVisible();
  });

  test('keeps every utility square while its hover tooltip names it', async ({ page }) => {
    const before = await tileGeometry(page);
    expect(before.tileSizeToken).toBeGreaterThan(0);

    for (const entry of before.tiles) {
      expect(entry.width, `${entry.id} width`).toBe(before.tileSizeToken);
      expect(entry.height, `${entry.id} height`).toBe(before.tileSizeToken);

      const control = tile(page, entry.id);
      const name = await control.getAttribute('aria-label');
      expect(name, `${entry.id} accessible name`).toBeTruthy();
      expect(await control.getAttribute('title'), `${entry.id} native tooltip`).toBe('');
      await control.hover();
      await expect(page.getByRole('tooltip')).toHaveText(name!);
    }

    expect(await tileGeometry(page)).toEqual(before);
  });

  test('shows the same tooltip on keyboard focus without changing geometry', async ({ page }) => {
    const before = await tileGeometry(page);
    const control = tile(page, 'topology-shortcuts-help-button');
    const name = await control.getAttribute('aria-label');

    await control.focus();
    await expect(page.getByRole('tooltip')).toHaveText(name!);
    expect(await tileGeometry(page)).toEqual(before);
  });
});
