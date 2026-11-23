"use client";

import { type RefObject, useLayoutEffect, useState } from "react";

import { readerPlacement, type ReaderPlacement } from "@/widgets/code-reader";

/** The space between the reader and the concept panel. */
export const READER_GAP_PX = 12;
/** Below this the panel is a bottom sheet, so the reader takes its place at the sheet's width. */
const SIDE_PANEL_MIN_WINDOW_PX = 1024;
const MAP_SLOT_SELECTOR = '[data-testid="topology-map-surface"]';

function measure(positioner: HTMLElement, panelWidthPx: number): ReaderPlacement | null {
  const slot = positioner.ownerDocument.querySelector<HTMLElement>(MAP_SLOT_SELECTOR);
  if (!slot) return null;
  if (window.innerWidth < SIDE_PANEL_MIN_WINDOW_PX) return { mode: "replace", widthPx: Math.round(panelWidthPx) };
  const slotBox = slot.getBoundingClientRect();
  const rightInset = Math.max(0, slotBox.right - positioner.getBoundingClientRect().right);
  return readerPlacement(slotBox.width, rightInset + panelWidthPx + READER_GAP_PX, rightInset);
}

/**
 * Where the reader stands, by the width of the map's slot rather than the window: measured when
 * it opens and again when the slot resizes, never while it is closed.
 */
export function useCodeReaderPlacement(
  active: boolean,
  positionerRef: RefObject<HTMLElement | null>,
  panelWidthPx: () => number,
): ReaderPlacement | null {
  const [placement, setPlacement] = useState<ReaderPlacement | null>(null);
  useLayoutEffect(() => {
    const positioner = positionerRef.current;
    if (!active || !positioner) return;
    const update = () => {
      const next = measure(positioner, panelWidthPx());
      setPlacement((previous) =>
        previous && next && previous.mode === next.mode && previous.widthPx === next.widthPx ? previous : next,
      );
    };
    update();
    const slot = positioner.ownerDocument.querySelector(MAP_SLOT_SELECTOR);
    if (!slot || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(slot);
    return () => observer.disconnect();
  }, [active, positionerRef, panelWidthPx]);
  return placement;
}
