import { describe, expect, it } from "vitest";

import { maxOf, minOf } from "./library-graph-extremes";

describe("maxOf and minOf", () => {
  it("find the extremes of a million values, more than Math.max takes as arguments", () => {
    const values = Array.from({ length: 1_000_000 }, (_, i) => (i + 500_000) % 1_000_000);
    expect(maxOf(values)).toBe(999_999);
    expect(minOf(values)).toBe(0);
  });

  it("read any iterable and answer the floor or ceiling when nothing passes it", () => {
    expect(maxOf(new Map([["a", 3], ["b", 9]]).values())).toBe(9);
    expect(maxOf([], 1)).toBe(1);
    expect(maxOf([0, -3], 1)).toBe(1);
    expect(maxOf([])).toBe(Number.NEGATIVE_INFINITY);
    expect(minOf([], 5)).toBe(5);
    expect(minOf([7, 2], 5)).toBe(2);
    expect(minOf([])).toBe(Number.POSITIVE_INFINITY);
  });
});
