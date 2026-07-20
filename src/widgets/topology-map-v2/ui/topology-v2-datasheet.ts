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
import { groupConnectionsByRole } from "@/shared/lib/ontology-tree/connections";
import type { DatasheetConnection as V2DatasheetConnection } from "@/shared/lib/ontology-tree/connections";

/** One relation-role group as the panel renders it: a capped preview of rows +
 * the group's TRUE total (so the header can say "쓰는 곳 23" while showing 6). */
export interface V2ConnectionGroupView {
  rows: V2DatasheetConnection[];
  total: number;
}
export interface V2ConnectionGroupsView {
  /** Outgoing containment — plain "담는 것" (what this node contains). */
  contains: V2ConnectionGroupView;
  /** Incoming non-containment — plain "쓰는 곳" (places that use this). */
  usedBy: V2ConnectionGroupView;
  /** Outgoing non-containment — plain "기대는 곳" (places this leans on). */
  dependsOn: V2ConnectionGroupView;
  /** Incoming containment — plain "속한 곳" (the parent this belongs to).
   *  Kept for handoff/count completeness; the panel surfaces it as the domain
   *  header (N6) rather than a group. */
  belongsTo: V2ConnectionGroupView;
}

/** Default rows shown per group before the typed "+N" overflow. */
export const V2_CONNECTION_ROW_CAP = 6;

/**
 * Group the full connection set by relation ROLE (contains / usedBy /
 * dependsOn / belongsTo) and cap each group to `perGroupCap` rows, keeping the
 * true total. M-2: containment is pulled into its OWN `contains`/`belongsTo`
 * groups instead of folding into usedBy/dependsOn by raw direction — so a
 * domain's 18 `contains` children read as "담는 것 18", not "기대는 곳". This
 * is the SAME split `buildFullDetailGroups` uses (both delegate to
 * `groupConnectionsByRole`), so the popover and full-detail can never disagree.
 * Callers source `metric.contains`/`usedBy`/`dependsOn` from these `.total`s so
 * the metric line and the group headers stay the same number by construction.
 */
export function buildV2ConnectionGroups(
  connections: readonly V2DatasheetConnection[],
  perGroupCap: number = V2_CONNECTION_ROW_CAP,
): V2ConnectionGroupsView {
  const grouped = groupConnectionsByRole(connections);
  const cap = Math.max(0, perGroupCap);
  const toView = (rows: readonly V2DatasheetConnection[]): V2ConnectionGroupView => ({
    rows: rows.slice(0, cap),
    total: rows.length,
  });
  return {
    contains: toView(grouped.contains),
    usedBy: toView(grouped.usedBy),
    dependsOn: toView(grouped.dependsOn),
    belongsTo: toView(grouped.belongsTo),
  };
}

export interface V2MetricValues {
  /** Outgoing containment — plain "담는 것" (what this node contains). Only
   *  rendered when > 0 (leaf nodes contain nothing, so the segment is hidden
   *  for them rather than showing a noisy "담는 것 0"). */
  contains: number;
  /** Direct incoming non-containment — plain "쓰는 곳" (places that use this). */
  usedBy: number;
  /** Direct outgoing non-containment — plain "기대는 곳" (places this leans on). */
  dependsOn: number;
  /** Node-level evidence references — plain "근거". */
  evidence: number;
}

export interface V2MetricLabels {
  contains: string;
  usedBy: string;
  dependsOn: string;
  evidence: string;
}

/**
 * The ONE engraved metric line — "담는 것 18 · 쓰는 곳 4 · 기대는 곳 2 · 근거 1".
 * Replaces the old subtitle + count boxes (the owner's "정보가 세 번 나온다"
 * complaint); every fact appears exactly once. M-2: the leading "담는 것"
 * segment appears ONLY for container nodes (`contains > 0`) — a leaf's line
 * stays "쓰는 곳 · 기대는 곳 · 근거", so the typed split adds signal for
 * domains without adding a "담는 것 0" to every element.
 */
export function formatV2MetricLine(
  values: V2MetricValues,
  labels: V2MetricLabels,
): string {
  const segments: string[] = [];
  if (values.contains > 0) segments.push(`${labels.contains} ${values.contains}`);
  segments.push(`${labels.usedBy} ${values.usedBy}`);
  segments.push(`${labels.dependsOn} ${values.dependsOn}`);
  segments.push(`${labels.evidence} ${values.evidence}`);
  return segments.join(" · ");
}

/** One row in the promoted 근거(evidence) group — RATIO-SYSTEM §4 scale-up
 * ("정보는 좋은데 너무 작고 그래"). Built from `KnowledgeGraphNode.evidenceIds`
 * (a vault slug like "capabilities/product-owner-operating-system" — the
 * node's own backing `.md`, see `derivationToInsight`'s doc comment), split
 * into a readable `title` (the last path segment) and a `path` prefix
 * (everything before it, trailing slash kept) so the row reads like the
 * mockup's doc-link ("PRODUCT-OWNER-OPERATING-SYSTEM.md" / "docs/"). Rows
 * are read-only/informational — evidenceIds are vault slugs, a different
 * namespace than the canvas's graph node ids, so they are not wired to
 * `onSelectConnection`. */
export interface V2EvidenceRow {
  id: string;
  title: string;
  path: string | null;
}

/**
 * Formats raw `evidenceIds` into display rows, one per non-blank id,
 * preserving input order. Pure/no dedup beyond blank-skipping — a node's
 * evidenceIds are already a short, mostly-single-entry list.
 */
export function buildV2EvidenceRows(
  evidenceIds: readonly string[],
): V2EvidenceRow[] {
  const rows: V2EvidenceRow[] = [];
  for (const raw of evidenceIds) {
    const id = raw.trim();
    if (!id) continue;
    const lastSlash = id.lastIndexOf("/");
    if (lastSlash === -1) {
      rows.push({ id, title: id, path: null });
    } else {
      rows.push({ id, title: id.slice(lastSlash + 1), path: id.slice(0, lastSlash + 1) });
    }
  }
  return rows;
}

export interface V2HandoffInput {
  slug: string;
  kind: string;
  domainTitle: string | null;
  /** Outgoing containment count (M-2) — `contains` edges, split out from the
   * old direction-only `depends_on` so an agent reading the handoff sees the
   * same typed facts the panel shows. */
  contains: number;
  usedBy: number;
  dependsOn: number;
  evidence: number;
  /** Names of the containment-child (contains) group's rows. */
  containsNames: readonly string[];
  /** Names of the incoming non-containment (usedBy) group's rows. */
  usedByNames: readonly string[];
  /** Names of the outgoing non-containment (dependsOn) group's rows. */
  dependsNames: readonly string[];
}

/**
 * Agent-ready handoff payload (MCP/CLI-style) for a single node — the "다음
 * 액션 복사" differentiation. Stable English field keys + a suggested MCP call
 * so it pastes cleanly into a coding agent regardless of UI locale; the button
 * label is localized, this payload is intentionally not. Deterministic.
 *
 * M-2 payload shape change: containment is now its own `contains` /
 * `contains_names` fields, split OUT of `depends_on` / `depends_names` (which
 * previously folded containment children in via the direction-only grouping).
 * `used_by` no longer includes the parent (`belongs_to`) either — the counts
 * match the panel's typed groups and the full-detail surface exactly.
 */
export function formatV2HandoffText(input: V2HandoffInput): string {
  const list = (names: readonly string[]) =>
    names.length > 0 ? names.join(", ") : "-";
  return [
    `node: ${input.slug}`,
    `kind: ${input.kind}`,
    `domain: ${input.domainTitle ?? "-"}`,
    `contains: ${input.contains}`,
    `used_by: ${input.usedBy}`,
    `depends_on: ${input.dependsOn}`,
    `evidence: ${input.evidence}`,
    `contains_names: ${list(input.containsNames)}`,
    `used_by_names: ${list(input.usedByNames)}`,
    `depends_names: ${list(input.dependsNames)}`,
    `next: get_concept("${input.slug}") → review context, then patch_concept / add_relation as needed`,
  ].join("\n");
}
