import { describe, expect, it } from "vitest";
import { RowHeightIndex } from "./row-height-index";
import { rowTop, windowRows } from "./use-windowed-rows";

describe("indexed row heights", () => {
  it("matches viewport boundaries, pads and jumps before and after height corrections", () => {
    const heights = Array.from({ length: 1000 }, (_, i) => i % 7 === 0 ? 0 : 20 + i % 43);
    const index = new RowHeightIndex(heights);
    for (const gap of [0, 4, 7]) {
      for (const top of [-1000, 0, 20, 300, 19000, 42000, 90000]) {
        for (const height of [0, 1, 600]) {
          expect(index.window(gap, top, height, 8)).toEqual(windowRows(heights, gap, top, height, 8));
        }
      }
    }
    for (const row of [0, 43, 500, 999]) {
      const previous = heights[row];
      heights[row] = 120;
      index.update(row, previous, heights[row]);
    }
    for (let row = 0; row <= heights.length; row += 1) {
      expect(index.top(row, 4)).toBe(rowTop(heights, 4, row));
    }
    for (let top = -100; top < 50000; top += 127) {
      expect(index.window(4, top, 600, 8)).toEqual(windowRows(heights, 4, top, 600, 8));
    }
  });

  it("keeps an empty list empty", () => {
    expect(new RowHeightIndex([]).window(4, 100, 600, 8))
      .toEqual({ start: 0, end: 0, before: 0, after: 0 });
  });
});
