import { describe, expect, it } from "vitest";
import {
  DOME_DETAIL_FADE_END,
  DOME_DETAIL_FADE_START,
  domeDetailFactor,
  domeHaloPx,
} from "@/widgets/ontology-map/model/dome-view/ink";

/**
 * Far-side strokes fold away through `domeDetailFactor(u)`: exactly 1 on the near side (u <= 0.5)
 * and continuous in depth so no stroke pops (Lipschitz bound; smoothstep slope is 1.5/(END-START)).
 * `domeHaloPx(u) * domeDetailFactor(u)` must be continuous too: the draw skips halos below 0.05px.
 */
describe("dome-far-detail: dropping far-side detail is continuous in depth, with no pop", () => {
  const H = 0.001;
  /** smoothstep's maximum slope 1.5/(END-START), with 7% headroom. */
  const MAX_STEP = (1.5 / (DOME_DETAIL_FADE_END - DOME_DETAIL_FADE_START)) * H * 1.07;

  it("the front hemisphere (u <= 0.5) has factor 1, which keeps the viewer-side pixels unchanged", () => {
    expect(DOME_DETAIL_FADE_START).toBeGreaterThanOrEqual(0.5);
    expect(domeDetailFactor(0)).toBe(1);
    expect(domeDetailFactor(0.5)).toBe(1);
  });

  it("the ramp has no step, bounded by the Lipschitz limit (smoothstep maximum slope)", () => {
    let maxStep = 0;
    for (let u = 0; u < 1; u += H) {
      const step = Math.abs(domeDetailFactor(u + H) - domeDetailFactor(u));
      if (step > maxStep) maxStep = step;
    }
    expect(maxStep).toBeGreaterThan(0); // The detector is not idling on an empty set
    expect(maxStep).toBeLessThanOrEqual(MAX_STEP);
  });

  it("the halo width product (domeHaloPx x detail) is continuous too, so the 0.05px skip gate is not a threshold", () => {
    let maxStep = 0;
    for (let u = 0; u < 1; u += H) {
      const a = domeHaloPx(u) * domeDetailFactor(u);
      const b = domeHaloPx(u + H) * domeDetailFactor(u + H);
      const step = Math.abs(b - a);
      if (step > maxStep) maxStep = step;
    }
    expect(maxStep).toBeGreaterThan(0);
    // 0.02px per 0.001u — under half the skip gate (0.05px), so no pair of frames can
    // make a stroke appear or vanish at a visible width.
    expect(maxStep).toBeLessThanOrEqual(0.02);
  });

  it("the omission completes at END (<1), where the fog is already deep", () => {
    expect(DOME_DETAIL_FADE_END).toBeLessThan(1);
    expect(DOME_DETAIL_FADE_END).toBeGreaterThan(DOME_DETAIL_FADE_START);
    expect(domeDetailFactor(DOME_DETAIL_FADE_END)).toBe(0);
  });
});
