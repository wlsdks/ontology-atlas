import { expect, test } from "@playwright/test";
import { waitForFiniteAnimations } from '../visual-ready';

import {
  HARNESS_SOURCE_ROOT,
  installHarnessRuntime,
  installProfilelessHarnessRuntime,
  mountHarnessVault,
} from "../harness-tab-fixture";

const AXE_PATH = require.resolve('axe-core/axe.min.js');
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const MIN_AXE_RULES_PASSED = 15;

async function auditGuidanceSurface(page: import('@playwright/test').Page, testId: string, role: 'dialog') {
  const surface = page.getByTestId(testId);
  await expect(surface).toBeVisible();
  await expect(surface).toHaveRole(role);
  await waitForFiniteAnimations(page);
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ path: AXE_PATH });
  const result = await page.evaluate(async (tags) => {
    type Run = { violations: Array<{ id: string; nodes: unknown[] }>; passes: unknown[] };
    const run = await (window as unknown as { axe: { run: (context: Document, options: unknown) => Promise<Run> } }).axe.run(document, {
      runOnly: { type: 'tag', values: tags },
      resultTypes: ['violations', 'passes'],
    });
    return { rulesPassed: run.passes.length, violations: run.violations.map((violation) => ({ id: violation.id, count: violation.nodes.length })) };
  }, WCAG_TAGS);
  expect(result.rulesPassed, `${testId} axe collection was empty`).toBeGreaterThanOrEqual(MIN_AXE_RULES_PASSED);
  expect(result.violations, `${testId} introduced WCAG violations`).toEqual([]);
}

/**
 * **The Harness tab, read on a repository that actually has a harness.**
 *
 * The fixture's source tree carries the four shapes this view exists to expose: a nested
 * `AGENTS.md` that Codex merges and Claude Code never auto-loads, a declared skill pair whose two
 * copies differ, a hook script the config names and the disk does not have, and a Codex hook config
 * that repeats one script across three matchers. Each assertion below is about one of those.
 */
test.describe("harness tab", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await installHarnessRuntime(page);
  });

  test('Guidance connection paths attach controls to the domain heading at both ends', async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto('/en/ontology/insights/?tab=harness&guides=off');
    const overview = page.getByTestId('harness-coverage-overview');
    await expect(overview).toBeVisible();
    const gaps = await overview.locator('[data-testid^="harness-domain-"]').evaluateAll((domains) => domains.flatMap((domain) => {
      const heading = domain.querySelector<HTMLElement>('[data-domain-heading]')!.getBoundingClientRect();
      const textRects: DOMRect[] = [];
      const walker = document.createTreeWalker(domain, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        // Only painted lines: a clamped purpose keeps rects for the lines it hides below its box.
        const box = node.parentElement!.getBoundingClientRect();
        textRects.push(...[...range.getClientRects()].filter((rect) => rect.top < box.bottom - 0.5));
      }
      return [...domain.querySelectorAll<SVGPathElement>('[data-role-connection]')].map((connection) => {
        const role = domain.querySelector<HTMLElement>(`[data-role="${connection.dataset.roleConnection}"]`)!;
        const roleRect = role.getBoundingClientRect();
        const matrix = connection.getScreenCTM()!;
        const point = (length: number) => {
          const local = connection.getPointAtLength(length);
          return new DOMPoint(local.x, local.y).matrixTransform(matrix);
        };
        const start = point(0);
        const end = point(connection.getTotalLength());
        const told = connection.dataset.roleConnection === 'told';
        const headingPoint = told ? end : start;
        const controlPoint = told ? start : end;
        const intersectsText = Array.from({ length: 25 }, (_, index) => point(connection.getTotalLength() * index / 24)).some((sample) =>
          textRects.some((rect) => sample.x > rect.left && sample.x < rect.right && sample.y > rect.top && sample.y < rect.bottom));
        return {
          role: connection.dataset.roleConnection,
          headingCenterDrift: Math.abs(headingPoint.x - (heading.left + heading.right) / 2),
          headingBoundaryDrift: Math.abs(headingPoint.y - (told ? heading.top : heading.bottom)),
          controlCenterDrift: Math.abs(controlPoint.x - (roleRect.left + roleRect.right) / 2),
          controlBoundaryDrift: Math.abs(controlPoint.y - (told ? roleRect.bottom : roleRect.top)),
          intersectsText,
        };
      });
    }));
    console.info('GUIDANCE_CONNECTION_ATTACHMENT', JSON.stringify(gaps));
    expect(gaps.every((gap) => gap.headingCenterDrift <= 1 && gap.headingBoundaryDrift <= 1 && gap.controlCenterDrift <= 1 && gap.controlBoundaryDrift <= 1 && !gap.intersectsText), JSON.stringify(gaps)).toBe(true);
  });

  test('Guidance anchored evidence closes when its field anchor leaves view without stealing outside focus', async ({ page }) => {
    await mountHarnessVault(page);
    await page.setViewportSize({ width: 1040, height: 720 });
    await page.goto('/en/ontology/insights/?tab=harness&guides=off');
    const overview = page.getByTestId('harness-coverage-overview');
    await expect(overview).toBeVisible();
    const field = overview.locator('[data-domain-count]');
    const trigger = overview.locator('[data-role][data-state="filled"]').first();
    await trigger.click();
    const popup = page.getByTestId('harness-role-popup');
    await expect(popup).toBeVisible();
    const safePopupTop = await popup.evaluate((element) => element.getBoundingClientRect().top);
    expect(safePopupTop).toBeGreaterThanOrEqual(0);

    const evidenceBody = popup.getByTestId('harness-role-evidence').locator(':scope > div').last();
    await evidenceBody.evaluate((element) => { element.scrollTop = Math.min(8, element.scrollHeight - element.clientHeight); });
    await expect(popup).toBeVisible();
    await expect(popup).not.toHaveAttribute('inert');

    await field.evaluate((element) => { element.scrollTop += 4; });
    await expect(popup).toBeVisible();
    await expect(popup).not.toHaveAttribute('inert');

    const outside = page.getByTestId('insights-core-harness');
    await outside.focus();
    const pageScrollBefore = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
    await field.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(popup).toHaveAttribute('inert');
    expect(await popup.evaluate((element) => element.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
    await expect(popup).toHaveCount(0);
    await expect(outside).toBeFocused();
    expect(await field.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(pageScrollBefore);

    await field.evaluate((element) => { element.scrollTop = 0; });
    await trigger.click();
    await expect(popup).toBeFocused();
    await field.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(popup).toHaveCount(0);
    await expect(field).toBeFocused();
  });

  test('Guidance expansions keep full source identity and distinct labels across domain, separate, and outside presenters', async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto('/en/ontology/insights/?tab=harness&guides=off');
    const overview = page.getByTestId('harness-coverage-overview');
    await expect(overview).toBeVisible();
    const assertExpandedIdentity = async (row: import('@playwright/test').Locator) => {
      const sourceId = await row.getAttribute('data-evidence-source');
      const button = row.getByRole('button');
      await button.click();
      const detail = page.locator(`#${await button.getAttribute('aria-controls')}`);
      await expect(detail).toHaveAttribute('data-state', 'open');
      await expect(detail.getByText(sourceId!, { exact: true })).toBeVisible();
      const identity = await detail.evaluate((element) => ({ text: element.textContent, fits: element.scrollWidth <= element.clientWidth + 1 || getComputedStyle(element).overflowWrap === 'anywhere' }));
      expect(identity.text).toContain(sourceId);
      expect(identity.fits).toBe(true);
      expect(identity.text).toMatch(/Source label/);
      return sourceId;
    };

    await overview.locator('[data-role="told"][data-state="filled"]').first().click();
    const domainId = await assertExpandedIdentity(page.locator('[data-evidence-kind="scoped"]').first());
    await page.getByTestId('harness-role-popup').getByRole('button', { name: 'Close' }).click();
    await expect(page.getByTestId('harness-role-popup')).toHaveCount(0);

    await page.locator('[data-guidance-evidence-action="separate:gated"]').click();
    const separateId = await assertExpandedIdentity(page.locator('[data-evidence-kind="global"]').first());
    await page.getByTestId('harness-role-popup').getByRole('button', { name: 'Close' }).click();
    await expect(page.getByTestId('harness-role-popup')).toHaveCount(0);

    await page.locator('[data-guidance-evidence-action="outside"]').click();
    const outsideRows = page.locator('[data-evidence-kind="outside"]');
    expect(await outsideRows.count(), 'fixture must expose an actual outside declaration').toBeGreaterThan(0);
    const outsideId = await assertExpandedIdentity(outsideRows.first());
    expect(new Set([domainId, separateId, outsideId]).size).toBe(3);
  });

  test('Guidance desktop Role body scrolls from the genuine keyboard stop', async ({ page }) => {
    await mountHarnessVault(page);
    await page.setViewportSize({ width: 1040, height: 720 });
    await page.goto('/en/ontology/insights/?tab=harness&guides=off');
    const trigger = page.locator('[data-role="told"][data-state="filled"]').first();
    await trigger.focus();
    await page.keyboard.press('Enter');
    const popup = page.getByTestId('harness-role-popup');
    await expect(popup).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(popup.getByRole('button', { name: 'Close' })).toBeFocused();
    await page.keyboard.press('Tab');
    const body = page.getByTestId('harness-role-scroll-body');
    await expect(body).toBeFocused();
    expect(await body.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0);
    await page.keyboard.press('PageDown');
    await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("the destination name and one-line description speak of the harness", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("하네스");
    // Exactly one page headline: the identity travels into the blueprint's own header.
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    /*
     * The explainer stands on the document views; in the blueprint the line under the title already names
     * the profile, and 20px there would make the ladder hide the seventh row.
     */
    await page.locator("#harness-tab-guides").click();
    await expect(
      page.getByText("에이전트가 이 저장소에서 어떻게 일하도록 되어 있는지"),
    ).toBeVisible();
    // The rail label moved with the tab; the route did not.
    await expect(page.getByTestId("app-nav-rail")).toContainText("하네스");
    expect(new URL(page.url()).pathname).toBe("/ko/architecture/");
  });

  test('Analysis guidance evidence is one portalled anchored dialog', async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto('/ko/ontology/insights/?tab=harness&guides=off');
    const overview = page.getByTestId('harness-coverage-overview');
    await expect(overview).toBeVisible();
    const trigger = overview.locator('[data-role]').first();
    await trigger.focus();
    await trigger.click();
    const popup = page.getByTestId('harness-role-popup');
    await expect(popup).toBeVisible();
    await expect(popup).toBeFocused();
    expect(await popup.evaluate((node) => ({
      parent: node.parentElement === document.body,
      insideOverview: !!node.closest('[data-testid="harness-coverage-overview"]'),
      kind: node.getAttribute('data-transient-surface'),
      modal: node.getAttribute('aria-modal'),
    }))).toEqual({ parent: true, insideOverview: false, kind: 'anchored', modal: 'false' });
    const globalExplanation = popup.getByTestId('harness-global-evidence-explanation');
    const globalAction = popup.getByTestId('harness-global-evidence-toggle');
    expect(await globalExplanation.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    expect(await globalAction.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const text = range.getBoundingClientRect();
      const control = element.getBoundingClientRect();
      return text.left >= control.left - 1 && text.right <= control.right + 1 && text.top >= control.top - 1 && text.bottom <= control.bottom + 1;
    })).toBe(true);
    await auditGuidanceSurface(page, 'harness-role-popup', 'dialog');
    await page.keyboard.press('Escape');
    await expect(popup).toHaveAttribute('inert');
    await expect(popup).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('Brief restores its normal scrolling contract after measured Guidance', async ({ page }) => {
    await mountHarnessVault(page);
    await page.setViewportSize({ width: 1040, height: 480 });
    await page.goto('/en/ontology/insights/?tab=brief&guides=off');
    await expect(page.getByTestId('brief-tab')).toBeVisible();
    const main = page.locator('main[data-insights-surface="relationship-analysis"]');
    await expect(page.getByTestId('brief-headline')).toHaveAttribute('data-brief-headline-state', 'settled');
    const briefBefore = await main.evaluate((element) => ({ overflowY: getComputedStyle(element).overflowY }));
    expect(briefBefore.overflowY).toBe('auto');
    expect(await main.evaluate(element => element.scrollHeight)).toBeGreaterThan(await main.evaluate(element => element.clientHeight));

    await page.getByTestId('insights-core-harness').click();
    await expect(page.getByTestId('harness-coverage-overview')).toBeVisible();
    await waitForFiniteAnimations(page);
    expect(await main.evaluate(element => getComputedStyle(element).overflowY)).toBe('hidden');

    await page.getByTestId('insights-core-brief').click();
    await expect(page.getByTestId('brief-tab')).toBeVisible();
    await waitForFiniteAnimations(page);
    const briefAfter = await main.evaluate((element) => ({ overflowY: getComputedStyle(element).overflowY }));
    expect(briefAfter).toEqual(briefBefore);
    console.info('GUIDANCE_BRIEF_SCROLL_RESTORE', JSON.stringify({ briefBefore, briefAfter }));
  });

  test("the default view is At a glance, the tabs write the view, and a reload keeps it", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/");
    await expect(page.getByTestId("harness-overview")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#harness-tab-overview")).toHaveAttribute("aria-selected", "true");

    await page.locator("#harness-tab-guides").click();
    await expect(page).toHaveURL(/\?view=guides$/);
    await expect(page.getByTestId("harness-guides")).toBeVisible();

    /*
     * The address is rewritten in place, not pushed: switching view inside one destination is not a
     * place a person navigated to, and pushing would make Back walk the tabs instead of leaving.
     */
    await page.reload();
    await expect(page.getByTestId("harness-guides")).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\?view=guides$/);

    await page.locator("#harness-tab-overview").click();
    await expect(page.getByTestId("harness-overview")).toBeVisible();
    expect(new URL(page.url()).search).toBe("");
  });

  test('reduced motion keeps the panel an opacity fade without travel, and a swap on the short fade', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mountHarnessVault(page);
    await page.goto('/ko/architecture/?view=overview&guides=off');
    const front = page.locator('[data-harness-area="domains/shop-front"]');
    await front.locator('[data-harness-cell="told"]').click();
    const surface = page.locator('aside[data-surface-state]');
    await expect(surface).toBeVisible();
    const entering = await surface.evaluate((element) => {
      const style = getComputedStyle(element);
      return { name: style.animationName, transform: style.transform };
    });
    expect(entering.name).toContain('panelCrossfadeIn');
    expect(entering.transform).toBe('none');

    await waitForFiniteAnimations(page);
    /* Pressed inside the page so the read lands in the frame the swap exists, which lasts about 120ms. */
    const swap = await page.evaluate(async () => {
      const next = document.querySelector<HTMLElement>(
        '[data-harness-area="domains/shop-front"] [data-harness-cell="gated"]',
      )!;
      next.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const incoming = document.querySelector<HTMLElement>('[data-testid="harness-overview-panel"] .motion-swap-in');
      return incoming ? { duration: getComputedStyle(incoming).animationDuration } : null;
    });
    expect(swap).toEqual({ duration: '0.12s' });
  });

  test("the retired addresses go to At a glance, keeping the rest of the address", async ({ page }) => {
    await mountHarnessVault(page);
    for (const retired of ["sensors", "structure", "coverage"]) {
      await page.goto(`/ko/architecture/?view=${retired}&guides=off`);
      await expect(page.getByTestId("harness-overview")).toBeVisible({ timeout: 30_000 });
      await expect(page).toHaveURL(/\?view=overview&guides=off$/);
    }

    /* `?focus=main` names no view, so it opens the destination's own arrival screen. */
    await page.goto("/ko/architecture/?focus=main");
    await expect(page.getByTestId("harness-overview")).toBeVisible({ timeout: 30_000 });

    /* A blueprint deep link keeps working with no `?view=` on it: `?role=` and `?stage=` exist on
       no other view, so an address carrying one names the blueprint by itself. */
    await page.goto("/ko/architecture/?role=widgets");
    await expect(page.getByTestId("architecture-flow-panel")).toBeVisible({ timeout: 30_000 });
  });

  test("the explanation bubble is not covered by the body below it", async ({ page }) => {
    /*
     * Measures what the eye lands on with `elementFromPoint` over the panel's text: a panel inside the
     * window can still be occluded by the next sibling.
     */
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=guides");
    await expect(page.getByTestId("harness-guides")).toBeVisible({ timeout: 30_000 });

    const hint = page.getByRole("button", { name: "검사를 세는 방법" });
    await hint.focus();
    const panelId = (await hint.getAttribute("aria-describedby"))!;
    const panel = page.locator(`#${panelId.replace(/:/g, "\\:")}`);
    await expect(panel).toBeVisible();

    /* Nine probes down the panel's own column, because the overlap was partial: the first lines
       cleared the heading and the ones below did not. One point in the middle is a coin toss. */
    const covered = await page.evaluate((id) => {
      const el = document.getElementById(id)!;
      const box = el.getBoundingClientRect();
      const hits: string[] = [];
      /*
       * `InfoHint` lets the pointer through when shown by focus; paint order is the question,
       * so the probe makes the panel hit-testable during the reading.
       */
      const previous = el.style.pointerEvents;
      el.style.pointerEvents = "auto";
      for (let i = 1; i <= 9; i += 1) {
        const y = box.top + (box.height * i) / 10;
        const at = document.elementFromPoint(box.left + box.width / 2, y);
        if (!at || !el.contains(at)) {
          hits.push(`${i}/10 → ${at ? `${at.tagName}.${at.className}`.slice(0, 60) : "null"}`);
        }
      }
      el.style.pointerEvents = previous;
      return hits;
    }, panelId);
    expect(covered, `the explanation bubble was covered by the body below: ${covered.join(" | ")}`).toEqual([]);
  });

  test("the gap line counts the amber cells, and a missing hook script is named under the table", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=overview&guides=off");
    const overview = page.getByTestId("harness-overview");
    await expect(overview).toBeVisible({ timeout: 30_000 });

    const gapCells = await page.locator('[data-harness-cell-state="gap"]').count();
    expect(gapCells).toBeGreaterThan(0);
    await expect(page.getByTestId("harness-overview-gaps")).toHaveAttribute("data-gap-count", String(gapCells));
    await expect(page.getByTestId("harness-overview-silent")).toContainText("block-npm-publish");

    /* A row says what its domain is for in one truncated line, with the whole sentence in `title`; no score, grade or percentage exists. */
    const purpose = page.locator('[data-harness-area="domains/shop-front"] [role="rowheader"] [title]');
    await expect(purpose).toHaveAttribute("title", /What a shopper touches/);
    expect(await overview.textContent()).not.toMatch(/%|점수|등급|성숙도/);
  });

  test("a pressed cell opens its files beside the table, and Escape gives the focus back", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=overview&guides=off");
    await expect(page.getByTestId("harness-overview-table")).toBeVisible({ timeout: 30_000 });

    const cell = page.locator('[data-harness-area="domains/shop-front"] [data-harness-cell="told"]');
    await cell.click();
    const panel = page.getByTestId("harness-overview-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-panel-placement", "beside");
    await expect(panel).toHaveAttribute("data-panel-cell", "domains/shop-front|told");
    await waitForFiniteAnimations(page);

    const tableBox = (await page.getByTestId("harness-overview-table").boundingBox())!;
    const panelBox = (await panel.boundingBox())!;
    expect(panelBox.x).toBeGreaterThanOrEqual(tableBox.x + tableBox.width);

    if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ path: AXE_PATH });
    const audit = await page.evaluate(async (tags) => {
      type Run = { violations: Array<{ id: string; nodes: unknown[] }>; passes: unknown[] };
      const run = await (window as unknown as { axe: { run: (context: Document, options: unknown) => Promise<Run> } }).axe.run(document, {
        runOnly: { type: "tag", values: tags },
        resultTypes: ["violations", "passes"],
      });
      return { rulesPassed: run.passes.length, violations: run.violations.map((violation) => ({ id: violation.id, count: violation.nodes.length })) };
    }, WCAG_TAGS);
    expect(audit.rulesPassed, "overview axe collection was empty").toBeGreaterThanOrEqual(MIN_AXE_RULES_PASSED);
    expect(audit.violations, "the open overview panel introduced WCAG violations").toEqual([]);

    await expect(panel).toContainText("What a shopper touches");
    const rule = panel.locator('[data-entry-id=".claude/rules/cart.md"]');
    await expect(rule).toContainText("src/features/**");
    await expect(rule).toContainText("Claude Code");

    await page.keyboard.press("Escape");
    await expect(cell).toBeFocused();
    /* The panel never leaves a void: closed, it invites a pick instead of going blank. */
    await expect(panel).toHaveAttribute("data-panel-cell", "");
    await expect(panel.getByTestId("harness-overview-panel-empty")).toBeVisible();

    /* The focus never left the cell, so the key that opened it opens it again at once. */
    await page.keyboard.press("Enter");
    await expect(panel).toHaveAttribute("data-panel-cell", "domains/shop-front|told");
  });

  test("on arrival the first gap's panel is already open beside the table, and Tab moves between cell and panel", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=overview&guides=off");
    await expect(page.getByTestId("harness-overview-table")).toBeVisible({ timeout: 30_000 });

    const gap = page.locator('[data-harness-cell-state="gap"]').first();
    const expected = await gap.evaluate((cell) => {
      const row = cell.closest('[role="row"]')!.getAttribute("data-harness-area");
      return `${row}|${cell.getAttribute("data-harness-cell")}`;
    });
    const panel = page.getByTestId("harness-overview-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-panel-cell", expected);
    await expect(gap).toHaveAttribute("aria-expanded", "true");
    expect(await panel.evaluate((element) => element.contains(document.activeElement))).toBe(false);

    await gap.focus();
    const aside = page.locator("aside[data-surface-state]");
    await page.keyboard.press("Tab");
    await expect(aside).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(gap).toBeFocused();
  });

  test("a hook only Codex runs after trust wears the trust mark in the every-domain row", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=overview&guides=off");
    await expect(page.getByTestId("harness-overview-table")).toBeVisible({ timeout: 30_000 });

    await page.locator('[data-harness-area="#everywhere"] [data-harness-cell="gated"]').click();
    const panel = page.getByTestId("harness-overview-panel");
    const hook = panel.locator('[data-entry-id=".codex/hooks/block-unsafe-git.sh"]');
    await expect(hook).toBeVisible();
    await expect(hook.getByTestId("harness-overview-trust")).toBeVisible();
    await expect(panel.locator('[data-entry-id=".claude/hooks/block-unsafe-git.sh"]').getByTestId("harness-overview-trust")).toHaveCount(0);
  });

  test("below 1280px the panel follows the row it belongs to", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=overview&guides=off");
    await expect(page.getByTestId("harness-overview-table")).toBeVisible({ timeout: 30_000 });

    const row = page.locator('[data-harness-area="domains/shop-front"]');
    await row.locator('[data-harness-cell="told"]').click();
    const panel = page.getByTestId("harness-overview-panel");
    await expect(panel).toHaveAttribute("data-panel-placement", "below");
    await waitForFiniteAnimations(page);

    /* One in-page read, so a scroll still settling cannot skew the three boxes against each other. */
    await expect
      .poll(() =>
        page.evaluate(() => {
          const rowEl = document.querySelector('[data-harness-area="domains/shop-front"]')!;
          const rowBox = rowEl.getBoundingClientRect();
          const panelBox = document.querySelector('[data-testid="harness-overview-panel"]')!.getBoundingClientRect();
          const nextBox = rowEl.nextElementSibling!.nextElementSibling!.getBoundingClientRect();
          return panelBox.top >= rowBox.bottom - 1 && panelBox.bottom <= nextBox.top + 1;
        }),
      )
      .toBe(true);
  });

  test("below 1280px the opened row stays in view under the sticky head with its panel right after it", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=overview&guides=off");
    await expect(page.getByTestId("harness-overview-table")).toBeVisible({ timeout: 30_000 });

    const row = page.locator('[role="row"][data-harness-area]').first();
    await row.locator('[data-harness-cell="watched"]').click();
    await expect(page.getByTestId("harness-overview-panel")).toHaveAttribute("data-panel-placement", "below");
    await waitForFiniteAnimations(page);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const rowEl = document.querySelector('[role="row"][data-harness-area]')!;
          const headBottom = document.querySelector("[data-harness-head]")!.getBoundingClientRect().bottom;
          const rowBox = rowEl.getBoundingClientRect();
          const panelBox = document.querySelector('[data-testid="harness-overview-panel"]')!.getBoundingClientRect();
          return rowBox.top >= headBottom - 1 && rowBox.bottom <= panelBox.top + 1;
        }),
      )
      .toBe(true);
  });

  test("the counting method lives in a collapsed spot, not in a sentence", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=overview");
    await expect(page.getByTestId("harness-overview")).toBeVisible({ timeout: 30_000 });
    const rule = page.getByText("어떤 파일이 선언한 경로가", { exact: false });
    await expect(rule).toBeHidden();
    await page.getByTestId("harness-overview-provenance").click();
    await expect(rule).toBeVisible();
  });

  test("the detail names which tools read a guide file, and cites each claim", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=guides");
    await expect(page.getByTestId("harness-guides")).toBeVisible({ timeout: 30_000 });

    // The walker question: which file does Codex read that Claude Code does not?
    const nested = page.getByTestId("harness-guide-row-nested-agents-md");
    const detail = page.getByTestId("harness-guide-detail");
    await expect(nested).not.toContainText("Codex");
    await nested.locator("[data-guide-item]").click();
    await expect(nested.locator("[data-guide-item]")).toHaveAttribute("aria-pressed", "true");
    await expect(detail).toContainText("Codex");
    await expect(detail).not.toContainText("Claude Code");

    // Every tool claim carries the document it came from.
    await expect(detail.getByRole("link", { name: /출처/ }).first()).toHaveAttribute("href", /^https:\/\//);
    await expect(page.getByText(`읽은 곳 ${HARNESS_SOURCE_ROOT}`)).toBeVisible();

    await page.getByTestId("harness-guide-row-claude-md").locator("[data-guide-item]").click();
    await expect(detail).toContainText("Claude Code");
  });

  test("counts mismatched pairs, and opens on the first difference with both files side by side", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=guides");
    const drift = page.getByTestId("harness-drift");
    await expect(drift).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("harness-guide-row-claude-skills")).toContainText("내용 차이 1");
    await expect(page.getByTestId("harness-guides")).toContainText("참고용 2쌍 비교");

    const diff = page.getByTestId("harness-drift-diff");
    await expect(diff).toBeVisible();
    await expect(diff).toContainText(".claude/skills/po-pass/SKILL.md");
    await expect(diff).toContainText(".agents/skills/po-pass/SKILL.md");
    await expect(diff.locator('[data-harness-drift-line="only-here"]')).toHaveText(["Diverged line."]);
  });

  test("the guides workbench fits 1512x900 without a page scroll and keeps focus in the list on a swap", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=guides");
    await expect(page.getByTestId("harness-drift")).toBeVisible({ timeout: 30_000 });
    const panel = page.locator('[role="tabpanel"]');
    const overflow = await panel.evaluate((node) => node.scrollHeight - node.clientHeight);
    expect(overflow, "the tab panel scrolls although both panes scroll on their own").toBeLessThanOrEqual(0);

    const rules = page.getByTestId("harness-guide-row-claude-rules").locator("[data-guide-item]");
    await rules.click();
    await page.keyboard.press("ArrowDown");
    const skills = page.getByTestId("harness-guide-row-claude-skills").locator("[data-guide-item]").first();
    await expect(skills).toBeFocused();
    await expect(skills).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("harness-guide-detail")).toContainText(".claude/skills/");
    await expect(page.getByTestId("harness-guide-detail-pane").locator("[inert]")).toHaveCount(0);
    await expect(skills).toBeFocused();
  });

  test("hooks distinguish connected from absent, and Codex gets needs-approval instead of green", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=guides");
    await expect(page.getByTestId("harness-guides")).toBeVisible({ timeout: 30_000 });
    const claudeRow = page.getByRole("button", { name: /\.claude\/settings\.json/ });
    await expect(claudeRow).toContainText("스크립트 없음");
    await expect(claudeRow).not.toContainText("연결됨");
    await expect(page.getByRole("button", { name: /\.codex\/hooks\.json/ })).not.toContainText("연결됨");
    await claudeRow.click();

    // The script on disk is wired; the one only the config knows about is missing, and a missing
    // guard produces no error at all — which is exactly why it has to be on the screen.
    await expect(page.locator('[data-harness-hook-status="wired"]').first()).toBeVisible();
    await expect(page.locator('[data-harness-hook-status="missing"]').first()).toBeVisible();

    await expect(page.getByTestId("harness-hook-approval-gate")).toContainText(
      "도구 안에서 승인 필요",
    );
  });

  test("the sentence states only the two measured numbers", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=guides");
    const sentence = page.getByTestId("harness-sentence");
    await expect(sentence).toBeVisible({ timeout: 30_000 });
    await expect(sentence).toContainText("문서");
    await expect(sentence).toContainText("검사");
    /* ⚠️ The fixture holds two exclusion files (`.cursorignore`, `.geminiignore`), and this number
       must not move for them: a file that says what an agent may not see is the opposite of a
       document the repository speaks through. The outside-mapping fixture adds one valid Claude
       guide; the exact total is eleven. The overview proves the rows; this proves the
       census the exclusions are kept out of. */
    await expect(sentence).toContainText("문서 11개");
    /* The two numbers here are file counts. The coverage claim has its own denominator and its own
       kind of statement, so it is not folded in beside them. */
    await expect(sentence.locator("p").first()).not.toContainText("영역");
  });

  test("the way to other views never disappears on any screen", async ({ page }) => {
    /* The tab set must not be a property of the panel it switches; the empty blueprint returns early. */
    await page.setViewportSize({ width: 1512, height: 949 });
    await installProfilelessHarnessRuntime(page);
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=architecture");
    await expect(page.getByRole("tablist")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("tab")).toHaveCount(3);
    // And the tab the open panel names actually exists, so `aria-labelledby` does not dangle.
    const labelledBy = await page
      .locator('[role="tabpanel"]')
      .first()
      .getAttribute("aria-labelledby");
    await expect(page.locator(`#${labelledBy}`)).toHaveCount(1);

    await page.getByRole("tab", { name: "지침" }).click();
    await expect(page.getByTestId("harness-guides")).toBeVisible({ timeout: 30_000 });
  });

  test("with no profile, the architecture preview draws the connected source's own folders", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await installProfilelessHarnessRuntime(page);
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=architecture");
    const preview = page.getByTestId("architecture-draft-preview");
    await expect(preview).toHaveAttribute("data-preview-source", "connected");
    await expect(page.getByTestId("architecture-draft-preview-label")).toContainText("storefront");
    for (const folder of ["api", "docs", "scripts", "src"]) {
      await expect(preview.getByText(folder, { exact: true })).toBeVisible();
    }
  });

  test("under reduced motion the architecture preview is one still, finished picture", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1512, height: 949 });
    await installProfilelessHarnessRuntime(page);
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=architecture");
    const preview = page.getByTestId("architecture-draft-preview");
    await expect(preview).toHaveAttribute("data-preview-state", "still");
    expect(await preview.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0);
    await expect(preview.getByTestId("architecture-draft-preview-violation")).toBeVisible();
  });

  test("focus stays on the tab when the view is moved by keyboard", async ({ page }) => {
    /*
     * One `TabBar` instance, not one per branch: the two-instance build unmounted the focused tab
     * on activation and the browser reset focus to `<body>`, from where no key did anything.
     */
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=guides");
    await page.getByRole("tab", { name: "지침" }).focus();
    for (const key of ["ArrowRight", "ArrowRight", "Home", "End"]) {
      await page.keyboard.press(key);
      const state = await page.evaluate(() => ({
        role: document.activeElement?.getAttribute("role"),
        selected: document.activeElement?.getAttribute("aria-selected"),
      }));
      expect(state.role, `focus left the tab set after ${key}`).toBe("tab");
      expect(state.selected, `focus landed on an unselected tab after ${key}`).toBe("true");
    }
  });

  test('Guidance reduced-motion presenter preserves facts and focus', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1512, height: 949 }, reducedMotion: 'reduce' });
    const reducedPage = await context.newPage();
    try {
      await installHarnessRuntime(reducedPage);
      await mountHarnessVault(reducedPage);
      await reducedPage.goto('/en/ontology/insights/?tab=harness&guides=off');
      expect(await reducedPage.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
      const overview = reducedPage.getByTestId('harness-coverage-overview');
      await expect(overview).toBeVisible();
      const diagramFacts = await overview.locator('[data-testid^="harness-domain-"]').evaluateAll((domains) => domains.map((domain) => ({ name: domain.getAttribute('aria-label'), roles: [...domain.querySelectorAll<HTMLElement>('[data-role]')].map((role) => ({ role: role.dataset.role, count: role.textContent?.match(/\d+/)?.[0] })) })));
      const textMode = reducedPage.getByTestId('guidance-mode-text');
      await textMode.focus();
      await textMode.click();
      await expect(textMode).toBeFocused();
      const textRows = overview.locator('[data-testid^="harness-text-domain-"]');
      await expect(textRows).toHaveCount(8);
      expect(await textRows.evaluateAll((rows) => rows.map((row) => ({ name: row.querySelector('h3')?.textContent, roles: [...row.querySelectorAll<HTMLElement>('[data-role]')].map((role) => ({ role: role.dataset.role, count: role.textContent?.match(/\d+/)?.[0] })) })))).toEqual(diagramFacts);
      const trigger = textRows.first().locator('[data-role][data-state="filled"]').first();
      await trigger.click();
      const surface = reducedPage.getByTestId('harness-role-popup');
      await expect(surface).toBeVisible();
      await expect(reducedPage.getByTestId('harness-role-evidence')).toHaveAttribute('data-domain');
      const globalToggle = reducedPage.getByTestId('harness-global-evidence-toggle');
      await globalToggle.click();
      const firstGlobal = reducedPage.locator('[data-evidence-kind="global"]').first();
      if (await firstGlobal.count()) {
        await firstGlobal.getByRole('button').click();
        await expect(firstGlobal.locator('.ai-row-disclosure')).toHaveAttribute('data-state', 'open');
      }
      await reducedPage.setViewportSize({ width: 1040, height: 720 });
      const field = overview.locator('[data-domain-count]');
      // A condition wait: the field refits a frame after the resize, so a single read measures the old fit.
      await expect.poll(() => field.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0);
      await field.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      await expect(surface).toHaveCount(0);
      await expect(field).toBeFocused();
    } finally {
      await context.close();
    }
  });
});
