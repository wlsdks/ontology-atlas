import type { WikiIndexItem } from "../../lib/wiki/wiki-index";

/** Item heights are fixed, so the window and keyboard scrolling compute offsets instead of measuring. */
export const ITEM_HEIGHT_PX: Record<WikiIndexItem["type"], number> = { heading: 38, row: 44, more: 32 };
export const LIST_PAD_TOP_PX = 2;

/** The top of every item and the end of the last, from the fixed heights: `tops[i + 1] - tops[i]` is item `i`. */
export function itemTops(items: readonly WikiIndexItem[]): Float64Array {
  const tops = new Float64Array(items.length + 1);
  for (let index = 0; index < items.length; index += 1) tops[index + 1] = tops[index]! + ITEM_HEIGHT_PX[items[index]!.type];
  return tops;
}

/** The items the keyboard can stop on, as item indexes: every one except a heading. */
export function focusStops(items: readonly WikiIndexItem[]): number[] {
  return items.flatMap((item, index) => (item.type === "heading" ? [] : [index]));
}

/** The keyboard stops drawn inside a window of items; an empty range when the window holds none. */
export function renderedStopRange(
  range: { start: number; end: number },
  stopOfItem: ReadonlyMap<number, number>,
  stopCount: number,
): { start: number; end: number } {
  let start = stopCount;
  let end = 0;
  for (let index = range.start; index < range.end; index += 1) {
    const stop = stopOfItem.get(index);
    if (stop === undefined) continue;
    start = Math.min(start, stop);
    end = stop + 1;
  }
  return { start: Math.min(start, end), end };
}
