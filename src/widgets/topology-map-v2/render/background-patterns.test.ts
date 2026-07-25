import { describe, expect, it } from "vitest";

import { readCanvasBgTokens, seededStars } from "./background-patterns";

describe("seededStars (#20 constellation — fixed seed determinism)", () => {
  it("is identical across calls with the same seed (session/machine invariant)", () => {
    const a = seededStars(240, 3400, 1337);
    const b = seededStars(240, 3400, 1337);
    expect(a).toEqual(b);
  });

  it("differs for a different seed", () => {
    const a = seededStars(240, 3400, 1337);
    const b = seededStars(240, 3400, 42);
    expect(a).not.toEqual(b);
  });

  it("places stars within the tile, with 1-2px radii and 2 brightness steps", () => {
    const stars = seededStars(240, 3400, 1337);
    expect(stars.length).toBeGreaterThan(0);
    const radii = new Set<number>();
    const brightness = new Set<boolean>();
    for (const s of stars) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(240);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(240);
      expect(s.r).toBeGreaterThan(0);
      expect(s.r).toBeLessThanOrEqual(2);
      radii.add(s.r);
      brightness.add(s.bright);
    }
    expect(radii.size).toBeLessThanOrEqual(2);
    expect(brightness.size).toBeGreaterThan(0);
  });

  it("stays low-density (a subtle field, not noise)", () => {
    const stars = seededStars(240, 3400, 1337);
    // 240*240 / 3400 ≈ 17 — a handful per tile, never a dense screen of noise.
    expect(stars.length).toBeLessThan(30);
  });
});

describe("readCanvasBgTokens", () => {
  it("reads declared tokens", () => {
    const reader = (name: string): string =>
      ({
        "--canvas-bg-ink-max": "0.08",
        "--canvas-bg-constellation-dim": "rgba(1, 2, 3, 0.03)",
        "--canvas-bg-constellation-bright": "rgba(1, 2, 3, 0.055)",
        "--canvas-bg-contour": "rgba(4, 5, 6, 0.05)",
      })[name] ?? "";
    const tokens = reader ? readCanvasBgTokens(reader) : null;
    expect(tokens?.inkMax).toBeCloseTo(0.08, 4);
    expect(tokens?.constellationDim).toBe("rgba(1, 2, 3, 0.03)");
    expect(tokens?.contour).toBe("rgba(4, 5, 6, 0.05)");
  });

  it("falls back to documented defaults when a token is missing (aesthetic layer, no hard throw)", () => {
    const tokens = readCanvasBgTokens(() => "");
    expect(tokens.inkMax).toBeCloseTo(0.08, 4);
    expect(tokens.constellationDim).toContain("rgba");
    expect(tokens.contour).toContain("rgba");
  });

  it("never exceeds the documented ink-max cap in the default alphas (#20 charter)", () => {
    const tokens = readCanvasBgTokens(() => "");
    const alphaOf = (rgba: string): number => Number(rgba.replace(/rgba?\([^)]*,\s*([\d.]+)\)/, "$1"));
    expect(alphaOf(tokens.constellationDim)).toBeLessThanOrEqual(tokens.inkMax);
    expect(alphaOf(tokens.constellationBright)).toBeLessThanOrEqual(tokens.inkMax);
    expect(alphaOf(tokens.contour)).toBeLessThanOrEqual(tokens.inkMax);
  });
});
