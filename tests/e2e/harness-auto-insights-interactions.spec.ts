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
