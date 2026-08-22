import { describe, expect, it } from "vitest";

import { hitTestEdges, type EdgeHitCandidate } from "./topology-edge-hit";
import type { WorldEdge } from "./topology-world";

const edge = (id: string): WorldEdge => ({
  sourceId: `${id}-a`,
  targetId: `${id}-b`,
  kind: "contains",
  ax: 0, ay: 0, bx: 0, by: 0, controlX: 0, controlY: 0,
  t: 0,
  level: 1,
  relationType: "contains",
  declaredBySlug: null,
});

const straight = (id: string, y: number): EdgeHitCandidate => ({
  edge: edge(id),
  a: { x: 100, y },
  b: { x: 500, y },
  control: { x: 300, y },
});

describe("hitTestEdges", () => {
  it("임계 안의 가장 가까운 엣지를 고른다", () => {
    const hit = hitTestEdges([straight("far", 100), straight("near", 200)], 300, 204, 8);
    expect(hit?.sourceId).toBe("near-a");
  });

  it("임계 밖이면 null — 빈 공간 클릭이 엣지를 잡으면 안 된다", () => {
    expect(hitTestEdges([straight("e", 100)], 300, 130, 8)).toBeNull();
  });

  it("곡선(제어점 오프셋) 위의 점도 잡는다 — 직선 근사가 아니라 베지어 샘플링", () => {
    const bowed: EdgeHitCandidate = {
      edge: edge("bow"),
      a: { x: 100, y: 300 },
      b: { x: 500, y: 300 },
      control: { x: 300, y: 100 }, // A bow curving upward.
    };
    // The bezier's t=0.5 point is (300, 200) — not on the straight chord.
    expect(hitTestEdges([bowed], 300, 200, 6)?.sourceId).toBe("bow-a");
    // The chord's midpoint (y=300) is far from the curve — a hit here would mean a straight-line approximation.
    expect(hitTestEdges([bowed], 300, 296, 6)).toBeNull();
  });

  it("AABB 밖 후보는 스킵돼도 결과가 같다 (프리패스 무손실)", () => {
    const many = Array.from({ length: 400 }, (_, i) => straight(`e${i}`, 1000 + i * 10));
    many.push(straight("target", 200));
    expect(hitTestEdges(many, 300, 203, 8)?.sourceId).toBe("target-a");
  });

  // Hit-test inversion guard (panel3-S3) — the edge anchors a/b are the end nodes'
  // centres, so a click inside (or beside) a node's body radius must belong to the
  // node. The edge passes through the node's centre, so without radius information a
  // click dead centre on a node, or near it, leaks to the edge.
  describe("노드 바디 > 엣지 우선순위 (aRadius/bRadius)", () => {
    const withRadii = (id: string, y: number, r: number): EdgeHitCandidate => ({
      edge: edge(id),
      a: { x: 100, y },
      b: { x: 500, y },
      control: { x: 300, y },
      aRadius: r,
      bRadius: r,
    });

    it("끝 노드 몸통 안(정중앙 포함) 클릭은 엣지 히트에서 제외된다", () => {
      // 4px from node a's centre (100,200) — inside radius 14, so node territory. The
      // edge passes through this point (distance 0) but the node owns it, so this must be null.
      expect(hitTestEdges([withRadii("e", 200, 14)], 104, 200, 8)).toBeNull();
      // Dead centre (node a's centre) behaves the same way.
      expect(hitTestEdges([withRadii("e", 200, 14)], 100, 200, 8)).toBeNull();
    });

    it("반경 정보가 없으면(구 동작) 같은 지점이 엣지로 잡힌다 — 회귀 대조군", () => {
      // aRadius/bRadius omitted = backwards compatible. With no notion of a node, a
      // point on the edge line hits as before — this control proves the exclusion
      // above is due to the radius.
      expect(hitTestEdges([straight("e", 200)], 104, 200, 8)?.sourceId).toBe("e-a");
    });

    it("엣지 중앙(양 끝 노드에서 먼 곳)은 반경이 있어도 그대로 잡힌다", () => {
      // (300,204) — 200px from both node centres, outside radius 14, and 4px from the edge line (y=200).
      expect(hitTestEdges([withRadii("e", 200, 14)], 300, 204, 8)?.sourceId).toBe("e-a");
    });
  });
});
