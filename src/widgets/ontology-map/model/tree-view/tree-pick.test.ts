import { describe, expect, it } from "vitest";
import { pickTreeMark } from "./tree-pick";
import type { TreeDrawList, TreeDrawMark } from "./tree-shapes";

function mark(node: number, x: number, y: number, radius: number, depth: number): TreeDrawMark {
  return { node, x, y, radius, scale: 1, depth, tone: 0, closed: false };
}

/** Marks are given far to near, as the draw list holds them. */
function listOf(marks: TreeDrawMark[]): TreeDrawList {
  return { marks, count: marks.length, visited: marks.length, folded: 0 };
}

describe("pickTreeMark", () => {
  it("picks the nearer of two overlapping marks", () => {
    const list = listOf([mark(1, 100, 100, 20, 9), mark(2, 110, 100, 20, 3)]);
    expect(pickTreeMark(list, 100, 100, 0)).toBe(2);
  });

  it("picks the closer centre among marks at the same depth", () => {
    const list = listOf([mark(1, 100, 100, 20, 5), mark(2, 120, 100, 20, 5)]);
    expect(pickTreeMark(list, 104, 100, 0)).toBe(1);
  });

  it("picks a small leaf when the point is within the slop", () => {
    const list = listOf([mark(4, 100, 100, 2, 1)]);
    expect(pickTreeMark(list, 105, 100, 4)).toBe(4);
    expect(pickTreeMark(list, 105, 100, 2)).toBe(-1);
  });

  it("prefers a farther mark under the point to a nearer mark whose slop reaches it", () => {
    const list = listOf([mark(1, 200, 200, 3, 5.2), mark(2, 207, 200, 3, 5.1)]);
    expect(pickTreeMark(list, 200, 200, 6)).toBe(1);
  });

  it("picks nothing for a point that is not a number", () => {
    const list = listOf([mark(1, 100, 100, 10, 2)]);
    expect(pickTreeMark(list, Number.NaN, 100, 6)).toBe(-1);
  });

  it("picks nothing on empty canvas", () => {
    const list = listOf([mark(1, 100, 100, 10, 2), mark(2, 300, 100, 10, 1)]);
    expect(pickTreeMark(list, 200, 100, 6)).toBe(-1);
  });

  it("ignores pooled marks past the list count", () => {
    const list = listOf([mark(1, 100, 100, 10, 2), mark(2, 300, 100, 10, 1)]);
    list.count = 1;
    expect(pickTreeMark(list, 300, 100, 0)).toBe(-1);
  });
});
