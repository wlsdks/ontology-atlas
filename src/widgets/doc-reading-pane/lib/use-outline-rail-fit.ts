"use client";

import { useCallback, useRef, useState } from "react";

import { docColumnPxAtRoot } from "@/shared/ui/reading-measure";
import { rootFontPx } from "@/shared/ui/root-font-size";

import { resolveOutlineRailFit, type OutlineRailFit } from "./outline-rail";

/**
 * Room the pane can spare for the outline rail, observed on the pane itself because a docked
 * conversation changes the pane without changing the window. State holds only the verdict, so a
 * dock transition costs at most two renders.
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
      // The column is rem-derived and moves with text-only zoom, so the pane and the column are
      // read at the same moment.
      const next = resolveOutlineRailFit(
        node.getBoundingClientRect().width,
        docColumnPxAtRoot(rootFontPx()),
      );
      setFit((current) => (current === next ? current : next));
    };
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    // A hidden 1rem probe on `document.body` catches font-size changes the pane width cannot show;
    // outside React's tree and the accessibility tree.
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
