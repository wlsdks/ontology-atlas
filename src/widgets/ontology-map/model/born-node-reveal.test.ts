import { describe, expect, it } from "vitest";

import { stepEmphasis } from "./focus-state";
import { effectiveNodeAlpha, nodeTierAlpha, DEFAULT_TIER_REVEAL } from "./tier-visibility";

/**
 * **A node an agent just created surfaces on the map** (owner instruction,
 * 2026-08-17).
 *
 * The appear ramp (`appearRef` — swells from 0.6× while alpha goes 0→1) already
 * existed, but a new capability has **tier alpha 0** at overview zoom, so the
 * staging was multiplied by 0. Measured: when an agent created a capability, the
 * only visible change was the domain's child count going 2→3; no new dot appeared.
 *
 * So a just-born node gets a **tier exemption of the same class** as an ego click
 * or a chip expansion. Nothing new was invented — an existing ramp was given reach
 * where it could not previously land.
 *
 * Screen-recording measurement (30fps, installed app): first-frame share **29.7%**,
 * under `design.md`'s 70% hard-cut threshold; it rises monotonically to ~95% across
 * 300–400 ms with no dip.
 *
 * CI does not record the screen, so that curve is pinned here at the **model
 * level**: visible even at tier 0, no single-frame pop, and no fall back after the
 * rise.
 */

/** A capability at overview zoom (zoomRatio 1) — normally an invisible position. */
const HIDDEN_CAPABILITY = nodeTierAlpha("capability", false, 1, DEFAULT_TIER_REVEAL);

/** Same value as the tau the appear ramp uses (the `--map-cluster-reveal-tau` family). */
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
    // The recording measured 29.7%; the model starts lower still (one frame = 13%).
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
    const series = revealSeries(30); // 0.5 s @60fps
    expect(series.at(-1)).toBeGreaterThan(0.95);
  });

  it("cannot be hidden by the tier once fully risen, since vanishing is a flicker", () => {
    // While the ramp sits at 1, alpha is 1. That is why it holds for the session.
    expect(effectiveNodeAlpha(HIDDEN_CAPABILITY, true, 1)).toBe(1);
    expect(effectiveNodeAlpha(0, true, 1)).toBe(1);
  });
});
