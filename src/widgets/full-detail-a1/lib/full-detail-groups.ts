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
 * A node's own containment child count, shown on every row; handles both `contains` (parent to
 * child) and `belongs_to` (child to parent) like `buildContainmentParents`.
 */
function countContainmentChildren(
  nodeId: string,
  edges: readonly ConnectionSourceEdge[],
): number {
  let count = 0;
  for (const edge of edges) {
    if (edge.type === "contains" && edge.from === nodeId) count += 1;
    else if (edge.type === "belongs_to" && edge.to === nodeId) count += 1;
  }
  return count;
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

  const toRow = (connection: DatasheetConnection): FullDetailConnectionRow => ({
    id: connection.id,
    title: connection.title,
    kind: connection.kind,
    containment: isContainmentRelation(connection.relationType),
    childCount: countContainmentChildren(connection.id, edges),
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
