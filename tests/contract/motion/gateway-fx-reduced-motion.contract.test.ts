import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';

/**
 * Under `prefers-reduced-motion` the field draws one static frame, the system pointer stays,
 * and the entrance choreography is replaced by always visible.
 */

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const read = (rel: string): string => readFileSync(join(repoRoot, rel), "utf8");

describe("gateway FX: reduced-motion equivalent", () => {
  it("(b) the current field does not run the rAF loop under reduced-motion", () => {
    const fx = read("src/views/download/ui/GatewayFx.tsx");
    expect(fx).toMatch(/prefers-reduced-motion/);
    // Reduced-motion branch: one static frame (draw(0)) — the loop starts only in the
    // else branch.
    expect(fx).toMatch(/if \(reduced\) \{\s*\n\s*draw\(0\);/);
    // Under reduced motion the page's own pointer never starts: the system pointer stays, which
    // has no lag, no links and no click sparks.
    expect(fx).toMatch(/if \(finePointer && !reduced && /);
  });

  /*
   * The Library's ambient canvases are checked here because rAF loops are invisible to
   * `reduced-motion-equivalent.contract.test.ts`, which only scans `app/globals.css` for `animation:`.
   */
  /*
   * The insights figures animate from JavaScript timers, which
   * `reduced-motion-equivalent.contract.test.ts` cannot see; they must draw finished with zero timers.
   */
  it("(d) the growth figures draw finished on the first frame, with no schedule", () => {
    for (const rel of [
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
    const field = read("src/views/library/ui/parts/first-run/LibrarySynapseField.tsx");
    // The still frame is drawn, then the effect returns before any loop is registered.
    const guard = field.indexOf("if (reducedMotion || paused) return");
    expect(guard, "the reduced-motion branch is gone").toBeGreaterThan(-1);
    expect(
      field.indexOf("requestAnimationFrame"),
      "a loop is registered before the reduced-motion branch",
    ).toBeGreaterThan(guard);
    expect(field.slice(0, guard)).toMatch(/\n\s*draw\(\);/);

    /*
     * Pins the guarantee, not the lines: the reduced branch draws exactly one frame and registers
     * no loop or pointer listener before the `else`.
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

  it("(b') the reduced-motion equivalent of the gateway entrance choreography sits after the base-layer kill rule", () => {
    const css = readGlobalCss();
    // The carve-out must sit inside the same layer as the global kill rule
    // (@layer base) and after it to win — an !important outside the layer loses to one
    // inside it (measured).
    const kill = css.indexOf("animation-duration: 0.01ms");
    expect(kill).toBeGreaterThan(-1);
    // The carve-out is the `!important` rule; the plain `.gateway-rise` rest state lives elsewhere.
    const carve = css.search(/\.gateway-rise\s*\{[^}]*opacity: 1 !important/);
    expect(carve, "the gateway reduced-motion carve-out is missing").toBeGreaterThan(-1);
    expect(carve, "the carve-out comes before the global kill rule, so it silently loses").toBeGreaterThan(kill);
    const block = css.slice(carve, css.indexOf("}", carve));
    expect(block).toContain("opacity: 1 !important");
    expect(block).toContain("transform: none !important");
  });
});
