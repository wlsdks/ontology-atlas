import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { pageScaleFor, parallaxFollow } from "./constellation-scene";

/**
 * The scene needs a GPU and is proved by recording; this file covers the arithmetic part: the
 * pointer tilt must follow real elapsed time, not a fixed fraction per frame.
 */

/** Remaining distance to the target after `ms` of following in steps of `frameMs`. */
function remainingAfter(ms: number, frameMs: number): number {
  let remaining = 1;
  for (let t = 0; t < ms; t += frameMs) {
    remaining *= 1 - parallaxFollow(Math.min(frameMs, ms - t));
  }
  return remaining;
}

function remainingAfterFixedFraction(ms: number, frameMs: number): number {
  let remaining = 1;
  for (let t = 0; t < ms; t += frameMs) remaining *= 1 - 0.06;
  return remaining;
}

describe("parallaxFollow", () => {
  const HZ_120 = 1000 / 120;
  const HZ_60 = 1000 / 60;
  const HZ_30 = 1000 / 30;

  it("lands in the same place after the same time, whatever the refresh rate", () => {
    const at120 = remainingAfter(280, HZ_120);
    const at60 = remainingAfter(280, HZ_60);
    const at30 = remainingAfter(280, HZ_30);
    expect(at60).toBeCloseTo(at120, 3);
    expect(at30).toBeCloseTo(at120, 3);
  });

  it("detects the defect it replaced, so the fix cannot be quietly reverted", () => {
    const at120 = remainingAfterFixedFraction(280, HZ_120);
    const at30 = remainingAfterFixedFraction(280, HZ_30);
    // A fixed per-frame fraction would make four times the frames four times the progress.
    expect(at30 / at120).toBeGreaterThan(3);
  });

  it("keeps the 60Hz feel the screen was tuned at", () => {
    // One 60Hz frame moves about 6%.
    expect(parallaxFollow(HZ_60)).toBeCloseTo(0.06, 3);
  });

  it("never overshoots, and stands still for no elapsed time", () => {
    expect(parallaxFollow(0)).toBe(0);
    expect(parallaxFollow(-5)).toBe(0);
    expect(parallaxFollow(100_000)).toBeLessThanOrEqual(1);
    expect(parallaxFollow(64)).toBeLessThan(1);
  });
});

describe("pageScaleFor", () => {
  it("is ordered, so a heavier page is never drawn smaller", () => {
    const weights = [0, 0.25, 0.5, 0.75, 1];
    const sizes = weights.map(pageScaleFor);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(new Set(sizes).size).toBe(weights.length);
  });

  it("gives one weight one size, wherever the mark sits", () => {
    expect(pageScaleFor(0.5)).toBe(pageScaleFor(0.5));
  });
});

/*
 * The projection is part of the weight encoding: a perspective camera divides the drawn size by
 * depth and reorders it. Reading which camera the scene builds needs no GPU.
 */
describe("the projection the weight channel depends on", () => {
  // Repo-relative: this suite runs under jsdom, where `import.meta.url` is not a file URL.
  const source = readFileSync("src/views/library/expressive/constellation-scene.ts", "utf8");

  it("is orthographic, because perspective divides the weight channel by depth", () => {
    expect(source).toContain("new THREE.OrthographicCamera(");
    expect(source).not.toContain("new THREE.PerspectiveCamera(");
  });

  it("listens for the pointer on the object's own box, never on the window", () => {
    expect(source).not.toContain('window.addEventListener("pointermove"');
    expect(source).toContain('pointerHost.addEventListener("pointermove"');
  });
});
