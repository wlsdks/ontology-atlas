/**
 * Pure view-model helpers for the topology-map-v2 "component datasheet" panel
 * (`docs/TOPOLOGY-V2-DESIGN.md` §5 — agent-handoff differentiation). No React,
 * no i18n, no DOM — so the grouping / metric line / handoff payload are
 * unit-testable on structure alone and stay locale-agnostic.
 *
 * The datasheet re-presents the SAME selection facts the shared popover already
 * derives (`TopologyNodeFocusModel`); the view maps that model into these
 * inputs. This module only groups + formats — it never recomputes counts.
 *
 * R+ 카운트 시맨틱 통일: groups used to split by relation TYPE (containment vs
 * depends) while the metric line above counted by DIRECTION (incoming vs
 * outgoing) — same words ("포함"/"의존" near "쓰는 곳"/"기대는 곳"), two
 * different axes, so the numbers never reconciled (persona finding: header
 * "used by 10 · depends on 73" vs groups "포함 71 / 의존 12"). Groups are now
 * DIRECTION-based too, computed from the exact same connection set the metric
 * line counts — the header count and the group total are the SAME number by
 * construction, not just by convention. Relation TYPE (containment vs depends)
 * demotes to a per-row trace mark (`TopologyV2DetailPanel.tsx`'s `TraceMark`),
 * still visible, just no longer the grouping axis.
 */

export interface V2DatasheetConnection {
  id: string;
  title: string;
  kind: string;
  relationType: string;
  direction: "incoming" | "outgoing";
}

/** usedBy = incoming (places that use this node); dependsOn = outgoing
 * (places this node leans on). The SAME axis the metric line counts. */
export interface V2GroupedConnections {
  usedBy: V2DatasheetConnection[];
  dependsOn: V2DatasheetConnection[];
}

/**
 * Split direct connections into the two DIRECTION groups the datasheet
 * renders and the metric line counts — one axis, everywhere. Input order is
 * preserved inside each group so the panel stays deterministic.
 *
 * Also collapses each group to one row per neighbor `id` — the live dogfood
 * bug (`capability:mcp-server` had BOTH a `depends_on` AND a `related_to`
 * edge to the SAME neighbor, `capability:frontmatter-to-ontology`) isn't
 * caught by `buildV2Connections`'s own dedup (the relationType genuinely
 * differs there), but the panel shows only the neighbor's title with a
 * per-row type mark, not a relationType-keyed row, so two rows for the same
 * neighbor in the same direction read as one duplicated row AND collide on
 * the React list key (`TopologyV2DetailPanel.tsx`'s `key={group:direction:id}`).
 * The SAME neighbor in the OPPOSITE direction (a real mutual-dependency fact)
 * lands in the OTHER group and stays as two rows total — that's correct,
 * not a duplicate (item 5 — no cross-group dedup).
 */
export function groupV2ConnectionsByDirection(
  connections: readonly V2DatasheetConnection[],
): V2GroupedConnections {
  const usedBy: V2DatasheetConnection[] = [];
  const dependsOn: V2DatasheetConnection[] = [];
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
export interface V2ConnectionSourceNode {
  id: string;
  title: string;
  kind: string;
}
export interface V2ConnectionSourceEdge {
  from: string;
  to: string;
  type: string;
}

/**
 * The FULL direct-connection list for a node — every incoming + outgoing edge,
 * direction-tagged, resolved to the neighbor's title/kind. Outgoing first, then
 * incoming (same order the shared drawer preview uses). Unlike the shared 5-item
 * `previewRelations` slice, this is complete, so the datasheet can show each
 * relation-type group's TRUE total instead of folding depends edges into a
 * generic overflow on contains-dominated hubs.
 *
 * Deduped by `(neighbor id, relationType, direction)`, keeping the first
 * occurrence — a live dogfood bug (`capability:mcp-server` had TWO
 * `depends_on` edges to the same neighbor, one direct + one re-derived)
 * otherwise emits duplicate rows: a duplicate React list key
 * ("Encountered two children with the same key") and a visibly doubled
 * DEPENDS entry. Parallel edges of a DIFFERENT relation type, or the same
 * pair in the OPPOSITE direction, are still distinct facts and both kept.
 */
export function buildV2Connections(
  nodeId: string,
  nodes: readonly V2ConnectionSourceNode[],
  edges: readonly V2ConnectionSourceEdge[],
): V2DatasheetConnection[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const outgoing: V2DatasheetConnection[] = [];
  const incoming: V2DatasheetConnection[] = [];
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

/** One direction group as the panel renders it: a capped preview of rows +
 * the group's TRUE total (so the header can say "쓰는 곳 23" while showing 6). */
export interface V2ConnectionGroupView {
  rows: V2DatasheetConnection[];
  total: number;
}
export interface V2ConnectionGroupsView {
  usedBy: V2ConnectionGroupView;
  dependsOn: V2ConnectionGroupView;
}

/** Default rows shown per group before the typed "+N" overflow. */
export const V2_CONNECTION_ROW_CAP = 6;

/**
 * Group the full connection set by DIRECTION and cap each group to
 * `perGroupCap` rows, keeping the true total. This guarantees BOTH groups can
 * render their real count independently — a hub node with many outgoing
 * containment edges must not starve the (usually smaller) incoming group to
 * empty. Because direction is the SAME axis the metric line counts, callers
 * should source `metric.usedBy`/`metric.dependsOn` from `.usedBy.total`/
 * `.dependsOn.total` here, not recompute them separately — that's what
 * guarantees the metric line and the group headers can never diverge.
 */
export function buildV2ConnectionGroups(
  connections: readonly V2DatasheetConnection[],
  perGroupCap: number = V2_CONNECTION_ROW_CAP,
): V2ConnectionGroupsView {
  const grouped = groupV2ConnectionsByDirection(connections);
  const cap = Math.max(0, perGroupCap);
  return {
    usedBy: {
      rows: grouped.usedBy.slice(0, cap),
      total: grouped.usedBy.length,
    },
    dependsOn: {
      rows: grouped.dependsOn.slice(0, cap),
      total: grouped.dependsOn.length,
    },
  };
}

export interface V2MetricValues {
  /** Direct incoming — plain "쓰는 곳" (places that use this). */
  usedBy: number;
  /** Direct outgoing — plain "기대는 곳" (places this leans on). */
  dependsOn: number;
  /** Node-level evidence references — plain "근거". */
  evidence: number;
}

export interface V2MetricLabels {
  usedBy: string;
  dependsOn: string;
  evidence: string;
}

/**
 * The ONE engraved metric line — "쓰는 곳 3 · 기대는 곳 5 · 근거 2". Replaces the
 * old subtitle + two big count boxes (the owner's "정보가 세 번 나온다" complaint);
 * every fact appears exactly once. Always three segments, zeros explicit.
 */
export function formatV2MetricLine(
  values: V2MetricValues,
  labels: V2MetricLabels,
): string {
  return [
    `${labels.usedBy} ${values.usedBy}`,
    `${labels.dependsOn} ${values.dependsOn}`,
    `${labels.evidence} ${values.evidence}`,
  ].join(" · ");
}

export interface V2HandoffInput {
  slug: string;
  kind: string;
  domainTitle: string | null;
  usedBy: number;
  dependsOn: number;
  evidence: number;
  /** Names of the direct-incoming (usedBy) group's rows — same direction axis
   * as `usedBy`, so the count and the list can never contradict. */
  usedByNames: readonly string[];
  /** Names of the direct-outgoing (dependsOn) group's rows. */
  dependsNames: readonly string[];
}

/**
 * Agent-ready handoff payload (MCP/CLI-style) for a single node — the "다음
 * 액션 복사" differentiation. Stable English field keys + a suggested MCP call
 * so it pastes cleanly into a coding agent regardless of UI locale; the button
 * label is localized, this payload is intentionally not. Deterministic.
 *
 * R+ payload shape change: `contains`/`depends` name-list fields (relation
 * TYPE axis) renamed to `used_by_names`/`depends_names` (relation DIRECTION
 * axis) — matching the datasheet's groups now that direction is the single
 * grouping axis everywhere. Agents parsing the old field names must update.
 */
export function formatV2HandoffText(input: V2HandoffInput): string {
  const list = (names: readonly string[]) =>
    names.length > 0 ? names.join(", ") : "-";
  return [
    `node: ${input.slug}`,
    `kind: ${input.kind}`,
    `domain: ${input.domainTitle ?? "-"}`,
    `used_by: ${input.usedBy}`,
    `depends_on: ${input.dependsOn}`,
    `evidence: ${input.evidence}`,
    `used_by_names: ${list(input.usedByNames)}`,
    `depends_names: ${list(input.dependsNames)}`,
    `next: get_concept("${input.slug}") → review context, then patch_concept / add_relation as needed`,
  ].join("\n");
}
