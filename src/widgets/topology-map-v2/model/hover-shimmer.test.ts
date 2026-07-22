import { describe, expect, it } from "vitest";

import { clampSegRatio, computeHoverShimmer } from "./hover-shimmer";

describe("clampSegRatio", () => {
  it("[0,1] 안은 그대로", () => {
    expect(clampSegRatio(0.16)).toBe(0.16);
    expect(clampSegRatio(0)).toBe(0);
    expect(clampSegRatio(1)).toBe(1);
  });

  it("음수는 0 으로 클램프", () => {
    expect(clampSegRatio(-0.5)).toBe(0);
  });

  it("1 초과는 1 로 클램프", () => {
    expect(clampSegRatio(1.4)).toBe(1);
  });
});

describe("computeHoverShimmer", () => {
  const PERIMETER = 100;
  const PERIOD = 2400;

  it("결정론 — 같은 입력은 같은 결과", () => {
    const a = computeHoverShimmer(1000, PERIOD, PERIMETER, 0.16);
    const b = computeHoverShimmer(1000, PERIOD, PERIMETER, 0.16);
    expect(a).toEqual(b);
  });

  it("seg 비율대로 dash 세그먼트/간격 길이를 낸다", () => {
    const { dash } = computeHoverShimmer(0, PERIOD, PERIMETER, 0.16);
    expect(dash[0]).toBeCloseTo(16, 6);
    expect(dash[1]).toBeCloseTo(84, 6);
  });

  it("seg=0 클램프 경계 — 세그먼트 0, 간격 = 전체 둘레", () => {
    const { dash } = computeHoverShimmer(0, PERIOD, PERIMETER, -1);
    expect(dash[0]).toBe(0);
    expect(dash[1]).toBe(PERIMETER);
  });

  it("seg=1 클램프 경계 — 세그먼트 = 전체 둘레, 간격 0", () => {
    const { dash } = computeHoverShimmer(0, PERIOD, PERIMETER, 2);
    expect(dash[0]).toBe(PERIMETER);
    expect(dash[1]).toBe(0);
  });

  it("now=0 → offset 0(위상 시작점)", () => {
    // -0*perimeter === -0 — Object.is 는 -0 !== 0 으로 보므로 toBeCloseTo 사용.
    expect(computeHoverShimmer(0, PERIOD, PERIMETER, 0.16).offset).toBeCloseTo(0, 9);
  });

  it("등속 순환 — half period 에서 정확히 절반 둘레만큼 전진", () => {
    const { offset } = computeHoverShimmer(PERIOD / 2, PERIOD, PERIMETER, 0.16);
    expect(offset).toBeCloseTo(-PERIMETER / 2, 6);
  });

  it("한 바퀴(now=period)에서 시작점으로 랩", () => {
    const { offset } = computeHoverShimmer(PERIOD, PERIOD, PERIMETER, 0.16);
    expect(offset).toBeCloseTo(0, 6);
  });

  it("여러 바퀴를 돌아도 phase 는 항상 같은 위치로 랩(결정론 순환)", () => {
    const oneLap = computeHoverShimmer(300, PERIOD, PERIMETER, 0.16);
    const threeLaps = computeHoverShimmer(300 + PERIOD * 3, PERIOD, PERIMETER, 0.16);
    expect(threeLaps.offset).toBeCloseTo(oneLap.offset, 6);
  });

  it("단조 진행 — period 안에서 now 증가에 따라 offset 크기(진행 거리)도 단조 증가", () => {
    const times = [0, 200, 600, 1200, 2000];
    const offsets = times.map((t) => Math.abs(computeHoverShimmer(t, PERIOD, PERIMETER, 0.16).offset));
    for (let i = 1; i < offsets.length; i += 1) {
      expect(offsets[i]).toBeGreaterThan(offsets[i - 1]);
    }
  });

  it("perimeter<=0 이면 그릴 게 없다 — dash [0,0], offset 0", () => {
    expect(computeHoverShimmer(500, PERIOD, 0, 0.16)).toEqual({ dash: [0, 0], offset: 0 });
    expect(computeHoverShimmer(500, PERIOD, -10, 0.16)).toEqual({ dash: [0, 0], offset: 0 });
  });

  it("periodMs<=0 이면 그릴 게 없다 — dash [0,0], offset 0", () => {
    expect(computeHoverShimmer(500, 0, PERIMETER, 0.16)).toEqual({ dash: [0, 0], offset: 0 });
  });
});
