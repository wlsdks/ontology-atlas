import { expect, test } from "@playwright/test";
import { AUDITED_ROUTES } from "./audited-routes";

/**
 * Accessibility ratchet — of axe-core's 105 rules, **WCAG 2.x A/AA** only.
 *
 * **Why this sits on top of five hand-written specs.** `a11y-structure`,
 * `aria-audit`, `keyboard-path`, and `touch-target-contract` each pin **one defect
 * a person noticed**. (`mobile-keyboard-audit` used to be in that list; deleted
 * 2026-08-16 because it carried no assertions at all — anything could break and it
 * stayed green — and the two shortcuts it claimed to cover were already covered by
 * specs that do assert.) They are good checks but cover only what was noticed: 15
 * cases looking at five or six of the 105 rules. The first run of this ratchet
 * found three defects those five had never seen (`aria-required-children`,
 * `target-size`, `color-contrast` ×12).
 *
 * **Why a ratchet rather than "zero violations".** `/gate-probe`: **take the
 * inventory before switching a rule on.** Demanding 0 without clearing first makes
 * the gate red from day one, and a red gate is soon switched off or ignored.
 *
 * The 14 originally registered were **all repaid** — `target-size` 1 (control
 * normalisation), `aria-required-children` 1 (role given back), `color-contrast` 4
 * (ink token on filled indigo), and the final 8 disappeared when the design-systems
 * (design-systems seat) verdict raised `--color-text-quaternary` itself to
 * `#82828a` (see the `BASELINE` doc-block below; decision ledger 2026-08-03). With
 * all three baselines at 0, **the collection guard (the `passes` floor) holds this
 * gate's life** — it is the only thing separating an empty screen from no
 * violations.
 *
 * Three contracts:
 *   1. **Collection is alive** — per route, the rules axe applied to content must
 *      be above a floor. Two of the three rules are already 0, so without this an
 *      empty screen and no violations are the same green.
 *   2. **Zero violations from new rules** — any rule not on the list fails. New
 *      defects cannot enter.
 *   3. **Counts can never rise** — the baseline is a ceiling; when you fix
 *      something you lower the number in this file.
 *
 * **Raising a baseline is a human decision that shows up in the diff.** That is the
 * point of this shape: silent growth is blocked, deliberate growth is reviewed.
 *
 * **This gate really does turn red** (four probes, 2026-08-03):
 *
 * | Deliberate defect | Result |
 * |---|---|
 * | Revert the CTA ink to `--color-text-primary` | `color-contrast` 8 → 12, fails |
 * | Restore `role="tablist"` on the sidebar row | `aria-required-children` 0 → 1, fails |
 * | Fix the defect but leave `BASELINE` at 9 | Slack assertion fails (baseline 9, measured 8) |
 * | Point at a server serving only an empty document | Collection assertion fails (4 rules passed < 15) |
 *
 * To retake the inventory: `node scripts/measure-a11y.mjs` (needs a build and a
 * static server).
 */

// Playwright specs load as CJS — using `import.meta` stops the file loading at all,
// and the symptom ("No tests found") is indistinguishable from having no checks.
const AXE_PATH = require.resolve("axe-core/axe.min.js");

/** The `best-practice` tag is advice, not spec — mixing it in merges spec violations and taste into one number. */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// The route list is **shared with the contrast ratchet**. The two gates used to
// keep hand-written subsets, and that divergence meant the AA failure on both 404
// pages was never once seen. Exclusion reasons and the contract-test wiring are in
// that file's doc-block.
const ROUTES = AUDITED_ROUTES;

/**
 * ## 2026-08-04 — routes widened 8 → 17 and re-inventoried
 *
 * **15** of the 17 routes in the canonical inventory + both 404s = **17 URLs**.
 * The two excluded are redirects; the reason is in `audited-routes.ts`.
 *
 * Widening was expected to flood the count; it produced **2** (both on the newly
 * included `/ko/git/`, both `color-contrast`). The other 7 new routes were 0. Both
 * 404s were 0 too — their 4.42:1 had been repaid the day before (#899), and this
 * expansion puts that place **inside the gate for the first time**.
 *
 * The 2 on `/ko/git/` came from two chips in the setup preview sketch
 * (`atlas-git-setup-preview`, `aria-hidden` + `opacity-45`) that **carried words**
 * (composited 2.09:1). Ink cannot fix it — at that opacity even the ramp's
 * brightest ink reaches 4.30 (pure white is exactly 4.50). So the **text** was
 * removed rather than the colour: the sketch's other twenty-odd places were already
 * grey bars, and switching to a bar made the diagram consistent with its own
 * grammar while the violation disappeared. The baseline stays 0.
 *
 * ## 2026-08-03 full inventory (1512×900, 8 routes at the time, identical across two runs)
 *
 * | Rule | Elements | What it was |
 * |---|---|---|
 * | `color-contrast` | 12 → **8** | See the section below. The remaining 8 are **one token** |
 * | ~~`aria-required-children`~~ | ~~1~~ → **0** | The docs sidebar's top row was `role="tablist"` but held search, sort, and new-document alongside the 3 collections. The fix is **giving the role back, not turning the children into `tab`s** — borrowing the role without `tabpanel`, `aria-controls`, and roving tabindex promises assistive tech something we do not deliver. The sibling `DocsVaultTabStrip` had already recorded the same judgement, and the two now share one contract |
 * | ~~`target-size`~~ | ~~1~~ → **0** | WCAG 2.2 §2.5.8 — under 24px with insufficient spacing. Gone with the 2026-08-03 docs/drawer control normalisation: icon controls that left their size to content via `p-1`/`p-0.5` moved to `IconButton` (fixed 24/28/32), giving the smallest one a 24px floor. **When the value layer owns the floor, no place can omit it** — this entry is the evidence |
 *
 * ## `color-contrast` 12 → 8 — what was repaid and what remained
 *
 * **The 4 repaid**: the primary CTAs on gateway/download (`/ko/` ×2 ·
 * `/ko/download/` ×2). The ink on filled indigo (`#5e6ad2`) was
 * `--color-text-primary` (#f7f8f8, **4.42:1**); it moved to
 * `--color-text-on-accent` (#ffffff, **4.70:1**). That token had already been
 * created on 2026-08-03 as "the ink on filled indigo" and `control-class.ts` was
 * using it — only `button.tsx`'s `primary` had been left out of the migration. Zero
 * new values.
 *
 * **The final 8 (`/ko/ontology/insights/` 4 · `/ko/projects/` 4) were all one
 * token, `--color-text-quaternary`, and were repaid on 2026-08-03 when the design-systems
 * seat's verdict raised it from `#787c84` to `#82828a`** (ledger:
 * docs/DECISIONS.md).
 *
 * | Background | before | after |
 * |---|---:|---:|
 * | `--color-canvas` #08090a | 4.76 | 5.23 |
 * | `--color-panel` #0f1011 | 4.55 | 5.00 |
 * | panel + `--color-overlay-1` | **4.37** | 4.81 |
 * | `--color-elevated` #191a1b | **4.16** | 4.57 |
 *
 * (Figures use `scripts/lib/contrast.mjs` alpha compositing.) Why raise the value
 * instead of substituting per place: the screen showed 8 violations but the token
 * has 584 consumers, so clearing only the visible 8 leaves the rest loaded.
 * `#82828a` is effectively the minimum lightness clearing 4.5 on elevated (#828282
 * is the 4.54 floor), which preserves as much hierarchy as possible against
 * tertiary (#8a8f98, step ratio 1.17) and converges with the value the map panel's
 * equivalent step arrived at in 2026-07.
 * ⚠️ Still below on hover/selected (overlay-2, 4.36) — text on a pressable row
 * starts at tertiary.
 *
 * **This number only goes down.**
 */
const BASELINE: Readonly<Record<string, number>> = {
  "color-contrast": 0,
  "aria-required-children": 0,
  "target-size": 0,
};

/**
 * Evidence the detector is not idling — **needed more the closer a baseline gets to 0.**
 *
 * A failure to load axe, or a page that mounted empty, also yields "zero
 * violations". That is **not measured**, not a pass, and the three assertions below
 * cannot tell the two apart (`target-size` and `aria-required-children` are already
 * 0, so they emit no signal at all).
 *
 * ⚠️ **Count the wrong thing and this guard becomes decoration too.** The first
 * attempt counted "rules evaluated" (violations+passes+incomplete+inapplicable);
 * measured, a real route gave **64** and an empty document **63** —
 * `inapplicable` dominates the total, so an empty screen and a real one are
 * indistinguishable. That is a guard that can never turn red.
 *
 * What separates them is `passes`: the number of rules **applied to real content
 * and passed**. Measured 2026-08-03 — `/ko/` 26 · `/ko/topology/` 27 ·
 * `/ko/projects/` 26 · `/ko/docs/` 25 vs **an empty document at 2**. The floor of
 * 15 sits in the gap between.
 *
 * **The floor of 15 still holds after widening to 17 routes** (re-measured
 * 2026-08-04): the thinnest are the two 404s at **21** — naturally low, being a
 * single-card screen — and the rest are 24–30. Six of headroom looks tight, but the
 * distance to an empty document's 2 is 19, so the two states this guard separates
 * are still far apart. If a 404 gets thinner, **suspect that the screen is empty
 * before lowering the floor.**
 *
 * ⚠️ **This guard's reach ends at "did the screen mount"** (confirmed by probe,
 * 2026-08-04). Adding a temporary route rendering only `<div />` did **not** trip
 * this assertion — the shell chrome (rail, tab bar) alone puts axe over 15 applied
 * rules. So it catches "the whole axis failed to mount" but not "the shell is fine
 * and only the body is quietly empty". In the same probe the contrast ratchet's
 * combination guard measured 3 and did trip (it counts text combinations, so it is
 * more sensitive to body content). The two gates cover each other's blind spots, so
 * neither stands alone.
 */
const MIN_RULES_PASSED_PER_ROUTE = 15;

/**
 * Floor on elements actually rendered inside `<main>` — catches **the state the
 * two guards above cannot see.**
 *
 * `MIN_RULES_PASSED_PER_ROUTE` says of itself that it cannot catch "the shell is
 * fine and only the body is quietly empty". That sentence was not hypothetical —
 * it had **already happened inside this list** (measured 2026-08-04):
 *
 *   `/ko/project/ontology-atlas/edit/` → no `<main>` at all, **0** elements inside
 *   main. Yet axe passed **25** rules (floor 15) and contrast combinations were
 *   **6** (floor 4). Both gates green.
 *
 * Shell chrome alone — rail, tab bar, skip link — clears both floors comfortably.
 * So the count is narrowed to **inside `<main>`, not the whole document**; the
 * shell lives outside `<main>` and contributes nothing to this number.
 *
 * **Where the floor of 15 came from.** Measured across 17 routes (1512×900, static
 * export): the thinnest are the two 404s at **19**, then the studio at **24**, and
 * the rest 40–227. An empty screen is **0**. 15 stands between "the thinnest real
 * screen, 19" and "an empty screen, 0".
 *
 * If a route drops below this floor, **ask why that screen is empty first** —
 * lowering the floor is right only when the answer is "that screen really is like
 * that".
 *
 * ## 15 → 13 (2026-09-05), and the answer really was "that screen is like that"
 *
 * MCP left `/agents` for its own destination, and what remains of `/agents` **in the
 * state this list opens it in** — a browser, which cannot launch a program — is a
 * title, one sentence, and one degradation row that says why and links to where the
 * folder connection now lives. Measured: **14**.
 *
 * The question this floor asks is "did the body mount", and 14 answers it as clearly
 * as 40 does; an empty screen is still 0. What 14 does *not* answer is whether the
 * screen is worth its own destination on the web, and that is not this gate's
 * question — the installed app draws the runner list here and is far above the floor.
 * The barren web state is recorded as a design observation instead of being padded
 * with elements to satisfy a number.
 *
 * 13 keeps one element of margin below today's thinnest real screen, so the next
 * screen that loses its body still fails.
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
    await page.goto(`${route}?guides=off`, { waitUntil: "domcontentloaded" });
    // The map's screen is only settled once the physics simulation converges —
    // measuring earlier measures an intermediate state.
    await page.waitForTimeout(2500);
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
    `axe 가 라우트당 ${MIN_RULES_PASSED_PER_ROUTE}개 룰도 내용에 적용하지 못했다 — ` +
      `위반이 없는 게 아니라 화면이 안 떴거나 채집이 깨진 것이다.\n${thinRuns.join("\n")}`,
  ).toEqual([]);

  // "The shell mounted but there is no body" — a state the guard above cannot see in
  // principle. Such a route really was in this list, and both ratchets stayed green.
  expect(
    emptyBodies,
    `\`<main>\` 안에 요소가 ${MIN_MAIN_ELEMENTS_PER_ROUTE}개도 안 그려졌다 — ` +
      `이 라우트에서 «위반 0» 은 통과가 아니라 미측정이다. 주소가 실재하지 않는 ` +
      `값(슬러그 등)을 가리키고 있지 않은지 먼저 확인해라.\n${emptyBodies.join("\n")}`,
  ).toEqual([]);

  const unknown = [...counts.keys()].filter((id) => !(id in BASELINE)).sort();
  expect(
    unknown,
    `기준선에 없는 접근성 룰이 떴다 — 새 결함이다. 고쳐라. 정말 등재해야 한다면 ` +
      `BASELINE 을 올리는 커밋이 리뷰에 보여야 한다.\n` +
      unknown.map((id) => `  ${id}: ${samples.get(id)}`).join("\n"),
  ).toEqual([]);

  for (const [id, max] of Object.entries(BASELINE)) {
    const actual = counts.get(id) ?? 0;
    expect(
      actual,
      `\`${id}\` 위반이 ${max} → ${actual} 로 늘었다. 래칫은 내려가기만 한다.\n` +
        `  예: ${samples.get(id) ?? "(없음)"}`,
    ).toBeLessThanOrEqual(max);
  }

  // Fixing something without lowering the baseline leaves that much as **room to
  // regress**. Not leaving slack free is the other half of a ratchet.
  const slack = Object.entries(BASELINE)
    .filter(([id, max]) => (counts.get(id) ?? 0) < max)
    .map(([id, max]) => `  ${id}: 기준선 ${max} · 실측 ${counts.get(id) ?? 0}`);
  expect(
    slack,
    `접근성 위반이 줄었다 — 이 파일의 BASELINE 도 같이 내려라. 안 내리면 그 차이가 ` +
      `다시 나빠질 여유로 남는다.\n${slack.join("\n")}`,
  ).toEqual([]);
});
