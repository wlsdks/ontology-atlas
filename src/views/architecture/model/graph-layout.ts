import type { ArchitectureLayout } from '@/entities/architecture-profile';
import type { ArchitectureRoleEdge } from '@/entities/architecture-record';

/** ISO 5807 shapes from the declared graph, never from a role's name: an end of the chain is a terminator, every other role a process. */
export type GraphBoxShape = 'terminator' | 'process';

/** One role, placed: one role per column, so no two faces ever share a place along the chain. */
interface GraphBox {
  id: string;
  column: number;
  /** Its layer. Roles the rules cannot order share a rank and stand in declaration order. */
  rank: number;
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
  /** Ranks between the two ends: 0 joins siblings, 1 neighbouring ranks, more skips a rank. */
  rankSpan: number;
  /** Runs against the chain: its target stands before its source. */
  climbs: boolean;
}

export interface ArchitectureGraph {
  boxes: GraphBox[];
  edges: GraphEdge[];
  columns: number;
  /** What the strokes on this profile are, so the legend can say it rather than guess. */
  edgeSource: 'permitted' | 'traffic' | 'both' | 'none';
  policy: ArchitectureLayout['policy'];
}

/**
 * One chain in rank order, declaration order within a rank. Strokes: every rule under `explicit`, the
 * adjacent spine under `lower-only`, and all measured traffic. O(V + E log E).
 */
export function buildArchitectureGraph(
  layout: ArchitectureLayout,
  traffic: readonly ArchitectureRoleEdge[],
): ArchitectureGraph {
  const columnOf = new Map(layout.rows.flat().map((id, column) => [id, column]));
  const runOf = (edge: { from: string; to: string }) =>
    (columnOf.get(edge.to) ?? 0) - (columnOf.get(edge.from) ?? 0);
  const spanOf = (edge: { from: string; to: string }) => Math.abs(runOf(edge));
  const rankOf = new Map(layout.rows.flatMap((row, rank) => row.map((id) => [id, rank] as const)));
  const rankSpanOf = (edge: { from: string; to: string }) =>
    Math.abs((rankOf.get(edge.to) ?? 0) - (rankOf.get(edge.from) ?? 0));

  /* Under `lower-only` only the adjacent spine is drawn: a skip means "everything after me", which the order already carries. */
  const permitted: GraphEdge[] = layout.edges
    .filter((edge) => layout.policy === 'explicit' || spanOf(edge) === 1)
    .map((edge) => ({
      from: edge.from,
      to: edge.to,
      kind: 'permitted' as const,
      columnSpan: spanOf(edge),
      rankSpan: rankSpanOf(edge),
      climbs: runOf(edge) < 0,
    }));

  /* Same-role traffic crosses nothing and must not set the crossing scale; the box carries it as a count. */
  const crossings = traffic.filter(
    (edge) =>
      edge.fromRole !== edge.toRole &&
      columnOf.has(edge.fromRole) &&
      columnOf.has(edge.toRole),
  );
  const busiest = crossings.reduce((most, edge) => Math.max(most, edge.count), 0);
  const measured: GraphEdge[] = crossings.map((crossing) => {
    const edge = { from: crossing.fromRole, to: crossing.toRole };
    return {
      ...edge,
      kind: 'traffic' as const,
      count: crossing.count,
      weight: busiest === 0 ? 0 : crossing.count / busiest,
      columnSpan: spanOf(edge),
      rankSpan: rankSpanOf(edge),
      climbs: runOf(edge) < 0,
    };
  });

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

  return {
    boxes: layout.rows.flatMap((row, rank) =>
      row.map((id) => ({
        id,
        column: columnOf.get(id) ?? 0,
        rank,
        shape: declaredIn.has(id) && declaredOut.has(id) ? ('process' as const) : ('terminator' as const),
      })),
    ),
    edges: [...permitted, ...measured].sort(
      (a, b) =>
        b.columnSpan - a.columnSpan ||
        (b.count ?? 0) - (a.count ?? 0) ||
        a.from.localeCompare(b.from) ||
        a.to.localeCompare(b.to),
    ),
    columns: columnOf.size,
    edgeSource,
    policy: layout.policy,
  };
}
