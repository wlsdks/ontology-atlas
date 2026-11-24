"use client";

import { type RefObject, useLayoutEffect, useState } from "react";

import { readerPlacement, type ReaderPlacement } from "@/widgets/code-reader";

/** The space between the reader and the concept panel. */
export const READER_GAP_PX = 12;
/** Below this the panel is a bottom sheet, so the reader takes its place at the sheet's width. */
const SIDE_PANEL_MIN_WINDOW_PX = 1024;
const MAP_SLOT_SELECTOR = '[data-testid="topology-map-surface"]';
/** An exiting list frame is `aria-hidden`; only the one that stays counts. */
const EXPANDED_LIST_SELECTOR = '[data-testid="topology-index-panel"]:not([aria-hidden="true"] *)';
/** The two conversation columns: the coding agent's dock frame and the API-key panel. */
const CONVERSATION_COLUMNS_SELECTOR = '[data-agent-dock-frame="true"], [data-testid="vault-agent-panel"]';
/** Written on the root by the home view whenever the concept list folds or opens. */
const LIST_STATE_ATTRIBUTE = "data-topology-index";

/** The width a column is moving to: its inline target, not the value mid-transition. */
function targetWidthPx(element: HTMLElement): number {
  const target = element.style.width;
  if (target.endsWith("px")) return Number.parseFloat(target);
  const resolved = Number.parseFloat(getComputedStyle(element).getPropertyValue("--agent-panel-width"));
  if (target.includes("--agent-panel-width") && Number.isFinite(resolved)) return resolved;
  return element.getBoundingClientRect().width;
}

/** A placement with the panel width it was measured against, which the slide between seats uses. */
export interface MeasuredReaderPlacement extends ReaderPlacement {
  panelWidthPx: number;
}

function measure(positioner: HTMLElement, panelWidthPx: number): MeasuredReaderPlacement | null {
  const page = positioner.ownerDocument;
  const slot = page.querySelector<HTMLElement>(MAP_SLOT_SELECTOR);
  if (!slot) return null;
  if (window.innerWidth < SIDE_PANEL_MIN_WINDOW_PX) {
    return { mode: "replace", widthPx: Math.round(panelWidthPx), makesRoom: false, panelWidthPx };
  }
  const slotBox = slot.getBoundingClientRect();
  const columns = [...page.querySelectorAll<HTMLElement>(CONVERSATION_COLUMNS_SELECTOR)];
  const conversationWidthPx = columns.reduce((sum, column) => sum + targetWidthPx(column), 0);
  const conversationNowPx = columns.reduce((sum, column) => sum + column.getBoundingClientRect().width, 0);
  const list = page.querySelector<HTMLElement>(EXPANDED_LIST_SELECTOR);
  const placement = readerPlacement({
    // The slot is the width it will have once the conversation finishes opening or closing.
    slotWidthPx: slotBox.width + conversationNowPx - conversationWidthPx,
    listReachPx: list ? Math.max(0, list.getBoundingClientRect().right - slotBox.left) : 0,
    conversationWidthPx,
    rightInsetPx: Math.max(0, slotBox.right - positioner.getBoundingClientRect().right),
    panelReachPx: panelWidthPx + READER_GAP_PX,
  });
  return { ...placement, panelWidthPx };
}

/**
 * Where the reader stands, by the map's slot rather than the window: measured when it opens and
 * again when the slot resizes or the concept list folds, never while it is closed. A placement
 * that needs the list's or the conversation's room asks for it through `needsRoom`.
 */
export function useCodeReaderPlacement(
  active: boolean,
  positionerRef: RefObject<HTMLElement | null>,
  panelWidthPx: () => number,
  needsRoom: () => void,
): MeasuredReaderPlacement | null {
  const [placement, setPlacement] = useState<MeasuredReaderPlacement | null>(null);
  useLayoutEffect(() => {
    const positioner = positionerRef.current;
    if (!active || !positioner) return;
    const update = () => {
      const next = measure(positioner, panelWidthPx());
      if (next?.makesRoom) needsRoom();
      setPlacement((previous) =>
        previous && next && previous.mode === next.mode && previous.widthPx === next.widthPx && previous.panelWidthPx === next.panelWidthPx
          ? previous
          : next,
      );
    };
    update();
    const page = positioner.ownerDocument;
    const slot = page.querySelector(MAP_SLOT_SELECTOR);
    if (!slot || typeof ResizeObserver === "undefined") return;
    const resizes = new ResizeObserver(update);
    resizes.observe(slot);
    // The concept list folding or opening changes the map's width without resizing the slot.
    const listFolds = new MutationObserver(update);
    listFolds.observe(page.documentElement, { attributeFilter: [LIST_STATE_ATTRIBUTE] });
    return () => {
      resizes.disconnect();
      listFolds.disconnect();
    };
  }, [active, positionerRef, panelWidthPx, needsRoom]);
  return placement;
}
