import { describe, expect, it } from "vitest";

import { stepEmphasis } from "./focus-state";
import { effectiveNodeAlpha, nodeTierAlpha, DEFAULT_TIER_REVEAL } from "./tier-visibility";

/**
 * A node an agent just created gets the same tier exemption as an ego click, so the appear
 * ramp is not multiplied by a tier alpha of 0 at overview zoom. CI records no screen, so
 * the curve is pinned at the model level: visible at tier 0, no one-frame pop, no fall back.
 */

const HIDDEN_CAPABILITY = nodeTierAlpha("capability", false, 1, DEFAULT_TIER_REVEAL);

/** The appear ramp tau (the `--map-cluster-reveal-tau` family). */
const REVEAL_TAU = 0.12;
const FRAME_DT = 1 / 60;

function revealSeries(frames: number): number[] {
  const out: number[] = [];
  let ramp = 0;
  for (let i = 0; i < frames; i += 1) {
    ramp = stepEmphasis(ramp, true, true, FRAME_DT, REVEAL_TAU, REVEAL_TAU);
    out.push(effectiveNodeAlpha(HIDDEN_CAPABILITY, true, ramp));
  }
  return out;
}

describe("a node born this moment rises onto the map", () => {
  it("hides an overview-scale capability without the reveal, or this check tests nothing", () => {
    expect(HIDDEN_CAPABILITY).toBe(0);
    expect(effectiveNodeAlpha(HIDDEN_CAPABILITY, false, 0)).toBe(0);
  });

  it("shows a just-born node even at tier 0", () => {
    expect(effectiveNodeAlpha(HIDDEN_CAPABILITY, true, 1)).toBe(1);
  });

  it("does not jump in one frame, since a hard cut is the defect", () => {
    const first = revealSeries(1)[0];
    // Under the 70% first-frame hard-cut threshold (`docs/DESIGN-SYSTEM.md`, "Motion budget
    // goes to the protagonist").
    expect(first).toBeLessThan(0.7);
    expect(first).toBeGreaterThan(0);
  });

  it("rises monotonically, since rising and falling is a flicker", () => {
    const series = revealSeries(40);
    for (let i = 1; i < series.length; i += 1) {
      expect(series[i], `fell back at frame ${i}`).toBeGreaterThanOrEqual(series[i - 1]);
    }
  });

  it("finishes rising within half a second", () => {
    const series = revealSeries(30); // 0.5 s at 60 fps
    expect(series.at(-1)).toBeGreaterThan(0.95);
  });

  it("cannot be hidden by the tier once fully risen, since vanishing is a flicker", () => {
    expect(effectiveNodeAlpha(HIDDEN_CAPABILITY, true, 1)).toBe(1);
    expect(effectiveNodeAlpha(0, true, 1)).toBe(1);
  });
});
