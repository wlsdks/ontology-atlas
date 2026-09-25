import { describe, expect, it } from "vitest";
import { computeCardPlacement, resolveAnchorRect, visibleAnchorBox } from "./resolve-anchor-rect";

describe("resolveAnchorRect", () => {
  it("returns null when the testid element is absent", () => {
    document.body.innerHTML = "";
    expect(resolveAnchorRect("missing-testid")).toBeNull();
  });

  it("returns null when the element has zero size (display:none)", () => {
    document.body.innerHTML = '<div data-testid="ghost" style="display:none"></div>';
    expect(resolveAnchorRect("ghost")).toBeNull();
  });

  it("returns the rect when present with real size", () => {
    document.body.innerHTML = '<div data-testid="present"></div>';
    const el = document.querySelector('[data-testid="present"]') as HTMLElement;
    el.getBoundingClientRect = () =>
      ({ top: 10, left: 20, width: 100, height: 40, right: 120, bottom: 50 }) as DOMRect;
    expect(resolveAnchorRect("present")).toEqual({ top: 10, left: 20, width: 100, height: 40 });
  });

  it("returns null when the rect is entirely off the right edge of the viewport", () => {
    document.body.innerHTML = '<div data-testid="offscreen"></div>';
    const el = document.querySelector('[data-testid="offscreen"]') as HTMLElement;
    el.getBoundingClientRect = () =>
      ({
        top: 10,
        left: window.innerWidth + 50,
        width: 100,
        height: 40,
        right: window.innerWidth + 150,
        bottom: 50,
      }) as DOMRect;
    expect(resolveAnchorRect("offscreen")).toBeNull();
  });
});

describe("computeCardPlacement", () => {
  const viewport = { viewportWidth: 1440, viewportHeight: 900 };

  it("centers the card with no target rect (welcome step)", () => {
    const placement = computeCardPlacement({
      targetRect: null,
      cardWidth: 360,
      cardHeight: 190,
      ...viewport,
    });
    expect(placement.side).toBe("center");
    expect(placement.left).toBeCloseTo((1440 - 360) / 2, 0);
    expect(placement.top).toBeCloseTo((900 - 190) / 2, 0);
  });

  it("prefers 'below' when there is room beneath the target", () => {
    const placement = computeCardPlacement({
      targetRect: { top: 100, left: 600, width: 80, height: 80 },
      cardWidth: 360,
      cardHeight: 190,
      ...viewport,
    });
    expect(placement.side).toBe("below");
    expect(placement.top).toBeGreaterThan(100 + 80);
  });

  it("keeps the 'below' card clear of a name the target wears under itself", () => {
    const targetRect = { top: 383, left: 810, width: 79, height: 79 };
    const plain = computeCardPlacement({ targetRect, cardWidth: 360, cardHeight: 250, viewportWidth: 1512, viewportHeight: 806 });
    const withBand = computeCardPlacement({ targetRect, cardWidth: 360, cardHeight: 250, viewportWidth: 1512, viewportHeight: 806, belowGap: 40 });
    expect(plain.side).toBe("below");
    expect(withBand.side).toBe("below");
    expect(withBand.top).toBe(383 + 79 + 40);
    expect(withBand.top - plain.top).toBe(28);
  });

  it("falls back to 'above' when there is no room below", () => {
    const placement = computeCardPlacement({
      targetRect: { top: 850, left: 600, width: 80, height: 40 },
      cardWidth: 360,
      cardHeight: 190,
      ...viewport,
    });
    expect(placement.side).toBe("above");
    expect(placement.top).toBeLessThan(850);
  });

  it("falls back to 'right' when below and above both lack room (short viewport)", () => {
    const placement = computeCardPlacement({
      targetRect: { top: 20, left: 20, width: 80, height: 850 },
      cardWidth: 200,
      cardHeight: 190,
      viewportWidth: 1440,
      viewportHeight: 900,
    });
    expect(placement.side).toBe("right");
  });

  it("clamps to the viewport when nothing fits (small viewport, large card)", () => {
    const placement = computeCardPlacement({
      targetRect: { top: 300, left: 300, width: 40, height: 40 },
      cardWidth: 360,
      cardHeight: 190,
      viewportWidth: 400,
      viewportHeight: 400,
    });
    expect(placement.left).toBeGreaterThanOrEqual(16);
    expect(placement.top).toBeGreaterThanOrEqual(16);
    expect(placement.left + 360).toBeLessThanOrEqual(400 + 1); // clamp keeps mostly on-screen
  });
});

/**
 * The shared viewport test both anchor paths use. The testid path always ran it;
 * the canvas-node path (the per-frame probe in `GuidedTourOverlay`) checked only
 * for zero size, so a domain projected outside the viewport still produced a
 * "resolved" rect and the cutout was drawn off-screen (round 4, 2026-09-04).
 */
describe("visibleAnchorBox", () => {
  it("returns the box when it lies inside the viewport", () => {
    expect(visibleAnchorBox({ top: 400, left: 700, width: 48, height: 48 }, 1440, 900)).toEqual({
      top: 400,
      left: 700,
      width: 48,
      height: 48,
    });
  });

  it("returns null for a zero-size box", () => {
    expect(visibleAnchorBox({ top: 400, left: 700, width: 0, height: 0 }, 1440, 900)).toBeNull();
  });

  it("returns null when the box sits entirely past the right edge", () => {
    expect(visibleAnchorBox({ top: 400, left: 1600, width: 48, height: 48 }, 1440, 900)).toBeNull();
  });

  it("returns null when the box sits entirely past the left edge", () => {
    expect(visibleAnchorBox({ top: 400, left: -200, width: 48, height: 48 }, 1440, 900)).toBeNull();
  });

  it("returns null when the box sits entirely below the viewport", () => {
    expect(visibleAnchorBox({ top: 1200, left: 700, width: 48, height: 48 }, 1440, 900)).toBeNull();
  });

  it("returns null when the box sits entirely above the viewport", () => {
    expect(visibleAnchorBox({ top: -90, left: 700, width: 48, height: 48 }, 1440, 900)).toBeNull();
  });

  it("keeps a box that is only partly on screen, because part of the ring is still visible", () => {
    expect(visibleAnchorBox({ top: 400, left: -20, width: 48, height: 48 }, 1440, 900)).toEqual({
      top: 400,
      left: -20,
      width: 48,
      height: 48,
    });
  });
});

/**
 * **The card may not sit on the node the step asks the person to press.**
 *
 * Reported at 1200×863: the try-click card occupied x 420–780, y 307–555 with the lit node
 * inside it. `belowGap` (2026-09-19) had already lifted the card off the node's *name*; this is
 * the node itself, and the guarantee is now structural — `avoidTarget` accepts a side only when
 * the card, **after** the viewport clamp, clears the target plus its gap and name band.
 */
describe("computeCardPlacement · avoidTarget (the card clears the lit node)", () => {
  const CARD = { cardWidth: 360, cardHeight: 250, gap: 12, belowGap: 40 } as const;

  /** The card box the placement produces, in the same coordinates as the target. */
  const cardBox = (placement: { top: number; left: number }) => ({
    top: placement.top,
    left: placement.left,
    right: placement.left + CARD.cardWidth,
    bottom: placement.top + CARD.cardHeight,
  });

  const intersects = (
    card: { top: number; left: number; right: number; bottom: number },
    target: { top: number; left: number; width: number; height: number },
  ) =>
    card.left < target.left + target.width &&
    card.right > target.left &&
    card.top < target.top + target.height &&
    card.bottom > target.top;

  /** A node disc of `size` centred in the viewport — where the tour parks the project node. */
  const centredNode = (viewportWidth: number, viewportHeight: number, size = 80) => ({
    top: viewportHeight / 2 - size / 2,
    left: viewportWidth / 2 - size / 2,
    width: size,
    height: size,
  });

  for (const [viewportWidth, viewportHeight] of [
    [1200, 863],
    [1512, 982],
  ] as const) {
    it(`${viewportWidth}×${viewportHeight}: the card never overlaps a node at the viewport centre`, () => {
      const targetRect = centredNode(viewportWidth, viewportHeight);
      const placement = computeCardPlacement({ targetRect, viewportWidth, viewportHeight, avoidTarget: true, ...CARD });
      const card = cardBox(placement);
      expect(
        intersects(card, targetRect),
        `카드(${JSON.stringify(card)})가 켜진 노드(${JSON.stringify(targetRect)})를 덮는다`,
      ).toBe(false);
      // The name band under the disc stays clear too, which is what `belowGap` bought.
      expect(intersects(card, { ...targetRect, height: targetRect.height + CARD.belowGap })).toBe(false);
      // Both viewports have room to either side, and a card beside the node leaves the node and
      // its name fully readable — which is why the horizontal sides are tried first.
      expect(placement.side).toBe("right");
      expect(placement.left).toBeGreaterThanOrEqual(targetRect.left + targetRect.width + CARD.gap);
      expect(placement.left + CARD.cardWidth).toBeLessThanOrEqual(viewportWidth - 16);
    });
  }

  it("takes the roomier horizontal side when the node is off-centre", () => {
    const targetRect = { top: 400, left: 980, width: 80, height: 80 };
    const placement = computeCardPlacement({ targetRect, viewportWidth: 1200, viewportHeight: 863, avoidTarget: true, ...CARD });
    // 1200 − 16 − (1060 + 12) = 112 on the right; 968 − 16 = 952 on the left.
    expect(placement.side).toBe("left");
    expect(placement.left + CARD.cardWidth).toBeLessThanOrEqual(targetRect.left - CARD.gap);
  });

  it("drops to a vertical side when neither horizontal side can hold the card", () => {
    // A narrow window: 360 of card does not fit beside an 80px node either way.
    const targetRect = { top: 200, left: 340, width: 80, height: 80 };
    const placement = computeCardPlacement({ targetRect, viewportWidth: 760, viewportHeight: 863, avoidTarget: true, ...CARD });
    expect(placement.side).toBe("below");
    expect(placement.top).toBeGreaterThanOrEqual(targetRect.top + targetRect.height + CARD.belowGap);
    expect(intersects(cardBox(placement), targetRect)).toBe(false);
  });

  it("rejects the roomiest side when the viewport clamp would push its card back onto the node", () => {
    // Right is the roomier horizontal side (352px against 300px), so it is tried first — but 352
    // is less than the card, and the clamp would slide it back across the node's gap. Testing the
    // *unclamped* candidate is exactly where an "it fits" turns into an overlap, so the placement
    // walks on: left is narrower still, and the card lands above, the roomier vertical side.
    const targetRect = { top: 380, left: 328, width: 80, height: 80 };
    const placement = computeCardPlacement({ targetRect, viewportWidth: 788, viewportHeight: 863, avoidTarget: true, ...CARD });
    expect(placement.side).toBe("above");
    expect(intersects(cardBox(placement), targetRect)).toBe(false);
    expect(intersects(cardBox(placement), { ...targetRect, height: targetRect.height + CARD.belowGap })).toBe(false);
  });

  it("leaves a DOM anchor's placement alone — only a canvas node asks to be pressed", () => {
    const targetRect = { top: 100, left: 600, width: 80, height: 80 };
    const withoutFlag = computeCardPlacement({ targetRect, viewportWidth: 1200, viewportHeight: 863, ...CARD });
    expect(withoutFlag.side).toBe("below");
  });
});

describe("computeCardPlacement · avoidRects (the card leaves what it explains in view)", () => {
  const viewport = { viewportWidth: 1512, viewportHeight: 949 };
  const card = { cardWidth: 360, cardHeight: 205 };
  const overlaps = (
    p: { top: number; left: number },
    r: { top: number; left: number; width: number; height: number },
  ) =>
    p.left < r.left + r.width &&
    r.left < p.left + card.cardWidth &&
    p.top < r.top + r.height &&
    r.top < p.top + card.cardHeight;

  it("moves a free-floating card off the centre when the centre covers a drawn domain", () => {
    // Interaction audit, 2026-09-25: "lines are relations" centred its card on a domain.
    const domain = { top: 450, left: 660, width: 80, height: 60 };
    const placed = computeCardPlacement({ targetRect: null, ...card, ...viewport, avoidRects: [domain] });
    expect(overlaps(placed, domain)).toBe(false);
  });

  it("stays centred when nothing it explains is under the centre", () => {
    const far = { top: 20, left: 20, width: 40, height: 20 };
    const placed = computeCardPlacement({ targetRect: null, ...card, ...viewport, avoidRects: [far] });
    expect(placed).toEqual(computeCardPlacement({ targetRect: null, ...card, ...viewport }));
  });

  it("beside a panel cutout, takes the side that leaves the opened node in view", () => {
    const panel = { top: 32, left: 1128, width: 352, height: 740 };
    const node = { top: 300, left: 900, width: 90, height: 60 };
    const placed = computeCardPlacement({ targetRect: panel, ...card, ...viewport, avoidRects: [node] });
    expect(overlaps(placed, node)).toBe(false);
    expect(overlaps(placed, panel)).toBe(false);
  });
});
