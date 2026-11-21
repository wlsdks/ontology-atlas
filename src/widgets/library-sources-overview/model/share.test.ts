import { describe, expect, it } from "vitest";

import { drawnSourceShare, sourceShare } from "./share";

describe("sourceShare", () => {
  it.each([
    [2, 3, 66],
    [999, 1000, 99],
    [1000, 1000, 100],
    [0, 7, 0],
    [0, 0, 0],
  ])("%i of %i is %i%%, floored and 100 only when complete", (withPage, total, percent) => {
    expect(sourceShare(withPage, total)).toEqual({ percent, underOne: false });
  });

  it("says under 1% above zero and under one percent", () => {
    expect(sourceShare(1, 1000)).toEqual({ percent: 0, underOne: true });
    expect(sourceShare(10, 1000)).toEqual({ percent: 1, underOne: false });
  });
});

describe("drawnSourceShare", () => {
  it("never draws 100% while the settled share is below it", () => {
    expect(drawnSourceShare(1, sourceShare(999, 1000)).percent).toBe(99);
    expect(drawnSourceShare(1, sourceShare(5, 5)).percent).toBe(100);
  });

  it("holds under 1% while the bar moves toward it", () => {
    expect(drawnSourceShare(0.4, sourceShare(1, 1000))).toEqual({ percent: 0, underOne: true });
  });
});
