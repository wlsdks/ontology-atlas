/**
 * Anchor resolution (DOM-dependent, integration in nature) plus pure card placement and
 * clamping, which `resolve-anchor-rect.test.ts` unit-tests.
 */

export interface AnchorBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * The viewport-relative box of `[data-testid="<testId>"]`, or `null` when absent, zero-size or
 * off-viewport, so `computeVisibleSteps` skips the step. `useGuidedTour` calls this during the
 * server render too, where the global `document` throws, so `typeof document` is checked first.
 */
export function resolveAnchorRect(
  testId: string,
  doc: Document | undefined = typeof document === "undefined" ? undefined : document,
): AnchorBox | null {
  if (!doc) return null;
  const el = doc.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const view = doc.defaultView;
  return visibleAnchorBox(
    { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    view?.innerWidth ?? Number.POSITIVE_INFINITY,
    view?.innerHeight ?? Number.POSITIVE_INFINITY,
  );
}

/**
 * The viewport test both anchor kinds share: real size and some part inside the viewport. The
 * canvas-node kind arrives as a per-frame projection (`use-topology-loop.ts`, read by
 * `GuidedTourOverlay`); `null` routes an off-screen node to the full-scrim fallback instead of
 * an invisible cutout. A partly visible box is kept so the cutout does not jump mid-spring.
 */
export function visibleAnchorBox(
  rect: AnchorBox,
  viewportWidth: number,
  viewportHeight: number,
): AnchorBox | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  if (
    rect.left + rect.width <= 0 ||
    rect.top + rect.height <= 0 ||
    rect.left >= viewportWidth ||
    rect.top >= viewportHeight
  ) {
    return null;
  }
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

type CardPlacementSide = "center" | "below" | "above" | "right" | "left";

export interface CardPlacementInput {
  /** `null` gives a centred card with no cutout (step 1, welcome). */
  targetRect: AnchorBox | null;
  cardWidth: number;
  cardHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  /** Defaults to 12px. */
  gap?: number;
  /** Only for the "below" side, leaving room for a name under the target. Defaults to `gap`. */
  belowGap?: number;
  /** Defaults to 16px. */
  edgeMargin?: number;
  /**
   * The card must not cover the target (set for a canvas-node anchor the copy asks to press).
   * Sides are tried roomiest-first, horizontal before vertical so the node's name stays visible,
   * and a side counts only when the card still clears the padded target after the clamp.
   */
  avoidTarget?: boolean;
  /**
   * Boxes the card may not cover, such as the map's top toolbar. A covering placement moves
   * below the box when the card still fits there (and clears the target with `avoidTarget`).
   */
  keepClear?: readonly AnchorBox[];
  /**
   * Node names and discs the step talks about. The card takes the first place in its usual
   * order that covers none, else the least-covering one; a target cutout is never covered.
   */
  avoidRects?: readonly AnchorBox[];
}

export interface CardPlacement {
  top: number;
  left: number;
  side: CardPlacementSide;
}

/**
 * Places the card beside the cutout: the first candidate that fits, in the order below, above,
 * right, left, else the clamped first. With `avoidTarget` the order is roomiest-first.
 * At most 16 candidates, each against every avoid and keep-clear box: O(16 × (avoid + keepClear)).
 */
export function computeCardPlacement(input: CardPlacementInput): CardPlacement {
  const gap = input.gap ?? 12;
  // A canvas node wears its name under the disc, outside the anchor rect, so the "below" side
  // needs a band or the card cuts the name the step asks the person to press.
  const belowGap = input.belowGap ?? gap;
  const edgeMargin = input.edgeMargin ?? 16;
  const { targetRect, cardWidth, cardHeight, viewportWidth, viewportHeight } = input;
  const avoid = input.avoidRects ?? [];
  const covered = (p: { top: number; left: number }) => {
    let area = 0;
    for (const r of avoid) {
      const w = Math.min(p.left + cardWidth, r.left + r.width) - Math.max(p.left, r.left);
      const h = Math.min(p.top + cardHeight, r.top + r.height) - Math.max(p.top, r.top);
      if (w > 0 && h > 0) area += w * h;
    }
    return area;
  };

  if (!targetRect) {
    const centred = {
      top: clamp((viewportHeight - cardHeight) / 2, edgeMargin, viewportHeight - cardHeight - edgeMargin),
      left: clamp((viewportWidth - cardWidth) / 2, edgeMargin, viewportWidth - cardWidth - edgeMargin),
      side: "center" as const,
    };
    if (avoid.length === 0 || covered(centred) === 0) return centred;
    // The centre covers what the step explains: try the middle of each edge, then the corners, and
    // keep the clearest, the centre winning ties so nothing moves without a reason.
    const top = edgeMargin;
    const bottom = Math.max(edgeMargin, viewportHeight - cardHeight - edgeMargin);
    const left = edgeMargin;
    const right = Math.max(edgeMargin, viewportWidth - cardWidth - edgeMargin);
    const spots = [
      { top: bottom, left: centred.left },
      { top, left: centred.left },
      { top: centred.top, left: right },
      { top: centred.top, left },
      { top: bottom, left: right },
      { top: bottom, left },
      { top, left: right },
      { top, left },
    ];
    let best: CardPlacement = centred;
    let bestArea = covered(centred);
    for (const spot of spots) {
      const area = covered(spot);
      if (area < bestArea) {
        best = { ...spot, side: "center" };
        bestArea = area;
        if (area === 0) break;
      }
    }
    return best;
  }

  const centerX = targetRect.left + targetRect.width / 2 - cardWidth / 2;
  const centerY = targetRect.top + targetRect.height / 2 - cardHeight / 2;

  const candidates: Array<{ side: CardPlacementSide; top: number; left: number; fits: boolean }> = [
    {
      side: "below",
      top: targetRect.top + targetRect.height + belowGap,
      left: centerX,
      fits:
        targetRect.top + targetRect.height + belowGap + cardHeight <= viewportHeight - edgeMargin,
    },
    {
      side: "above",
      top: targetRect.top - gap - cardHeight,
      left: centerX,
      fits: targetRect.top - gap - cardHeight >= edgeMargin,
    },
    {
      side: "right",
      top: centerY,
      left: targetRect.left + targetRect.width + gap,
      fits:
        targetRect.left + targetRect.width + gap + cardWidth <= viewportWidth - edgeMargin,
    },
    {
      side: "left",
      top: centerY,
      left: targetRect.left - gap - cardWidth,
      fits: targetRect.left - gap - cardWidth >= edgeMargin,
    },
  ];

  const maxTop = Math.max(edgeMargin, viewportHeight - cardHeight - edgeMargin);
  const keepClear = input.keepClear ?? [];
  const covers = (top: number, left: number, box: AnchorBox) =>
    left < box.left + box.width &&
    left + cardWidth > box.left &&
    top < box.top + box.height &&
    top + cardHeight > box.top;
  const place = (candidate: { side: CardPlacementSide; top: number; left: number }): CardPlacement => {
    let top = clamp(candidate.top, edgeMargin, maxTop);
    const left = clamp(candidate.left, edgeMargin, Math.max(edgeMargin, viewportWidth - cardWidth - edgeMargin));
    // Step below every kept-clear box the card would sit on while the window still holds it;
    // otherwise keep the placement.
    for (const box of keepClear) {
      if (!covers(top, left, box)) continue;
      const below = box.top + box.height + gap;
      if (below <= maxTop) top = below;
    }
    return { top, left, side: candidate.side };
  };

  if (avoid.length > 0 && !input.avoidTarget) {
    // Beside a DOM target: the usual order, but a side covering what the step explains yields, and
    // among fitting sides the least covered wins. Each side may slide along the target's edge so a
    // card beside a tall panel can move past the node.
    const variants = candidates.flatMap((c) =>
      c.side === "left" || c.side === "right"
        ? [
            c,
            { ...c, top: targetRect.top },
            { ...c, top: targetRect.top + targetRect.height - cardHeight },
            { ...c, top: edgeMargin },
            { ...c, top: viewportHeight - cardHeight - edgeMargin },
          ]
        : [
            c,
            { ...c, left: targetRect.left },
            { ...c, left: targetRect.left + targetRect.width - cardWidth },
          ],
    );
    const scored = variants.map((c, i) => {
      const placed = place(c);
      return { placed, fits: c.fits, area: covered(placed), i };
    });
    const pick = [...scored].sort((a, b) =>
      a.fits === b.fits ? a.area - b.area || a.i - b.i : a.fits ? -1 : 1,
    )[0];
    if (pick) return pick.placed;
  }

  if (input.avoidTarget) {
    // The target plus the gap on three sides and the name band on the fourth: the card may not
    // enter this rectangle.
    const forbidden = {
      top: targetRect.top - gap,
      left: targetRect.left - gap,
      right: targetRect.left + targetRect.width + gap,
      bottom: targetRect.top + targetRect.height + belowGap,
    };
    // Usable width or height per side once the edge inset is taken off.
    const room = {
      right: viewportWidth - edgeMargin - forbidden.right,
      left: forbidden.left - edgeMargin,
      below: viewportHeight - edgeMargin - forbidden.bottom,
      above: forbidden.top - edgeMargin,
    };
    const order: CardPlacementSide[] = [
      ...(room.right >= room.left ? ["right", "left"] : ["left", "right"]),
      ...(room.below >= room.above ? ["below", "above"] : ["above", "below"]),
    ] as CardPlacementSide[];
    for (const side of order) {
      const candidate = candidates.find((c) => c.side === side);
      if (!candidate) continue;
      const placed = place(candidate);
      const overlaps =
        placed.left < forbidden.right &&
        placed.left + cardWidth > forbidden.left &&
        placed.top < forbidden.bottom &&
        placed.top + cardHeight > forbidden.top;
      if (!overlaps) return placed;
    }
    // Nothing clears: the target outgrows every strip (a camera state, not a layout). Falling
    // through keeps the default placement; the overlay's full scrim and "open that dot" button
    // carry the step.
  }

  const chosen = candidates.find((c) => c.fits) ?? candidates[0];
  return place(chosen);
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}
