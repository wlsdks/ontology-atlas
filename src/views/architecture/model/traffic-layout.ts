import type { ArchitectureRoleEdge } from '@/entities/architecture-record';

/**
 * One drawable crossing. These are measurements, not rules: the bands draw what the profile
 * permits, an arc draws what the scanner observed, so every arc carries its count in words.
 */
export interface TrafficArc {
  from: string;
  to: string;
  count: number;
  /** Rows between the two ends. 1 is an adjacent floor; 0 means it never left its own. */
  rowSpan: number;
  /** 0..1 against the busiest *crossing*. Same-role traffic is always 0; see below. */
  weight: number;
  /** True when the traffic never left its role. Always permitted, never a boundary crossing. */
  sameRole: boolean;
}

/**
 * Arcs from the record's measured role edges. The busiest crossing sets the scale because
 * same-role counts are the largest and cross nothing. Edges naming a role the profile no longer
 * has are dropped: the record may predate a profile edit. Longest arcs first, so short ones paint on top.
 */
export function buildTrafficArcs(
  edges: readonly ArchitectureRoleEdge[],
  rows: readonly (readonly string[])[],
): TrafficArc[] {
  const rowOf = new Map<string, number>();
  rows.forEach((row, index) => {
    row.forEach((id) => rowOf.set(id, index));
  });

  const placed = edges.filter((edge) => rowOf.has(edge.fromRole) && rowOf.has(edge.toRole));
  const busiestCrossing = placed.reduce(
    (most, edge) => (edge.fromRole === edge.toRole ? most : Math.max(most, edge.count)),
    0,
  );

  return placed
    .map((edge) => {
      const sameRole = edge.fromRole === edge.toRole;
      return {
        from: edge.fromRole,
        to: edge.toRole,
        count: edge.count,
        rowSpan: Math.abs((rowOf.get(edge.toRole) ?? 0) - (rowOf.get(edge.fromRole) ?? 0)),
        weight: sameRole || busiestCrossing === 0 ? 0 : edge.count / busiestCrossing,
        sameRole,
      };
    })
    .sort(
      (a, b) =>
        b.rowSpan - a.rowSpan ||
        b.count - a.count ||
        a.from.localeCompare(b.from) ||
        a.to.localeCompare(b.to),
    );
}
