/**
 * Full-detail A1 direction groups — the "expanded datasheet" (expanded datasheet)
 * replaces the rejected badge-soup FROM THIS/CONTAINS rows with FOUR uncapped groups:
 * contains / usedBy / dependsOn / belongsTo. Unlike the compact canvas datasheet
 * (`topology-v2-datasheet.ts`), which demotes containment vs depends to a
 * per-row trace mark under a DIRECTION-only split, the full-detail surface
 * elevates containment back into its own two groups (outgoing containment =
 * contains, incoming containment = belongsTo) while non-containment stays
 * direction-split (usedBy/dependsOn) — see `docs/prototypes/detail-a1-datasheet.html`.
 *
 * Reuses `buildConnections` (shared/lib/ontology-tree) for the full
 * dir-tagged connection list — no forked BFS/edge-scan.
 */
import {
  buildConnections,
  groupConnectionsByRole,
  type ConnectionSourceEdge,
  type ConnectionSourceNode,
  type DatasheetConnection,
} from "@/shared/lib/ontology-tree/connections";
import { isContainmentRelation } from "@/shared/lib/ontology-tree/relations";

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
 * Count of a node's OWN containment children — reused for every row
 * (contains/usedBy/dependsOn/belongsTo alike) so any row's neighbor shows
 * "how big is that node" uniformly, not just contains-specific rows. Handles
 * both containment encodings: `contains` (parent→child, so `nodeId` is
 * parent when `edge.from === nodeId`) and `belongs_to` (child→parent, so
 * `nodeId` is parent when `edge.to === nodeId`) — same rule as
 * `buildContainmentParents`.
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
  // The four-bucket role split (contains / usedBy / dependsOn / belongsTo) +
  // per-bucket neighbor dedup lives in the shared `groupConnectionsByRole`
  // (M-2) so the compact canvas popover renders the SAME numbers from the SAME
  // construction — the two surfaces can't drift. This widget only enriches
  // each row with `childCount` / `fresh` / `containment` for its denser view.
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
