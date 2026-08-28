import type { ArchitectureLayout } from '@/entities/architecture-profile';
import type { ArchitectureRoleEdge } from '@/entities/architecture-record';

/** One role, placed. `column` is its rank left to right; `slot` is its position within it. */
export interface GraphBox {
  id: string;
  column: number;
  slot: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  /** `permitted` is a reviewed rule; `traffic` is an observed count. Never the same mark. */
  kind: 'permitted' | 'traffic';
  /** Traffic only: how many imports were observed on this crossing. */
  count?: number;
  /** Traffic only: 0..1 against the busiest crossing, so thickness means something. */
  weight?: number;
  /** Columns between the two ends. 1 is adjacent. */
  columnSpan: number;
}

export interface ArchitectureGraph {
  boxes: GraphBox[];
  edges: GraphEdge[];
  columns: number;
  /** What the strokes on this profile are, so the legend can say it rather than guess. */
  edgeSource: 'permitted' | 'traffic' | 'both' | 'none';
}

/**
 * Place the roles in columns and decide which relationships earn a stroke.
 *
 * ⚠️ **A stroke must carry something the columns cannot.** Three different things get confused
 * here, and only two of them may ever be drawn:
 *
 * - **Rank** is which role comes before which. It is the column position and never a line.
 * - **Permitted edges** are what may reach what. Under `lower-only` the rule is "everything to my
 *   right", so the whole set is derivable from the order: this repository's own profile has 21 of
 *   them among 7 roles, and drawing them would restate the column order twenty-one times. Under
 *   `explicit` the set *is* the information and cannot be read off the order at all, so there it
 *   is drawn in full.
 * - **Measured traffic** is how many imports actually crossed. It is derivable from nothing, so it
 *   is drawn wherever a record supplies it, under either policy.
 *
 * The same screen therefore draws different strokes for different profiles. That is the rule, not
 * an inconsistency: every line has to be able to answer "why am I here", and under `lower-only` a
 * permitted edge has no answer.
 *
 * Ranks are not recomputed. `buildArchitectureLayout` already assigns them by longest path to a
 * sink, which is the property that makes every real dependency point one way; this function turns
 * those rows into columns and does nothing else to them.
 */
export function buildArchitectureGraph(
  layout: ArchitectureLayout,
  traffic: readonly ArchitectureRoleEdge[],
): ArchitectureGraph {
  const columnOf = new Map<string, number>();
  layout.rows.forEach((row, column) => {
    row.forEach((id) => columnOf.set(id, column));
  });

  const permitted: GraphEdge[] =
    layout.policy === 'explicit'
      ? layout.edges.map((edge) => ({
          from: edge.from,
          to: edge.to,
          kind: 'permitted' as const,
          columnSpan: Math.abs((columnOf.get(edge.to) ?? 0) - (columnOf.get(edge.from) ?? 0)),
        }))
      : [];

  /*
   * Same-role traffic is excluded rather than drawn faintly. It is the largest measured number on
   * this repository and it crosses nothing, so it has no two ends to join and it must not set the
   * scale for the crossings that do. The box carries it as a count instead.
   */
  const crossings = traffic.filter(
    (edge) =>
      edge.fromRole !== edge.toRole &&
      columnOf.has(edge.fromRole) &&
      columnOf.has(edge.toRole),
  );
  const busiest = crossings.reduce((most, edge) => Math.max(most, edge.count), 0);
  const measured: GraphEdge[] = crossings.map((edge) => ({
    from: edge.fromRole,
    to: edge.toRole,
    kind: 'traffic' as const,
    count: edge.count,
    weight: busiest === 0 ? 0 : edge.count / busiest,
    columnSpan: Math.abs((columnOf.get(edge.toRole) ?? 0) - (columnOf.get(edge.fromRole) ?? 0)),
  }));

  const edgeSource: ArchitectureGraph['edgeSource'] =
    permitted.length > 0 && measured.length > 0
      ? 'both'
      : permitted.length > 0
        ? 'permitted'
        : measured.length > 0
          ? 'traffic'
          : 'none';

  return {
    boxes: assignSlots(layout.rows, [...permitted, ...measured]),
    edges: [...permitted, ...measured].sort(
      (a, b) =>
        b.columnSpan - a.columnSpan ||
        (b.count ?? 0) - (a.count ?? 0) ||
        a.from.localeCompare(b.from) ||
        a.to.localeCompare(b.to),
    ),
    columns: layout.rows.length,
    edgeSource,
  };
}

/**
 * Order the boxes inside each column so the lines between columns cross as little as possible.
 *
 * One pass of the barycentre heuristic: a box sits at the average slot of the boxes it connects
 * back to in the previous column, and declaration order breaks every tie. Dagre repeats this pass
 * until it settles, which matters at hundreds of nodes; at columns of one or two it changes
 * nothing that a second pass would improve, and a stable tie-break is what keeps the picture from
 * moving between renders.
 */
function assignSlots(
  rows: readonly (readonly string[])[],
  edges: readonly GraphEdge[],
): GraphBox[] {
  const boxes: GraphBox[] = [];
  const slotOf = new Map<string, number>();

  rows.forEach((row, column) => {
    const ordered = [...row]
      .map((id, declared) => {
        const incoming = edges
          .filter((edge) => edge.to === id && slotOf.has(edge.from))
          .map((edge) => slotOf.get(edge.from) ?? 0);
        return {
          id,
          declared,
          barycentre:
            incoming.length === 0
              ? declared
              : incoming.reduce((sum, slot) => sum + slot, 0) / incoming.length,
        };
      })
      .sort((a, b) => a.barycentre - b.barycentre || a.declared - b.declared);

    ordered.forEach((entry, slot) => {
      slotOf.set(entry.id, slot);
      boxes.push({ id: entry.id, column, slot });
    });
  });

  return boxes;
}
