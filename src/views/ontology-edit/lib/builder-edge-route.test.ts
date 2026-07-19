import { describe, expect, it } from "vitest";
import { Position } from "@xyflow/react";
import {
  buildBuilderBezierPath,
  edgeTangentStrength,
  parallelEndpointShift,
  unorderedPairKey,
  MAX_EDGE_TANGENT,
  MIN_EDGE_TANGENT,
  PARALLEL_EDGE_GAP,
} from "./builder-edge-route";

describe("edgeTangentStrength", () => {
  it("never drops below the minimum tangent for near-adjacent nodes", () => {
    // 아주 작은 Δ — 하한이 지배해 뻣뻣함 방지.
    expect(edgeTangentStrength(10, 10)).toBe(MIN_EDGE_TANGENT);
  });

  it("grows the tangent with vertical offset (the fan lever)", () => {
    // |Δy| 가 커질수록 접선이 커져 멀리 가는 선이 더 부푼다 = 부채꼴.
    const near = edgeTangentStrength(0, 120);
    const far = edgeTangentStrength(0, 400);
    expect(far).toBeGreaterThan(near);
  });

  it("grows the tangent with horizontal separation", () => {
    expect(edgeTangentStrength(400, 0)).toBeGreaterThan(edgeTangentStrength(120, 0));
  });

  it("caps the tangent so far pairs don't balloon off-screen", () => {
    expect(edgeTangentStrength(0, 5000)).toBe(MAX_EDGE_TANGENT);
  });

  it("puffs relation edges a touch more than containment for the same delta", () => {
    // 관계선은 카드 옆으로 확실히 감아 나가도록 접선을 살짝 더 키운다.
    expect(edgeTangentStrength(0, 400, "relation")).toBeGreaterThan(
      edgeTangentStrength(0, 400, "containment"),
    );
  });
});

describe("buildBuilderBezierPath", () => {
  it("extends control points along the port normal (right→left facing ports)", () => {
    const { path } = buildBuilderBezierPath(
      {
        sourceX: 0,
        sourceY: 0,
        sourcePosition: Position.Right,
        targetX: 200,
        targetY: 100,
        targetPosition: Position.Left,
      },
      50,
    );
    // source 는 오른쪽으로 +50, target 은 왼쪽에서 -50 (200-50=150) 에서 접근.
    expect(path).toBe("M0,0 C50,0 150,100 200,100");
  });

  it("extends control points vertically for top/bottom ports", () => {
    const { path } = buildBuilderBezierPath(
      {
        sourceX: 0,
        sourceY: 0,
        sourcePosition: Position.Bottom,
        targetX: 0,
        targetY: 200,
        targetPosition: Position.Top,
      },
      40,
    );
    expect(path).toBe("M0,0 C0,40 0,160 0,200");
  });

  it("returns the cubic midpoint (t=0.5) as the label anchor", () => {
    const { labelX, labelY } = buildBuilderBezierPath(
      {
        sourceX: 0,
        sourceY: 0,
        sourcePosition: Position.Right,
        targetX: 200,
        targetY: 0,
        targetPosition: Position.Left,
      },
      50,
    );
    // 대칭 수평 케이스 → 중점은 정확히 (100, 0).
    expect(labelX).toBeCloseTo(100);
    expect(labelY).toBeCloseTo(0);
  });

  it("same-side ports (right→right) bow both controls outward for a clean arc", () => {
    // 관계선 세로 스택 케이스 — 두 제어점 모두 오른쪽으로 뻗어 카드 옆을 감는 호.
    const { path } = buildBuilderBezierPath(
      {
        sourceX: 0,
        sourceY: 0,
        sourcePosition: Position.Right,
        targetX: 0,
        targetY: 240,
        targetPosition: Position.Right,
      },
      120,
    );
    expect(path).toBe("M0,0 C120,0 120,240 0,240");
  });
});

describe("parallelEndpointShift", () => {
  const base = { sourceX: 0, sourceY: 0, targetX: 100, targetY: 0 };

  it("leaves a lone edge untouched", () => {
    expect(parallelEndpointShift(base, 0, 1)).toEqual(base);
  });

  it("splits two overlapping edges symmetrically along the normal", () => {
    // 수평 연결(법선 = 세로) → 두 엣지가 위/아래로 gap/2 씩 갈린다.
    const a = parallelEndpointShift(base, 0, 2);
    const b = parallelEndpointShift(base, 1, 2);
    expect(a.sourceY).toBeCloseTo(-PARALLEL_EDGE_GAP / 2);
    expect(a.targetY).toBeCloseTo(-PARALLEL_EDGE_GAP / 2);
    expect(b.sourceY).toBeCloseTo(PARALLEL_EDGE_GAP / 2);
    expect(b.targetY).toBeCloseTo(PARALLEL_EDGE_GAP / 2);
    // x 는 보존 — 통째로 옆으로 평행 이동.
    expect(a.sourceX).toBeCloseTo(0);
    expect(a.targetX).toBeCloseTo(100);
  });

  it("keeps the middle of three edges on the original line", () => {
    const mid = parallelEndpointShift(base, 1, 3);
    expect(mid.sourceY).toBeCloseTo(0);
    expect(mid.targetY).toBeCloseTo(0);
  });

  it("returns identical points when source and target coincide", () => {
    const degenerate = { sourceX: 5, sourceY: 5, targetX: 5, targetY: 5 };
    expect(parallelEndpointShift(degenerate, 0, 2)).toEqual(degenerate);
  });
});

describe("unorderedPairKey", () => {
  it("is direction-agnostic so A->B and B->A group together", () => {
    expect(unorderedPairKey("capabilities/a", "elements/b")).toBe(
      unorderedPairKey("elements/b", "capabilities/a"),
    );
  });
});
