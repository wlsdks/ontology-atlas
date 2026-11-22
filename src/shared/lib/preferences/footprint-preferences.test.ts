import { describe, expect, it } from "vitest";

import { DEFAULT_FOOTPRINT, FOOTPRINT_RANGES, resolveFootprint } from "./footprint-preferences";

/**
 * Footprint settings. A hand-edited localStorage entry or an old-version value
 * leaking `NaN` into the renderer makes the footprints **vanish entirely with no
 * error at all**. This is where that silent failure is blocked.
 */
describe("footprint setting normalization", () => {
  it("out-of-range numbers are clamped", () => {
    const out = resolveFootprint({ size: 999, opacity: -3, gap: 900 });
    expect(out.size).toBe(FOOTPRINT_RANGES.size.max);
    expect(out.opacity).toBe(FOOTPRINT_RANGES.opacity.min);
    expect(out.gap).toBe(FOOTPRINT_RANGES.gap.max);
  });

  it("NaN, strings and missing values are replaced by the default", () => {
    const out = resolveFootprint({ size: Number.NaN, gap: "8", tone: "chartreuse" });
    expect(out.size).toBe(DEFAULT_FOOTPRINT.size);
    expect(out.gap).toBe(DEFAULT_FOOTPRINT.gap);
    expect(out.tone).toBe(DEFAULT_FOOTPRINT.tone);
  });

  it("a non-object becomes the default as a whole", () => {
    expect(resolveFootprint(null)).toEqual(DEFAULT_FOOTPRINT);
    expect(resolveFootprint("[]")).toEqual(DEFAULT_FOOTPRINT);
  });

  /**
   * Saved settings with keys that are no longer read still load: they resolve to a valid preference
   * rather than throwing or falling back wholesale to the defaults.
   */
  it("the rest come back alive even when the six retired values remain", () => {
    const out = resolveFootprint({
      size: 17,
      gap: 4,
      opacity: 0.95,
      tone: "indigo",
      filled: false,
      strokeWidth: 1.2,
      bloom: 3,
      onEdges: true,
      edgeDensity: "sparse",
      placement: "both",
    });
    expect(out).toEqual({ size: 17, gap: 4, opacity: 0.95, tone: "indigo" });
  });
});
