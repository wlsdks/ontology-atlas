import { expect, test } from "@playwright/test";
import { waitForFiniteAnimations } from './visual-ready';

import {
  HARNESS_SOURCE_ROOT,
  installHarnessRuntime,
  installProfilelessHarnessRuntime,
  mountHarnessVault,
} from "./harness-tab-fixture";

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
test.describe("하네스 탭", () => {
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

  test("목적지 이름과 한 줄 설명이 하네스를 말한다", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("하네스");
    // Exactly one page headline: the identity travels into the blueprint's own header.
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    /*
     * The explainer stands on the document views. In the blueprint the line directly under the
     * title already names the profile and what the view compares, and 20px there is a third of a
     * layer row — the difference between the ladder tightening its seven rows and hiding the
     * seventh (measured 2026-09-13).
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
    await page.setViewportSize({ width: 1040, height: 720 });
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
    const back = page.getByTestId('analysis-back-to-system');
    await back.scrollIntoViewIfNeeded();
    await expect(back).toBeInViewport({ ratio: 1 });
    expect(await back.evaluate(element => { const rect = element.getBoundingClientRect(); const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2); return element === hit || element.contains(hit); })).toBe(true);
    console.info('GUIDANCE_BRIEF_SCROLL_RESTORE', JSON.stringify({ briefBefore, briefAfter }));
  });

  test("기본 보기는 하네스 구조이고, 세그먼트가 보기를 주소에 적는다", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/");
    await expect(page.getByTestId("harness-anatomy")).toBeVisible({ timeout: 30_000 });

    await page.locator("#harness-tab-guides").click();
    await expect(page).toHaveURL(/\?view=guides$/);
    await page.locator("#harness-tab-coverage").click();
    await expect(page).toHaveURL(/\?view=coverage$/);
    await expect(page.getByTestId("harness-coverage")).toBeVisible();

    /*
     * The address is rewritten in place, not pushed — switching view inside one destination is not
     * a place a person navigated to, and pushing would make Back walk the segmented control instead
     * of leaving the screen (the grammar `/mcp` already uses for its tabs). What the URL owes is a
     * refresh and a shared link landing on the same view.
     */
    await page.reload();
    await expect(page.getByTestId("harness-coverage")).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\?view=coverage$/);
  });

  test('reduced motion keeps the selected evidence fade without travel', async ({page}) => {
    await page.emulateMedia({reducedMotion:'reduce'});
    await mountHarnessVault(page);
    await page.goto('/ko/architecture/?view=structure&guides=off');
    await page.getByTestId('harness-diagram-node-scoped').click();
    const evidence=page.getByTestId('harness-anatomy-slot-scoped');
    await expect(evidence).toBeVisible();
    const motion=await evidence.evaluate(el=>{
      const detail=el.closest('ul')!.parentElement!;
      const style=getComputedStyle(detail);
      return {name:style.animationName,duration:style.animationDuration,transform:style.transform};
    });
    expect(motion.name).toContain('detailFade');
    expect(motion.duration).toBe('0.12s');
    expect(motion.transform).toBe('none');
  });

  test("은퇴한 sensors 주소는 그 질문에 답하는 보기로 간다", async ({ page }) => {
    /*
     * The sensors view named this exact question — which checks cover each domain's paths, and
     * where nobody is watching — and said it was not built. It is built now, so that address opens
     * the answer. The shell-wide `?focus=main` that every left-rail link carries names no view, so
     * it opens the destination's own arrival screen — the harness structure, since 2026-09-19.
     */
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=sensors");
    await expect(page.getByTestId("harness-coverage")).toBeVisible({ timeout: 30_000 });

    await page.goto("/ko/architecture/?focus=main");
    await expect(page.getByTestId("harness-anatomy")).toBeVisible({ timeout: 30_000 });

    /* A blueprint deep link keeps working with no `?view=` on it: `?role=` and `?stage=` exist on
       no other view, so an address carrying one names the blueprint by itself. Every link written
       while the blueprint was the default would otherwise land on a screen with no roles. */
    await page.goto("/ko/architecture/?role=widgets");
    await expect(page.getByTestId("architecture-flow-panel")).toBeVisible({ timeout: 30_000 });
  });

  test("설명 말풍선은 그 아래 본문에 덮이지 않는다", async ({ page }) => {
    /*
     * ⚠️ **A panel that is on screen is not yet a panel that can be read.** The lead sentence's
     * `InfoHint` hangs out of `harness-sentence`, and the results block is the *next sibling*, so
     * every mark it draws — the guides heading, the file table, the matrix — painted on top of the
     * open panel and the two texts read as one smear (owner, 2026-09-14, installed app). The
     * panel's own `z-30` could never fix it: it orders the panel inside its own element, never
     * against the element that follows it.
     *
     * The geometry gate at 390 could not see this: a panel fully inside the window is exactly what
     * an occluded panel also is. So this measures **what a person's eye lands on** —
     * `elementFromPoint` over the panel's own text — which is the only question a tooltip has.
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
      /* A panel shown by focus lets the pointer through (`InfoHint`, 2026-09-25), and
         `elementFromPoint` skips what the pointer skips. Paint order is the question here,
         so the probe makes the panel hit-testable for the length of the reading. */
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
    expect(covered, `설명 말풍선이 아래 본문에 덮였다: ${covered.join(" | ")}`).toEqual([]);
  });

  test("구조 보기가 저장소가 알려주는 것·막는 것·지켜보는 것을 부속별로 세고, 도구가 가진 자리는 숫자로 세지 않는다", async ({ page }) => {
    /*
     * The tab is named Harness and its first screen used to be the product's layer ladder. The
     * owner named the mismatch on 2026-09-19: that ladder is architecture, which a harness
     * regulates, not a part of the harness. This is what took its place, and the assertions are
     * about the two readings it must never allow — a grade, and a zero where the answer is simply
     * not in the checkout.
     */
    /*
     * ⚠️ The console is part of this assertion. An `InfoHint` placed inside a `<p>` renders a
     * `div` in a paragraph, which React reports as a hydration error and the dev overlay counts
     * silently in the corner — the screen looked perfectly correct while doing it (2026-09-20).
     */
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await mountHarnessVault(page);
    await page.goto("/ko/architecture/");
    const anatomy = page.getByTestId("harness-anatomy");
    await expect(anatomy).toBeVisible({ timeout: 30_000 });

    // Same three words as the coverage matrix: one destination, one vocabulary.
    await expect(page.getByTestId("harness-anatomy-band-tells")).toContainText("말해둔 것");
    await expect(page.getByTestId("harness-anatomy-band-gates")).toContainText("막는 것");
    await expect(page.getByTestId("harness-anatomy-band-watches")).toContainText("지켜보는 것");

    await expect(page.getByTestId('harness-structure-diagram')).toBeVisible();
    await page.getByTestId('harness-diagram-node-always').click();
    await expect(page.getByTestId('harness-anatomy-slot-always')).toContainText('.claude/rules/forbidden.md');
    await page.getByTestId('harness-view-text').click();
    await expect(page.getByTestId('harness-structure-diagram')).toHaveCount(0);

    // A rule with no `paths:` is read every time; one with `paths:` joins only for its folder.
    await expect(page.getByTestId("harness-anatomy-slot-always")).toContainText(
      ".claude/rules/forbidden.md",
    );
    await expect(page.getByTestId("harness-anatomy-slot-scoped")).toContainText(
      ".claude/rules/cart.md",
    );
    // Nested AGENTS.md files attach by path, which is the whole reason they exist.
    await expect(page.getByTestId("harness-anatomy-slot-scoped")).toContainText("src/AGENTS.md");

    // A hook that can refuse is not the same fact as a hook that only records, and the fixture's
    // Claude and Codex copies of one guard are one name: the script's own.
    await expect(page.getByTestId("harness-anatomy-slot-toolGates")).toContainText(
      "block-unsafe-git.sh",
    );
    await expect(page.getByTestId("harness-anatomy-count-toolGates")).toHaveText("훅 1개");
    await expect(page.getByTestId("harness-anatomy-slot-permissions")).toContainText(
      "허용 1 · 물어봄 0 · 금지 2",
    );

    // The pipeline phase has its own row, so a repository guarded only by CI is not drawn as
    // having nothing watching it. This fixture has no workflows, which the row states.
    await expect(page.getByTestId("harness-anatomy-count-pipeline")).toHaveText("아직 없음");

    // An empty part is visible *and addable*: the conventional address, copyable, never advice.
    const emptyTools = page.getByTestId("harness-anatomy-slot-tools");
    await expect(emptyTools).toContainText("이런 것이 사는 자리");
    await expect(emptyTools).toContainText(".mcp.json");
    // And a part that is there is not told where it could have been.
    await expect(page.getByTestId("harness-anatomy-slot-always")).not.toContainText(
      "이런 것이 사는 자리",
    );

    // Nothing here is a mark out of ten, and an absent part says so in words.
    await expect(page.getByTestId("harness-anatomy-count-tools")).toHaveText("아직 없음");
    const loop = page.getByTestId("harness-anatomy-slot-loop");
    await expect(loop).toHaveAttribute("data-status", "tool-owned");
    await expect(loop).not.toContainText("아직 없음");
    await expect(anatomy).not.toContainText("%");

    // The half the rows cannot do: handing the reading to an agent without retyping it.
    await expect(page.getByTestId("harness-anatomy-brief")).toBeVisible();

    // The chain: a turn inside a governed folder pays the always-read set plus that folder's file,
    // which is the mechanic the tool documents and a flat per-repository number cannot express.
    await expect(page.getByTestId("harness-anatomy-slot-scoped")).toContainText("가장 깊은 사슬");

    // ⚠️ The fixture's config names `block-npm-publish.sh` and the disk does not have it. Every
    // count on this screen stays healthy while that guard is absent, so the absence is said out
    // loud — the one warning this view draws.
    await expect(page.getByTestId("harness-anatomy-silent")).toContainText("block-npm-publish.sh");

    // What the repository keeps out of sight is a gate, not a guide, and it keeps each product's
    // own file name.
    const blind = page.getByTestId("harness-anatomy-slot-blind");
    await expect(blind).toContainText(".cursorignore");
    await expect(blind).toContainText(".geminiignore");
    await expect(page.getByTestId("harness-anatomy-count-blind")).toHaveText("파일 2개");
    // And it is not counted among the documents the repository speaks through — read on the
    // coverage view, because the census sentence and these bands count by different rules and
    // this view does not print both.
    await expect(page.getByTestId("harness-sentence")).toHaveCount(0);

    // What every turn costs, beside the count that cannot say it.
    await expect(page.getByTestId("harness-anatomy-slot-always")).toContainText("매 턴 읽는 분량");

    expect(consoleErrors, "the structure view logged to the console").toEqual([]);

    // And the ladder is one press away, under its own name.
    await page.getByRole("tab", { name: "아키텍처" }).click();
    await expect(page.getByTestId("architecture-flow-panel")).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\?view=architecture$/);
  });

  test("커버리지 표가 영역마다 말해둔 것·막는 것·지켜보는 것을 말하고, 빈 칸은 문장으로 말한다", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=coverage");
    const matrix = page.getByTestId("harness-coverage");
    await expect(matrix).toBeVisible({ timeout: 30_000 });

    // Each column gets a card: the count of areas it has no answer for, over a denominator the
    // reader can see. This replaced a headline sentence that could only ever speak for Watched.
    const watchedCard = page.locator('[data-testid="harness-coverage-column-card"][data-census-row="watched"]');
    await expect(watchedCard).toContainText("어떤 검사도 부르지 않는 도메인");

    // ⚠️ The card's number is not a derived statistic — it is the count of empty marks in the
    // column below it, so a reader can settle it by counting. If the two ever disagree the screen
    // is worse than the undecodable bar this replaced, so the agreement is the assertion.
    const declaredGap = await watchedCard.locator("[data-harness-column-gap]").getAttribute("data-harness-column-gap");
    const emptyMarks = await page.locator('[data-harness-cell="watched"][data-harness-cell-empty="true"]').count();
    expect(Number(declaredGap)).toBe(emptyMarks);

    // The always-loaded lanes are counted on the card of the column they qualify and open beneath
    // it. As a separate section below the table they were three flat runs of monospace names — the
    // disease that had just been removed from the table — furthest from the cells they explain.
    await expect(page.getByTestId("harness-coverage-everywhere")).toHaveCount(0);
    await watchedCard.getByTestId("harness-everywhere-toggle").click();
    const everywhere = page.getByTestId("harness-coverage-everywhere");
    await expect(everywhere).toContainText("lint");

    // ⚠️ Nine of this repository's hook names exist in both .claude/hooks/ and .codex/hooks/ as
    // real mirrored files, and the first build printed the bare name twice — which reads as a
    // rendering fault rather than as the mirror it is. Each name appears once now, and the tools
    // that read it carry the distinction the repetition destroyed.
    const toldCard = page.locator('[data-testid="harness-coverage-column-card"][data-census-row="told"]');
    await toldCard.getByTestId("harness-everywhere-toggle").click();
    const told = page.getByTestId("harness-coverage-everywhere");
    await expect(told).toContainText("forbidden");
    expect((await told.textContent())!.match(/forbidden/g)!).toHaveLength(1);

    // Every row carries the vault's purpose sentence, which is the whole reason the rows are areas
    // rather than folders: without it an empty cell can only say "a file is absent".
    const front = page.locator('[data-harness-area="domains/shop-front"]');
    const api = page.locator('[data-harness-area="domains/shop-api"]');
    await expect(front).toContainText("What a shopper touches");
    await expect(api).toContainText("The order service every storefront screen reads");

    // The shop front is watched by a check that names its path; the API is watched by nothing, and
    // the gap is a mark rather than a sentence so it can be compared down the column at a glance.
    await expect(front.locator('[data-harness-cell="watched"]')).toHaveAttribute(
      "data-harness-cell-empty",
      "false",
    );
    await expect(api.locator('[data-harness-cell="watched"]')).toHaveAttribute(
      "data-harness-cell-empty",
      "true",
    );

    // The names are one press away, beside the cell — never a full-screen detail.
    await front.locator('[data-harness-cell="watched"]').click();
    await expect(page.getByTestId("harness-coverage-detail")).toContainText("test:cart");

    // The empty cell opens the vault's own record of what the area is for — the sentence a
    // file-only scanner cannot write — beside the paths nothing names.
    await api.locator('[data-harness-cell="watched"]').click();
    const detail = page.getByTestId("harness-coverage-detail");
    await expect(detail).toContainText("The order service every storefront screen reads");
    await expect(detail).toContainText("api/orders");

    // No score, no grade, no percentage: the thing every competitor ships and this may not.
    expect(await matrix.textContent()).not.toMatch(/%|점수|등급|성숙도/);
  });

  test("문서가 지침인지, 지침이 이름을 댄 것인지, 아무도 안 부르는 것인지 셋으로 나뉜다", async ({ page }) => {
    /*
     * The harness's most common silent failure: a document that exists and no guide points at. The
     * fixture source tree carries one of each under its own `docs/` folder — one that the fixture's
     * AGENTS.md names by path, and one that nothing names.
     */
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=coverage");
    const reach = page.getByTestId("harness-reach");
    await expect(reach).toBeVisible({ timeout: 30_000 });
    await expect(reach.locator('[data-census-row="guides"]')).toContainText("지침");
    await expect(reach.locator('[data-census-row="named"]')).toContainText("1");
    /* Three: the fixture's unnamed document, plus both agent briefs. A brief is addressed by name
       rather than by path, so it lands here for a reason that is fine — which is exactly why the
       folders are printed beside the count instead of the rows being filtered. */
    await expect(reach.locator('[data-census-row="unnamed"]')).toContainText("3");

    // The breakdown of where the unnamed documents are opens on a press. Spilled permanently, the
    // most important number on the screen was the one followed by the most text on the screen.
    await expect(page.getByTestId("harness-reach-breakdown")).toHaveCount(0);
    await page.getByTestId("harness-reach-breakdown-toggle").click();
    await expect(page.getByTestId("harness-reach-breakdown")).toContainText("docs");
  });

  test("세는 방법은 문장이 아니라 접힌 자리에 있다", async ({ page }) => {
    /*
     * Every honesty rule this page depends on used to stand at body size in the reading flow, where
     * the most carefully reasoned part of the screen was the heaviest to read. The claim is
     * unchanged; it costs nothing until a reader asks for it.
     */
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=coverage");
    await expect(page.getByTestId("harness-coverage")).toBeVisible({ timeout: 30_000 });
    const rule = page.getByText("어떤 파일이 선언한 경로가", { exact: false });
    await expect(rule).toBeHidden();
    await page.getByTestId("harness-coverage-provenance").click();
    await expect(rule).toBeVisible();
  });

  test("지침 표가 도구별로 어느 파일을 읽는지 보여준다", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=guides");
    const table = page.getByTestId("harness-guides");
    await expect(table).toBeVisible({ timeout: 30_000 });

    // The walker question: which file does Codex read that Claude Code does not?
    const nested = page.getByTestId("harness-guide-row-nested-agents-md");
    await expect(nested).toContainText("Codex");
    await expect(nested).not.toContainText("Claude Code");
    await expect(page.getByTestId("harness-guide-row-claude-md")).toContainText("Claude Code");

    // Every tool claim carries the document it came from.
    await expect(nested.getByRole("link", { name: /출처/ }).first()).toHaveAttribute(
      "href",
      /^https:\/\//,
    );
    await expect(page.getByText(`읽은 곳 ${HARNESS_SOURCE_ROOT}`)).toBeVisible();
  });

  test("어긋난 짝을 세고, 차이 보기가 두 파일을 나란히 연다", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=guides");
    const drift = page.getByTestId("harness-drift");
    await expect(drift).toBeVisible({ timeout: 30_000 });
    await expect(drift).toContainText("내용 차이");
    await expect(page.getByTestId("harness-guides")).toContainText("참고용 2쌍 비교");

    await drift.getByText("차이 보기").first().click();
    const diff = page.getByTestId("harness-drift-diff");
    await expect(diff).toBeVisible();
    await expect(diff).toContainText(".claude/skills/po-pass/SKILL.md");
    await expect(diff).toContainText(".agents/skills/po-pass/SKILL.md");
    await expect(diff).toContainText("Diverged line.");
  });

  test("훅은 연결됨과 없음을 구별하고, Codex 는 초록 대신 승인 필요를 단다", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=guides");
    await expect(page.getByTestId("harness-guides")).toBeVisible({ timeout: 30_000 });

    // The script on disk is wired; the one only the config knows about is missing, and a missing
    // guard produces no error at all — which is exactly why it has to be on the screen.
    await expect(page.locator('[data-harness-hook-status="wired"]').first()).toBeVisible();
    await expect(page.locator('[data-harness-hook-status="missing"]').first()).toBeVisible();

    await expect(page.getByTestId("harness-hook-approval-gate")).toContainText(
      "도구 안에서 승인 필요",
    );
  });

  test("문장은 잰 숫자 둘만 말한다", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=guides");
    const sentence = page.getByTestId("harness-sentence");
    await expect(sentence).toBeVisible({ timeout: 30_000 });
    await expect(sentence).toContainText("문서");
    await expect(sentence).toContainText("검사");
    /* ⚠️ The fixture holds two exclusion files (`.cursorignore`, `.geminiignore`), and this number
       must not move for them: a file that says what an agent may not see is the opposite of a
       document the repository speaks through. The outside-mapping fixture adds one valid Claude
       guide; the exact total is eleven. The structure view proves the rows; this proves the
       census the exclusions are kept out of. */
    await expect(sentence).toContainText("문서 11개");
    /* The two numbers here are file counts. The coverage claim has its own denominator and its own
       kind of statement, so it is not folded in beside them. */
    await expect(sentence.locator("p").first()).not.toContainText("영역");
  });

  test("다른 보기로 가는 길은 어떤 화면에서도 사라지지 않는다", async ({ page }) => {
    /*
     * The tab set must never be a property of the panel it switches. With no architecture profile
     * the blueprint returns its empty state early; a tab set rendered inside it vanished, and the
     * other two views had no path from the screen a person lands on (design-interaction, 2026-09-13).
     */
    await page.setViewportSize({ width: 1512, height: 949 });
    await installProfilelessHarnessRuntime(page);
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=architecture");
    await expect(page.getByRole("tablist")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("tab")).toHaveCount(4);
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

  test("키보드로 보기를 옮겨도 초점이 탭에 남는다", async ({ page }) => {
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
      expect(await textRows.evaluateAll((rows) => rows.map((row) => ({ name: row.querySelector('h4')?.textContent, roles: [...row.querySelectorAll<HTMLElement>('[data-role]')].map((role) => ({ role: role.dataset.role, count: role.textContent?.match(/\d+/)?.[0] })) })))).toEqual(diagramFacts);
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
      // A condition wait, not one read: the field refits to the new window a frame after the
      // resize, and the single read measured the old fit — red on every local run and green in
      // CI only on retry (2026-09-24), which `.claude/rules/testing.md` says is not a gate.
      await expect.poll(() => field.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0);
      await field.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      await expect(surface).toHaveCount(0);
      await expect(field).toBeFocused();
    } finally {
      await context.close();
    }
  });
});
