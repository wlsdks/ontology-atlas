"use client";

import { useEffect } from "react";
import { refreshIndexDependentTokens } from "@/widgets/ontology-map";

const TOP_RESERVE_VAR = "--map-safe-inset-top";

/**
 * `--map-safe-inset-top` in `app/globals.css` is fixed, but the toolbar grows when its lanes wrap,
 * and fit, culling and free-area reads trust the token. When the toolbar reaches past it, the
 * larger value is written on the root. Width-only resizes cost one comparison.
 */
export function useMapToolbarTopReserve(toolbar: HTMLElement | null): void {
  useEffect(() => {
    if (!toolbar || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    let lastKey = "";
    let frame = 0;

    const apply = () => {
      frame = 0;
      const map = toolbar.offsetParent;
      if (!map) return;
      const bottom = Math.ceil(toolbar.getBoundingClientRect().bottom - map.getBoundingClientRect().top);
      const key = `${bottom}:${window.innerHeight}`;
      if (key === lastKey) return;
      lastKey = key;
      const previous = root.style.getPropertyValue(TOP_RESERVE_VAR);
      root.style.removeProperty(TOP_RESERVE_VAR);
      const stylesheet = Number(getComputedStyle(root).getPropertyValue(TOP_RESERVE_VAR).trim());
      if (Number.isFinite(stylesheet) && bottom > stylesheet) {
        root.style.setProperty(TOP_RESERVE_VAR, String(bottom));
      }
      if (root.style.getPropertyValue(TOP_RESERVE_VAR) !== previous) refreshIndexDependentTokens(root);
    };
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(apply);
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(toolbar);
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame !== 0) window.cancelAnimationFrame(frame);
      if (root.style.getPropertyValue(TOP_RESERVE_VAR) !== "") {
        root.style.removeProperty(TOP_RESERVE_VAR);
        refreshIndexDependentTokens(root);
      }
    };
  }, [toolbar]);
}
