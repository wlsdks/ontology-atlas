import { describe, expect, it } from "vitest";

import { bezierPoint, computeBowControlPoint, computeDependsBowControlPoint, dependsTaperFactor, DEPENDS_TAPER_END, DEPENDS_TAPER_START, draw, HOVER_LIFT_WIDTH_PX, type Point, type TraceDrawState } from "./traces";

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
 * Comet-tail contract (always-on comets, restored on the owner instruction
 * "bring back the old one" — bring the old one back). The
 * prototype's ambient comet is back: EVERY non-dim `depends` edge carries the
 * three-dot tail regardless of focus (the old A1 "focus signal only" retirement
 * is reversed). ego/selected edges get a bigger, brighter tail; dimmed edges
 * never draw it; reduced-motion suppresses it entirely (so the canvas can
 * still reach a genuine idle state for those users). Design Guardian-approved —
 * `contains` edges normally never draw a tail EXCEPT the incident ego edges
 * the caller marks `containsCometEligible: true` (seed-ranked top-24 cap
 * upstream in `render/edge-fireflies.ts#selectEgoContainsComets`) — see the
 * dedicated `describe` block below.
 */
describe("draw — comet tail is an always-on depends signal", () => {
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
      lineTo() {},
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
      lineCap: "butt",
      lineJoin: "miter",
      lineDashOffset: 0,
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

  it("draws the three-dot tail on an unfocused (normal) depends edge — always-on", () => {
    expect(drawAndCountTailDots(base)).toBe(3);
  });

  it("draws the three-dot tail on an ego depends edge too", () => {
    expect(drawAndCountTailDots({ ...base, egoState: "ego" })).toBe(3);
  });

  it("draws the tail on a selected (pair-focus) depends edge", () => {
    expect(drawAndCountTailDots({ ...base, egoState: "normal", selected: true })).toBe(3);
  });

  it("never draws a tail on a contains edge or a dimmed one", () => {
    expect(drawAndCountTailDots({ ...base, relationType: "contains", egoState: "ego" })).toBe(0);
    expect(drawAndCountTailDots({ ...base, egoState: "dim" })).toBe(0);
  });

  it("suppresses the tail under prefers-reduced-motion (idle-gate contract)", () => {
    expect(drawAndCountTailDots({ ...base, egoState: "normal", reducedMotion: true })).toBe(0);
    expect(drawAndCountTailDots({ ...base, egoState: "ego", reducedMotion: true })).toBe(0);
  });
});

/**
 * Design Guardian-approved: contains edges incident to the selection (ego) carry
 * comet flow too — the same continuous phase as depends, not a one-shot. Edges
 * that fail the cap (`containsCometEligible`), non-ego edges, dim, and
 * reduced-motion all stay at 0.
 */
describe("draw — ego contains comet (Guardian E)", () => {
  const TOKENS = {
    edgeContains: "#3a3a42",
    edgeDepends: "#4c4c63",
    edgeDim: "#1a1a1f",
    indigo: "#5e6ad2",
    indigoBright: "#8b97ff",
  };

  function drawAndCountTailDots(state: TraceDrawState): number {
    let arcs = 0;
    const ctx = {
      beginPath() {},
      moveTo() {},
      lineTo() {},
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
      lineCap: "butt",
      lineJoin: "miter",
      lineDashOffset: 0,
    } as unknown as CanvasRenderingContext2D;
    draw(ctx, state, TOKENS);
    return arcs;
  }

  const base: TraceDrawState = {
    a: { x: 0, y: 0 },
    b: { x: 100, y: 0 },
    control: { x: 50, y: 20 },
    relationType: "contains",
    egoState: "ego",
    farT: 0,
    t: 0.5,
    containsCometEligible: true,
  };

  it("draws the three-dot tail on an eligible ego contains edge", () => {
    expect(drawAndCountTailDots(base)).toBe(3);
  });

  it("no tail when containsCometEligible is false/absent (cap excluded) even if ego", () => {
    expect(drawAndCountTailDots({ ...base, containsCometEligible: false })).toBe(0);
    const { containsCometEligible: _omit, ...withoutFlag } = base;
    expect(drawAndCountTailDots(withoutFlag)).toBe(0);
  });

  it("no tail when eligible but not ego (normal/dim contains never comet)", () => {
    expect(drawAndCountTailDots({ ...base, egoState: "normal" })).toBe(0);
    expect(drawAndCountTailDots({ ...base, egoState: "dim" })).toBe(0);
  });

  it("reduced-motion suppresses even an eligible ego contains comet", () => {
    expect(drawAndCountTailDots({ ...base, reducedMotion: true })).toBe(0);
  });

  it("uses the standard indigo tone (not bright) — NORMAL tail tier one step below depends ego", () => {
    let fillStyle = "";
    const ctx = {
      beginPath() {},
      moveTo() {},
      lineTo() {},
      quadraticCurveTo() {},
      stroke() {},
      fill() {
        fillStyle = String((this as { fillStyle?: unknown }).fillStyle);
      },
      setLineDash() {},
      arc() {},
      strokeStyle: "",
      fillStyle: "",
      lineWidth: 0,
      lineCap: "butt",
      lineJoin: "miter",
      lineDashOffset: 0,
    } as unknown as CanvasRenderingContext2D;
    draw(ctx, base, TOKENS);
    expect(fillStyle).toBe(TOKENS.indigo);
  });
});

/** The depends directional taper: thick at source → thin at target, monotonically decreasing. */
describe("dependsTaperFactor", () => {
  it("u=0(source) 최대, u=1(target) 최소, 단조 감소", () => {
    expect(dependsTaperFactor(0)).toBeCloseTo(DEPENDS_TAPER_START, 6);
    expect(dependsTaperFactor(1)).toBeCloseTo(DEPENDS_TAPER_END, 6);
    expect(dependsTaperFactor(0)).toBeGreaterThan(dependsTaperFactor(0.5));
    expect(dependsTaperFactor(0.5)).toBeGreaterThan(dependsTaperFactor(1));
  });
  it("범위를 벗어난 u 는 [0,1] 로 clamp", () => {
    expect(dependsTaperFactor(-3)).toBeCloseTo(DEPENDS_TAPER_START, 6);
    expect(dependsTaperFactor(9)).toBeCloseTo(DEPENDS_TAPER_END, 6);
  });
  it("source 계수 > target 계수 (방향이 굵기로 읽힘)", () => {
    expect(DEPENDS_TAPER_START).toBeGreaterThan(DEPENDS_TAPER_END);
  });
});

describe("draw — depends 방향 테이퍼", () => {
  const TOKENS = {
    edgeContains: "#3a3a42", edgeDepends: "#4c4c63", edgeDim: "#1a1a1f",
    indigo: "#5e6ad2", indigoBright: "#8b97ff",
  };
  /** Collects lineWidth per segment stroke to check the first (source) exceeds the last (target). */
  function collectSegmentWidths(state: TraceDrawState): number[] {
    const widths: number[] = [];
    const ctx = {
      beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, fill() {}, setLineDash() {}, arc() {},
      stroke() { widths.push(Number((this as { lineWidth?: unknown }).lineWidth)); },
      strokeStyle: "", fillStyle: "", lineWidth: 0, lineCap: "butt", lineJoin: "miter", lineDashOffset: 0,
    } as unknown as CanvasRenderingContext2D;
    draw(ctx, state, TOKENS);
    return widths;
  }
  it("source 세그먼트가 target 세그먼트보다 굵다", () => {
    const widths = collectSegmentWidths({
      a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, control: { x: 100, y: 30 },
      relationType: "depends", egoState: "normal", farT: 0, t: 0,
    });
    expect(widths.length).toBeGreaterThan(2);
    expect(widths[0]).toBeGreaterThan(widths[widths.length - 1]);
  });
  it("contains 는 단일 stroke — 테이퍼 없음(방향이 구조로 자명)", () => {
    const widths = collectSegmentWidths({
      a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, control: { x: 100, y: 30 },
      relationType: "contains", egoState: "normal", farT: 0, t: 0,
    });
    expect(widths.length).toBe(1);
  });
});

/** Ink ramp: the non-ego contains render takes its stroke and width per level. */
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
      beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, fill() {}, setLineDash() {}, arc() {},
      stroke() { stroke = String((this as { strokeStyle?: unknown }).strokeStyle); width = Number((this as { lineWidth?: unknown }).lineWidth); },
      strokeStyle: "", fillStyle: "", lineWidth: 0, lineCap: "butt", lineJoin: "miter", lineDashOffset: 0,
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

/** The depends bow: a left-perpendicular offset that separates a mutual pair. */
describe("computeDependsBowControlPoint", () => {
  it("제어점이 중점에서 진행 방향 왼쪽 법선으로 오프셋된다", () => {
    const c = computeDependsBowControlPoint({ x: 0, y: 0 }, { x: 100, y: 0 }, 92);
    expect(c.x).toBeCloseTo(50, 5);
    expect(c.y).toBeCloseTo(12, 5); // len*0.12 = 12 < maxBow; left is +y in screen coordinates
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

/** Corner self-similarity: the silhouette keeps the same character regardless of zoom (screen r). */

describe("hover lift — a hovered node's lines rise toward the ego ink on the ramp (2026-09-02)", () => {
  const TOKENS = {
    edgeContains: "#3a3a42",
    edgeDepends: "#4c4c63",
    edgeDim: "#1a1a1f",
    indigo: "#5e6ad2",
    indigoBright: "#8b97ff",
  };
  function drawAndRead(state: TraceDrawState): { stroke: string; width: number } {
    let stroke = "";
    let width = 0;
    const ctx: Record<string, unknown> & { strokeStyle: string; lineWidth: number } = {
      beginPath() {},
      moveTo() {},
      lineTo() {},
      quadraticCurveTo() {},
      stroke() {
        // The body stroke is the last one; halo and tails happen elsewhere.
        stroke = String(ctx.strokeStyle);
        width = ctx.lineWidth;
      },
      fill() {},
      setLineDash() {},
      arc() {},
      strokeStyle: "",
      fillStyle: "",
      lineWidth: 0,
      lineCap: "butt",
      lineJoin: "miter",
      lineDashOffset: 0,
    };
    draw(ctx as unknown as CanvasRenderingContext2D, state, TOKENS);
    return { stroke, width };
  }
  const contains: TraceDrawState = {
    a: { x: 0, y: 0 },
    b: { x: 100, y: 0 },
    control: { x: 50, y: 20 },
    relationType: "contains",
    egoState: "normal",
    farT: 0,
    t: 0.5,
    reducedMotion: true,
  };

  it("lift 0 draws the plain normal line", () => {
    const plain = drawAndRead(contains);
    const zero = drawAndRead({ ...contains, hoverLift: 0 });
    expect(zero).toEqual(plain);
  });

  it("full lift lands on the ego ink and gains the lift width", () => {
    const plain = drawAndRead(contains);
    const lifted = drawAndRead({ ...contains, hoverLift: 1 });
    // `mixHex` emits rgb() — compare channels, not spelling.
    const rgb = (c: string) => {
      const m = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
      return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    };
    expect(rgb(lifted.stroke)).toEqual(rgb(TOKENS.indigo));
    expect(lifted.width).toBeCloseTo(plain.width + HOVER_LIFT_WIDTH_PX, 6);
  });

  it("half lift sits between — the ramp, not a switch", () => {
    const plain = drawAndRead(contains);
    const half = drawAndRead({ ...contains, hoverLift: 0.5 });
    const full = drawAndRead({ ...contains, hoverLift: 1 });
    expect(half.width).toBeGreaterThan(plain.width);
    expect(half.width).toBeLessThan(full.width);
    expect(half.stroke).not.toBe(plain.stroke);
    expect(half.stroke.toLowerCase()).not.toBe(full.stroke.toLowerCase());
  });

  it("ego and dim edges ignore the lift — focus owns those inks", () => {
    const ego = drawAndRead({ ...contains, egoState: "ego" });
    expect(drawAndRead({ ...contains, egoState: "ego", hoverLift: 1 })).toEqual(ego);
    const dim = drawAndRead({ ...contains, egoState: "dim" });
    expect(drawAndRead({ ...contains, egoState: "dim", hoverLift: 1 })).toEqual(dim);
  });
});
