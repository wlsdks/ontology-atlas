import { expect, test } from '@playwright/test';

import { openSwitcher } from './app-chrome-harness';
import { installDesktopRailRuntime, mountDesktopVault } from './desktop-rail-arrival-harness';
import { seedFirstRunSeen } from './first-run-seed';

test.describe('the vault switcher geometry', () => {
  test.use({ viewport: { width: 1512, height: 949 } });

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
   * Measured at the app's minimum window and a wide one, INDEX open and folded, en and ko:
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
    // The app's minimum window and a wide display: two widths are what "the same rect at every
    // width" needs, and the folded INDEX is the other layout the popover stands beside.
    for (const [locale, index] of [
      ['en', 'collapsed'],
      ['ko', 'expanded'],
    ] as const) {
      for (const viewport of [
        { width: 1040, height: 720 },
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
        await page.keyboard.press('Escape');
        await expect(popover).toHaveCount(0);
        await expect(page.getByTestId('vault-switch-scrim')).toHaveCount(0);
        await expect(page.getByTestId('vault-switch-rail-tile')).toBeFocused();
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
    expect([...rects], 'the popover moved between widths').toHaveLength(1);
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

test.describe('settings geometry', () => {
  test.use({ viewport: { width: 1512, height: 949 } });

  test('an inline key form uses one control size', async ({ page }) => {
    test.setTimeout(120_000);
    await installDesktopRailRuntime(page);
    await mountDesktopVault(page);
    await page.locator('[data-testid="app-settings-trigger"]:visible').click();
    await page.getByTestId('app-settings-nav-agents').click();
    await page.getByTestId('app-settings-door-models').click();
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
    await page.getByTestId('app-settings-nav-agents').click();
    await page.getByTestId('app-settings-door-models').click();
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
});
