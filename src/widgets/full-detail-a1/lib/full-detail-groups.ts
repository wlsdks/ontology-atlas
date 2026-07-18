/**
 * Full-detail A1 direction groups — the "데이터시트 확장판" replaces the
 * rejected badge-soup FROM THIS/CONTAINS rows with FOUR uncapped groups:
 * 담는 것(contains) / 이 노드를 쓰는 곳(usedBy) / 이 노드가 기대는 곳
 * (dependsOn) / 속한 곳(belongsTo). Unlike the compact canvas datasheet
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
  type ConnectionSourceEdge,
  type ConnectionSourceNode,
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
  /** Recently changed (mirrors the compact datasheet's "전원" concept). */
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
  const connections = buildConnections(nodeId, nodes, edges);
  const contains: FullDetailConnectionRow[] = [];
  const usedBy: FullDetailConnectionRow[] = [];
  const dependsOn: FullDetailConnectionRow[] = [];
  const belongsTo: FullDetailConnectionRow[] = [];
  // `buildConnections` dedups by (neighbor, relationType, direction) — a
  // neighbor with BOTH a `depends_on` AND a `related_to` edge in the SAME
  // direction (live dogfood case: `capability:ontology-hub-mode-aware`) is
  // genuinely two distinct relationType facts there, but this surface shows
  // only one row per neighbor per bucket (no relationType-keyed row), so two
  // rows for the same neighbor in the same bucket read as a visible
  // duplicate AND collide on the React list key — same failure mode
  // `groupConnectionsByDirection` already guards against for usedBy/dependsOn;
  // contains/belongsTo need the identical per-bucket neighbor dedup.
  const seenByBucket = {
    contains: new Set<string>(),
    usedBy: new Set<string>(),
    dependsOn: new Set<string>(),
    belongsTo: new Set<string>(),
  };

  for (const connection of connections) {
    const containment = isContainmentRelation(connection.relationType);
    const row: FullDetailConnectionRow = {
      id: connection.id,
      title: connection.title,
      kind: connection.kind,
      containment,
      childCount: countContainmentChildren(connection.id, edges),
      fresh: changedIds?.has(connection.id) ?? false,
    };
    let bucket: FullDetailConnectionRow[];
    let seen: Set<string>;
    if (containment) {
      // `contains` edges point parent→child (outgoing from `nodeId` = nodeId
      // is the parent); `belongs_to` edges point child→parent, so the SAME
      // direction check is inverted for that type — `buildContainmentParents`
      // (shared/lib/ontology-tree/insights.ts) resolves parentage the same
      // way. Getting this wrong would put a `belongs_to`-authored parent
      // into "담는 것" instead of "속한 곳".
      const nodeIsParent =
        connection.relationType === "belongs_to"
          ? connection.direction === "incoming"
          : connection.direction === "outgoing";
      bucket = nodeIsParent ? contains : belongsTo;
      seen = nodeIsParent ? seenByBucket.contains : seenByBucket.belongsTo;
    } else if (connection.direction === "incoming") {
      bucket = usedBy;
      seen = seenByBucket.usedBy;
    } else {
      bucket = dependsOn;
      seen = seenByBucket.dependsOn;
    }
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    bucket.push(row);
  }

  const toView = (rows: FullDetailConnectionRow[]): FullDetailGroupView => ({
    rows,
    total: rows.length,
  });

  return {
    contains: toView(contains),
    usedBy: toView(usedBy),
    dependsOn: toView(dependsOn),
    belongsTo: toView(belongsTo),
  };
}
