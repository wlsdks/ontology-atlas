import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { readGlobalCss } from '../../scripts/lib/global-css.mjs';

/**
 * Gateway FX (current field, grain, cursor ring) — the reduced-motion equivalent.
 *
 * Until 2026-09-08 this file sealed the gateway field as the one exception to
 * the animated-background ban: single consumer, alpha ceiling, documented
 * listing. The owner lifted that ban (`docs/DECISIONS.md`, "The expression bans
 * are lifted"), so the seal is gone. What stays is accessibility: under
 * `prefers-reduced-motion` the field draws one static frame, the cursor snaps,
 * and the entrance choreography is replaced by "always visible".
 */

const repoRoot = join(import.meta.dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(repoRoot, rel), "utf8");

describe("관문 FX — 감속 동등물", () => {
  it("(b) 전류장은 reduced-motion 에서 rAF 루프를 돌리지 않는다", () => {
    const fx = read("src/views/download/ui/GatewayFx.tsx");
    expect(fx).toMatch(/prefers-reduced-motion/);
    // Reduced-motion branch: one static frame (draw(0)) — the loop starts only in the
    // else branch.
    expect(fx).toMatch(/if \(reduced\) \{\s*\n\s*draw\(0\);/);
    // The cursor lerp snaps instantly under reduced motion — a lagging cursor is not an
    // equivalent.
    expect(fx).toMatch(/!fxLoopLive \|\| reduced/);
  });

  /*
   * The Library's two ambient canvases join this file rather than
   * `reduced-motion-equivalent.contract.test.ts`, which scans `app/globals.css` for
   * `animation:` and cannot see a rAF loop at all. They shipped on 2026-09-09 with the
   * still-frame behaviour measured once (0 rAF callbacks per second) and nothing
   * defending it; a measurement nobody can repeat is not a gate (guardian, 2026-09-09).
   */
  /*
   * The insights board's two staged figures join the same roster for the same reason: they
   * animate from JavaScript timers, so `reduced-motion-equivalent.contract.test.ts`, which
   * scans `app/globals.css` for `animation:`, cannot see them at all. design-motion measured
   * both paths on 2026-09-09 — forced `prefers-reduced-motion` and a deleted
   * `IntersectionObserver` — and found the finished figure on the first painted frame with
   * **zero** build timers in each. A measurement nobody can repeat is not a gate.
   */
  it("(d) the growth figures draw finished on the first frame, with no schedule", () => {
    for (const rel of [
      "src/views/ontology-insights/ui/parts/VaultPresentStack.tsx",
      "src/views/ontology-insights/ui/parts/VaultHistoryTracks.tsx",
    ]) {
      const source = read(rel);
      // The finished state is *derived at render*, not written from an effect — that is what
      // makes the still frame the first frame rather than one that arrives after one.
      // The finished value is whatever the figure calls "all of it"; what this pins is that
      // it is chosen *in the render expression*, not written by an effect.
      expect(source, `${rel}: reduced motion is not derived`).toMatch(
        /reducedMotion \|\| !canWatch \? [\w.]+ :/,
      );
      // Both escapes return before any timer is registered.
      const guard = source.indexOf("if (reducedMotion || !canWatch) return");
      expect(guard, `${rel}: the reduced-motion guard is gone`).toBeGreaterThan(-1);
      expect(
        source.indexOf("setInterval"),
        `${rel}: a timer is registered before the reduced-motion guard`,
      ).toBeGreaterThan(guard);
    }
  });

  it("(c) the Library's two ambient canvases draw one still frame under reduced motion", () => {
    const field = read("src/views/library/ui/parts/LibrarySynapseField.tsx");
    // The still frame is drawn, then the effect returns before any loop is registered.
    const guard = field.indexOf("if (reducedMotion || paused) return");
    expect(guard, "the reduced-motion branch is gone").toBeGreaterThan(-1);
    expect(
      field.indexOf("requestAnimationFrame"),
      "a loop is registered before the reduced-motion branch",
    ).toBeGreaterThan(guard);
    expect(field.slice(0, guard)).toMatch(/\n\s*draw\(\);/);

    /*
     * ⚠️ **Pin the guarantee, not the two lines that happened to provide it** (2026-09-09).
     * This case first matched `if (reduced) {\n draw();\n } else {` literally, and went red
     * the moment the reduced branch gained a second correct statement — landing the
     * self-assembly at t=0 so the still frame is the *settled* object rather than an
     * object frozen mid-arrival. A contract that fails on a correct edit teaches people to
     * loosen it under pressure. What must hold is: the reduced branch draws exactly one
     * frame, and no loop or pointer listener is registered before the `else`.
     */
    const scene = read("src/views/library/expressive/constellation-scene.ts");
    const branch = scene.indexOf("if (reduced) {");
    expect(branch, "the reduced-motion branch is gone").toBeGreaterThan(-1);
    const elseAt = scene.indexOf("} else {", branch);
    expect(elseAt, "the reduced branch no longer has an else").toBeGreaterThan(branch);
    const reducedBranch = scene.slice(branch, elseAt);
    expect(reducedBranch, "the reduced branch draws no frame").toMatch(/\n\s*draw\(\);/);
    expect(
      (reducedBranch.match(/\n\s*draw\(\);/g) ?? []).length,
      "the reduced branch draws more than one frame",
    ).toBe(1);
    for (const forbidden of ["requestAnimationFrame", "addEventListener"]) {
      expect(
        reducedBranch.includes(forbidden),
        `the reduced branch registers ${forbidden}`,
      ).toBe(false);
    }
  });

  it("(b′) 관문 등장 안무의 감속 동등물이 base 레이어 kill 규칙 뒤에 있다", () => {
    const css = readGlobalCss();
    // The carve-out must sit inside the same layer as the global kill rule
    // (@layer base) and after it to win — an !important outside the layer loses to one
    // inside it (measured).
    const kill = css.indexOf("animation-duration: 0.01ms");
    expect(kill).toBeGreaterThan(-1);
    // The carve-out is the `!important` rule; the plain `.gateway-rise` rest state lives elsewhere.
    const carve = css.search(/\.gateway-rise\s*\{[^}]*opacity: 1 !important/);
    expect(carve, "관문 감속 carve-out 이 없다").toBeGreaterThan(-1);
    expect(carve, "carve-out 이 전역 kill 규칙보다 앞이라 조용히 진다").toBeGreaterThan(kill);
    const block = css.slice(carve, css.indexOf("}", carve));
    expect(block).toContain("opacity: 1 !important");
    expect(block).toContain("transform: none !important");
  });
});
