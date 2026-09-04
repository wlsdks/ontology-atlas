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
