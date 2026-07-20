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
      control: { x: 300, y: 100 }, // 위로 휜 활
    };
    // 베지어 t=0.5 지점 = (300, 200) — 직선(현) 위가 아니다
    expect(hitTestEdges([bowed], 300, 200, 6)?.sourceId).toBe("bow-a");
    // 현(y=300) 중앙은 곡선에서 멀다 — 잡히면 직선 근사를 하고 있다는 뜻
    expect(hitTestEdges([bowed], 300, 296, 6)).toBeNull();
  });

  it("AABB 밖 후보는 스킵돼도 결과가 같다 (프리패스 무손실)", () => {
    const many = Array.from({ length: 400 }, (_, i) => straight(`e${i}`, 1000 + i * 10));
    many.push(straight("target", 200));
    expect(hitTestEdges(many, 300, 203, 8)?.sourceId).toBe("target-a");
  });
});
