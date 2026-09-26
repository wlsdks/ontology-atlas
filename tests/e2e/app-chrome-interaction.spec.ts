import { expect, test, type Page } from '@playwright/test';

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

/** Screenshots land in this test's own output folder, never a fixed path outside the repo. */
const shot = (name: string) => test.info().outputPath(name);

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
        // measurement window: the claim is about every frame of the switch, sampled in the page.
        if (performance.now() - start < 6000) requestAnimationFrame(tick);
        else (window as unknown as { __chromeSamplesDone: boolean }).__chromeSamplesDone = true;
      };
      requestAnimationFrame(tick);
    });
    await page.getByTestId('vault-switch-pick-other').click();
    // The capture shows the switch in progress: the chip is busy opening the folder.
    await expect(page.getByTestId('vault-switch-rail-tile')).toHaveAttribute('data-busy', 'true');
    await page.screenshot({ path: shot('ch1-switching-400.png') });
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
    await page.screenshot({ path: shot('ch3-popover.png') });
  });

  /*
   * **The popover belongs to its chip, and what it stands on is dimmed, not collided with.**
   *
   * Two placements failed review (2026-09-25). Hung from the chip's corner with nothing dimmed it
   * lay over the INDEX search field and folder line, edge straddling the INDEX card's. Stepped
   * into the "free map" (x412-828) it covered the fitted graph's top node and its label at 1040
   * and 1280, stood ~350px from the chip under the toolbar's Expand all / Auto-arrange buttons,
   * and its gap to INDEX was 8px at one width and 6px at the others.
   *
   * Measured here at each rail width, INDEX open and folded, en and ko:
   * - anchored: one gap past the rail, top on the chip's top, the same rect at every width;
   * - every INDEX, toolbar and on-screen node point outside the popover hits the scrim, so
   *   nothing under it reads as live chrome, and the rail itself stays lit;
   * - a press on the dimmed map closes the popover and does not reach the map.
   */
  test('the popover stands beside its chip over a dimmed workspace, at every rail width', async ({ page }) => {
    test.setTimeout(300_000);
    await installDesktopRailRuntime(page);
    await mountDesktopVault(page);
    const failures: string[] = [];
    const rects = new Set<string>();
    for (const [locale, index] of [
      ['en', 'expanded'],
      ['en', 'collapsed'],
      ['ko', 'expanded'],
    ] as const) {
      for (const viewport of [
        { width: 1040, height: 720 },
        { width: 1280, height: 800 },
        { width: 1512, height: 949 },
        { width: 1920, height: 1080 },
      ]) {
        await page.setViewportSize(viewport);
        await page.goto(`/${locale}/topology/?guides=off&e2e=1${index === 'collapsed' ? '&index=collapsed' : ''}`, {
          waitUntil: 'domcontentloaded',
        });
        const indexTestId = index === 'expanded' ? 'topology-index-panel' : 'topology-index-tab';
        await expect(page.getByTestId(indexTestId)).toBeVisible({ timeout: 60_000 });
        await expect(page.getByTestId('topology-top-toolbar')).toBeVisible();
        await expect
          .poll(() => page.evaluate(() => ((window as unknown as { __atlasMap?: { nodes: () => unknown[] } }).__atlasMap?.nodes().length ?? 0)))
          .toBeGreaterThan(0);
        const popover = await openSwitcher(page);
        await expect
          .poll(() => page.getByTestId('vault-switch-scrim').evaluate((el) => Number(getComputedStyle(el).opacity)))
          .toBe(1);
        const where = `${locale} ${viewport.width} index=${index}`;
        const m = await page.evaluate((indexSelector) => {
          const pop = document.querySelector('[data-testid="vault-switch-popover"]')!;
          const scrim = document.querySelector('[data-testid="vault-switch-scrim"]')!;
          const hit = (x: number, y: number) => {
            const top = document.elementFromPoint(x, y);
            if (top === null) return 'none';
            if (pop.contains(top)) return 'popover';
            return top === scrim ? 'scrim' : 'live';
          };
          const pr = pop.getBoundingClientRect();
          const inPopover = (x: number, y: number) => x >= pr.left && x <= pr.right && y >= pr.top && y <= pr.bottom;
          const live: string[] = [];
          const probe = (label: string, x: number, y: number) => {
            if (inPopover(x, y) || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return;
            if (hit(x, y) !== 'scrim') live.push(`${label}@${Math.round(x)},${Math.round(y)}`);
          };
          const ir = document.querySelector(indexSelector)!.getBoundingClientRect();
          for (let i = 0; i < 7; i += 1) {
            for (let j = 0; j < 7; j += 1) probe('INDEX', ir.left + (ir.width * (i + 0.5)) / 7, ir.top + (ir.height * (j + 0.5)) / 7);
          }
          const toolbar = document.querySelector('[data-testid="topology-top-toolbar"]')!;
          for (const control of toolbar.querySelectorAll('button, a, input')) {
            const r = control.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) probe(control.getAttribute('aria-label') ?? 'toolbar', r.left + r.width / 2, r.top + r.height / 2);
          }
          const canvas = document.querySelector('canvas')!.getBoundingClientRect();
          const nodes = (window as unknown as { __atlasMap: { nodes: () => Array<{ id: string; x: number; y: number; hidden?: boolean }> } }).__atlasMap.nodes();
          for (const node of nodes) if (!node.hidden) probe(node.id, canvas.left + node.x, canvas.top + node.y);
          const rail = document.querySelector('[data-testid="app-nav-rail"]')!.getBoundingClientRect();
          const chip = document.querySelector('[data-testid="vault-switch-rail-tile"]')!.getBoundingClientRect();
          const destination = document.querySelector('[data-testid^="app-nav-rail-item-"]')!.getBoundingClientRect();
          return {
            live,
            railLit: hit(destination.left + destination.width / 2, destination.top + destination.height / 2) === 'live',
            gapToRail: pr.left - rail.right,
            topToChip: pr.top - chip.top,
            popover: { left: pr.left, top: pr.top, right: pr.right, bottom: pr.bottom },
            viewport: { width: innerWidth, height: innerHeight },
          };
        }, `[data-testid="${indexTestId}"]`);
        if (m.live.length > 0) failures.push(`${where}: live chrome or map beside the popover, not dimmed: ${m.live.join(', ')}`);
        if (!m.railLit) failures.push(`${where}: the rail is dimmed with the workspace`);
        if (Math.round(m.gapToRail) !== 8) failures.push(`${where}: the popover stands ${m.gapToRail}px from the rail, not 8`);
        if (Math.round(m.topToChip) !== 0) failures.push(`${where}: the popover's top is ${m.topToChip}px off the chip's`);
        if (m.popover.right > m.viewport.width || m.popover.bottom > m.viewport.height) {
          failures.push(`${where}: the popover leaves the window`);
        }
        rects.add(`${Math.round(m.popover.left)},${Math.round(m.popover.top)}`);
        await page.screenshot({ path: shot(`ch3-popover-${locale}-${index}-${viewport.width}.png`) }).catch(() => {});
        await page.keyboard.press('Escape');
        await expect(popover).toHaveCount(0);
        await expect(page.getByTestId('vault-switch-scrim')).toHaveCount(0);
        await expect(page.getByTestId('vault-switch-rail-tile')).toBeFocused();
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
    expect([...rects], 'the popover moved between widths').toHaveLength(1);
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

  test('under reduced motion the popover fades in place instead of growing', async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installDesktopRailRuntime(page);
    await mountDesktopVault(page);
    await page.getByTestId('vault-switch-rail-tile').click();
    const motion = await page.getByTestId('vault-switch-popover').evaluate((el) => {
      const style = getComputedStyle(el);
      return { name: style.animationName, transform: style.transform };
    });
    expect(motion.name, 'the growing entrance still runs').not.toContain('topologyChromeIn');
    expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(motion.transform);
  });
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
    await page.screenshot({ path: shot('ch5-sheet-1040.png') });
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
    await page.screenshot({ path: shot('ch6-update.png') });
  });

  // The key form lives on Agents → Models since 2026-09-25; the settings sheet's pointer row
  // is the door a person who reaches for keys in settings takes.
  test('an inline key form uses one control size', async ({ page }) => {
    test.setTimeout(120_000);
    await installDesktopRailRuntime(page);
    await mountDesktopVault(page);
    await page.locator('[data-testid="app-settings-trigger"]:visible').click();
    await page.getByTestId('app-settings-nav-models').click();
    await expect(page).toHaveURL(/\/agents\/\?(?:.*&)?tab=models/);
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
    await page.screenshot({ path: shot('ch7-key-form.png') });
  });

  test('neutral row actions read in one text tone across Settings → Workspace and Agents → Models', async ({ page }) => {
    test.setTimeout(120_000);
    await installDesktopRailRuntime(page);
    await mountDesktopVault(page);
    await page.locator('[data-testid="app-settings-trigger"]:visible').click();
    await page.getByTestId('app-settings-nav-workspace').click();
    const workspace = page.getByTestId('app-settings-reveal-vault-path');
    await expect(workspace).toBeVisible();
    const workspaceInk = await workspace.evaluate((el) => getComputedStyle(el).color);
    await page.getByTestId('app-settings-nav-models').click();
    await expect(page).toHaveURL(/\/agents\/\?(?:.*&)?tab=models/);
    await page.getByTestId('ai-register-anthropic').click();
    await expect(page.getByTestId('ai-cancel-anthropic')).toBeVisible();
    // The claim is about the resting ink. The pointer that just pressed the opener still sits on
    // it, and its hover ink (stronger, by design) would be measured instead once the colour
    // transition finishes, so the pointer leaves first and the colour is read after it settles.
    await page.mouse.move(0, 0);
    await expect
      .poll(() =>
        page.evaluate(() =>
          ['ai-register-anthropic', 'ai-cancel-anthropic'].map((id) => {
            const el = document.querySelector(`[data-testid="${id}"]`)!;
            return getComputedStyle(el).color;
          }),
        ),
        { message: `workspace chip ink ${workspaceInk}` },
      )
      .toEqual([workspaceInk, workspaceInk]);
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
    await page.screenshot({ path: shot('ch10-locale.png') });
  });
});
