import { describe, expect, it } from "vitest";

import { clampSegRatio, computeHoverShimmer } from "./hover-shimmer";

describe("clampSegRatio", () => {
  it("keeps values inside [0,1]", () => {
    expect(clampSegRatio(0.16)).toBe(0.16);
    expect(clampSegRatio(0)).toBe(0);
    expect(clampSegRatio(1)).toBe(1);
  });

  it("clamps negatives to 0", () => {
    expect(clampSegRatio(-0.5)).toBe(0);
  });

  it("clamps values above 1 to 1", () => {
    expect(clampSegRatio(1.4)).toBe(1);
  });
});

describe("computeHoverShimmer", () => {
  const PERIMETER = 100;
  const PERIOD = 2400;

  it("is deterministic: the same input gives the same result", () => {
    const a = computeHoverShimmer(1000, PERIOD, PERIMETER, 0.16);
    const b = computeHoverShimmer(1000, PERIOD, PERIMETER, 0.16);
    expect(a).toEqual(b);
  });

  it("yields dash segment and gap lengths in the seg ratio", () => {
    const { dash } = computeHoverShimmer(0, PERIOD, PERIMETER, 0.16);
    expect(dash[0]).toBeCloseTo(16, 6);
    expect(dash[1]).toBeCloseTo(84, 6);
  });

  it("at the seg=0 clamp edge, the segment is 0 and the gap the whole perimeter", () => {
    const { dash } = computeHoverShimmer(0, PERIOD, PERIMETER, -1);
    expect(dash[0]).toBe(0);
    expect(dash[1]).toBe(PERIMETER);
  });

  it("at the seg=1 clamp edge, the segment is the whole perimeter and the gap 0", () => {
    const { dash } = computeHoverShimmer(0, PERIOD, PERIMETER, 2);
    expect(dash[0]).toBe(PERIMETER);
    expect(dash[1]).toBe(0);
  });

  it("now=0 gives offset 0 (phase start)", () => {
    // -0 * perimeter is -0, which Object.is tells apart from 0.
    expect(computeHoverShimmer(0, PERIOD, PERIMETER, 0.16).offset).toBeCloseTo(0, 9);
  });

  it("cycles at constant speed, advancing exactly half the perimeter at half period", () => {
    const { offset } = computeHoverShimmer(PERIOD / 2, PERIOD, PERIMETER, 0.16);
    expect(offset).toBeCloseTo(-PERIMETER / 2, 6);
  });

  it("wraps to the start after one period (now=period)", () => {
    const { offset } = computeHoverShimmer(PERIOD, PERIOD, PERIMETER, 0.16);
    expect(offset).toBeCloseTo(0, 6);
  });

  it("wraps phase to the same position after many periods (deterministic cycle)", () => {
    const oneLap = computeHoverShimmer(300, PERIOD, PERIMETER, 0.16);
    const threeLaps = computeHoverShimmer(300 + PERIOD * 3, PERIOD, PERIMETER, 0.16);
    expect(threeLaps.offset).toBeCloseTo(oneLap.offset, 6);
  });

  it("grows the offset magnitude (distance travelled) monotonically with now within a period", () => {
    const times = [0, 200, 600, 1200, 2000];
    const offsets = times.map((t) => Math.abs(computeHoverShimmer(t, PERIOD, PERIMETER, 0.16).offset));
    for (let i = 1; i < offsets.length; i += 1) {
      expect(offsets[i]).toBeGreaterThan(offsets[i - 1]);
    }
  });

  it("draws nothing for perimeter <= 0: dash [0,0], offset 0", () => {
    expect(computeHoverShimmer(500, PERIOD, 0, 0.16)).toEqual({ dash: [0, 0], offset: 0 });
    expect(computeHoverShimmer(500, PERIOD, -10, 0.16)).toEqual({ dash: [0, 0], offset: 0 });
  });

  it("draws nothing for periodMs <= 0: dash [0,0], offset 0", () => {
    expect(computeHoverShimmer(500, 0, PERIMETER, 0.16)).toEqual({ dash: [0, 0], offset: 0 });
  });
});
