import { describe, expect, it } from "vitest";

import { computeOverviewFitScale, domeFitFreeHalfSize } from "./fit-targets";

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

describe("computeOverviewFitScale", () => {
  const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  const tokens = { cameraScaleMax: 10, cameraScaleMin: 0.1, cameraSmallGraphScaleMax: 2 };

  it("caps a graph of five nodes or fewer at the small-graph ceiling", () => {
    expect(computeOverviewFitScale(bounds, 1000, 800, tokens, 5)).toBe(2);
  });

  it("lets a graph of six nodes, or one of unknown size, fit up to the camera maximum", () => {
    expect(computeOverviewFitScale(bounds, 1000, 800, tokens, 6)).toBe(10);
    expect(computeOverviewFitScale(bounds, 1000, 800, tokens)).toBe(10);
  });
});
