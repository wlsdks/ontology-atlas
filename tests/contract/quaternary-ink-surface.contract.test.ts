import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { composite, contrastRatio, parseColor } from "../../scripts/lib/contrast.mjs";

/**
 * The **surface licence contract** for quaternary ink (system seat verdict,
 * 2026-08-04).
 *
 * **What it locks.** The 2026-08-03 lift (#787c84 → #82828a) measured the four
 * static surfaces (canvas · panel · panel+overlay-1 · elevated) against the licence
 * and passed them all. But surfaces with **one more overlay** were not among those
 * four backgrounds, and the new open-surface instrument
 * (`tests/e2e/a11y-open-surfaces.spec.ts`) confirmed that blind spot with numbers on
 * its first run — global search's kbd (panel+overlay-2, 4.38), the selected row's
 * chip (overlay-1∘indigo-a14∘panel, 4.14), and the selected row's span
 * (indigo-a14∘panel, 4.39).
 *
 * Verdict: **do not lift the ink again.** Overlay composition has no ceiling on
 * depth in principle, so no single ink value can win at every depth, and each lift
 * digs into the hierarchy gap against tertiary (step ratio 1.17 on panel; the lowest
 * this repository has accepted is 1.06). Instead the **boundary is written into the
 * licence**:
 *
 * > **quaternary is licensed up to static neutral backgrounds** — the three base
 * > steps (canvas / panel / elevated) plus a single overlay-1 on canvas or panel.
 * > **Text on any background above that** (overlay-2 or deeper, elevated+overlay,
 * > indigo or amber tint composition) **starts at tertiary.** (A generalisation of
 * > AtlasGitPanel's 2026-08-02 rule "text on a pressable row starts at tertiary" —
 * > the rule came from the background rising, not from the row being pressable.)
 *
 * **Why a contract plus a runtime instrument rather than lint.** A static scan
 * **does not know which background the ink is drawn on** — the same
 * `text-quaternary` lives on panel (5.00, passes) and on overlay-2 (4.36, fails). The
 * same-tag pairing heuristic does not work here either: this layer's dominant idiom
 * is a **branch** such as `active ? 'tint background + bright ink' : 'quaternary
 * ink'`, so most of the 18 pairs where both literals share a tag were false
 * positives that never coexist at runtime (exhaustive count, 2026-08-04). So the
 * work is split across three layers:
 *
 * 1. **Value layer (here)** — computes the licence boundary itself from the real
 *    values in globals.css. If a token moves, this test recomputes the truth of that
 *    moment.
 * 2. **Site layer (here)** — a source assertion that the site caught by measurement
 *    this round (global search) does not return to quaternary.
 * 3. **Screen layer (`a11y-open-surfaces.spec.ts`)** — a ratchet that actually opens
 *    the open surfaces and measures with axe. Its color-contrast baseline went 5 → 0
 *    this round.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

type Rgba = readonly number[];

function cssToken(css: string, name: string): Rgba {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`globals.css 에 ${name} 이 없다`);
  const v = m[1].trim();
  if (v.startsWith("var(")) return cssToken(css, v.slice(4, -1).trim());
  const parsed = parseColor(v);
  if (!parsed) throw new Error(`${name} 값(${v})을 색으로 못 읽는다`);
  return parsed as Rgba;
}

const css = read("app/globals.css");
const stack = (...layers: Rgba[]) =>
  layers.reduce((bg, fg) => composite(fg as never, bg as never) as unknown as Rgba);
const ratioOn = (ink: Rgba, bg: Rgba) =>
  contrastRatio(composite(ink as never, bg as never), bg as never);

const canvas = cssToken(css, "--color-canvas");
const panel = cssToken(css, "--color-panel");
const elevated = cssToken(css, "--color-elevated");
const o1 = cssToken(css, "--color-overlay-1");
const o2 = cssToken(css, "--color-overlay-2");
const a14 = cssToken(css, "--color-indigo-a14");

const quaternary = cssToken(css, "--color-text-quaternary");
const tertiary = cssToken(css, "--color-text-tertiary");

describe("quaternary 잉크 라이선스 — 정지한 무채 바탕까지", () => {
  it("라이선스 안: 맨 3단 + canvas/panel 위 overlay-1 에서 AA(4.5:1)", () => {
    const licensed: Record<string, Rgba> = {
      canvas,
      panel,
      elevated,
      "canvas+overlay-1": stack(canvas, o1),
      "panel+overlay-1": stack(panel, o1),
    };
    for (const [name, bg] of Object.entries(licensed)) {
      const r = ratioOn(quaternary, bg);
      expect(r, `quaternary 가 ${name} 위에서 ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("경계의 근거가 아직 실재한다 — 올라선 바탕에서는 실제로 AA 를 깬다", () => {
    /*
     * `/gate-probe`: no detector may idle on an empty set. The day this assertion turns
     * red is the day quaternary passes on raised surfaces too, and on that day this
     * licence boundary can be folded — the same grammar as the accent/accentOnTint
     * "grounds for the split" assertion. (Conversely, lifting quaternary that far
     * collapses the hierarchy against tertiary first — the step ratio below catches
     * that.)
     */
    expect(ratioOn(quaternary, stack(panel, o2))).toBeLessThan(4.5);
    expect(ratioOn(quaternary, stack(elevated, o1))).toBeLessThan(4.5);
    expect(ratioOn(quaternary, stack(panel, a14))).toBeLessThan(4.5);
  });

  it("처방이 성립한다 — tertiary 는 이번에 실측된 올라선 바탕 전부에서 AA", () => {
    /*
     * For "text on a raised background starts at tertiary" to be a prescription,
     * tertiary must actually clear those backgrounds. The three compositions the
     * open-surface instrument caught are the benchmark. If a deeper composition that
     * tertiary also fails (elevated+overlay-3 and so on) appears on screen, that site
     * starts at secondary and this list widens then.
     */
    const raised: Record<string, Rgba> = {
      "panel+overlay-2": stack(panel, o2),
      "indigo-a14∘panel": stack(panel, a14),
      "overlay-1∘indigo-a14∘panel": stack(panel, a14, o1),
      "elevated+overlay-1": stack(elevated, o1),
    };
    for (const [name, bg] of Object.entries(raised)) {
      const r = ratioOn(tertiary, bg);
      expect(r, `tertiary 가 ${name} 위에서 ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("위계 간격이 남아 있다 — panel 위 tertiary/quaternary 스텝비 ≥ 1.06", () => {
    /*
     * The 2026-08-03 lift already narrowed this from 1.29 to 1.17. The lowest this
     * repository has accepted at the same step is 1.06 (the map panel ramp), so a value
     * change below that has dug into the hierarchy — and the next time someone lifts
     * quaternary "one more time", this turns red first.
     */
    const step = ratioOn(tertiary, panel) / ratioOn(quaternary, panel);
    expect(step).toBeGreaterThanOrEqual(1.06);
  });
});

describe("실측으로 잡힌 자리가 되돌아가지 않는다 — 글로벌 검색", () => {
  it("kbd·선택 행 자식들은 tertiary 다", () => {
    /*
     * All 3 color-contrast findings in the first open-surface sweep (2026-08-04) were in
     * this file: kbd (4.38), the selected row's kind chip (4.14), and the selected row's
     * span (4.39). cmdk's selection travels every row, so the slug and status spans fall
     * under the same rule.
     */
    const src = read("src/widgets/global-search/ui/GlobalSearch.tsx");
    const kbd = /<kbd[^>]*className="[^"]*"/.exec(src)?.[0] ?? "";
    expect(kbd).toContain("--color-text-tertiary");
    expect(kbd).not.toContain("--color-text-quaternary");
    // A selected row (aria-selected:bg-indigo-a14) has no quaternary child.
    const items = src.split("aria-selected:bg-[color:var(--color-indigo-a14)]");
    expect(items.length, "선택 행 문법이 사라졌다 — 이 단언의 대상을 다시 찾아라").toBeGreaterThan(1);
    for (const chunk of items.slice(1)) {
      // Only up to where the row element closes (before the next Group heading).
      const scope = chunk.split("</Command.Item>")[0] ?? chunk;
      expect(
        scope.includes("--color-text-quaternary"),
        "선택 행(indigo-a14 합성) 안에 quaternary 잉크가 되돌아왔다 — 4.39:1 로 AA 미달이다. tertiary 부터 쓴다.",
      ).toBe(false);
    }
  });
});
