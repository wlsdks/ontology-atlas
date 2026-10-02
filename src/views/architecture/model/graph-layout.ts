import type { ArchitectureLayout } from '@/entities/architecture-profile';
import type { ArchitectureRoleEdge } from '@/entities/architecture-record';

/**
 * ISO 5807 shapes, derived from the declared graph (`allow_*`, `dependency_policy`), never from a
 * role's name: an end of the chain (nothing reaches it, or it reaches nothing) is a terminator,
 * every other role a process.
 */
export type GraphBoxShape = 'terminator' | 'process';

/** One role, placed. `column` is its rank left to right; `slot` is its position within it. */
interface GraphBox {
  id: string;
  column: number;
  slot: number;
  shape: GraphBoxShape;
}

interface GraphEdge {
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
 * Places roles in columns (ranks from `buildArchitectureLayout`) and picks strokes that carry what the
 * columns cannot: every permitted edge under `explicit`, only the adjacent spine under `lower-only`
 * (skips follow from the order), and all measured traffic.
 */
export function buildArchitectureGraph(
  layout: ArchitectureLayout,
  traffic: readonly ArchitectureRoleEdge[],
): ArchitectureGraph {
  const columnOf = new Map<string, number>();
  layout.rows.forEach((row, column) => {
    row.forEach((id) => columnOf.set(id, column));
  });

  const spanOf = (edge: { from: string; to: string }) =>
    Math.abs((columnOf.get(edge.to) ?? 0) - (columnOf.get(edge.from) ?? 0));

  /*
   * Under `lower-only` the adjacent spine is drawn: it is the one permitted edge the order cannot
   * restate (a chain, not a stack), and without it measured counts had no stroke. Skips mean
   * "everything to my right", which the order already carries.
   */
  const permitted: GraphEdge[] = layout.edges
    .filter((edge) => layout.policy === 'explicit' || spanOf(edge) === 1)
    .map((edge) => ({
      from: edge.from,
      to: edge.to,
      kind: 'permitted' as const,
      columnSpan: spanOf(edge),
    }));

  /* Same-role traffic crosses nothing and must not set the crossing scale; the box carries it as a count. */
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
    columnSpan: spanOf({ from: edge.fromRole, to: edge.toRole }),
  }));

  const edgeSource: ArchitectureGraph['edgeSource'] =
    permitted.length > 0 && measured.length > 0
      ? 'both'
      : permitted.length > 0
        ? 'permitted'
        : measured.length > 0
          ? 'traffic'
          : 'none';

  /* Shape comes from the declared graph: under `lower-only` the drawn set would make every box a terminator. */
  const declaredIn = new Set(layout.edges.map((edge) => edge.to));
  const declaredOut = new Set(layout.edges.map((edge) => edge.from));

  const drawnEdges = [...permitted, ...measured];
  return {
    boxes: assignSlots(layout.rows, drawnEdges, (id) =>
      declaredIn.has(id) && declaredOut.has(id) ? 'process' : 'terminator',
    ),
    edges: drawnEdges.sort(
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
 * Orders boxes in each column to reduce crossings: one barycentre pass, declaration order breaking
 * ties. One pass suffices for columns of one or two, and the stable tie-break keeps renders still.
 * For unique roles, O(E + V log V): incoming edges are indexed by target.
 */
function assignSlots(
  rows: readonly (readonly string[])[],
  edges: readonly GraphEdge[],
  shapeOf: (id: string) => GraphBoxShape,
): GraphBox[] {
  const boxes: GraphBox[] = [];
  const slotOf = new Map<string, number>();
  const incomingByTarget = new Map<string, string[]>();
  for (const edge of edges) {
    const predecessors = incomingByTarget.get(edge.to) ?? [];
    predecessors.push(edge.from);
    incomingByTarget.set(edge.to, predecessors);
  }

  rows.forEach((row, column) => {
    const ordered = [...row]
      .map((id, declared) => {
        const incoming = (incomingByTarget.get(id) ?? [])
          .filter(from => slotOf.has(from))
          .map(from => slotOf.get(from) ?? 0);
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
      boxes.push({ id: entry.id, column, slot, shape: shapeOf(entry.id) });
    });
  });

  return boxes;
}
