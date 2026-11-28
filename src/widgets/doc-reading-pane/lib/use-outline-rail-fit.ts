import { useCallback, useRef, useState } from "react";

import { docColumnPxAtRoot } from "@/shared/ui/tokens/reading-measure";
import { rootFontPx } from "@/shared/ui/tokens/root-font-size";

import { resolveOutlineRailFit, type OutlineRailFit } from "./outline-rail";

/**
 * Observed on the pane itself because a docked conversation changes the pane without changing the
 * window. State holds only the fit, so a dock transition costs at most two renders.
 */
export function useOutlineRailFit(): {
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
    // A hidden probe wearing the column token follows text zoom and the wide-window measure.
    const columnProbe = document.createElement("span");
    columnProbe.setAttribute("aria-hidden", "true");
    columnProbe.dataset.atlasRootSizeProbe = "";
    columnProbe.style.cssText =
      "position:absolute;left:0;top:0;width:var(--measure-doc-column);height:1rem;visibility:hidden;pointer-events:none";
    document.body.appendChild(columnProbe);
    rootProbeRef.current = columnProbe;
    const apply = () => {
      // An unlaid-out probe (test renderer) falls back to the root-derived column.
      const rendered = columnProbe.getBoundingClientRect().width;
      const next = resolveOutlineRailFit(
        node.getBoundingClientRect().width,
        rendered > 0 ? rendered : docColumnPxAtRoot(rootFontPx()),
      );
      setFit((current) => (current === next ? current : next));
    };
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    observer.observe(columnProbe);
    observerRef.current = observer;
  }, []);

  return { paneRef, fit };
}
