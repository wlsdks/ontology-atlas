/**
 * Pure view-model helpers for the topology-map-v2 "component datasheet" panel
 * (`docs/TOPOLOGY-V2-DESIGN.md` §5 — agent-handoff differentiation). No React,
 * no i18n, no DOM — so the grouping / metric line / handoff payload are
 * unit-testable on structure alone and stay locale-agnostic.
 *
 * The datasheet re-presents the SAME selection facts the shared popover already
 * derives (`TopologyNodeFocusModel`); the view maps that model into these
 * inputs. This module only groups + formats — it never recomputes counts.
 */

import { isContainmentRelation } from "@/shared/lib/ontology-tree";

/** contains = structural containment (contains/belongs_to); depends = everything else. */
export type V2ConnectionGroupKey = "contains" | "depends";

export interface V2DatasheetConnection {
  id: string;
  title: string;
  kind: string;
  relationType: string;
  direction: "incoming" | "outgoing";
}

export interface V2GroupedConnections {
  contains: V2DatasheetConnection[];
  depends: V2DatasheetConnection[];
}

/**
 * Split direct connections into the two relation-type groups the datasheet
 * renders (one compact marker per group, not a per-row badge pile). Input
 * order is preserved inside each group so the panel stays deterministic.
 */
export function groupV2Connections(
  connections: readonly V2DatasheetConnection[],
): V2GroupedConnections {
  const contains: V2DatasheetConnection[] = [];
  const depends: V2DatasheetConnection[] = [];
  for (const connection of connections) {
    if (isContainmentRelation(connection.relationType)) {
      contains.push(connection);
    } else {
      depends.push(connection);
    }
  }
  return { contains, depends };
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
 */
export function buildV2Connections(
  nodeId: string,
  nodes: readonly V2ConnectionSourceNode[],
  edges: readonly V2ConnectionSourceEdge[],
): V2DatasheetConnection[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const outgoing: V2DatasheetConnection[] = [];
  const incoming: V2DatasheetConnection[] = [];
  for (const edge of edges) {
    if (edge.from === nodeId) {
      const other = nodeById.get(edge.to);
      if (other) {
        outgoing.push({
          id: other.id,
          title: other.title,
          kind: other.kind,
          relationType: edge.type,
          direction: "outgoing",
        });
      }
    } else if (edge.to === nodeId) {
      const other = nodeById.get(edge.from);
      if (other) {
        incoming.push({
          id: other.id,
          title: other.title,
          kind: other.kind,
          relationType: edge.type,
          direction: "incoming",
        });
      }
    }
  }
  return [...outgoing, ...incoming];
}

/** One relation-type group as the panel renders it: a capped preview of rows +
 * the group's TRUE total (so the header can say "DEPENDS 23" while showing 6). */
export interface V2ConnectionGroupView {
  rows: V2DatasheetConnection[];
  total: number;
}
export interface V2ConnectionGroupsView {
  contains: V2ConnectionGroupView;
  depends: V2ConnectionGroupView;
}

/** Default rows shown per group before the typed "+N" overflow. */
export const V2_CONNECTION_ROW_CAP = 6;

/**
 * Group the full connection set by relation type and cap each group to
 * `perGroupCap` rows, keeping the true total. This guarantees BOTH groups can
 * render their real count independently — the contains-hub bug was that a single
 * outgoing-first 5-item slice starved the depends group to empty.
 */
export function buildV2ConnectionGroups(
  connections: readonly V2DatasheetConnection[],
  perGroupCap: number = V2_CONNECTION_ROW_CAP,
): V2ConnectionGroupsView {
  const grouped = groupV2Connections(connections);
  const cap = Math.max(0, perGroupCap);
  return {
    contains: {
      rows: grouped.contains.slice(0, cap),
      total: grouped.contains.length,
    },
    depends: {
      rows: grouped.depends.slice(0, cap),
      total: grouped.depends.length,
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
  containsNames: readonly string[];
  dependsNames: readonly string[];
}

/**
 * Agent-ready handoff payload (MCP/CLI-style) for a single node — the "다음
 * 액션 복사" differentiation. Stable English field keys + a suggested MCP call
 * so it pastes cleanly into a coding agent regardless of UI locale; the button
 * label is localized, this payload is intentionally not. Deterministic.
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
    `contains: ${list(input.containsNames)}`,
    `depends: ${list(input.dependsNames)}`,
    `next: get_concept("${input.slug}") → review context, then patch_concept / add_relation as needed`,
  ].join("\n");
}
