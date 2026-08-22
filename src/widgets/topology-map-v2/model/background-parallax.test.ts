import { describe, expect, it } from "vitest";
import {
  backgroundParallaxOrigin,
  resolveBackgroundOrigin,
  resolveBackgroundParallax,
} from "./background-parallax";

const VP = { width: 1000, height: 600 };
const CENTER = { x: 500, y: 300 };

describe("backgroundParallaxOrigin", () => {
  it("계수 1 이면 세계에 용접 — 종전 동작과 완전히 같다", () => {
    const origin = { x: 320, y: 210 };
    expect(backgroundParallaxOrigin(origin, VP, 1)).toEqual(origin);
  });

  it("계수 0 이면 화면에 용접 — 뷰포트 중심에 고정", () => {
    expect(backgroundParallaxOrigin({ x: 320, y: 210 }, VP, 0)).toEqual(CENTER);
  });

  // This is the definition of parallax: the background moves **less** than the ground.
  it("0<k<1 이면 배경이 지면 이동량의 k 배만 움직인다", () => {
    const k = 0.82;
    const moved = { x: CENTER.x - 200, y: CENTER.y + 100 };
    const bg = backgroundParallaxOrigin(moved, VP, k);
    expect(bg.x).toBeCloseTo(CENTER.x - 200 * k, 6);
    expect(bg.y).toBeCloseTo(CENTER.y + 100 * k, 6);
    // The background travels a shorter distance than the ground = it is further away
    expect(Math.abs(bg.x - CENTER.x)).toBeLessThan(Math.abs(moved.x - CENTER.x));
  });

  // Applied about anything but the centre, the layers start out misaligned even at rest.
  it("카메라가 원점이면 어느 계수에서도 층이 어긋나지 않는다", () => {
    for (const k of [0, 0.5, 0.82, 1]) {
      expect(backgroundParallaxOrigin(CENTER, VP, k)).toEqual(CENTER);
    }
  });

  it("계수가 NaN 이어도 안전하게 1(용접)로 폴백한다", () => {
    const origin = { x: 320, y: 210 };
    expect(backgroundParallaxOrigin(origin, VP, Number.NaN)).toEqual(origin);
  });
});

describe("resolveBackgroundParallax", () => {
  it("성좌에서만 시차를 건다 — 도트 격자·등고선은 지면이라 1.0", () => {
    expect(resolveBackgroundParallax("web", 0.82, false)).toBe(0.82);
    expect(resolveBackgroundParallax("dot", 0.82, false)).toBe(1);
    expect(resolveBackgroundParallax("contour", 0.82, false)).toBe(1);
    expect(resolveBackgroundParallax(undefined, 0.82, false)).toBe(1);
  });

  /**
   * The heart of this contract is that reduced-motion is **1, not 0**. Vestibular
   * stimulus comes from relative motion between layers, and 1.0 removes it. At 0
   * the background welds to the screen and relative motion against the content
   * appears instead — manufacturing the thing being avoided.
   */
  it("prefers-reduced-motion 에서는 1.0 (상대 운동 제거)", () => {
    expect(resolveBackgroundParallax("web", 0.82, true)).toBe(1);
    expect(resolveBackgroundParallax("web", 0.1, true)).toBe(1);
  });

  it("1 초과는 1 로 잘린다 — 배경이 내용보다 빠르면 '가까운 층'으로 읽혀 의미가 뒤집힌다", () => {
    expect(resolveBackgroundParallax("web", 1.4, false)).toBe(1);
  });

  it("음수는 0 으로 잘린다 — 반대 방향으로 흐르면 멀미를 만든다", () => {
    expect(resolveBackgroundParallax("web", -0.3, false)).toBe(0);
  });

  it("토큰이 없거나 NaN 이면 1(종전 동작)로 폴백한다", () => {
    expect(resolveBackgroundParallax("web", Number.NaN, false)).toBe(1);
  });
});

describe("resolveBackgroundOrigin — 결정 전체를 한 함수로", () => {
  // If the caller (topology-frame-draw) wires the two functions together by hand,
  // that assembly becomes an unverified surface. Bundled into one, the only risk
  // left is whether the caller passes the result through.
  it("근접 성좌 + 각성 = 시차가 걸린 원점", () => {
    const out = resolveBackgroundOrigin({ x: 300, y: 300 }, VP, "web", 0.82, false);
    expect(out.x).toBeCloseTo(CENTER.x + (300 - CENTER.x) * 0.82, 6);
    expect(out.y).toBeCloseTo(CENTER.y + (300 - CENTER.y) * 0.82, 6);
  });

  it("도트 격자는 지면 — 원점 그대로", () => {
    const origin = { x: 300, y: 300 };
    expect(resolveBackgroundOrigin(origin, VP, "dot", 0.82, false)).toEqual(origin);
  });

  it("감속 사용자는 성좌여도 원점 그대로 (층간 상대 운동 제거)", () => {
    const origin = { x: 300, y: 300 };
    expect(resolveBackgroundOrigin(origin, VP, "web", 0.82, true)).toEqual(origin);
  });
});
