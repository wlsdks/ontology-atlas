import { describe, expect, it } from "vitest";

import {
  REALM_PARALLAX_FACTOR_DEPTH2,
  REALM_PARALLAX_FACTOR_DEPTH3,
  REALM_PARALLAX_TAU_S,
  ZERO_PARALLAX,
  depthParallaxFactorForDepth,
  depthParallaxOffsetFor,
  isDepthParallaxActive,
  stepDepthParallax,
} from "./realm-depth-parallax";

describe("depthParallaxFactorForDepth", () => {
  it("depth≤1 은 시차 없음(0), depth2 3%, depth3+ 6%", () => {
    expect(depthParallaxFactorForDepth(0)).toBe(0);
    expect(depthParallaxFactorForDepth(1)).toBe(0);
    expect(depthParallaxFactorForDepth(2)).toBe(REALM_PARALLAX_FACTOR_DEPTH2);
    expect(depthParallaxFactorForDepth(3)).toBe(REALM_PARALLAX_FACTOR_DEPTH3);
    expect(depthParallaxFactorForDepth(8)).toBe(REALM_PARALLAX_FACTOR_DEPTH3);
  });

  it("깊을수록 더 크게 뒤처진다", () => {
    expect(depthParallaxFactorForDepth(3)).toBeGreaterThan(depthParallaxFactorForDepth(2));
  });
});

describe("stepDepthParallax", () => {
  it("factor 0 이면 항상 0 (depth≤1 밴드)", () => {
    const next = stepDepthParallax({ x: 5, y: -3 }, { x: 100, y: 100 }, 0, 1 / 60);
    // The previous offset only decays; nothing new is charged.
    expect(next.x).toBeCloseTo(5 * Math.exp(-(1 / 60) / REALM_PARALLAX_TAU_S));
    expect(next.y).toBeCloseTo(-3 * Math.exp(-(1 / 60) / REALM_PARALLAX_TAU_S));
  });

  it("카메라 델타가 있으면 factor 비례로 충전한다", () => {
    const next = stepDepthParallax(ZERO_PARALLAX, { x: 200, y: 0 }, 0.06, 1 / 60);
    expect(next.x).toBeCloseTo(0.06 * 200);
    expect(next.y).toBe(0);
  });

  it("카메라 정지(델타 0) 시 오프셋이 0 으로 지수 감쇠한다", () => {
    let off = { x: 10, y: 10 };
    for (let i = 0; i < 120; i += 1) {
      off = stepDepthParallax(off, { x: 0, y: 0 }, 0.06, 1 / 60);
    }
    // After 2 s (beyond the grace period) it is effectively 0.
    expect(Math.hypot(off.x, off.y)).toBeLessThan(0.001);
  });

  it("등속 팬은 작은 정상상태 랙으로 수렴한다 (factor·v·tau 근처)", () => {
    const dt = 1 / 60;
    const vWorldPerFrame = 30; // world movement per frame
    let off = ZERO_PARALLAX;
    for (let i = 0; i < 600; i += 1) {
      off = stepDepthParallax(off, { x: vWorldPerFrame, y: 0 }, 0.06, dt);
    }
    const velWorldPerSec = vWorldPerFrame / dt;
    const expected = 0.06 * velWorldPerSec * REALM_PARALLAX_TAU_S;
    // A discrete approximation, so passing means the same order of magnitude (±20%),
    // not an exact value.
    expect(off.x).toBeGreaterThan(expected * 0.8);
    expect(off.x).toBeLessThan(expected * 1.2);
  });

  it("tau≤0 이면 감쇠 즉시(잔여 0) — reduced-motion 안전", () => {
    const next = stepDepthParallax({ x: 9, y: 9 }, { x: 0, y: 0 }, 0.06, 1 / 60, 0);
    expect(next).toEqual({ x: 0, y: 0 });
  });

  it("결정론 — 같은 입력은 같은 출력", () => {
    const a = stepDepthParallax({ x: 1, y: 2 }, { x: 3, y: 4 }, 0.03, 1 / 60);
    const b = stepDepthParallax({ x: 1, y: 2 }, { x: 3, y: 4 }, 0.03, 1 / 60);
    expect(a).toEqual(b);
  });
});

describe("isDepthParallaxActive", () => {
  it("epsilon 이하면 비활성(수렴)", () => {
    expect(isDepthParallaxActive({ x: 0.001, y: 0.001 })).toBe(false);
    expect(isDepthParallaxActive({ x: 0.5, y: 0 })).toBe(true);
    expect(isDepthParallaxActive({ x: 0, y: -0.5 })).toBe(true);
  });
});

describe("depthParallaxOffsetFor", () => {
  const d2 = { x: 1, y: 2 };
  const d3 = { x: 3, y: 4 };

  it("depth 미상/≤1 은 0 오프셋", () => {
    expect(depthParallaxOffsetFor(undefined, d2, d3)).toEqual(ZERO_PARALLAX);
    expect(depthParallaxOffsetFor(0, d2, d3)).toEqual(ZERO_PARALLAX);
    expect(depthParallaxOffsetFor(1, d2, d3)).toEqual(ZERO_PARALLAX);
  });

  it("depth2 는 depth2 밴드, depth3+ 는 depth3 밴드", () => {
    expect(depthParallaxOffsetFor(2, d2, d3)).toBe(d2);
    expect(depthParallaxOffsetFor(3, d2, d3)).toBe(d3);
    expect(depthParallaxOffsetFor(6, d2, d3)).toBe(d3);
  });
});
