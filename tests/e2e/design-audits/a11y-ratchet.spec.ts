import { expect, test } from "@playwright/test";
import { AUDITED_ROUTES } from "../audited-routes";
import { waitForPageSettled } from "../settle";

/**
 * Accessibility ratchet over axe-core WCAG 2.x A/AA rules. A ratchet rather than zero, so the gate is
 * not red from day one; new rules start at zero and counts never rise. Retake the inventory with
 * `node scripts/design/measure-a11y.mjs`.
 */

// Playwright specs load as CJS — using `import.meta` stops the file loading at all,
// and the symptom ("No tests found") is indistinguishable from having no checks.
const AXE_PATH = require.resolve("axe-core/axe.min.js");

/** The `best-practice` tag is advice, not spec — mixing it in merges spec violations and taste into one number. */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// The route list is shared with the contrast ratchet; exclusion reasons and contract-test wiring are
// in that file's doc-block.
const ROUTES = AUDITED_ROUTES;

/**
 * Baseline for the audited routes: 15 of the 17 canonical routes plus both 404 pages. The two excluded
 * are redirects (`audited-routes.ts`). This number only goes down.
 */
const BASELINE: Readonly<Record<string, number>> = {
  "color-contrast": 0,
  "aria-required-children": 0,
  "target-size": 0,
};

/**
 * A failed axe load or an empty page also yields zero violations, so `passes` (rules applied to
 * real content) is counted; the floor of 15 sits between real screens and an empty document (2).
 * It cannot catch an empty body under a mounted shell; the contrast guard covers that.
 */
const MIN_RULES_PASSED_PER_ROUTE = 15;

/**
 * Floor on elements rendered inside `<main>`: shell chrome sits outside it and clears the other floors
 * alone. Real screens have 14 or more and an empty screen 0, so 13 leaves one element of margin; ask
 * why a screen is empty before lowering it.
 */
const MIN_MAIN_ELEMENTS_PER_ROUTE = 13;

test("접근성 래칫 — 새 룰 위반 0, 기존 개수는 늘지 않는다", async ({ page }) => {
  // Routes went 8 → 17. At 2.5s of settle time per route plus the axe run, this
  // exceeds the default 60s.
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  const counts = new Map<string, number>();
  const samples = new Map<string, string>();
  const thinRuns: string[] = [];
  const emptyBodies: string[] = [];

  for (const route of ROUTES) {
    const destination = route === "/ko/docs/" ? "/ko/library/?tab=ontology" : route;
    await page.goto(`${destination}${destination.includes("?") ? "&" : "?"}guides=off`, {
      waitUntil: "domcontentloaded",
    });
    if (route === "/ko/docs/") {
      await expect(page).toHaveURL(
        (url) => url.pathname === "/ko/library/" && url.searchParams.get("tab") === "ontology",
      );
      await expect(
        page.locator('#library-workspace-tabpanel-ontology [data-docs-viewer]'),
      ).toBeVisible();
    }
    // Measuring before the route has arrived measures an intermediate state.
    await waitForPageSettled(page);
    await page.addScriptTag({ path: AXE_PATH });
    const result = await page.evaluate(async (tags) => {
      type Run = {
        violations: Array<{ id: string; nodes: Array<{ target: string[] }> }>;
        passes: Array<unknown>;
        incomplete: Array<unknown>;
        inapplicable: Array<unknown>;
      };
      const run = await (window as unknown as { axe: { run: (ctx: Document, opts: unknown) => Promise<Run> } }).axe.run(
        document,
        { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] },
      );
      return {
        // `resultTypes` trims only the **node detail**; array lengths are unchanged. So
        // the count of rules actually applied to content is free.
        rulesPassed: run.passes.length,
        violations: run.violations.map((v) => ({
          id: v.id,
          count: v.nodes.length,
          sample: v.nodes[0]?.target?.join(" ") ?? "",
        })),
      };
    }, WCAG_TAGS);

    // Shell chrome lives outside `<main>`, so counting here leaves only "the body did not mount".
    const mainElements = await page.evaluate(
      () => document.querySelectorAll("main *").length,
    );
    if (mainElements < MIN_MAIN_ELEMENTS_PER_ROUTE) {
      emptyBodies.push(`  ${route}: <main> 안 요소 ${mainElements}`);
    }

    if (result.rulesPassed < MIN_RULES_PASSED_PER_ROUTE) {
      thinRuns.push(`  ${route}: 내용에 적용돼 통과한 룰 ${result.rulesPassed}`);
    }
    for (const v of result.violations) {
      counts.set(v.id, (counts.get(v.id) ?? 0) + v.count);
      if (!samples.has(v.id)) samples.set(v.id, `${route} → ${v.sample}`);
    }
  }

  // Separates "zero violations" from "nothing was measured". Without this the three
  // assertions below are all green over an empty set, which is the same as no gate.
  expect(
    thinRuns,
    `axe applied fewer than ${MIN_RULES_PASSED_PER_ROUTE} rules to the content of a route. ` +
      `That is not the absence of violations: the screen did not render or collection broke.\n${thinRuns.join("\n")}`,
  ).toEqual([]);

  // "The shell mounted but there is no body" — a state the guard above cannot see in
  // principle. Such a route really was in this list, and both ratchets stayed green.
  expect(
    emptyBodies,
    `Fewer than ${MIN_MAIN_ELEMENTS_PER_ROUTE} elements rendered inside \`<main>\`, ` +
      `so "0 violations" on this route is unmeasured, not a pass. First check that the address does not point at a value ` +
      `that does not exist (a slug, say).\n${emptyBodies.join("\n")}`,
  ).toEqual([]);

  const unknown = [...counts.keys()].filter((id) => !(id in BASELINE)).sort();
  expect(
    unknown,
    `An accessibility rule the baseline does not have was raised: a new defect. Fix it. If it really must be listed, ` +
      `the commit that raises BASELINE has to be visible in review.\n` +
      unknown.map((id) => `  ${id}: ${samples.get(id)}`).join("\n"),
  ).toEqual([]);

  for (const [id, max] of Object.entries(BASELINE)) {
    const actual = counts.get(id) ?? 0;
    expect(
      actual,
      `\`${id}\` violations grew from ${max} to ${actual}. The ratchet only goes down.\n` +
        `  e.g. ${samples.get(id) ?? "(none)"}`,
    ).toBeLessThanOrEqual(max);
  }

  // Fixing something without lowering the baseline leaves that much as **room to
  // regress**. Not leaving slack free is the other half of a ratchet.
  const slack = Object.entries(BASELINE)
    .filter(([id, max]) => (counts.get(id) ?? 0) < max)
    .map(([id, max]) => `  ${id}: 기준선 ${max} · 실측 ${counts.get(id) ?? 0}`);
  expect(
    slack,
    `Accessibility violations fell, so lower this file's BASELINE with them; otherwise the difference ` +
      `stays as room to get worse again.\n${slack.join("\n")}`,
  ).toEqual([]);
});
