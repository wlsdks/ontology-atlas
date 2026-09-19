/**
 * **Where a pointer-anchored card goes so that it covers nothing the map drew.**
 *
 * The edge hover card used to sit at the pointer's lower right, always. On the
 * sample map at 1512×806, hovering the catalog-to-inventory line put the card
 * squarely over the fulfillment node and its name (measured 2026-09-19): the
 * card explained one
 * relation by hiding another concept. Four corners around the pointer are
 * tried; the first that overlaps nothing wins, in a fixed order so the card
 * does not wander between renders. When every corner overlaps something, the
 * least overlap wins.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type HoverCardCorner = "bottom-right" | "bottom-left" | "top-right" | "top-left";

export interface HoverCardPlacement {
  left: number;
  top: number;
  corner: HoverCardCorner;
  /** Overlap area, in px², with what the card still covers. 0 is clear. */
  overlap: number;
}

const CORNER_ORDER: readonly HoverCardCorner[] = ["bottom-right", "bottom-left", "top-right", "top-left"];

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function cornerRect(anchor: { x: number; y: number }, size: { w: number; h: number }, offset: number, corner: HoverCardCorner): Rect {
  const right = corner === "bottom-right" || corner === "top-right";
  const bottom = corner === "bottom-right" || corner === "bottom-left";
  return {
    x: right ? anchor.x + offset : anchor.x - offset - size.w,
    y: bottom ? anchor.y + offset : anchor.y - offset - size.h,
    w: size.w,
    h: size.h,
  };
}

function clampInto(rect: Rect, bounds: Rect): Rect {
  const maxX = bounds.x + bounds.w - rect.w;
  const maxY = bounds.y + bounds.h - rect.h;
  return {
    ...rect,
    x: Math.max(bounds.x, Math.min(rect.x, maxX)),
    y: Math.max(bounds.y, Math.min(rect.y, maxY)),
  };
}

/**
 * Picks the corner of `anchor` for a card of `size` that covers the least of
 * `avoid`, keeping the card inside `bounds`. A card pushed back by the bounds
 * until it lies under the pointer counts as covering the pointer, so a corner
 * that fits without that is preferred.
 */
export function placeHoverCard(
  anchor: { x: number; y: number },
  size: { w: number; h: number },
  avoid: readonly Rect[],
  bounds: Rect,
  offset = 14,
): HoverCardPlacement {
  let best: HoverCardPlacement | null = null;
  for (const corner of CORNER_ORDER) {
    const rect = clampInto(cornerRect(anchor, size, offset, corner), bounds);
    let overlap = 0;
    for (const item of avoid) overlap += overlapArea(rect, item);
    const coversPointer =
      anchor.x >= rect.x && anchor.x <= rect.x + rect.w && anchor.y >= rect.y && anchor.y <= rect.y + rect.h;
    // Covering the pointer hides the very line being read; count it as a full card.
    const score = overlap + (coversPointer ? size.w * size.h : 0);
    if (best === null || score < best.overlap) {
      best = { left: rect.x, top: rect.y, corner, overlap: score };
      if (score === 0) break;
    }
  }
  return best!;
}
