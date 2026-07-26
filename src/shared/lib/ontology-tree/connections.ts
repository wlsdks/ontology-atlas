/**
 * Pure "direct connection" derivation for a single node — the full,
 * direction-tagged incoming+outgoing edge list, resolved to each neighbor's
 * title/kind. Originally lived inside `widgets/topology-map-v2` (the compact
 * canvas datasheet) as `buildV2Connections`/`groupV2ConnectionsByDirection`;
 * promoted to `shared/lib/ontology-tree` (R+ full-detail A1) so a SECOND
 * widget (`full-detail-a1`, the topology "전체 상세" / `/ontology` full-detail
 * surface) can reuse the exact same derivation instead of forking a second
 * copy — FSD forbids widget→widget imports, so shared connection logic lives
 * one layer down. `topology-v2-datasheet.ts` re-exports these names
 * unchanged so existing call sites (`HomePage.tsx`, `TopologyV2DetailPanel`,
 * its tests) needed zero changes.
 */

import { isContainmentRelation } from "./relations";

export interface DatasheetConnection {
  id: string;
  title: string;
  kind: string;
  relationType: string;
  direction: "incoming" | "outgoing";
}

/** usedBy = incoming (places that use this node); dependsOn = outgoing
 * (places this node leans on). The SAME axis the metric line counts. */
export interface GroupedConnections {
  usedBy: DatasheetConnection[];
  dependsOn: DatasheetConnection[];
}

/**
 * Split direct connections into the two DIRECTION groups the datasheet
 * renders and the metric line counts — one axis, everywhere. Input order is
 * preserved inside each group so the panel stays deterministic.
 *
 * Also collapses each group to one row per neighbor `id` — the live dogfood
 * bug (`capability:mcp-server` had BOTH a `depends_on` AND a `related_to`
 * edge to the SAME neighbor, `capability:frontmatter-to-ontology`) isn't
 * caught by `buildConnections`'s own dedup (the relationType genuinely
 * differs there), but consumers show only the neighbor's title with a
 * per-row type mark, not a relationType-keyed row, so two rows for the same
 * neighbor in the same direction read as one duplicated row AND collide on
 * React list keys. The SAME neighbor in the OPPOSITE direction (a real
 * mutual-dependency fact) lands in the OTHER group and stays as two rows
 * total — that's correct, not a duplicate (no cross-group dedup).
 */
export function groupConnectionsByDirection(
  connections: readonly DatasheetConnection[],
): GroupedConnections {
  const usedBy: DatasheetConnection[] = [];
  const dependsOn: DatasheetConnection[] = [];
  const seenUsedBy = new Set<string>();
  const seenDependsOn = new Set<string>();
  for (const connection of connections) {
    if (connection.direction === "incoming") {
      if (seenUsedBy.has(connection.id)) continue;
      seenUsedBy.add(connection.id);
      usedBy.push(connection);
    } else {
      if (seenDependsOn.has(connection.id)) continue;
      seenDependsOn.add(connection.id);
      dependsOn.push(connection);
    }
  }
  return { usedBy, dependsOn };
}

/**
 * M-2 — connections split by relation ROLE, not just direction. `usedBy` /
 * `dependsOn` are the non-containment incoming/outgoing groups (same as
 * `groupConnectionsByDirection`); containment edges are pulled OUT into their
 * own `contains` (this node is the parent) / `belongsTo` (this node is the
 * child) groups instead of folding into usedBy/dependsOn by raw direction.
 *
 * The compact canvas popover used to group by DIRECTION only, so a domain's
 * 18 `contains` children landed in "기대는 곳" (dependsOn) — the exact typed-
 * fact collapse the UX round flagged (popover "쓰는 곳 5 · 기대는 곳 20" vs
 * full-detail "담는 것 18 · 쓰는 곳 4 · 기대는 곳 2 · 속한 곳 1"). This is the
 * SAME bucketing the full-detail surface uses (`buildFullDetailGroups` now
 * delegates here), so the two surfaces can never disagree on the counts.
 */
export interface RoleGroupedConnections {
  /** Outgoing containment — what this node contains. */
  contains: DatasheetConnection[];
  /** Incoming non-containment — places that use this node. */
  usedBy: DatasheetConnection[];
  /** Outgoing non-containment — places this node leans on. */
  dependsOn: DatasheetConnection[];
  /** Incoming containment — the (usually single) parent this node belongs to. */
  belongsTo: DatasheetConnection[];
}

/**
 * True when a containment connection means `nodeId` is the PARENT (→ contains)
 * vs the CHILD (→ belongsTo). `contains` edges point parent→child (so an
 * OUTGOING one makes nodeId the parent); `belongs_to` edges point child→parent
 * (so an INCOMING one makes nodeId the parent). Same rule as
 * `buildContainmentParents` (insights.ts) — getting it wrong would file a
 * `belongs_to`-authored parent under "담는 것" instead of "속한 곳".
 */
function containmentNodeIsParent(connection: DatasheetConnection): boolean {
  return connection.relationType === "belongs_to"
    ? connection.direction === "incoming"
    : connection.direction === "outgoing";
}

/**
 * Split direct connections into the four role groups (contains / usedBy /
 * dependsOn / belongsTo), each deduped by neighbor `id` within its own bucket
 * (a neighbor genuinely reachable by two relationTypes in the same role — the
 * live `depends_on` + `related_to` dogfood case — collapses to one row, same
 * guard `groupConnectionsByDirection` already applies). Input order preserved
 * inside each bucket for deterministic rendering.
 */
export function groupConnectionsByRole(
  connections: readonly DatasheetConnection[],
): RoleGroupedConnections {
  const contains: DatasheetConnection[] = [];
  const usedBy: DatasheetConnection[] = [];
  const dependsOn: DatasheetConnection[] = [];
  const belongsTo: DatasheetConnection[] = [];
  const seen = {
    contains: new Set<string>(),
    usedBy: new Set<string>(),
    dependsOn: new Set<string>(),
    belongsTo: new Set<string>(),
  };
  for (const connection of connections) {
    let bucket: DatasheetConnection[];
    let seenSet: Set<string>;
    if (isContainmentRelation(connection.relationType)) {
      if (containmentNodeIsParent(connection)) {
        bucket = contains;
        seenSet = seen.contains;
      } else {
        bucket = belongsTo;
        seenSet = seen.belongsTo;
      }
    } else if (connection.direction === "incoming") {
      bucket = usedBy;
      seenSet = seen.usedBy;
    } else {
      bucket = dependsOn;
      seenSet = seen.dependsOn;
    }
    if (seenSet.has(connection.id)) continue;
    seenSet.add(connection.id);
    bucket.push(connection);
  }
  return { contains, usedBy, dependsOn, belongsTo };
}

/** Minimal structural shapes — keeps this module pure + testable without
 * importing the full KnowledgeGraph types (which are structurally compatible). */
export interface ConnectionSourceNode {
  id: string;
  title: string;
  /** 과제 ⑩ — 표시용 짧은 제목(있으면). 이웃 행 라벨은 이것을 우선 쓴다. */
  display?: string;
  /**
   * `display_<locale>` 원본 전체 — 화면 언어와 무관하게 어느 어권 이름으로도
   * 후보를 찾을 수 있어야 한다(`shared/lib/node-name-match`).
   */
  displayLocales?: Readonly<Record<string, string>>;
  kind: string;
}
export interface ConnectionSourceEdge {
  from: string;
  to: string;
  type: string;
}

/**
 * The FULL direct-connection list for a node — every incoming + outgoing edge,
 * direction-tagged, resolved to the neighbor's title/kind. Outgoing first, then
 * incoming. Deduped by `(neighbor id, relationType, direction)`, keeping the
 * first occurrence — a live dogfood bug (`capability:mcp-server` had TWO
 * `depends_on` edges to the same neighbor, one direct + one re-derived)
 * otherwise emits duplicate rows: a duplicate React list key
 * ("Encountered two children with the same key") and a visibly doubled
 * DEPENDS entry. Parallel edges of a DIFFERENT relation type, or the same
 * pair in the OPPOSITE direction, are still distinct facts and both kept.
 */
export function buildConnections(
  nodeId: string,
  nodes: readonly ConnectionSourceNode[],
  edges: readonly ConnectionSourceEdge[],
): DatasheetConnection[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const outgoing: DatasheetConnection[] = [];
  const incoming: DatasheetConnection[] = [];
  const seen = new Set<string>();
  for (const edge of edges) {
    if (edge.from === nodeId) {
      const other = nodeById.get(edge.to);
      if (!other) continue;
      const key = `${other.id}|${edge.type}|outgoing`;
      if (seen.has(key)) continue;
      seen.add(key);
      outgoing.push({
        id: other.id,
        title: other.display ?? other.title,
        kind: other.kind,
        relationType: edge.type,
        direction: "outgoing",
      });
    } else if (edge.to === nodeId) {
      const other = nodeById.get(edge.from);
      if (!other) continue;
      const key = `${other.id}|${edge.type}|incoming`;
      if (seen.has(key)) continue;
      seen.add(key);
      incoming.push({
        id: other.id,
        title: other.display ?? other.title,
        kind: other.kind,
        relationType: edge.type,
        direction: "incoming",
      });
    }
  }
  return [...outgoing, ...incoming];
}
