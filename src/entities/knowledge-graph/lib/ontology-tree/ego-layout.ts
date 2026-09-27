import type { OntologyEgoSubgraph } from "./types";

interface EgoLayoutPoint {
  /** `ego.centerId` or `OntologyEgoNeighbor.neighborId`. */
  id: string;
  x: number;
  y: number;
}

interface EgoLayoutNeighborPoint extends EgoLayoutPoint {
  /** Decides the arrow direction. */
  direction: "outgoing" | "incoming";
  /** 1 = inner ring, 2 = outer ring. */
  hop: 1 | 2;
}

interface EgoLayoutEdge {
  /** Separates distinct edges between one pair. */
  edgeId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  direction: "outgoing" | "incoming";
  /** Styling branches on it. */
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
 * Radial ego layout: 1-hop inner ring, 2-hop outer; clockwise from 12 o'clock in input order. A
 * hop-2 edge runs from its 1-hop pivot. Default radius `min(width, height) / 2 - padding`.
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

  // Per ring, in input order (build-ego sorts hop 1 before hop 2).
  const hop1 = ego.neighbors.filter((n) => n.hop === 1);
  const hop2 = ego.neighbors.filter((n) => n.hop === 2);

  // Without an outer ring, the inner ring takes the full radius.
  const innerRadius = hop2.length === 0
    ? outerRadius
    : outerRadius * innerRadiusRatio;

  const startAngle = -Math.PI / 2; // 12 o'clock: sin/cos rotated −90°.

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
      // A bidirectional neighbor keeps its first position.
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
      // pivot → far node.
      const pivot = n.viaNeighborId
        ? positionByNeighborId.get(n.viaNeighborId)
        : undefined;
      const fromXY = pivot
        ? { x: pivot.x, y: pivot.y }
        : { x: cx, y: cy };
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
