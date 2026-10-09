import { expect, test } from '@playwright/test';

import { openSwitcher } from './app-chrome-harness';
import { installDesktopRailRuntime, mountDesktopVault } from './desktop-rail-arrival-harness';
import { seedFirstRunSeen } from './first-run-seed';
import { waitForMapSettled, waitForMapStill } from './settle';

/**
 * **The app chrome keeps its geometry, its focus and its word while it works.**
 *
 * Interaction inspection, 2026-09-25 (owner: "the position is odd, isn't it? the button sizes
 * differ, and things overlap"). Each block below is one defect that inspection measured, and
 * each measures the same thing it did — rects, computed styles and `document.activeElement` —
 * rather than a class name, because every one of these passed a class-name check.
 */

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
        // measurement window: the claim is about every frame of the switch, sampled in the page.
        if (performance.now() - start < 6000) requestAnimationFrame(tick);
        else (window as unknown as { __chromeSamplesDone: boolean }).__chromeSamplesDone = true;
      };
      requestAnimationFrame(tick);
    });
    await page.getByTestId('vault-switch-pick-other').click();
    // The switch is in progress: the chip is busy opening the folder.
    await expect(page.getByTestId('vault-switch-rail-tile')).toHaveAttribute('data-busy', 'true');
    await page.waitForFunction(() => (window as unknown as { __chromeSamplesDone?: boolean }).__chromeSamplesDone === true, undefined, {
      timeout: 30_000,
    });
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

  for (const viewport of [{ width: 1040, height: 720 }]) {
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

  /*
   * Paced at 300ms, a person's typing speed, and asserted after every press. The first version of
   * this test sent six Tabs in a burst, which passed only because a 0ms timeout ran after focus
   * had already reached the skip link - at a normal pace the popover stayed open throughout
   * (review, 2026-09-25).
   */
  for (const opener of ['mouse', 'Enter'] as const) {
    test(`Tab past the popover's last control closes it and moves on from the chip (${opener})`, async ({ page }) => {
      test.setTimeout(120_000);
      await installDesktopRailRuntime(page);
      await mountDesktopVault(page);
      const tile = page.getByTestId('vault-switch-rail-tile');
      await expect(tile).toBeVisible({ timeout: 60_000 });
      if (opener === 'mouse') {
        await openSwitcher(page);
      } else {
        await tile.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByTestId('vault-switch-popover')).toBeVisible();
      }
      // What Tab from the chip reaches when no popover is in the way.
      const expected = await page.evaluate(() => {
        const sel =
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
        const popover = document.querySelector('[data-testid="vault-switch-popover"]')!;
        const all = Array.from(document.body.querySelectorAll<HTMLElement>(sel)).filter(
          (n) => !popover.contains(n) && n.getClientRects().length > 0 && n.getAttribute('aria-hidden') !== 'true',
        );
        const tileEl = document.querySelector('[data-testid="vault-switch-rail-tile"]')!;
        const next = all[all.indexOf(tileEl as HTMLElement) + 1];
        return next?.getAttribute('data-testid') ?? next?.outerHTML.slice(0, 80) ?? null;
      });
      expect(expected, 'nothing follows the chip in the tab order').not.toBeNull();
      const trail: string[] = [];
      for (let i = 0; i < 6; i += 1) {
        await page.keyboard.press('Tab');
        // Settled once focus is inside the popover, or the popover has finished leaving; the
        // assertions below report whichever state it stopped in.
        await page
          .waitForFunction(
            () => {
              const popover = document.querySelector('[data-testid="vault-switch-popover"]');
              return popover === null || popover.contains(document.activeElement);
            },
            undefined,
            { timeout: 5_000 },
          )
          .catch(() => {});
        const state = await page.evaluate(() => {
          const a = document.activeElement as HTMLElement | null;
          const popover = document.querySelector('[data-testid="vault-switch-popover"]');
          return {
            active: a?.getAttribute('data-testid') ?? a?.tagName ?? 'none',
            inPopover: popover !== null && a !== null && popover.contains(a),
            open: popover !== null,
          };
        });
        trail.push(`${state.active}${state.open ? ' [open]' : ''}`);
        expect(state.active, `focus fell to BODY: ${trail.join(' -> ')}`).not.toBe('BODY');
        if (!state.inPopover) {
          expect(state.open, `focus left but the popover stayed: ${trail.join(' -> ')}`).toBe(false);
          const active = await page.evaluate(
            () => (document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.outerHTML.slice(0, 80)) ?? null,
          );
          expect(active, `Tab out did not continue from the chip: ${trail.join(' -> ')}`).toBe(expected);
          return;
        }
      }
      throw new Error(`six paced Tabs never left the popover: ${trail.join(' -> ')}`);
    });
  }

  test('Shift+Tab from the popover closes it and lands on the chip', async ({ page }) => {
    test.setTimeout(120_000);
    await installDesktopRailRuntime(page);
    await mountDesktopVault(page);
    await openSwitcher(page);
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByTestId('vault-switch-popover')).toHaveCount(0);
    await expect(page.getByTestId('vault-switch-rail-tile')).toBeFocused();
  });

  test('focus stays on the chip while the picked folder loads', async ({ page }) => {
    test.setTimeout(120_000);
    await installDesktopRailRuntime(page);
    await mountDesktopVault(page);
    await openSwitcher(page);
    await page.evaluate(() => {
      const samples: Array<{ at: number; active: string; busy: boolean }> = [];
      (window as unknown as { __focusSamples: typeof samples }).__focusSamples = samples;
      const start = performance.now();
      const tick = () => {
        const a = document.activeElement as HTMLElement | null;
        const tileEl = document.querySelector('[data-testid="vault-switch-rail-tile"]');
        samples.push({
          at: Math.round(performance.now() - start),
          active: a?.getAttribute('data-testid') ?? a?.tagName ?? 'none',
          busy: tileEl?.getAttribute('data-busy') === 'true',
        });
        // measurement window: the claim is about every frame of the load, sampled in the page.
        if (performance.now() - start < 5000) requestAnimationFrame(tick);
        else (window as unknown as { __focusSamplesDone: boolean }).__focusSamplesDone = true;
      };
      requestAnimationFrame(tick);
    });
    await page.getByTestId('vault-switch-pick-other').click();
    await page.waitForFunction(() => (window as unknown as { __focusSamplesDone?: boolean }).__focusSamplesDone === true, undefined, {
      timeout: 30_000,
    });
    const samples = await page.evaluate(
      () => (window as unknown as { __focusSamples: Array<{ at: number; active: string; busy: boolean }> }).__focusSamples,
    );
    const busyFrames = samples.filter((s) => s.busy);
    expect(busyFrames.length, 'the switch never showed a busy chip').toBeGreaterThan(5);
    // The popover's exit takes a moment; after it, the busy chip holds the keyboard.
    const lost = busyFrames.filter((s) => s.at > 400 && s.active !== 'vault-switch-rail-tile');
    expect(lost.map((s) => `${s.at}ms ${s.active}`), 'focus left the chip during the load').toEqual([]);
    // And it is still there once the new folder has landed.
    await expect(page.getByTestId('vault-switch-rail-tile')).toBeFocused({ timeout: 10_000 });
  });

  test('a press on the dimmed map closes the popover and does not reach the map', async ({ page }) => {
    test.setTimeout(120_000);
    await installDesktopRailRuntime(page);
    await mountDesktopVault(page);
    await page.goto('/en/topology/?guides=off&e2e=1', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('topology-index-panel')).toBeVisible({ timeout: 60_000 });
    type Node = { id: string; x: number; y: number; hidden?: boolean };
    await expect
      .poll(() => page.evaluate(() => ((window as unknown as { __atlasMap?: { nodes: () => unknown[] } }).__atlasMap?.nodes().length ?? 0)))
      .toBeGreaterThan(0);
    await waitForMapSettled(page);
    const target = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')!.getBoundingClientRect();
      const nodes = (window as unknown as { __atlasMap: { nodes: () => Node[] } }).__atlasMap.nodes();
      const onScreen = nodes
        .filter((n) => !n.hidden)
        .map((n) => ({ id: n.id, x: canvas.left + n.x, y: canvas.top + n.y }))
        .filter((n) => n.x > 520 && n.x < innerWidth - 80 && n.y > 140 && n.y < innerHeight - 80);
      return onScreen[0] ?? null;
    });
    expect(target, 'no node on screen to press').not.toBeNull();
    const popover = await openSwitcher(page);
    await expect(page.getByTestId('topology-node-popover-positioner')).toHaveCount(0);
    await page.mouse.click(target!.x, target!.y);
    await expect(popover).toHaveCount(0);
    // A press that also selected the node would reframe the map onto it; let it finish answering.
    await waitForMapStill(page);
    // The press closed the popover; it did not also focus the node under it.
    await expect(page.getByTestId('topology-node-popover-positioner')).toHaveCount(0);
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
  });
});

test.describe('settings', () => {
  test.use({ viewport: { width: 1512, height: 949 } });

  test('checking for updates keeps focus and starts its result on the pane line', async ({ page }) => {
    test.setTimeout(120_000);
    await installDesktopRailRuntime(page);
    await mountDesktopVault(page);
    await page.locator('[data-testid="app-settings-trigger"]:visible').click();
    await page.getByTestId('app-settings-nav-about').click();
    const check = page.getByTestId('app-settings-update-check');
    await check.focus();
    await page.keyboard.press('Enter');
    await expect(check).toBeFocused();
    const result = page.getByTestId('app-settings-update-result');
    await expect(result).not.toHaveText('', { timeout: 20_000 });
    const lines = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="app-settings-update-version"]')!.parentElement!;
      const out = document.querySelector('[data-testid="app-settings-update-result"]')!;
      const outRange = document.createRange();
      outRange.selectNodeContents(out);
      return {
        card: card.getBoundingClientRect().left,
        result: outRange.getBoundingClientRect().left,
        phase: out.getAttribute('data-phase'),
        color: getComputedStyle(out).color,
        tertiary: getComputedStyle(document.documentElement).getPropertyValue('--color-text-tertiary'),
      };
    });
    expect(Math.abs(lines.card - lines.result), 'result line is off the card edge').toBeLessThanOrEqual(1);
  });

  test('the web About pane shows the website build without the update check', async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/ko/topology/?guides=off', { waitUntil: 'networkidle' });
    // A press before hydration lands on an inert <summary>; retry the press, not the claim.
    await expect(async () => {
      await page.locator('[data-testid="app-settings-trigger"]:visible').click();
      await expect(page.getByTestId('app-settings-popover')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await page.getByTestId('app-settings-nav-about').click();
    await expect(page.getByTestId('app-settings-about-web-version')).toBeVisible();
    await expect(page.getByTestId('app-settings-update-check')).toHaveCount(0);
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
  });
});
