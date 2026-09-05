"use client";

import { useCallback, useRef, useState } from "react";

import { resolveOutlineRailFit, type OutlineRailFit } from "./outline-rail";

/**
 * How much room the reading pane can spare for the outline rail, measured on the pane
 * itself.
 *
 * **Why a `ResizeObserver` and not a media query.** The quantity that decides whether a
 * rail drawn in the right-hand margin touches the text is the width of the box that
 * holds the text. A media query can only see the window, and the two stop agreeing the
 * moment anything else in the row changes width — which is exactly what a docked agent
 * conversation does. `lib/outline-rail.ts` records the measurement that caught it.
 *
 * **Why the state only ever holds one of three words.** The observer fires on every
 * frame of the dock's width transition; storing the pixel width would re-render the
 * whole reading pane a hundred times for a question with three answers. The verdict is
 * computed on each callback and written only when it changes, so the transition costs
 * at most two renders.
 */
export function useOutlineRailFit(): {
  /** Attach to the box the body actually lives in. */
  paneRef: (node: HTMLElement | null) => void;
  fit: OutlineRailFit;
} {
  const [fit, setFit] = useState<OutlineRailFit>("hidden");
  const observerRef = useRef<ResizeObserver | null>(null);

  const paneRef = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    const apply = () => {
      const next = resolveOutlineRailFit(node.getBoundingClientRect().width);
      setFit((current) => (current === next ? current : next));
    };
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  return { paneRef, fit };
}
