import { expect, test, type Locator, type Page } from '@playwright/test';

import { installHarnessRuntime, mountHarnessVault } from './harness-tab-fixture';
import { installDesktopBridge } from './rounds-desktop-bridge';

/**
 * **Placement, overlap and consistency on Harness, Automations and Analysis** (2026-09-25).
 *
 * The owner's question was whether things are placed oddly, whether the buttons differ in size,
 * and whether anything overlaps. Every assertion here is a rect, a computed style or an
 * `elementFromPoint` answer, because each of these defects passed an eye that looked at a
 * screenshot: a 34px-wide tooltip, a panel 600px from its button, a confirm 126px from its trigger.
 */

async function hintPanel(page: Page, button: Locator): Promise<Locator> {
  const id = (await button.getAttribute('aria-describedby'))!;
  return page.locator(`[id="${id}"]`);
}

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  expect(rect, 'measured element has no box').not.toBeNull();
  return rect!;
}

test.describe('Harness hints', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await installHarnessRuntime(page);
    await mountHarnessVault(page);
  });

  test('the loop card hint opens a readable panel, not a one-syllable column', async ({ page }) => {
    await page.goto('/ko/architecture/?guides=off');
    const core = page.getByTestId('harness-anatomy-band-tool');
    await expect(core).toBeVisible({ timeout: 30_000 });
    const button = core.getByRole('button');
    await button.hover();
    const panel = await hintPanel(page, button);
    await expect(panel).toHaveCSS('opacity', '1');
    const rect = await box(panel);
    /* 34×332 before: the panel was capped at its 24px button's width. */
    expect(rect.width, 'hint panel collapsed to its button width').toBeGreaterThanOrEqual(240);
    expect(rect.x, 'hint panel left the window').toBeGreaterThanOrEqual(8);
    expect(rect.x + rect.width).toBeLessThanOrEqual(1512 - 8);
  });

  test('hint panels hang from the button that opened them', async ({ page }) => {
    for (const [route, name] of [
      ['/ko/architecture/?guides=off', '이 구분은 어디서 왔나'],
      ['/ko/architecture/?view=coverage&guides=off', '검사를 세는 방법'],
    ] as const) {
      await page.goto(route);
      const button = page.getByRole('button', { name, exact: true }).first();
      await expect(button).toBeVisible({ timeout: 30_000 });
      await button.focus();
      const panel = await hintPanel(page, button);
      await expect(panel).toHaveCSS('opacity', '1');
      const trigger = await box(button);
      const rect = await box(panel);
      const centre = trigger.x + trigger.width / 2;
      /* Before: panel [104..392] for a button at x=707, 28px below it. */
      expect(
        centre >= rect.x && centre <= rect.x + rect.width,
        `${name}: panel [${rect.x.toFixed(0)}, ${(rect.x + rect.width).toFixed(0)}] does not reach its button at ${centre.toFixed(0)}`,
      ).toBe(true);
      const gap = rect.y - (trigger.y + trigger.height);
      expect(gap, `${name}: panel is ${gap.toFixed(0)}px below its button`).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThanOrEqual(12);
    }
  });

  test('a hint panel can be hovered into and Escape dismisses it', async ({ page }) => {
    await page.goto('/ko/architecture/?view=coverage&guides=off');
    const button = page.getByRole('button', { name: '말해둔 것', exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    const panel = await hintPanel(page, button);
    const trigger = await box(button);
    const x = trigger.x + trigger.width / 2;
    await page.mouse.move(x, trigger.y + trigger.height / 2);
    await expect(panel).toHaveCSS('opacity', '1');
    const rect = await box(panel);
    /* Through the gap between button and panel, then into the panel itself. */
    await page.mouse.move(x, (trigger.y + trigger.height + rect.y) / 2, { steps: 3 });
    await page.waitForTimeout(400);
    await expect(panel, 'the panel vanished in the gap under its button').toHaveCSS('opacity', '1');
    await page.mouse.move(x, rect.y + 10, { steps: 3 });
    await page.waitForTimeout(400);
    await expect(panel, 'the panel vanished before the pointer reached it').toHaveCSS('opacity', '1');

    await page.mouse.move(2, 2);
    await button.focus();
    await expect(panel).toHaveCSS('opacity', '1');
    await page.keyboard.press('Escape');
    await expect(panel, 'Escape did not dismiss the hint').toHaveCSS('opacity', '0');
    await expect(button).toBeFocused();
  });
});

test.describe('Architecture toolbar', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await installHarnessRuntime(page);
    await mountHarnessVault(page);
  });

  test('one control height in the row, one close shape, and a copy that does not resize it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/ko/architecture/?view=architecture&guides=off');
    const action = page.getByTestId('architecture-agent-action');
    await expect(action).toBeVisible({ timeout: 30_000 });
    const ids = ['architecture-review-open', 'architecture-evidence-rail', 'architecture-agent-action', 'architecture-inspector-toggle'];
    const rects = await Promise.all(ids.map((id) => box(page.getByTestId(id))));
    /* The review door was 32px / 11px / r6 beside three 40px controls. */
    expect(rects.map((rect) => Math.round(rect.height)), 'toolbar heights').toEqual([40, 40, 40, 40]);

    const rail = page.getByTestId('architecture-evidence-rail');
    const before = { action: (await box(action)).width, rail: (await box(rail)).width };
    await action.click();
    await expect(action).toHaveAttribute('data-architecture-copy-state', 'copied');
    const after = { action: (await box(action)).width, rail: (await box(rail)).width };
    /* 177.8 → 373.1px and the rail 496 → 301px before. */
    expect(Math.abs(after.action - before.action), 'the copy confirmation resized the button').toBeLessThanOrEqual(1);
    expect(Math.abs(after.rail - before.rail), 'the copy confirmation squeezed the evidence rail').toBeLessThanOrEqual(1);

    await rail.click();
    const evidenceClose = await box(page.getByTestId('architecture-evidence-close'));
    await page.getByTestId('architecture-evidence-close').click();
    await page.getByTestId('architecture-inspector-toggle').click();
    const inspectorClose = await box(page.getByTestId('architecture-inspector-close'));
    /* 65×32 and 42×32 before: one close, one shape. */
    expect([Math.round(evidenceClose.width), Math.round(evidenceClose.height)]).toEqual([
      Math.round(inspectorClose.width),
      Math.round(inspectorClose.height),
    ]);
  });

  test('below xl a pressed role scrolls to its answer and the rules stay reachable', async ({ page }) => {
    await page.setViewportSize({ width: 1040, height: 720 });
    await page.goto('/ko/architecture/?view=architecture&guides=off');
    const box0 = page.getByTestId('architecture-graph-box-views');
    await expect(box0).toBeVisible({ timeout: 30_000 });
    await box0.click();
    const detail = page.getByTestId('architecture-role-detail-motion');
    await expect(detail).toBeAttached();
    await expect
      .poll(async () => (await detail.boundingBox())?.y ?? Infinity, { message: 'the role detail stayed under the fold' })
      .toBeLessThan(720 - 40);

    const toggle = page.getByTestId('architecture-inspector-toggle');
    await expect(toggle, 'no control reaches the rules below xl').toBeVisible();
    await toggle.click();
    await expect
      .poll(async () => (await page.getByTestId('architecture-blueprint').boundingBox())?.y ?? Infinity)
      .toBeLessThan(720 - 40);
  });
});

test.describe('Harness coverage detail', () => {
  test('an open cell detail pushes the rows below instead of covering their cells', async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await installHarnessRuntime(page);
    await mountHarnessVault(page);
    await page.goto('/ko/architecture/?view=coverage&guides=off');
    const first = page.locator('[data-harness-cell="told"]').first();
    await expect(first).toBeVisible({ timeout: 30_000 });
    await first.click();
    await expect(page.getByTestId('harness-coverage-detail')).toBeVisible();
    const covered = await page.evaluate(() => {
      const cells = [...document.querySelectorAll<HTMLElement>('[data-harness-cell]')];
      const view = document.querySelector('[role="tabpanel"]')!.getBoundingClientRect();
      const out: string[] = [];
      for (const cell of cells) {
        const rect = cell.getBoundingClientRect();
        const y = rect.top + rect.height / 2;
        /* Only cells whose centre the scroller shows; a clipped cell is not an overlap. */
        if (y < view.top || y > Math.min(view.bottom, window.innerHeight)) continue;
        const hit = document.elementFromPoint(rect.left + rect.width / 2, y);
        if (!hit || !cell.contains(hit)) {
          out.push(`${cell.getAttribute('aria-label')} → ${hit ? `${hit.tagName}.${String(hit.className).slice(0, 50)}` : 'null'}`);
        }
      }
      return out;
    });
    expect(covered, 'cells covered by the open detail').toEqual([]);
    await expect(first).toHaveAttribute('aria-controls', /harness-coverage-detail-/);
  });
});

test.describe('Automations remove confirm', () => {
  test('the question replaces the row, takes focus, and Escape gives it back', async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await installDesktopBridge(page, { seedRounds: true });
    await page.goto('/en/');
    await page.getByRole('button', { name: /Open.*folder/i }).first().click();
    await expect(page.getByTestId('app-nav-rail')).toBeVisible();
    await page.goto('/ko/automations/?guides=off&kind=documents');
    const remove = page.getByTestId('automations-remove').filter({ visible: true }).first();
    await expect(remove).toBeVisible({ timeout: 30_000 });
    const trigger = await box(remove);
    await remove.click();
    const confirm = page.getByTestId('automations-confirm-remove').filter({ visible: true }).first();
    await expect(confirm).toBeVisible();
    const group = await box(page.getByTestId('automations-remove-confirm').filter({ visible: true }).first());
    /* 59px lower and under a divider before: the question stands where the row stood. */
    expect(Math.abs(group.y - trigger.y), 'the confirm opened away from its trigger').toBeLessThanOrEqual(8);
    await expect(page.getByRole('button', { name: '취소', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);
    await expect(page.getByTestId('automations-remove').filter({ visible: true }).first()).toBeFocused();
  });
});

test.describe('Analysis', () => {
  test('the row menu is one line per item and the handoff footer is not monospace', async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await page.goto('/ko/ontology/insights/?tab=do-next&guides=off', { waitUntil: 'domcontentloaded' });
    const trigger = page.getByTestId('do-next-row-menu').first();
    await expect(trigger).toBeVisible({ timeout: 30_000 });
    await trigger.click();
    const items = page.getByTestId('do-next-row-menu-popover').getByRole('menuitem');
    await expect(items.first()).toBeVisible();
    const heights = await items.evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().height)));
    /* 28 and 44 before, because the second item wrapped in a 160px menu. */
    expect(new Set(heights).size, `menu item heights ${heights.join(', ')}`).toBe(1);
    await page.keyboard.press('Escape');

    await page.goto('/ko/ontology/insights/?tab=flow&guides=off', { waitUntil: 'domcontentloaded' });
    const handoff = page.getByTestId('insights-handoff-row').first();
    await handoff.scrollIntoViewIfNeeded();
    const families = await handoff.evaluate((row) =>
      [...row.querySelectorAll('span, button')].map((node) => getComputedStyle(node).fontFamily),
    );
    expect(families.filter((family) => /mono/i.test(family)), 'Hangul set in a monospace face').toEqual([]);
  });

  test('the guidance evidence popup stays inside its field at 1040×720', async ({ page }) => {
    await page.setViewportSize({ width: 1040, height: 720 });
    await installHarnessRuntime(page);
    await mountHarnessVault(page);
    await page.goto('/ko/ontology/insights/?tab=harness&guides=off');
    const overview = page.getByTestId('harness-coverage-overview');
    await expect(overview).toBeVisible({ timeout: 30_000 });
    const field = overview.locator(':scope > div').first();
    const fieldRect = await box(field);
    /* The reported case: the second row's Shop Front instructions port scrolled to y≈408, where
       the room below is shorter than the popup and the room above runs to the window's top. */
    const target = overview
      .locator('[data-testid^="harness-domain-"]', { hasText: 'Shop Front' })
      .locator('[data-role="told"]')
      .first();
    await expect(target).toBeAttached();
    const portY = (await box(target)).y;
    await field.evaluate((element, delta) => { element.scrollTop += delta; }, portY - 408);
    await page.waitForTimeout(200);
    const settled = (await box(target)).y;
    expect(Math.abs(settled - 408), `port did not reach y≈408 (at ${settled.toFixed(0)})`).toBeLessThanOrEqual(60);
    await target.click();
    const popup = page.getByTestId('harness-role-popup');
    await expect(popup).toBeVisible();
    await page.waitForTimeout(400);
    const rect = await box(popup);
    const title = await box(page.getByRole('heading', { level: 1 }).first());
    /* Before: [138,16,503,400], over the page title and the tab switch. */
    expect(rect.y, 'the popup rose over the page title').toBeGreaterThanOrEqual(title.y + title.height);
    expect(rect.y, 'the popup rose above its field').toBeGreaterThanOrEqual(fieldRect.y);
  });
});

/**
 * Where a hint panel may sit: in the window, inside the page scroller (what lies outside it is
 * chrome), readable on one pass, and on top at its own corners.
 */
async function hintPlacement(page: Page, button: Locator) {
  const id = (await button.getAttribute('aria-describedby'))!;
  return page.evaluate((id) => {
    const panel = document.getElementById(id)!;
    const body = (panel.querySelector<HTMLElement>(':scope > div') ?? panel);
    /* The visible region: the window, cut by every ancestor that actually scrolls on an axis. */
    const field = { left: 0, top: 0, right: document.documentElement.clientWidth, bottom: innerHeight };
    for (let node = panel.parentElement; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) {
        field.top = Math.max(field.top, rect.top);
        field.bottom = Math.min(field.bottom, rect.bottom);
      }
      if (/(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1) {
        field.left = Math.max(field.left, rect.left);
        field.right = Math.min(field.right, rect.right);
      }
    }
    const r = panel.getBoundingClientRect();
    const inset = 14;
    const corners = [
      [r.left + inset, r.top + inset],
      [r.right - inset, r.top + inset],
      [r.left + inset, r.bottom - inset],
      [r.right - inset, r.bottom - inset],
    ];
    return {
      rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
      field,
      /* A nowrap host gave a 640px line in a 254px body before. */
      wideText: body.scrollWidth - body.clientWidth,
      covered: corners
        .map(([x, y]) => document.elementFromPoint(x, y))
        .filter((hit) => !panel.contains(hit))
        .map((hit) => `${hit?.tagName}.${String(hit?.className).slice(0, 40)}`),
    };
  }, id);
}

function expectInside(placement: Awaited<ReturnType<typeof hintPlacement>>, what: string) {
  const { rect, field } = placement;
  expect(placement.wideText, `${what}: the hint text runs past its panel`).toBeLessThanOrEqual(1);
  expect(rect.left, `${what}: panel left of the field`).toBeGreaterThanOrEqual(field.left + 8 - 0.5);
  expect(rect.right, `${what}: panel right of the field`).toBeLessThanOrEqual(field.right - 8 + 0.5);
  expect(rect.top, `${what}: panel above the field`).toBeGreaterThanOrEqual(field.top - 0.5);
  expect(rect.bottom, `${what}: panel under the scroller's edge`).toBeLessThanOrEqual(field.bottom + 0.5);
  expect(placement.covered, `${what}: something sits over the panel`).toEqual([]);
}

test.describe('Harness hints stay whole', () => {
  test.beforeEach(async ({ page }) => {
    await installHarnessRuntime(page);
    await mountHarnessVault(page);
  });

  test('the Guides header hints wrap inside their panel and stay in the window', async ({ page }) => {
    for (const [width, height] of [[1512, 949], [390, 844]] as const) {
      await page.setViewportSize({ width, height });
      await page.goto('/ko/architecture/?view=guides&guides=off');
      for (const name of ['짝', '바뀜']) {
        const button = page.getByRole('button', { name, exact: true }).first();
        await expect(button).toBeVisible({ timeout: 30_000 });
        await button.scrollIntoViewIfNeeded();
        await button.hover();
        await expect(await hintPanel(page, button)).toHaveCSS('opacity', '1');
        expectInside(await hintPlacement(page, button), `${width} ${name}`);
      }
    }
  });

  test('a hint near the scroller bottom opens upward instead of under the edge', async ({ page }) => {
    /* 768 wide, and short enough that the page scrolls the button down to the tab bar's edge. */
    await page.setViewportSize({ width: 768, height: 760 });
    await page.goto('/ko/architecture/?guides=off');
    const button = page.getByRole('button', { name: '저장소가 정하지 않는 것', exact: true }).first();
    await expect(button).toBeVisible({ timeout: 30_000 });
    /* Put the button 60px above the page scroller's bottom edge. */
    await button.evaluate((element) => {
      let scroller: HTMLElement | null = null;
      for (let node = element.parentElement; node && !scroller; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) scroller = node;
      }
      if (!scroller) throw new Error('no vertical scroller around the hint');
      const bottom = Math.min(innerHeight, scroller.getBoundingClientRect().bottom);
      scroller.scrollTop += element.getBoundingClientRect().bottom - (bottom - 60);
    });
    await page.waitForTimeout(200);
    await button.hover();
    const panel = await hintPanel(page, button);
    await expect(panel).toHaveCSS('opacity', '1');
    const placement = await hintPlacement(page, button);
    expectInside(placement, '768 structure');
    const trigger = await box(button);
    expect(placement.rect.bottom, 'the panel did not open upward').toBeLessThanOrEqual(trigger.y);
  });

  test('Escape closes the hint and leaves the cell detail under it open', async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await page.goto('/ko/architecture/?view=coverage&guides=off');
    const cell = page.locator('[data-harness-cell="told"]').first();
    await expect(cell).toBeVisible({ timeout: 30_000 });
    await cell.click();
    const detail = page.getByTestId('harness-coverage-detail');
    await expect(detail).toBeVisible();
    const button = page.getByRole('button', { name: '말해둔 것', exact: true });
    await button.hover();
    const panel = await hintPanel(page, button);
    await expect(panel).toHaveCSS('opacity', '1');
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCSS('opacity', '0');
    /* Both closed on one press before. */
    await expect(detail, 'one Escape closed the hint and the detail').toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(detail).toHaveCount(0);
  });

  test('a hint dismissed with Escape comes back when the pointer returns', async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await page.goto('/ko/architecture/?view=coverage&guides=off');
    const button = page.getByRole('button', { name: '말해둔 것', exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    const panel = await hintPanel(page, button);
    await button.focus();
    await button.hover();
    await expect(panel).toHaveCSS('opacity', '1');
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCSS('opacity', '0');
    await page.mouse.move(2, 2);
    await button.hover();
    /* It stayed at 0 until the button blurred before. */
    await expect(panel, 'hover no longer reopens a dismissed hint').toHaveCSS('opacity', '1');
    await expect(button).toBeFocused();
  });
});

test.describe('Automations remove confirm at 390', () => {
  test('the answer pair stays together on one row', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installDesktopBridge(page, { seedRounds: true });
    await page.goto('/en/');
    await page.getByRole('button', { name: /Open.*folder/i }).first().click();
    await page.goto('/ko/automations/?guides=off&kind=documents');
    const remove = page.getByTestId('automations-remove').filter({ visible: true }).first();
    await expect(remove).toBeVisible({ timeout: 30_000 });
    await remove.click();
    const cancel = await box(page.getByRole('button', { name: '취소', exact: true }));
    const confirm = await box(page.getByTestId('automations-confirm-remove').filter({ visible: true }).first());
    /* The danger button wrapped alone to a second line, below and left of Cancel, before. */
    expect(Math.abs(cancel.y + cancel.height / 2 - (confirm.y + confirm.height / 2)), 'the pair split across rows').toBeLessThanOrEqual(1);
    expect(confirm.x, 'the danger step is not after Cancel').toBeGreaterThan(cancel.x + cancel.width);
    expect(confirm.x + confirm.width).toBeLessThanOrEqual(390);
  });
});

test.describe('Architecture copy failure', () => {
  test('the error label does not resize the toolbar button', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error('denied')) },
      });
      document.execCommand = () => false;
    });
    await installHarnessRuntime(page);
    await mountHarnessVault(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/ko/architecture/?view=architecture&guides=off');
    const action = page.getByTestId('architecture-agent-action');
    await expect(action).toBeVisible({ timeout: 30_000 });
    const rail = page.getByTestId('architecture-evidence-rail');
    const before = { action: (await box(action)).width, rail: (await box(rail)).width };
    await action.click();
    await expect(action).toHaveAttribute('data-architecture-copy-state', 'error');
    const after = { action: (await box(action)).width, rail: (await box(rail)).width };
    expect(Math.abs(after.action - before.action), 'the error label resized the button').toBeLessThanOrEqual(1);
    expect(Math.abs(after.rail - before.rail), 'the error label squeezed the evidence rail').toBeLessThanOrEqual(1);
  });
});

test.describe('Surfaces near the bottom tab bar and below xl', () => {
  test('a row menu near the tab bar opens upward instead of under it', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto('/ko/ontology/insights/?tab=do-next&guides=off', { waitUntil: 'domcontentloaded' });
    const trigger = page.getByTestId('do-next-row-menu').first();
    await expect(trigger).toBeVisible({ timeout: 30_000 });
    const nav = await box(page.locator('[data-tabbar="primary"]'));
    /* Park the kebab 40px above the tab bar, where the menu hung to y=864 across a bar at y≈843. */
    await trigger.evaluate((node, navTop) => {
      let scroller: HTMLElement | null = node.parentElement;
      while (scroller && !(/(auto|scroll)/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight + 1)) {
        scroller = scroller.parentElement;
      }
      const target = scroller ?? document.scrollingElement!;
      target.scrollTop += node.getBoundingClientRect().bottom - (navTop - 40);
    }, nav.y);
    const parked = await box(trigger);
    expect(nav.y - (parked.y + parked.height), 'could not park the kebab near the tab bar').toBeLessThan(120);
    await trigger.click();
    const menu = page.getByTestId('do-next-row-menu-popover');
    await expect(menu).toHaveAttribute('data-placement', 'above');
    await expect(menu).toHaveCSS('opacity', '1');
    const rect = await box(menu);
    expect(rect.y + rect.height, 'the menu ran under the tab bar').toBeLessThanOrEqual(nav.y);
    const covered = await menu.evaluate((node) => {
      const r = node.getBoundingClientRect();
      return [[r.left + 4, r.bottom - 4], [r.right - 4, r.bottom - 4]]
        .map(([x, y]) => document.elementFromPoint(x, y))
        .filter((hit) => !hit || !node.contains(hit)).length;
    });
    expect(covered, 'a lower corner of the menu is covered').toBe(0);
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  });

  test('below xl the evidence rail brings its panel on screen', async ({ page }) => {
    await installHarnessRuntime(page);
    await mountHarnessVault(page);
    for (const [width, height] of [[900, 900], [1040, 720]] as const) {
      await page.setViewportSize({ width, height });
      await page.goto('/ko/architecture/?view=architecture&guides=off');
      const rail = page.getByTestId('architecture-evidence-rail');
      await expect(rail).toBeVisible({ timeout: 30_000 });
      await rail.click();
      await expect(rail).toHaveAttribute('aria-expanded', 'true');
      const close = page.getByTestId('architecture-evidence-close');
      /* Before: the panel opened at y=892..1218 in a 900px window and nothing moved. */
      await expect
        .poll(async () => {
          const rect = await close.boundingBox();
          return rect ? rect.y >= 0 && rect.y + rect.height <= height : false;
        }, { message: `${width}×${height}: the evidence close stayed off-screen` })
        .toBe(true);
      await expect
        .poll(() => close.evaluate((node) => {
          const r = node.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !!hit && node.contains(hit);
        }))
        .toBe(true);
    }
  });
});
