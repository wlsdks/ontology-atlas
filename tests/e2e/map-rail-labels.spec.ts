import { expect, test, type Page } from '@playwright/test';

import { seedFirstRunSeen } from './first-run-seed';

/**
 * The map's utility rail names itself **as one group**.
 *
 * Four icon-only tiles sit on the right edge of `/topology` (fit · tour · shortcuts ·
 * replay). Each used to carry its own tooltip, so reading the rail cost one hover and
 * one wait per tile, and a keyboard user never saw a name at all.
 *
 * What only a rendered check can prove, and why each one is here:
 *
 * 1. **The collapsed tile is still the chrome tile.** The label lives inside the
 *    control, so the box could quietly grow. The first version of this shape measured
 *    38px because the tile's two 1px borders were outside the padding arithmetic — a
 *    defect no class-string assertion could have seen.
 * 2. **Touching one tile names all four.** That is the whole difference from a
 *    tooltip, and it depends on `:hover` resolving through a `pointer-events: none`
 *    group wrapper — a browser behaviour, not a source fact.
 * 3. **Focus does the same.** The keyboard path is the half that silently rots.
 */

const TILES = [
  'topology-fit-control',
  'topology-tour-button',
  'topology-shortcuts-help-button',
  'topology-replay-growth',
] as const;

function tile(page: Page, testId: string) {
  const host = page.getByTestId(testId);
  // Two of the four are the button itself; the other two are wrappers holding it.
  return host.locator('button').or(host.filter({ has: page.locator('svg') })).first();
}

async function labelState(page: Page) {
  return page.evaluate((ids) => {
    const root = getComputedStyle(document.documentElement);
    return {
      tileSizeToken: root.getPropertyValue('--chrome-tile-size').trim(),
      tiles: ids.map((id) => {
        const host = document.querySelector(`[data-testid="${id}"]`)!;
        const button = host.tagName === 'BUTTON' ? host : host.querySelector('button')!;
        const label = button.querySelector('.chrome-tile-label')!;
        return {
          id,
          width: Math.round(button.getBoundingClientRect().width),
          height: Math.round(button.getBoundingClientRect().height),
          labelOpacity: Number(getComputedStyle(label).opacity),
          labelText: label.textContent ?? '',
          accessibleName: button.getAttribute('aria-label') ?? label.textContent ?? '',
        };
      }),
    };
  }, TILES as unknown as string[]);
}

test.describe('map utility rail — the group names itself', () => {
  test.beforeEach(async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/en/topology?guides=off&e2e=1');
    await expect(page.getByTestId('topology-replay-growth')).toBeVisible();
  });

  test('at rest every tile measures the chrome tile token and shows no label', async ({ page }) => {
    const state = await labelState(page);
    const expected = Number.parseFloat(state.tileSizeToken);
    expect(Number.isFinite(expected)).toBe(true);
    for (const t of state.tiles) {
      expect(t.width, `${t.id} collapsed width`).toBe(expected);
      expect(t.height, `${t.id} collapsed height`).toBe(expected);
      expect(t.labelOpacity, `${t.id} label at rest`).toBe(0);
    }
  });

  test('hovering one tile reveals the whole group', async ({ page }) => {
    await tile(page, 'topology-tour-button').hover();
    await expect
      .poll(async () => (await labelState(page)).tiles.every((t) => t.labelOpacity === 1))
      .toBe(true);

    const state = await labelState(page);
    const collapsed = Number.parseFloat(state.tileSizeToken);
    for (const t of state.tiles) {
      // Each tile grew to fit its own word; the rail is not one padded width.
      expect(t.width, `${t.id} expanded width`).toBeGreaterThan(collapsed);
      expect(t.height, `${t.id} height is the fixed axis`).toBe(collapsed);
      expect(t.labelText.length).toBeGreaterThan(0);
    }
  });

  test('keyboard focus reveals the same group, and the name is the visible word', async ({
    page,
  }) => {
    await page.evaluate(() => {
      const host = document.querySelector('[data-testid="topology-fit-control"]')!;
      (host.querySelector('button') as HTMLElement).focus();
    });
    await expect
      .poll(async () => (await labelState(page)).tiles.every((t) => t.labelOpacity === 1))
      .toBe(true);

    for (const t of (await labelState(page)).tiles) {
      // WCAG 2.5.3: a speech-input user must be able to say what they can see.
      expect(t.accessibleName.toLowerCase(), `${t.id} name`).toContain(t.labelText.toLowerCase());
      await expect(page.getByRole('button', { name: t.labelText, exact: true })).toHaveCount(1);
    }
  });
});

test.describe('map utility rail — reduced motion', () => {
  test('keeps the reveal and drops only the growth', async ({ page }) => {
    // `page.emulateMedia`, not `test.use({ reducedMotion })`: the fixture form did not
    // reach the page here — `matchMedia('(prefers-reduced-motion: reduce)').matches`
    // read `false` — so the test would have measured the ordinary path and passed for
    // the wrong reason. The explicit call is asserted below before anything else.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedFirstRunSeen(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/en/topology?guides=off&e2e=1');
    await expect(page.getByTestId('topology-replay-growth')).toBeVisible();
    expect(
      await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches),
      'the emulation did not reach the page — the rest of this test would be meaningless',
    ).toBe(true);

    await tile(page, 'topology-tour-button').hover();
    await expect
      .poll(async () => (await labelState(page)).tiles.every((t) => t.labelOpacity === 1))
      .toBe(true);

    // The information survives; the moving axis is what reduced motion removes.
    const duration = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.chrome-tile-label')!).transitionDuration,
    );
    expect(duration.split(',').map((value) => value.trim())).not.toContain('0.18s');
  });
});
