import { describe, expect, it } from "vitest";

import { bezierPoint, computeBowControlPoint, computeDependsBowControlPoint, draw, type Point, type TraceDrawState } from "./traces";

describe("computeBowControlPoint", () => {
  it("never bows further than maxBow*blend from the segment midpoint", () => {
    const a: Point = { x: 0, y: 0 };
    const b: Point = { x: 500, y: 0 }; // far apart, so the raw pull vector would exceed maxBow
    const maxBow = 70;
    const blend = 0.46;

    const control = computeBowControlPoint(a, b, maxBow, blend);
    const mid: Point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const distanceFromMid = Math.hypot(control.x - mid.x, control.y - mid.y);

    expect(distanceFromMid).toBeLessThanOrEqual(maxBow * blend + 1e-6);
  });

  it("scales the bow distance by the blend factor for a short segment (well under maxBow)", () => {
    // a and b close together near the origin at different angles so the
    // "pull toward origin-facing angle" vector is short and unambiguous.
    const a: Point = { x: 10, y: 0 };
    const b: Point = { x: 0, y: 10 };
    const maxBowLarge = 1000; // effectively uncapped
    const blend = 0.5;

    const control = computeBowControlPoint(a, b, maxBowLarge, blend);
    const mid: Point = { x: 5, y: 5 };
    const distanceFromMid = Math.hypot(control.x - mid.x, control.y - mid.y);

    // Should scale down from the uncapped pull vector by exactly `blend`.
    const controlAtFullBlend = computeBowControlPoint(a, b, maxBowLarge, 1);
    const fullDistance = Math.hypot(controlAtFullBlend.x - mid.x, controlAtFullBlend.y - mid.y);
    expect(distanceFromMid).toBeCloseTo(fullDistance * blend, 4);
  });

  it("uses a different bow amount for depends (maxBow=92, blend=0.62) vs contains (70, 0.46)", () => {
    const a: Point = { x: 0, y: 0 };
    const b: Point = { x: 500, y: 0 };

    const containsControl = computeBowControlPoint(a, b, 70, 0.46);
    const dependsControl = computeBowControlPoint(a, b, 92, 0.62);
    const mid: Point = { x: 250, y: 0 };

    const containsDistance = Math.hypot(containsControl.x - mid.x, containsControl.y - mid.y);
    const dependsDistance = Math.hypot(dependsControl.x - mid.x, dependsControl.y - mid.y);

    expect(dependsDistance).toBeGreaterThan(containsDistance);
  });
});

describe("bezierPoint", () => {
  const p0: Point = { x: 0, y: 0 };
  const p1: Point = { x: 50, y: 100 };
  const p2: Point = { x: 100, y: 0 };

  it("is p0 at t=0", () => {
    const point = bezierPoint(p0, p1, p2, 0);
    expect(point.x).toBeCloseTo(0, 6);
    expect(point.y).toBeCloseTo(0, 6);
  });

  it("is p2 at t=1", () => {
    const point = bezierPoint(p0, p1, p2, 1);
    expect(point.x).toBeCloseTo(100, 6);
    expect(point.y).toBeCloseTo(0, 6);
  });

  it("matches the standard quadratic bezier formula at t=0.5", () => {
    // B(0.5) = 0.25*p0 + 0.5*p1 + 0.25*p2 = 0.25*(0,0) + 0.5*(50,100) + 0.25*(100,0)
    //        = (0,0) + (25,50) + (25,0) = (50, 50)
    const point = bezierPoint(p0, p1, p2, 0.5);
    expect(point.x).toBeCloseTo(50, 6);
    expect(point.y).toBeCloseTo(50, 6);
  });
});

/**
 * Comet-tail contract (Guardian 2026-07-20 A1/B1). The tail used to ride every
 * `depends` edge, making decoration the brightest ink on an idle canvas. It is
 * now a FOCUS signal. These tests pin that so the ambient playback can't
 * silently come back — the previous suite only covered the curve math, which
 * is why the regression window existed at all.
 */
describe("draw — comet tail is a focus signal, not ambient decoration", () => {
  const TOKENS = {
    edgeContains: "#3a3a42",
    edgeDepends: "#4c4c63",
    edgeDim: "#1a1a1f",
    indigo: "#5e6ad2",
    indigoBright: "#8b97ff",
  };

  /** Counts `arc()` calls — the tail is the only thing in `draw()` that uses them. */
  function drawAndCountTailDots(state: TraceDrawState): number {
    let arcs = 0;
    const ctx = {
      beginPath() {},
      moveTo() {},
      quadraticCurveTo() {},
      stroke() {},
      fill() {},
      setLineDash() {},
      arc() {
        arcs += 1;
      },
      strokeStyle: "",
      fillStyle: "",
      lineWidth: 0,
    } as unknown as CanvasRenderingContext2D;
    draw(ctx, state, TOKENS);
    return arcs;
  }

  const base: TraceDrawState = {
    a: { x: 0, y: 0 },
    b: { x: 100, y: 0 },
    control: { x: 50, y: 20 },
    relationType: "depends",
    egoState: "normal",
    farT: 0,
    t: 0.5,
  };

  it("draws no tail on an unfocused depends edge", () => {
    expect(drawAndCountTailDots(base)).toBe(0);
  });

  it("draws the three-dot tail once the edge is part of the ego subgraph", () => {
    expect(drawAndCountTailDots({ ...base, egoState: "ego" })).toBe(3);
  });

  it("never draws a tail on a contains edge or a dimmed one", () => {
    expect(drawAndCountTailDots({ ...base, relationType: "contains", egoState: "ego" })).toBe(0);
    expect(drawAndCountTailDots({ ...base, egoState: "dim" })).toBe(0);
  });

  it("suppresses the tail under prefers-reduced-motion", () => {
    expect(drawAndCountTailDots({ ...base, egoState: "ego", reducedMotion: true })).toBe(0);
  });
});

/** P3a — 잉크 사다리: contains 비-ego 렌더가 레벨별 stroke/width 를 탄다. */
describe("draw — containment ink ladder", () => {
  const TOKENS = {
    edgeContains: "#3a3a42",
    edgeContainsL0: "#45454e",
    edgeContainsL2: "#333339",
    edgeDepends: "#4c4c63",
    edgeDim: "#1a1a1f",
    indigo: "#5e6ad2",
    indigoBright: "#8b97ff",
  };
  function drawAndCapture(level: 0 | 1 | 2 | undefined) {
    let stroke = ""; let width = 0;
    const ctx = {
      beginPath() {}, moveTo() {}, quadraticCurveTo() {}, fill() {}, setLineDash() {}, arc() {},
      stroke() { stroke = String((this as { strokeStyle?: unknown }).strokeStyle); width = Number((this as { lineWidth?: unknown }).lineWidth); },
      strokeStyle: "", fillStyle: "", lineWidth: 0,
    } as unknown as CanvasRenderingContext2D;
    draw(ctx, {
      a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, control: { x: 50, y: 20 },
      relationType: "contains", egoState: "normal", farT: 0, t: 0, level,
    }, TOKENS);
    return { stroke, width };
  }

  it("L0 는 진하고 굵게(뼈대), L1 기본, L2 는 물러난다(잔가지)", () => {
    const l0 = drawAndCapture(0);
    const l1 = drawAndCapture(1);
    const l2 = drawAndCapture(2);
    expect(l0.stroke).toBe("#45454e");
    expect(l1.stroke).toBe("#3a3a42");
    expect(l2.stroke).toBe("#333339");
    expect(l0.width).toBeGreaterThan(l1.width);
    expect(l1.width).toBeGreaterThan(l2.width);
  });

  it("레벨 미지정(레거시 호출)은 L1 과 동일 — 무회귀", () => {
    expect(drawAndCapture(undefined)).toEqual(drawAndCapture(1));
  });
});

/** B8 — depends 활: 좌측 수직 오프셋, 상호쌍 분리. */
describe("computeDependsBowControlPoint", () => {
  it("제어점이 중점에서 진행 방향 왼쪽 법선으로 오프셋된다", () => {
    const c = computeDependsBowControlPoint({ x: 0, y: 0 }, { x: 100, y: 0 }, 92);
    expect(c.x).toBeCloseTo(50, 5);
    expect(c.y).toBeCloseTo(12, 5); // len*0.12 = 12 < maxBow, 왼쪽(+y: 화면 좌표)
  });

  it("A→B 와 B→A 가 서로 반대쪽으로 휘어 두 호로 분리된다", () => {
    const ab = computeDependsBowControlPoint({ x: 0, y: 0 }, { x: 100, y: 0 }, 92);
    const ba = computeDependsBowControlPoint({ x: 100, y: 0 }, { x: 0, y: 0 }, 92);
    expect(Math.sign(ab.y)).not.toBe(Math.sign(ba.y));
  });

  it("긴 엣지는 maxBow 로 캡된다", () => {
    const c = computeDependsBowControlPoint({ x: 0, y: 0 }, { x: 2000, y: 0 }, 92);
    expect(Math.abs(c.y)).toBeCloseTo(92, 5);
  });

  it("영길이 방어 — NaN 없이 중점 반환", () => {
    const c = computeDependsBowControlPoint({ x: 5, y: 5 }, { x: 5, y: 5 }, 92);
    expect(Number.isFinite(c.x)).toBe(true);
    expect(Number.isFinite(c.y)).toBe(true);
  });
});

/** B6 — 코너 자기유사성: 실루엣이 줌(스크린 r)과 무관하게 같은 성격. */
