import { describe, expect, it } from "vitest";

import { domeFitFreeHalfSize } from "./overview-fit";

describe("domeFitFreeHalfSize", () => {
  const insets = { left: 200, right: 0, top: 0, bottom: 0 };

  it("is half the free canvas times the fill, less a disc on each side", () => {
    expect(domeFitFreeHalfSize(1000, 800, insets, 10, { domeFitFill: 0.9 })).toEqual({ halfW: 350, halfH: 350 });
  });

  it("takes a fill of zero or less as the whole free canvas", () => {
    expect(domeFitFreeHalfSize(1000, 800, insets, 10, { domeFitFill: 0 })).toEqual({ halfW: 390, halfH: 390 });
  });

  it("stays at least a pixel when the discs outgrow the canvas", () => {
    expect(domeFitFreeHalfSize(30, 30, { left: 0, right: 0, top: 0, bottom: 0 }, 40, { domeFitFill: 1 })).toEqual({ halfW: 0.5, halfH: 0.5 });
  });
});
