import { describe, expect, it } from "vitest";

import type { WikiIndexItem } from "../../lib/wiki/wiki-index";
import { focusStops, ITEM_HEIGHT_PX, itemTops, renderedStopRange } from "./wiki-index-window";

const items = [
  { type: "heading", group: "one", count: 2 },
  { type: "row", group: "one", entry: {} },
  { type: "row", group: "one", entry: {} },
  { type: "more", group: "one", count: 5 },
] as unknown as WikiIndexItem[];

describe("itemTops", () => {
  it("adds the fixed height of each kind of item", () => {
    expect([...itemTops(items)]).toEqual([
      0,
      ITEM_HEIGHT_PX.heading,
      ITEM_HEIGHT_PX.heading + ITEM_HEIGHT_PX.row,
      ITEM_HEIGHT_PX.heading + 2 * ITEM_HEIGHT_PX.row,
      ITEM_HEIGHT_PX.heading + 2 * ITEM_HEIGHT_PX.row + ITEM_HEIGHT_PX.more,
    ]);
  });
});

describe("focusStops", () => {
  it("skips headings", () => {
    expect(focusStops(items)).toEqual([1, 2, 3]);
  });
});

describe("renderedStopRange", () => {
  const stopOfItem = new Map([[1, 0], [2, 1], [3, 2]]);

  it("covers the stops inside the window", () => {
    expect(renderedStopRange({ start: 0, end: 3 }, stopOfItem, 3)).toEqual({ start: 0, end: 2 });
    expect(renderedStopRange({ start: 2, end: 4 }, stopOfItem, 3)).toEqual({ start: 1, end: 3 });
  });

  it("is empty when only a heading is drawn", () => {
    expect(renderedStopRange({ start: 0, end: 1 }, stopOfItem, 3)).toEqual({ start: 0, end: 0 });
  });
});
