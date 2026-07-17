import { describe, expect, it } from "vitest";

import {
  computeZoomRatio,
  DEFAULT_TIER_REVEAL,
  edgeTierAlpha,
  nodeTierAlpha,
} from "./tier-visibility";

// zoomRatio: 1 = overview entry, >1 zoomed IN, <1 zoomed OUT.
const ENTRY = 1;
const ZOOMED_IN = 4; // well past both reveal bands
const ZOOMED_OUT = 0.5;

describe("computeZoomRatio", () => {
  it("is 1.0 exactly at the overview entry scale", () => {
    expect(computeZoomRatio(0.87, 0.87)).toBe(1);
  });

  it("is >1 zoomed in and <1 zoomed out", () => {
    expect(computeZoomRatio(1.74, 0.87)).toBeCloseTo(2, 6);
    expect(computeZoomRatio(0.435, 0.87)).toBeCloseTo(0.5, 6);
  });

  it("guards a non-positive entry scale (returns 1)", () => {
    expect(computeZoomRatio(0.9, 0)).toBe(1);
    expect(computeZoomRatio(0.9, -1)).toBe(1);
  });
});

describe("nodeTierAlpha", () => {
  it("keeps project and domain fully visible at every zoom ratio (level-0 spine)", () => {
    for (const ratio of [0.4, 1, 1.5, 2.5, 4]) {
      expect(nodeTierAlpha("project", false, ratio, DEFAULT_TIER_REVEAL)).toBe(1);
      expect(nodeTierAlpha("domain", false, ratio, DEFAULT_TIER_REVEAL)).toBe(1);
    }
  });

  it("keeps the single hub node visible at entry regardless of its kind", () => {
    expect(nodeTierAlpha("capability", true, ENTRY, DEFAULT_TIER_REVEAL)).toBe(1);
    expect(nodeTierAlpha("element", true, ENTRY, DEFAULT_TIER_REVEAL)).toBe(1);
  });

  it("hides capabilities and elements at the overview entry (the fan-arc/soup fix)", () => {
    expect(nodeTierAlpha("capability", false, ENTRY, DEFAULT_TIER_REVEAL)).toBe(0);
    expect(nodeTierAlpha("element", false, ENTRY, DEFAULT_TIER_REVEAL)).toBe(0);
  });

  it("keeps capabilities and elements hidden when zoomed OUT (never soup below entry)", () => {
    expect(nodeTierAlpha("capability", false, ZOOMED_OUT, DEFAULT_TIER_REVEAL)).toBe(0);
    expect(nodeTierAlpha("element", false, ZOOMED_OUT, DEFAULT_TIER_REVEAL)).toBe(0);
  });

  it("reveals capabilities and elements fully once zoomed deep in", () => {
    expect(nodeTierAlpha("capability", false, ZOOMED_IN, DEFAULT_TIER_REVEAL)).toBe(1);
    expect(nodeTierAlpha("element", false, ZOOMED_IN, DEFAULT_TIER_REVEAL)).toBe(1);
  });

  it("reveals capabilities before elements as you zoom in (staged semantic zoom)", () => {
    // At the capability full-reveal ratio, capabilities are fully in while
    // elements (deeper band) have not started yet.
    const ratio = DEFAULT_TIER_REVEAL.capability.fullRatio;
    const cap = nodeTierAlpha("capability", false, ratio, DEFAULT_TIER_REVEAL);
    const el = nodeTierAlpha("element", false, ratio, DEFAULT_TIER_REVEAL);
    expect(cap).toBeGreaterThan(el);
    expect(el).toBe(0);
  });

  it("is monotonic non-decreasing in zoom ratio for capabilities (no discrete flip)", () => {
    let prev = -Infinity;
    for (let ratio = 0.4; ratio <= 4.0001; ratio += 0.05) {
      const a = nodeTierAlpha("capability", false, ratio, DEFAULT_TIER_REVEAL);
      expect(a).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = a;
    }
  });
});

describe("edgeTierAlpha", () => {
  it("is the min of its endpoints' alphas (an edge shows only when both ends do)", () => {
    expect(edgeTierAlpha(1, 0)).toBe(0);
    expect(edgeTierAlpha(0.8, 0.4)).toBe(0.4);
    expect(edgeTierAlpha(1, 1)).toBe(1);
  });
});
