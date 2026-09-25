import { expect, test, type Page } from '@playwright/test';

import { installDesktopRailRuntime, mountDesktopVault } from './desktop-rail-arrival-harness';
import { seedFirstRunSeen } from './first-run-seed';

/**
 * **The app chrome keeps its geometry, its focus and its word while it works.**
 *
 * Interaction inspection, 2026-09-25 (owner: "the position is odd, isn't it? the button sizes
 * differ, and things overlap"). Each block below is one defect that inspection measured, and
 * each measures the same thing it did — rects, computed styles and `document.activeElement` —
 * rather than a class name, because every one of these passed a class-name check.
 */

const SHOTS = '/Users/jinan/scratch/ix/chrome/after';

async function openSwitcher(page: Page) {
  await page.getByTestId('vault-switch-rail-tile').click();
  const popover = page.getByTestId('vault-switch-popover');
  await expect(popover).toBeVisible();
  await expect
    .poll(() => popover.evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBe(1);
  return popover;
}

test.describe('the vault switcher', () => {
  test.use({ viewport: { width: 1512, height: 949 } });

  test('switching folders keeps the rail still and says what it is opening', async ({ page }) => {
    test.setTimeout(180_000);
    await installDesktopRailRuntime(page);
    await mountDesktopVault(page);
    await expect(page.getByTestId('vault-switch-rail-tile')).toBeVisible({ timeout: 60_000 });
    const mapItem = page.getByTestId('app-nav-rail-item-map');
    const before = await mapItem.evaluate((el) => el.getBoundingClientRect().top);

    await openSwitcher(page);
    // Sample every frame from the press until the new folder has landed.
    await page.evaluate(() => {
      const samples: Array<{ at: number; tile: boolean; mapTop: number | null; pending: boolean; pendingText: string }> = [];
      (window as unknown as { __chromeSamples: typeof samples }).__chromeSamples = samples;
      const start = performance.now();
      const tick = () => {
        const map = document.querySelector('[data-testid="app-nav-rail-item-map"]');
        const pending = document.querySelector('[data-testid="vault-route-identity-pending"]');
        samples.push({
          at: Math.round(performance.now() - start),
          tile: document.querySelector('[data-testid="vault-switch-rail-tile"]') !== null,
          mapTop: map ? map.getBoundingClientRect().top : null,
          pending: pending !== null,
          pendingText: (pending?.textContent ?? '').trim(),
        });
        if (performance.now() - start < 6000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.getByTestId('vault-switch-pick-other').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/ch1-switching-400.png` });
    await page.waitForTimeout(5800);
    const samples = await page.evaluate(
      () => (window as unknown as { __chromeSamples: Array<{ at: number; tile: boolean; mapTop: number | null; pending: boolean; pendingText: string }> }).__chromeSamples,
    );
    expect(samples.length, 'no frames were sampled').toBeGreaterThan(10);
    const tileGone = samples.filter((s) => !s.tile).map((s) => s.at);
    expect(tileGone, 'the folder chip left the rail while the folder switched').toEqual([]);
    const moved = samples.filter((s) => s.mapTop !== null && Math.abs(s.mapTop - before) > 0.5);
    expect(moved.map((s) => `${s.at}ms y=${s.mapTop}`), 'rail items jumped').toEqual([]);
    const silent = samples.filter((s) => s.pending && s.at > 450 && s.pendingText.length === 0);
    expect(silent.map((s) => s.at), 'the neutral pane stood with nothing on it').toEqual([]);
    // After the switch, the keyboard is back on the chip it started from.
    await expect(page.getByTestId('vault-switch-rail-tile')).toBeFocused({ timeout: 10_000 });
  });

  for (const viewport of [
    { width: 1512, height: 949 },
    { width: 1040, height: 720 },
  ]) {
    test(`Escape plays the exit and returns focus to the chip at ${viewport.width}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport);
      await installDesktopRailRuntime(page);
      await mountDesktopVault(page);
      await openSwitcher(page);
      await page.keyboard.press('Escape');
      // The exit is a window, not a single frame.
      const present = await page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            requestAnimationFrame(() =>
              resolve(document.querySelector('[data-testid="vault-switch-popover"]') !== null),
            );
          }),
      );
      expect(present, 'the popover hard-cut out on Escape').toBe(true);
      await expect(page.getByTestId('vault-switch-popover')).toHaveCount(0);
      await expect(page.getByTestId('vault-switch-rail-tile')).toBeFocused();
    });
  }

  test('Tab out of the popover closes it instead of leaving it open behind the focus', async ({ page }) => {
    test.setTimeout(120_000);
    await installDesktopRailRuntime(page);
    await mountDesktopVault(page);
    await openSwitcher(page);
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('Tab');
    await expect(page.getByTestId('vault-switch-popover')).toHaveCount(0);
  });

  test('the popover starts its captions, rows and picker on one line', async ({ page }) => {
    test.setTimeout(120_000);
    await installDesktopRailRuntime(page);
    await mountDesktopVault(page);
    const popover = await openSwitcher(page);
    const lines = await popover.evaluate((el) => {
      const caption = el.querySelector('p')!;
      const range = document.createRange();
      range.selectNodeContents(caption);
      const pick = el.querySelector('[data-testid="vault-switch-pick-other"] svg')!;
      return { caption: range.getBoundingClientRect().left, pick: pick.getBoundingClientRect().left };
    });
    expect(Math.abs(lines.caption - lines.pick), 'caption and picker glyph start on different lines').toBeLessThanOrEqual(1);
    await page.screenshot({ path: `${SHOTS}/ch3-popover.png` });
  });

  for (const viewport of [
    { width: 1512, height: 949 },
    { width: 1040, height: 720 },
  ]) {
    test(`the popover leaves the map toolbar uncovered at ${viewport.width}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport);
      await installDesktopRailRuntime(page);
      await mountDesktopVault(page);
      await expect(page.getByTestId('topology-top-toolbar')).toBeVisible({ timeout: 60_000 });
      await openSwitcher(page);
      // Every toolbar control, sampled at its centre and its four inset corners, is still the
      // thing on top: the popover hangs from the chip, it does not lid the map's own controls.
      const covered = await page.evaluate(() => {
        const toolbar = document.querySelector('[data-testid="topology-top-toolbar"]')!;
        const hits: string[] = [];
        for (const control of toolbar.querySelectorAll('button, a')) {
          const r = control.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const points = [
            [r.left + r.width / 2, r.top + r.height / 2],
            [r.left + 3, r.top + 3],
            [r.right - 3, r.top + 3],
            [r.left + 3, r.bottom - 3],
            [r.right - 3, r.bottom - 3],
          ];
          for (const [x, y] of points) {
            const top = document.elementFromPoint(x, y);
            if (top && top.closest('[data-testid="vault-switch-popover"]')) {
              hits.push(`${control.getAttribute('aria-label') ?? control.textContent} @${Math.round(x)},${Math.round(y)}`);
              break;
            }
          }
        }
        return hits;
      });
      expect(covered, 'the folder popover covers map toolbar controls').toEqual([]);
      await page.screenshot({ path: `${SHOTS}/ch3-popover-${viewport.width}.png` });
    });
  }
});

test.describe('the rail utility tier on the web', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('the get-app tile has the gear tile geometry', async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.goto('/en/topology/?guides=off', { waitUntil: 'domcontentloaded' });
    const getApp = page.getByTestId('app-nav-rail-get-app');
    await expect(getApp).toBeVisible({ timeout: 60_000 });
    const geometry = await page.evaluate(() => {
      const rect = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
      const gear = document.querySelector('[data-testid="app-nav-rail-utility-tier"] [data-testid="app-settings-trigger"]')!;
      return {
        app: rect('[data-testid="app-nav-rail-get-app"]').toJSON(),
        appIcon: rect('[data-testid="app-nav-rail-get-app"] svg').toJSON(),
        gear: gear.getBoundingClientRect().toJSON(),
        gearIcon: gear.querySelector('svg')!.getBoundingClientRect().toJSON(),
      };
    });
    expect(geometry.app.height).toBeCloseTo(geometry.gear.height, 0);
    expect(geometry.app.width).toBeCloseTo(geometry.gear.width, 0);
    expect(geometry.appIcon.width).toBeCloseTo(geometry.gearIcon.width, 0);
    expect(geometry.appIcon.height).toBeCloseTo(geometry.gearIcon.height, 0);
  });
});

test.describe('the keyboard shortcut sheet', () => {
  test.use({ viewport: { width: 1040, height: 720 } });

  test('the shortcut list gets the sheet and the map is not offered twice', async ({ page }) => {
    test.setTimeout(120_000);
    await installDesktopRailRuntime(page);
    await mountDesktopVault(page);
    await page.goto('/en/topology/?guides=off', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('topology-shortcuts-help-button').click();
    const scroll = page.getByTestId('shortcut-sheet-scroll');
    await expect(scroll).toBeVisible();
    await expect(page.getByTestId('shortcut-sheet-scope-topology')).toHaveCount(0);
    const shares = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][aria-modal="true"]')!.getBoundingClientRect();
      const region = document.querySelector('[data-testid="shortcut-sheet-scroll"]')!.getBoundingClientRect();
      return region.height / dialog.height;
    });
    expect(shares, 'the shortcut list is squeezed under a fixed footer').toBeGreaterThan(0.6);
    await page.screenshot({ path: `${SHOTS}/ch5-sheet-1040.png` });
  });
});

test.describe('settings', () => {
  test.use({ viewport: { width: 1512, height: 949 } });

  test('checking for updates keeps focus and reads its result on the row line', async ({ page }) => {
    test.setTimeout(120_000);
    await installDesktopRailRuntime(page);
    await mountDesktopVault(page);
    await page.locator('[data-testid="app-settings-trigger"]:visible').click();
    await page.getByTestId('app-settings-nav-update').click();
    const check = page.getByTestId('app-settings-update-check');
    await check.focus();
    await page.keyboard.press('Enter');
    await expect(check).toBeFocused();
    const result = page.getByTestId('app-settings-update-result');
    await expect(result).not.toHaveText('', { timeout: 20_000 });
    const lines = await page.evaluate(() => {
      const label = document.querySelector('[data-testid="app-settings-update-version"] p')!;
      const range = document.createRange();
      range.selectNodeContents(label);
      const out = document.querySelector('[data-testid="app-settings-update-result"]')!;
      const outRange = document.createRange();
      outRange.selectNodeContents(out);
      return {
        label: range.getBoundingClientRect().left,
        result: outRange.getBoundingClientRect().left,
        phase: out.getAttribute('data-phase'),
        color: getComputedStyle(out).color,
        tertiary: getComputedStyle(document.documentElement).getPropertyValue('--color-text-tertiary'),
      };
    });
    expect(Math.abs(lines.label - lines.result), 'result line is off the row start').toBeLessThanOrEqual(1);
    await page.screenshot({ path: `${SHOTS}/ch6-update.png` });
  });

  test('an inline key form uses one control size', async ({ page }) => {
    test.setTimeout(120_000);
    await installDesktopRailRuntime(page);
    await mountDesktopVault(page);
    await page.locator('[data-testid="app-settings-trigger"]:visible').click();
    await page.getByTestId('app-settings-nav-ai').click();
    await page.getByTestId('ai-register-anthropic').click();
    await expect(page.getByTestId('ai-save-anthropic')).toBeVisible();
    const faces = await page.evaluate(() =>
      ['ai-register-anthropic', 'ai-cancel-anthropic', 'ai-save-anthropic'].map((id) => {
        const el = document.querySelector(`[data-testid="${id}"]`)!;
        return { id, size: getComputedStyle(el).fontSize, height: el.getBoundingClientRect().height, border: getComputedStyle(el).borderTopColor };
      }),
    );
    expect(new Set(faces.map((f) => f.size)).size, JSON.stringify(faces)).toBe(1);
    expect(new Set(faces.map((f) => Math.round(f.height))).size, JSON.stringify(faces)).toBe(1);
    await page.screenshot({ path: `${SHOTS}/ch7-key-form.png` });
  });

  test('the web lists no app-only Updates pane', async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/ko/topology/?guides=off', { waitUntil: 'networkidle' });
    // A press before hydration lands on an inert <summary>; retry the press, not the claim.
    await expect(async () => {
      await page.locator('[data-testid="app-settings-trigger"]:visible').click();
      await expect(page.getByTestId('app-settings-popover')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await expect(page.getByTestId('app-settings-nav-screen')).toBeVisible();
    await expect(page.getByTestId('app-settings-nav-update')).toHaveCount(0);
  });

  test('switching language keeps the sheet open on the same pane', async ({ page }) => {
    test.setTimeout(120_000);
    await seedFirstRunSeen(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/ko/topology/?guides=off', { waitUntil: 'networkidle' });
    await page.locator('[data-testid="app-settings-trigger"]:visible').click();
    const sheet = page.getByTestId('app-settings-popover');
    await expect(sheet).toBeVisible();
    await expect.poll(() => sheet.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1);
    await sheet.getByRole('radio', { name: /EN/ }).click();
    await expect(page).toHaveURL(/\/en\/topology\//, { timeout: 20_000 });
    await expect(page.getByTestId('app-settings-popover')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('app-settings-nav-screen')).toHaveAttribute('aria-current', 'page');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const active = document.activeElement;
          return Boolean(active && active !== document.body && active.closest('[data-testid="app-settings-popover"]'));
        }),
      )
      .toBe(true);
    await page.screenshot({ path: `${SHOTS}/ch10-locale.png` });
  });
});
