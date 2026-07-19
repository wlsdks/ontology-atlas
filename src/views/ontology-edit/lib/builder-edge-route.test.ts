import { describe, expect, it } from "vitest";
import {
  edgeCurvatureForSemanticType,
  parallelEndpointShift,
  unorderedPairKey,
  PARALLEL_EDGE_GAP,
} from "./builder-edge-route";

describe("edgeCurvatureForSemanticType", () => {
  it("puffs relation edges more than containment edges", () => {
    expect(edgeCurvatureForSemanticType("relation")).toBeGreaterThan(
      edgeCurvatureForSemanticType("containment"),
    );
  });

  it("defaults undefined to the containment curvature", () => {
    expect(edgeCurvatureForSemanticType(undefined)).toBe(
      edgeCurvatureForSemanticType("containment"),
    );
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
