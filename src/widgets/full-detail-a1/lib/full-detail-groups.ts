/**
 * Full-detail direction groups: four uncapped lists, contains, usedBy, dependsOn and belongsTo
 * (`docs/prototypes/detail-a1-datasheet.html`). Built from `buildConnections`, with no forked edge
 * scan.
 */
import {
  buildConnections,
  groupConnectionsByRole,
  type ConnectionSourceEdge,
  type ConnectionSourceNode,
  type DatasheetConnection,
  isContainmentRelation,
} from "@/entities/knowledge-graph";

export interface FullDetailConnectionRow {
  id: string;
  title: string;
  kind: string;
  /** true = containment edge (solid trace mark); false = depends/related (dashed). */
  containment: boolean;
  /** How many containment-children the ROW's own node has — 0 when it's a
   * leaf. Rendered as a compact engraved count only when > 0. */
  childCount: number;
  /** Recently changed (mirrors the compact datasheet's "powered" concept). */
  fresh: boolean;
}

export interface FullDetailGroupView {
  rows: FullDetailConnectionRow[];
  total: number;
}

export interface FullDetailGroups {
  /** Outgoing containment — what this node contains. */
  contains: FullDetailGroupView;
  /** Incoming non-containment — places that use this node. */
  usedBy: FullDetailGroupView;
  /** Outgoing non-containment — places this node leans on. */
  dependsOn: FullDetailGroupView;
  /** Incoming containment — the (usually single) parent this node belongs to. */
  belongsTo: FullDetailGroupView;
}

/**
 * O(E) counts of authored containment edges, including unresolved children and duplicate edges.
 */
function containmentChildCounts(
  edges: readonly ConnectionSourceEdge[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const edge of edges) {
    const parentId = edge.type === "contains" ? edge.from : edge.type === "belongs_to" ? edge.to : null;
    if (parentId !== null) counts.set(parentId, (counts.get(parentId) ?? 0) + 1);
  }
  return counts;
}

export function buildFullDetailGroups(
  nodeId: string,
  nodes: readonly ConnectionSourceNode[],
  edges: readonly ConnectionSourceEdge[],
  changedIds?: ReadonlySet<string>,
): FullDetailGroups {
  // The role split and per-bucket dedup live in the shared `groupConnectionsByRole`, so the compact
  // popover shows the same numbers; this adds `childCount`, `fresh` and `containment` per row.
  const connections = buildConnections(nodeId, nodes, edges);
  const grouped = groupConnectionsByRole(connections);
  const childCounts = containmentChildCounts(edges);

  const toRow = (connection: DatasheetConnection): FullDetailConnectionRow => ({
    id: connection.id,
    title: connection.title,
    kind: connection.kind,
    containment: isContainmentRelation(connection.relationType),
    childCount: childCounts.get(connection.id) ?? 0,
    fresh: changedIds?.has(connection.id) ?? false,
  });

  const toView = (
    connections: readonly DatasheetConnection[],
  ): FullDetailGroupView => {
    const rows = connections.map(toRow);
    return { rows, total: rows.length };
  };

  return {
    contains: toView(grouped.contains),
    usedBy: toView(grouped.usedBy),
    dependsOn: toView(grouped.dependsOn),
    belongsTo: toView(grouped.belongsTo),
  };
}
