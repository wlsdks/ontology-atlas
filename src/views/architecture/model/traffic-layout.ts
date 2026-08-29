import type { ArchitectureRoleEdge } from '@/entities/architecture-record';

/**
 * One drawable crossing, with everything a renderer needs and nothing it has to compute again.
 *
 * ⚠️ **These are measurements, not rules.** The bands and the connectors between them draw what
 * the profile *permits*; an arc draws what the scanner *observed* at the moment stamped in the
 * record. A surface that lets the two read alike is lying about the status of one of them, which
 * is why the drawing carries the count in words beside every arc and why the legend names the
 * thickness as imports rather than as policy.
 */
export interface TrafficArc {
  /** Role id the imports left from. */
  from: string;
  /** Role id they arrived at. */
  to: string;
  /** How many imports were observed on this crossing. */
  count: number;
  /** Rows between the two ends. 1 is an adjacent floor; 0 means it never left its own. */
  rowSpan: number;
  /** 0..1 against the busiest *crossing*. Same-role traffic is always 0; see below. */
  weight: number;
  /** True when the traffic never left its role. Always permitted, never a boundary crossing. */
  sameRole: boolean;
}

/**
 * Turn the record's measured role edges into arcs the stage can draw.
 *
 * **Why the scale excludes same-role traffic.** On this repository the three largest counts in
 * the measurement are `widgets → widgets` (240), `features → features` (228) and `views → views`
 * (223), and none of them crosses anything: the scanner's first rule permits same-role imports
 * unconditionally. Ranking every arc against those would draw the heaviest real crossing at
 * roughly the same weight as the lightest, which is the opposite of the one thing thickness is
 * for. So the busiest *crossing* sets the scale, and same-role arcs are drawn in their own mark.
 *
 * **Why edges naming unknown roles are dropped rather than reported.** A record is a receipt from
 * a past moment; a profile edited afterwards may no longer have the role it names. That is a
 * normal state, not a defect, and the stage's honest response is to draw only what it can place.
 * The record's own `measured` stamp is what tells a reader the drawing may be behind the source.
 *
 * The result is ordered so the same data always produces the same picture, longest arcs first, so
 * a renderer painting in order lays short arcs over long ones instead of burying them.
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
