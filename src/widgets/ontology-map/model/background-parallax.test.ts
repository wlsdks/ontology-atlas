import { describe, expect, it } from "vitest";
import {
  backgroundParallaxOrigin,
  resolveBackgroundOrigin,
  resolveBackgroundParallax,
} from "./background-parallax";

const VP = { width: 1000, height: 600 };
const CENTER = { x: 500, y: 300 };

describe("backgroundParallaxOrigin", () => {
  it("welds to the world at factor 1, the same as without parallax", () => {
    const origin = { x: 320, y: 210 };
    expect(backgroundParallaxOrigin(origin, VP, 1)).toEqual(origin);
  });

  it("welds to the screen at factor 0, fixed at the viewport centre", () => {
    expect(backgroundParallaxOrigin({ x: 320, y: 210 }, VP, 0)).toEqual(CENTER);
  });

  // This is the definition of parallax: the background moves **less** than the ground.
  it("moves the background k times the ground motion for 0 < k < 1", () => {
    const k = 0.82;
    const moved = { x: CENTER.x - 200, y: CENTER.y + 100 };
    const bg = backgroundParallaxOrigin(moved, VP, k);
    expect(bg.x).toBeCloseTo(CENTER.x - 200 * k, 6);
    expect(bg.y).toBeCloseTo(CENTER.y + 100 * k, 6);
    // The background travels a shorter distance than the ground = it is further away
    expect(Math.abs(bg.x - CENTER.x)).toBeLessThan(Math.abs(moved.x - CENTER.x));
  });

  // Applied about anything but the centre, the layers start out misaligned even at rest.
  it("keeps the layers aligned at any factor when the camera is at the origin", () => {
    for (const k of [0, 0.5, 0.82, 1]) {
      expect(backgroundParallaxOrigin(CENTER, VP, k)).toEqual(CENTER);
    }
  });

  it("falls back to 1 (welded) on a NaN factor", () => {
    const origin = { x: 320, y: 210 };
    expect(backgroundParallaxOrigin(origin, VP, Number.NaN)).toEqual(origin);
  });
});

describe("resolveBackgroundParallax", () => {
  it("applies parallax only to the constellation; dot grid and contours are ground at 1.0", () => {
    expect(resolveBackgroundParallax("web", 0.82, false)).toBe(0.82);
    expect(resolveBackgroundParallax("dot", 0.82, false)).toBe(1);
    expect(resolveBackgroundParallax("contour", 0.82, false)).toBe(1);
    expect(resolveBackgroundParallax(undefined, 0.82, false)).toBe(1);
  });

  /**
   * The heart of this contract is that reduced-motion is **1, not 0**. Vestibular
   * stimulus comes from relative motion between layers, and 1.0 removes it. At 0
   * the background welds to the screen and relative motion against the content
   * appears instead — manufacturing the thing being avoided.
   */
  it("returns 1.0 under prefers-reduced-motion, removing relative motion", () => {
    expect(resolveBackgroundParallax("web", 0.82, true)).toBe(1);
    expect(resolveBackgroundParallax("web", 0.1, true)).toBe(1);
  });

  it("clamps above 1 to 1, since a background faster than content reads as the nearer layer", () => {
    expect(resolveBackgroundParallax("web", 1.4, false)).toBe(1);
  });

  it("clamps below 0 to 0, since reverse drift causes motion sickness", () => {
    expect(resolveBackgroundParallax("web", -0.3, false)).toBe(0);
  });

  it("falls back to 1 when the token is missing or NaN", () => {
    expect(resolveBackgroundParallax("web", Number.NaN, false)).toBe(1);
  });
});

describe("resolveBackgroundOrigin decides the whole origin in one function", () => {
  // If the caller (topology-frame-draw) wires the two functions together by hand,
  // that assembly becomes an unverified surface. Bundled into one, the only risk
  // left is whether the caller passes the result through.
  it("offsets the origin for the near constellation while awake", () => {
    const out = resolveBackgroundOrigin({ x: 300, y: 300 }, VP, "web", 0.82, false);
    expect(out.x).toBeCloseTo(CENTER.x + (300 - CENTER.x) * 0.82, 6);
    expect(out.y).toBeCloseTo(CENTER.y + (300 - CENTER.y) * 0.82, 6);
  });

  it("keeps the origin for the dot grid, which is ground", () => {
    const origin = { x: 300, y: 300 };
    expect(resolveBackgroundOrigin(origin, VP, "dot", 0.82, false)).toEqual(origin);
  });

  it("keeps the origin for the constellation under reduced motion", () => {
    const origin = { x: 300, y: 300 };
    expect(resolveBackgroundOrigin(origin, VP, "web", 0.82, true)).toEqual(origin);
  });
});
