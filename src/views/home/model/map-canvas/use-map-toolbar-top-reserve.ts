"use client";

import { useEffect } from "react";
import { refreshIndexDependentTokens } from "@/widgets/ontology-map";

const TOP_RESERVE_VAR = "--map-safe-inset-top";
const RAIL_TOP_VAR = "--topology-floating-control-desktop-top";

/** Keep map fits and the utility rail below a wrapping toolbar, including its status chip. */
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
      root.style.removeProperty(RAIL_TOP_VAR);
      const railTop = Number.parseFloat(getComputedStyle(root).getPropertyValue(RAIL_TOP_VAR));
      if (Number.isFinite(railTop) && bottom + 8 > railTop) {
        root.style.setProperty(RAIL_TOP_VAR, `${bottom + 8}px`);
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
      root.style.removeProperty(RAIL_TOP_VAR);
      if (root.style.getPropertyValue(TOP_RESERVE_VAR) !== "") {
        root.style.removeProperty(TOP_RESERVE_VAR);
        refreshIndexDependentTokens(root);
      }
    };
  }, [toolbar]);
}
