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

/** Minimal structural shapes — keeps this module pure + testable without
 * importing the full KnowledgeGraph types (which are structurally compatible). */
export interface ConnectionSourceNode {
  id: string;
  title: string;
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
        title: other.title,
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
        title: other.title,
        kind: other.kind,
        relationType: edge.type,
        direction: "incoming",
      });
    }
  }
  return [...outgoing, ...incoming];
}
