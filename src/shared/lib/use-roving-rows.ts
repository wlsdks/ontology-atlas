"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";

/**
 * **One tab stop for the whole list; the arrows walk the rows.**
 *
 * A list of four thousand rows is not four thousand tab stops. Before this, Tab moved
 * through every row, which nobody asked for, and past the rows a windowed list had
 * rendered (`useWindowedRows`) a fast Tab could leave the list before the next rows
 * arrived (measured 2026-09-19: forty presses landed on the rail; at a human 80 ms pace
 * they stayed on the fortieth row). The roving pattern the radiogroups already use
 * (`use-roving-radio-group.ts`) is the answer for lists too: one row carries `tabIndex=0`,
 * the rest `-1`; ArrowDown/Up, Home/End and PageDown/Up move the stop, and a windowed list
 * scrolls the row into its scroller first so the row exists when focus moves onto it.
 *
 * The caller puts `onKeyDown` on the list, `tabIndexOf(i)` and `onRowFocus(i)` on each
 * row, `data-row-index` on the row's focusable, and hands over the window hook's `scrollToRow`.
 */
export function useRovingRows({
  count,
  listRef,
  pageSize = 10,
  scrollToRow,
  rendered,
}: {
  count: number;
  listRef: RefObject<HTMLElement | null>;
  /** Rows a PageDown/PageUp press moves by. */
  pageSize?: number;
  /** Brings a row into the scroller before focus moves onto it; a windowed list supplies it. */
  scrollToRow?: (index: number) => void;
  /**
   * The rows a windowed list has in the DOM. When the stop has scrolled out of them, the
   * nearest rendered row carries the tab stop instead, so Shift+Tab from below the list
   * still lands in it (measured 2026-09-19: with the stop unrendered the list had none).
   */
  rendered?: { start: number; end: number };
}) {
  const [focusIndex, setFocusIndex] = useState(0);
  /** Set when a key moved the stop, so the effect knows to move focus once the row exists. */
  const wantFocusRef = useRef(false);

  const clamp = useCallback((index: number) => Math.max(0, Math.min(Math.max(0, count - 1), index)), [count]);
  /** A mirror the key handler reads, so a burst of presses moves from the latest stop. */
  const focusIndexRef = useRef(0);
  useEffect(() => {
    focusIndexRef.current = clamp(focusIndex);
  }, [clamp, focusIndex]);

  useEffect(() => {
    if (!wantFocusRef.current) return;
    const list = listRef.current;
    if (!list) return;
    const target = list.querySelector<HTMLElement>(`[data-row-index="${focusIndex}"]`);
    if (!target) return;
    wantFocusRef.current = false;
    target.focus({ preventScroll: false });
  });

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const moves: Record<string, number | "home" | "end"> = {
        ArrowDown: 1,
        ArrowUp: -1,
        PageDown: pageSize,
        PageUp: -pageSize,
        Home: "home",
        End: "end",
      };
      const move = moves[event.key];
      if (move === undefined || count === 0) return;
      // Only when a row itself has focus: a search field inside the list keeps its keys.
      const target = event.target as HTMLElement;
      if (!target.closest("[data-row-index]")) return;
      event.preventDefault();
      wantFocusRef.current = true;
      const next = move === "home" ? 0 : move === "end" ? count - 1 : clamp(focusIndexRef.current + move);
      scrollToRow?.(next);
      setFocusIndex(next);
    },
    [clamp, count, pageSize, scrollToRow],
  );

  const onRowFocus = useCallback((index: number) => setFocusIndex(index), []);
  const stop = clamp(focusIndex);
  const effectiveStop =
    rendered && rendered.end > rendered.start
      ? stop < rendered.start ? rendered.start : stop >= rendered.end ? rendered.end - 1 : stop
      : stop;
  const tabIndexOf = useCallback((index: number) => (index === effectiveStop ? 0 : -1), [effectiveStop]);

  return { focusIndex: stop, onKeyDown, onRowFocus, tabIndexOf };
}
