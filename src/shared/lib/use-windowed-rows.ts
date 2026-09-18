"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * **Only the rows in view are in the DOM.**
 *
 * A list of 3,000 file rows (installed app, 2026-09-18) cost 33,000 DOM nodes and ~450 ms
 * of element creation on the rail press, and every later measurement that forced layout
 * (`scrollTop`, `scrollHeight`, a tab strip's edges) paid for the whole tree again. Skipping
 * paint for off-screen rows (`content-visibility`) changed nothing, because the cost was
 * the elements, not their pixels. So the list renders the rows that intersect the scroller
 * plus an overscan, and pads the rest with the heights it has measured or estimated.
 *
 * The scroller is the nearest ancestor that scrolls vertically; the list does not own it,
 * because in the Library the column above the list is the one scroller (a section that
 * could shrink is a section that can cut a row in half). Heights are read off the rows that
 * are rendered and remembered per index, so rows of different heights (a two-line title,
 * a folded caption) stay exact once seen; the unseen use the estimate. Without a scroller,
 * or in a box with no height (jsdom, a hidden tab), every row renders — the list degrades to
 * what it was, never to nothing.
 *
 * The caller applies `before` and `after` as the list's top and bottom padding (adding its
 * own base padding back), renders `rows.slice(start, end)`, and puts the ref on the list.
 * Returned as a pair, so the window is a value and the ref stays a ref to the lint.
 */

export interface WindowedRows {
  /** First rendered index, inclusive. */
  start: number;
  /** Last rendered index, exclusive. */
  end: number;
  /** Space, in px, standing in for the rows before `start`. */
  before: number;
  /** Space, in px, standing in for the rows from `end`. */
  after: number;
}

/**
 * The pure part: which rows a viewport sees, given every row's height (measured or
 * estimated) and the gap the list draws between rows. `viewportTop` is measured from the
 * first row's top edge.
 */
export function windowRows(
  heights: ArrayLike<number>,
  gap: number,
  viewportTop: number,
  viewportHeight: number,
  overscan: number,
): WindowedRows {
  const count = heights.length;
  if (count === 0) return { start: 0, end: 0, before: 0, after: 0 };
  let start = 0;
  let y = 0;
  while (start < count && y + heights[start] + gap <= viewportTop) {
    y += heights[start] + gap;
    start += 1;
  }
  let end = start;
  let yEnd = y;
  while (end < count && yEnd < viewportTop + viewportHeight) {
    yEnd += heights[end] + gap;
    end += 1;
  }
  start = Math.max(0, start - overscan);
  end = Math.min(count, end + overscan);
  let before = 0;
  for (let i = 0; i < start; i += 1) before += heights[i] + gap;
  let after = 0;
  for (let i = end; i < count; i += 1) after += heights[i] + gap;
  // The gap after the last rendered row is drawn by the list itself when `after` is 0.
  if (end < count) after -= gap;
  return { start, end, before, after: Math.max(0, after) };
}

function scrollParent(node: HTMLElement | null): HTMLElement | null {
  for (let el = node?.parentElement ?? null; el; el = el.parentElement) {
    const overflowY = getComputedStyle(el).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return el;
  }
  return null;
}

const EVERYTHING = (count: number): WindowedRows => ({ start: 0, end: count, before: 0, after: 0 });

function sameWindow(a: WindowedRows, b: WindowedRows): boolean {
  return a.start === b.start && a.end === b.end && a.before === b.before && a.after === b.after;
}

export function useWindowedRows({
  count,
  estimate,
  overscan = 8,
}: {
  count: number;
  /** A row's height in px before it has been measured. */
  estimate: number;
  overscan?: number;
}): [WindowedRows, RefObject<HTMLUListElement | null>] {
  const listRef = useRef<HTMLUListElement | null>(null);
  /** Every row's height, measured where it has been rendered, the estimate elsewhere. */
  const heightsRef = useRef<number[]>([]);
  /** The `before` pad the list is currently drawn with, so its own top can be found under it. */
  const appliedBeforeRef = useRef(0);
  const [range, setRange] = useState<WindowedRows>(() => EVERYTHING(count));

  const compute = useCallback(() => {
    const list = listRef.current;
    const scroller = scrollParent(list);
    if (heightsRef.current.length !== count) {
      const held = heightsRef.current;
      heightsRef.current = Array.from({ length: count }, (_, i) => held[i] ?? estimate);
    }
    let next: WindowedRows;
    if (!list || !scroller || scroller.clientHeight === 0) {
      next = EVERYTHING(count);
    } else {
      const style = getComputedStyle(list);
      const gap = Number.parseFloat(style.rowGap) || 0;
      const basePadTop = (Number.parseFloat(style.paddingTop) || 0) - appliedBeforeRef.current;
      // The first row's top in the scroller's content coordinates.
      const rowsTop = list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop + basePadTop;
      next = windowRows(heightsRef.current, gap, scroller.scrollTop - rowsTop, scroller.clientHeight, overscan);
    }
    setRange((previous) => (sameWindow(previous, next) ? previous : next));
  }, [count, estimate, overscan]);

  useLayoutEffect(() => {
    appliedBeforeRef.current = range.before;
    const list = listRef.current;
    if (!list) return;
    // Read the rendered rows' heights; a change re-runs the window so the pads stay exact.
    let changed = false;
    const rows = list.children;
    for (let i = 0; i < rows.length; i += 1) {
      const index = range.start + i;
      if (index >= count) break;
      const height = (rows[i] as HTMLElement).getBoundingClientRect().height;
      if (height > 0 && Math.abs((heightsRef.current[index] ?? estimate) - height) > 0.5) {
        heightsRef.current[index] = height;
        changed = true;
      }
    }
    if (changed) compute();
  });

  useEffect(() => {
    compute();
    const scroller = scrollParent(listRef.current);
    if (!scroller) return undefined;
    const onScroll = () => compute();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => compute());
    observer?.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    };
  }, [compute]);

  return [range, listRef];
}
