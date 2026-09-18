import { describe, expect, it } from "vitest";

import { windowRows } from "./use-windowed-rows";

describe("windowRows", () => {
  const heights = Array.from({ length: 1000 }, () => 36);

  it("renders nothing for an empty list", () => {
    expect(windowRows([], 4, 0, 600, 8)).toEqual({ start: 0, end: 0, before: 0, after: 0 });
  });

  it("at the top, renders one viewport of rows plus the overscan below, and pads the rest", () => {
    const w = windowRows(heights, 4, 0, 600, 8);
    expect(w.start).toBe(0);
    // 600 / 40 = 15 rows in view, then 8 more.
    expect(w.end).toBe(23);
    expect(w.before).toBe(0);
    // Every row after `end` with its gap, less the trailing gap the list draws itself.
    expect(w.after).toBe((1000 - 23) * 40 - 4);
  });

  it("scrolled into the middle, the pads add up to the rows not rendered and the window brackets the viewport", () => {
    const w = windowRows(heights, 4, 10_000, 600, 8);
    // Row 250 starts at 10,000: eight rows of overscan stand above it.
    expect(w.start).toBe(242);
    expect(w.end).toBe(250 + 15 + 8);
    expect(w.before).toBe(242 * 40);
    expect(w.after).toBe((1000 - w.end) * 40 - 4);
  });

  it("at the end, the last row is rendered and nothing is padded after it", () => {
    const w = windowRows(heights, 4, 1000 * 40, 600, 8);
    expect(w.end).toBe(1000);
    expect(w.after).toBe(0);
  });

  it("rows of different heights keep the pads exact", () => {
    const mixed = [20, 60, 40, 80, 20, 60, 40, 80];
    const w = windowRows(mixed, 0, 100, 50, 0);
    // 20 + 60 = 80 < 100 ≤ 80 + 40: row 2 is the first in view.
    expect(w.start).toBe(2);
    expect(w.before).toBe(80);
    expect(w.end).toBe(4);
    expect(w.after).toBe(20 + 60 + 40 + 80);
  });

  it("a list that fits its viewport renders every row", () => {
    const w = windowRows([36, 36, 36], 4, 0, 600, 8);
    expect(w).toEqual({ start: 0, end: 3, before: 0, after: 0 });
  });
});
