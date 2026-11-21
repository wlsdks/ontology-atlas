import { describe, expect, it } from "vitest";

import { domeNudgeSlidePx } from "./nudge-slide";

describe("domeNudgeSlidePx", () => {
  const freeLeftPx = 100;
  const freeRightPx = 500;

  it("does not slide a neighbourhood that already sits in the free band", () => {
    expect(domeNudgeSlidePx(300, 250, 350, freeLeftPx, freeRightPx)).toBe(0);
  });

  it("slides only as far as the neighbourhood needs to clear the band's edge", () => {
    expect(domeNudgeSlidePx(300, 250, 600, freeLeftPx, freeRightPx)).toBe(100);
  });

  it("centres a neighbourhood wider than the band", () => {
    expect(domeNudgeSlidePx(300, 150, 800, freeLeftPx, freeRightPx)).toBe(175);
  });

  it("never slides the node itself past the band's edge", () => {
    expect(domeNudgeSlidePx(150, 150, 900, freeLeftPx, freeRightPx)).toBe(50);
  });

  it("does not slide when the panels leave no free width", () => {
    expect(domeNudgeSlidePx(300, 250, 600, 400, 400)).toBe(0);
  });
});
