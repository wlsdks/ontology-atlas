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

  // 히트테스트 역전 방지(패널3-S3) — 엣지 앵커 a/b 는 곧 끝 노드 중심이라,
  // 노드 몸통 반경 안(또는 그 곁) 클릭은 노드 소유여야 한다. 엣지가 노드
  // 중심을 관통하므로 반경 정보가 없으면 노드 정중앙/근접 클릭이 엣지로 샌다.
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
      // 노드 a(100,200) 중심에서 4px — 반경 14 안 = 노드 영역. 엣지는 이 점을
      // 관통하지만(거리 0) 노드가 소유하므로 null 이어야 한다.
      expect(hitTestEdges([withRadii("e", 200, 14)], 104, 200, 8)).toBeNull();
      // 정중앙(노드 a 중심) 클릭도 마찬가지.
      expect(hitTestEdges([withRadii("e", 200, 14)], 100, 200, 8)).toBeNull();
    });

    it("반경 정보가 없으면(구 동작) 같은 지점이 엣지로 잡힌다 — 회귀 대조군", () => {
      // aRadius/bRadius 미지정 = 하위호환. 노드 개념이 없으니 엣지선 위 점은
      // 그대로 히트 — 이 대조가 위 제외가 반경 때문임을 증명한다.
      expect(hitTestEdges([straight("e", 200)], 104, 200, 8)?.sourceId).toBe("e-a");
    });

    it("엣지 중앙(양 끝 노드에서 먼 곳)은 반경이 있어도 그대로 잡힌다", () => {
      // (300,204) — 두 노드 중심에서 200px, 반경 14 밖. 엣지선(y=200)에서 4px.
      expect(hitTestEdges([withRadii("e", 200, 14)], 300, 204, 8)?.sourceId).toBe("e-a");
    });
  });
});
