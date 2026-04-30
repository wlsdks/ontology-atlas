import type { OntologyEgoSubgraph } from "./types";

export interface EgoLayoutPoint {
  /** node 식별자 — center 는 ego.centerId, neighbor 는 OntologyEgoNeighbor.neighborId. */
  id: string;
  x: number;
  y: number;
}

export interface EgoLayoutNeighborPoint extends EgoLayoutPoint {
  /** 원본 OntologyEgoNeighbor.direction. arrow 방향 결정에 사용. */
  direction: "outgoing" | "incoming";
  /** center 로부터의 거리 — 1 = inner ring, 2 = outer ring. */
  hop: 1 | 2;
}

export interface EgoLayoutEdge {
  /** 원본 OntologyEgoNeighbor.edge.id — 같은 source/target 의 다른 edge 구분. */
  edgeId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  direction: "outgoing" | "incoming";
  /** edge 가 어느 hop 의 이웃을 잇는지 — UI 가 색·두께 분기. */
  hop: 1 | 2;
}

export interface EgoLayoutResult {
  width: number;
  height: number;
  center: EgoLayoutPoint;
  neighbors: EgoLayoutNeighborPoint[];
  edges: EgoLayoutEdge[];
}

/**
 * ego subgraph 의 동심 radial layout — 1-hop inner ring, 2-hop outer ring.
 *
 * 정책:
 * - 1-hop 만 있으면 기존 1-hop radial 동작과 동일 (회귀 호환). hops=1 호출
 *   결과에서 outer ring 은 자연스럽게 비어 있어 무관.
 * - hop=1 의 inner ring 반지름 = `outerRadius * innerRadiusRatio` (기본 0.55).
 * - hop=2 의 outer ring 반지름 = `outerRadius` (= inferred 또는 options.radius).
 * - 두 ring 모두 12시 시작 시계 방향 균등 배치 (각 ring 안에서 입력 순서).
 * - hop=2 edge 는 viaNeighborId (1-hop pivot) 위치 → far (2-hop) 위치 — center
 *   와 직접 잇지 않는다 (실제 그래프 구조 보존). pivot 노드를 못 찾으면
 *   center 에서 잇는 fallback (실제로는 build-ego 가 잘 만들어 거의 안 발생).
 *
 * 1-hop 그래프는 보통 < 12 노드라 force layout 없이 radial 만으로 충분. 2-hop
 * 추가 시 노드가 더 많아져도 inner/outer 분리로 라벨 충돌 mitigation.
 *
 * radius 기본 = `min(width, height) / 2 - padding (28px)` — 라벨이 viewBox
 * 안에 들어가도록 안전 마진.
 */
export function buildRadialEgoLayout(
  ego: OntologyEgoSubgraph,
  width: number,
  height: number,
  options?: { radius?: number; padding?: number; innerRadiusRatio?: number },
): EgoLayoutResult {
  const padding = options?.padding ?? 28;
  const inferredRadius = Math.max(0, Math.min(width, height) / 2 - padding);
  const outerRadius = options?.radius ?? inferredRadius;
  const innerRadiusRatio = options?.innerRadiusRatio ?? 0.55;

  const cx = width / 2;
  const cy = height / 2;
  const center: EgoLayoutPoint = { id: ego.centerId, x: cx, y: cy };

  if (ego.neighbors.length === 0) {
    return { width, height, center, neighbors: [], edges: [] };
  }

  // hop 별로 분리해 균등 배치 — 같은 ring 안에서는 입력 순서 (build-ego 가
  // hop=1 outgoing → hop=1 incoming → hop=2 순으로 정렬해 줌).
  const hop1 = ego.neighbors.filter((n) => n.hop === 1);
  const hop2 = ego.neighbors.filter((n) => n.hop === 2);

  // 1-hop 만 있을 때는 기존 동작 호환 — inner = outer (단일 ring). 2-hop 이
  // 있을 때만 inner 축소해 동심원 분리.
  const innerRadius = hop2.length === 0
    ? outerRadius
    : outerRadius * innerRadiusRatio;

  const startAngle = -Math.PI / 2; // 12시 기준 (sin/cos 표준에 −90° 회전)

  const positionByNeighborId = new Map<string, EgoLayoutNeighborPoint>();
  const neighbors: EgoLayoutNeighborPoint[] = [];

  function placeRing(
    list: typeof ego.neighbors,
    radius: number,
    hopValue: 1 | 2,
  ) {
    if (list.length === 0) return;
    const step = (Math.PI * 2) / list.length;
    list.forEach((n, i) => {
      const theta = startAngle + step * i;
      const point: EgoLayoutNeighborPoint = {
        id: n.neighborId,
        direction: n.direction,
        hop: hopValue,
        x: cx + Math.cos(theta) * radius,
        y: cy + Math.sin(theta) * radius,
      };
      neighbors.push(point);
      // 같은 neighborId 가 두 번 나오면 (양방향 edge) 첫 위치만 보존 — edge 가
      // 두 번 그려져도 같은 좌표를 공유.
      if (!positionByNeighborId.has(n.neighborId)) {
        positionByNeighborId.set(n.neighborId, point);
      }
    });
  }

  placeRing(hop1, innerRadius, 1);
  placeRing(hop2, outerRadius, 2);

  const edges: EgoLayoutEdge[] = ego.neighbors.map((n, i) => {
    const point = neighbors[i]!;
    if (n.hop === 2) {
      // hop=2: pivot (1-hop 노드) 위치 → far (2-hop) 위치.
      const pivot = n.viaNeighborId
        ? positionByNeighborId.get(n.viaNeighborId)
        : undefined;
      const fromXY = pivot
        ? { x: pivot.x, y: pivot.y }
        : { x: cx, y: cy }; // fallback — 실제로는 거의 안 발생.
      return n.direction === "outgoing"
        ? {
            edgeId: n.edge.id,
            from: fromXY,
            to: { x: point.x, y: point.y },
            direction: "outgoing",
            hop: 2,
          }
        : {
            edgeId: n.edge.id,
            from: { x: point.x, y: point.y },
            to: fromXY,
            direction: "incoming",
            hop: 2,
          };
    }
    // hop=1: center ↔ neighbor.
    return {
      edgeId: n.edge.id,
      from:
        n.direction === "outgoing"
          ? { x: cx, y: cy }
          : { x: point.x, y: point.y },
      to:
        n.direction === "outgoing"
          ? { x: point.x, y: point.y }
          : { x: cx, y: cy },
      direction: n.direction,
      hop: 1,
    };
  });

  return { width, height, center, neighbors, edges };
}
