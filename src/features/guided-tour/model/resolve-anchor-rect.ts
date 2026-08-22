/**
 * Anchor resolution plus card placement. testid → DOMRect is DOM-dependent
 * (meaningful only in jsdom or a browser), while card placement and clamping are pure
 * functions — `resolve-anchor-rect.test.ts` unit-tests only the latter (the former is
 * integration in nature).
 */

export interface AnchorBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Finds `[data-testid="<testId>"]` and returns its viewport-relative box. Returns
 * `null` when the element is absent, has zero size (`display:none`), or is outside
 * the viewport (fully hidden) — the signal for the caller (`computeVisibleSteps`) to
 * skip that step automatically.
 *
 * SSR guard — `useGuidedTour`'s `visibleSteps` useMemo calls this on every render
 * (even while the tour is closed), and that first render runs on the server too (a
 * Next client component's initial HTML is still produced by the server). On the
 * server, called without the `doc` argument, referencing the global `document` is
 * itself a `ReferenceError` (found 2026-07-24 — a stack trace was printed to the
 * server console on the first request to every page; it was invisible on screen
 * because the client re-run after hydration overwrote it with the correct value).
 * Checking `typeof document` first drops it quietly to `null` on the server (treated
 * as an unresolved anchor).
 */
export function resolveAnchorRect(
  testId: string,
  doc: Document | undefined = typeof document === "undefined" ? undefined : document,
): AnchorBox | null {
  if (!doc) return null;
  const el = doc.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const view = doc.defaultView;
  const vw = view?.innerWidth ?? Number.POSITIVE_INFINITY;
  const vh = view?.innerHeight ?? Number.POSITIVE_INFINITY;
  if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= vw || rect.top >= vh) {
    return null;
  }
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

export type CardPlacementSide = "center" | "below" | "above" | "right" | "left";

export interface CardPlacementInput {
  /** The target rect — `null` gives a centred card with no cutout (step 1, welcome). */
  targetRect: AnchorBox | null;
  cardWidth: number;
  cardHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  /** The gap between card and target. Defaults to 12px. */
  gap?: number;
  /** The minimum margin from the viewport edge. Defaults to 16px. */
  edgeMargin?: number;
}

export interface CardPlacement {
  top: number;
  left: number;
  side: CardPlacementSide;
}

/**
 * Placement adjacent to the cutout — the first candidate that fits the viewport is
 * chosen in the order below → above → right → left, and if none fits completely the
 * first candidate (below) is clamped into the viewport.
 */
export function computeCardPlacement(input: CardPlacementInput): CardPlacement {
  const gap = input.gap ?? 12;
  const edgeMargin = input.edgeMargin ?? 16;
  const { targetRect, cardWidth, cardHeight, viewportWidth, viewportHeight } = input;

  if (!targetRect) {
    return {
      top: clamp((viewportHeight - cardHeight) / 2, edgeMargin, viewportHeight - cardHeight - edgeMargin),
      left: clamp((viewportWidth - cardWidth) / 2, edgeMargin, viewportWidth - cardWidth - edgeMargin),
      side: "center",
    };
  }

  const centerX = targetRect.left + targetRect.width / 2 - cardWidth / 2;
  const centerY = targetRect.top + targetRect.height / 2 - cardHeight / 2;

  const candidates: Array<{ side: CardPlacementSide; top: number; left: number; fits: boolean }> = [
    {
      side: "below",
      top: targetRect.top + targetRect.height + gap,
      left: centerX,
      fits:
        targetRect.top + targetRect.height + gap + cardHeight <= viewportHeight - edgeMargin,
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

  const chosen = candidates.find((c) => c.fits) ?? candidates[0];

  return {
    top: clamp(chosen.top, edgeMargin, Math.max(edgeMargin, viewportHeight - cardHeight - edgeMargin)),
    left: clamp(chosen.left, edgeMargin, Math.max(edgeMargin, viewportWidth - cardWidth - edgeMargin)),
    side: chosen.side,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}
