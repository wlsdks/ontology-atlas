import type { OntologyEgoSubgraph } from "./types";

interface EgoLayoutPoint {
  /** Node identifier: `ego.centerId` for the centre, `OntologyEgoNeighbor.neighborId` for a neighbour. */
  id: string;
  x: number;
  y: number;
}

interface EgoLayoutNeighborPoint extends EgoLayoutPoint {
  /** The original `OntologyEgoNeighbor.direction`; decides which way the arrow points. */
  direction: "outgoing" | "incoming";
  /** Distance from the centre: 1 = inner ring, 2 = outer ring. */
  hop: 1 | 2;
}

interface EgoLayoutEdge {
  /** The original `OntologyEgoNeighbor.edge.id`, separating distinct edges between the same pair. */
  edgeId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  direction: "outgoing" | "incoming";
  /** Which hop's neighbour this edge joins; the UI branches colour and width on it. */
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
 * Concentric radial layout for an ego subgraph — 1-hop inner ring, 2-hop outer ring.
 *
 * Policy:
 * - With only 1-hop neighbours the result matches the previous single-ring radial
 *   behaviour: an `hops=1` call simply leaves the outer ring empty.
 * - Inner ring radius = `outerRadius * innerRadiusRatio` (default 0.55).
 * - Outer ring radius = `outerRadius` (inferred, or `options.radius`).
 * - Both rings are spaced evenly clockwise from 12 o'clock, in input order within
 *   the ring.
 * - A hop=2 edge runs from the `viaNeighborId` pivot (a 1-hop node) to the far
 *   2-hop node rather than from the centre, preserving the real graph structure.
 *   When the pivot cannot be found it falls back to the centre — build-ego makes
 *   this practically unreachable.
 *
 * A 1-hop graph is usually under 12 nodes, so radial placement suffices without a
 * force layout; separating inner and outer rings mitigates label collisions as the
 * 2-hop set grows.
 *
 * Default radius is `min(width, height) / 2 - padding (28px)`, the safety margin that
 * keeps labels inside the viewBox.
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

  // Split by hop and space each ring evenly; within a ring the order is the input
  // order (build-ego sorts hop=1 outgoing → hop=1 incoming → hop=2).
  const hop1 = ego.neighbors.filter((n) => n.hop === 1);
  const hop2 = ego.neighbors.filter((n) => n.hop === 2);

  // With no 2-hop neighbours, inner = outer, i.e. a single ring, matching the
  // previous behaviour. The inner ring only shrinks once there is an outer one.
  const innerRadius = hop2.length === 0
    ? outerRadius
    : outerRadius * innerRadiusRatio;

  const startAngle = -Math.PI / 2; // 12 o'clock: standard sin/cos rotated −90°

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
      // A neighborId appearing twice (a bidirectional edge) keeps its first
      // position, so both edges share the same coordinates.
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
      // hop=2 runs pivot (the 1-hop node) → far (the 2-hop node).
      const pivot = n.viaNeighborId
        ? positionByNeighborId.get(n.viaNeighborId)
        : undefined;
      const fromXY = pivot
        ? { x: pivot.x, y: pivot.y }
        : { x: cx, y: cy }; // Fallback; practically unreachable.
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
    // hop=1 runs centre ↔ neighbour.
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
