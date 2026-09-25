"use client";

import { useEffect } from "react";
import { refreshIndexDependentTokens } from "@/widgets/ontology-map";

const TOP_RESERVE_VAR = "--map-safe-inset-top";

/**
 * The map's top reserve follows the toolbar's real height (2026-09-25).
 *
 * `--map-safe-inset-top` is a fixed number in `app/globals.css` (148, or 112 in a
 * window under 880px tall), and the camera fit, the label cull and the free-area
 * reads all trust it to be the band the toolbar covers. The toolbar does not know
 * that number: when its lanes took a second or third line it grew to 120 and 156
 * while the reserve stayed 112, and at 1040x720 the path chip stood over the node
 * the guided tour had lit for the reader to press.
 *
 * This measures the toolbar's bottom edge against the map and, when it reaches past
 * the stylesheet's reserve, writes the larger number on the root so every reader of
 * the token gets it; when it fits, the stylesheet value stands untouched. Only the
 * toolbar's height and the window's height can change the answer, so a width-only
 * resize (the dock's reflow transition, frame by frame) costs one comparison.
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
