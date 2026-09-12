"use client";

import { useCallback, useRef, useState } from "react";

import { DOC_BODY_FONT_PX, docColumnPxAtRoot } from "@/shared/ui/reading-measure";

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
  const rootProbeRef = useRef<HTMLElement | null>(null);

  const paneRef = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    rootProbeRef.current?.remove();
    rootProbeRef.current = null;
    if (!node) return;
    const apply = () => {
      // The column is `rem`-derived, so a browser text-only zoom moves it while the pane
      // stands still. Both sides of the comparison are therefore read at the same moment:
      // the pane from its own rect, the column from the live root size.
      const rootFontPx =
        Number.parseFloat(getComputedStyle(document.documentElement).fontSize) ||
        DOC_BODY_FONT_PX;
      const next = resolveOutlineRailFit(
        node.getBoundingClientRect().width,
        docColumnPxAtRoot(rootFontPx),
      );
      setFit((current) => (current === next ? current : next));
    };
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    // Second observed box: a `1rem` square. The pane's width does not change when a reader
    // raises the browser's font size, but the column's does — so without this the verdict
    // would keep describing the column as it was until something else happened to resize the
    // pane, which is the overlap this file's arithmetic exists to prevent. It hangs off
    // `document.body` rather than the pane so that nothing is appended inside a box React
    // reconciles, and it is `visibility: hidden` and `aria-hidden`, so it is in no
    // accessibility tree and paints nothing.
    const rootProbe = document.createElement("span");
    rootProbe.setAttribute("aria-hidden", "true");
    rootProbe.dataset.atlasRootSizeProbe = "";
    rootProbe.style.cssText =
      "position:absolute;left:0;top:0;width:1rem;height:1rem;visibility:hidden;pointer-events:none";
    document.body.appendChild(rootProbe);
    observer.observe(rootProbe);
    rootProbeRef.current = rootProbe;
    observerRef.current = observer;
  }, []);

  return { paneRef, fit };
}
