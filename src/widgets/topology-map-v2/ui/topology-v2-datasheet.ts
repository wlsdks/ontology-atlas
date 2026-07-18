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
 *
 * R+ full-detail A1: the base connection derivation (`buildConnections`/
 * `groupConnectionsByDirection` + structural types) moved to
 * `shared/lib/ontology-tree/connections.ts` so the NEW `full-detail-a1` widget
 * (topology "전체 상세" / `/ontology` full-detail surface) can reuse it too —
 * FSD forbids widget→widget imports, so shared derivation lives one layer
 * down. Re-exported here under the SAME `V2`-prefixed names so this file's
 * existing consumers (`HomePage.tsx`, `TopologyV2DetailPanel`, this module's
 * own tests) needed zero changes.
 */
export {
  buildConnections as buildV2Connections,
  groupConnectionsByDirection as groupV2ConnectionsByDirection,
  type ConnectionSourceEdge as V2ConnectionSourceEdge,
  type ConnectionSourceNode as V2ConnectionSourceNode,
  type DatasheetConnection as V2DatasheetConnection,
  type GroupedConnections as V2GroupedConnections,
} from "@/shared/lib/ontology-tree/connections";
import { groupConnectionsByDirection } from "@/shared/lib/ontology-tree/connections";
import type { DatasheetConnection as V2DatasheetConnection } from "@/shared/lib/ontology-tree/connections";

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
  const grouped = groupConnectionsByDirection(connections);
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
