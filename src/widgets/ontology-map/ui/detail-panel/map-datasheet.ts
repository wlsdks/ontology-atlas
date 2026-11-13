/**
 * Pure view-model helpers for the component datasheet panel (`docs/design/ontology-map.md` section
 * 5): no React, i18n or DOM. Role groups feed the handoff and the rows' reasons; the reach lists
 * count as the map does (`model/concept-reach.ts`). Base derivation lives in
 * `entities/knowledge-graph`, re-exported here under `V2` names.
 */
export {
  buildConnections as buildV2Connections,
  type DatasheetConnection as V2DatasheetConnection,
} from "@/entities/knowledge-graph";
import { groupConnectionsByRole } from "@/entities/knowledge-graph";
import type { DatasheetConnection as V2DatasheetConnection } from "@/entities/knowledge-graph";
import type { DomainUsage } from "../../model/domain-usage";

/** One relation-role group as the panel renders it: a capped preview of rows +
 * the group's TRUE total (so the header can say "Uses 23" while showing 6). */
export interface V2ConnectionGroupView {
  rows: V2DatasheetConnection[];
  total: number;
  /**
   * The uncapped full rows, so "+N" is a door opened in place rather than a dead number.
   * It references the pre-cap array directly, so the extra cost is one reference.
   */
  allRows?: V2DatasheetConnection[];
}
export interface V2ConnectionGroupsView {
  /** Outgoing containment — plain "Contains" (what this node contains). */
  contains: V2ConnectionGroupView;
  /** Incoming directed relations — plain "Used by". */
  usedBy: V2ConnectionGroupView;
  /** Outgoing directed relations — plain "Leans on". */
  dependsOn: V2ConnectionGroupView;
  /** Incoming containment, plain "Belongs To", so a node with only a parent is not "Connected 0". */
  belongsTo: V2ConnectionGroupView;
  /** `relates` either way, plain "Related": it names no direction, so it joins neither side. */
  related: V2ConnectionGroupView;
}

/** Default rows shown per group before the typed "+N" overflow. */
const V2_CONNECTION_ROW_CAP = 6;

/**
 * The full connection set by role, each group capped to `perGroupCap` rows with its true total.
 * `groupConnectionsByRole` is the split full detail uses too, so the two surfaces cannot disagree,
 * and the handoff's counts are these totals.
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
    allRows: rows.slice(),
  });
  return {
    contains: toView(grouped.contains),
    usedBy: toView(grouped.usedBy),
    dependsOn: toView(grouped.dependsOn),
    belongsTo: toView(grouped.belongsTo),
    related: toView(grouped.related),
  };
}

/** The most rows a reach list shows before it folds; past it, five rows and a "show more" row. */
export const REACH_ROW_LIMIT = 6;

/** How many of `total` rows a list shows: all of six or fewer, else one fewer so the "show more" row fits. */
export function shownReachRows(total: number, open: boolean): number {
  return open || total <= REACH_ROW_LIMIT ? total : REACH_ROW_LIMIT - 1;
}

/**
 * The recorded reason of each direct relation, looked up by direction and far concept: `out:` for
 * what the concept points at, `in:` for what points at it. The first written reason wins. O(rows).
 */
export function reasonsByRelation(groups: V2ConnectionGroupsView): ReadonlyMap<string, string> {
  const reasons = new Map<string, string>();
  for (const view of [groups.dependsOn, groups.usedBy, groups.related]) {
    for (const row of view.allRows ?? view.rows) {
      const key = `${row.direction === "outgoing" ? "out" : "in"}:${row.id}`;
      if (row.reason && !reasons.has(key)) reasons.set(key, row.reason);
    }
  }
  return reasons;
}

/**
 * One row in the promoted evidence group, from `KnowledgeGraphNode.evidenceIds` (a vault slug naming
 * the node's backing `.md`), split into `title` (last segment) and `path` prefix. Read-only: vault
 * slugs are not canvas node ids, so rows are not wired to `onSelectConnection`.
 */
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

/**
 * The last segment of a path-like string (a slug or vault path); with no `/` the source is
 * returned unchanged. Same last-slash split as `buildV2EvidenceRows`. The full source folds
 * into `title=`.
 */
export function slugDisplaySegment(slug: string): string {
  const lastSlash = slug.lastIndexOf("/");
  return lastSlash === -1 ? slug : slug.slice(lastSlash + 1);
}

export interface V2HandoffInput {
  /** The graph facts and the MCP write target must describe the same source. */
  source: "loaded-vault" | "read-only-sample";
  slug: string;
  /**
   * Does this node have its own `.md` document? Without one, `slug` is the raw
   * reference text another document wrote down, so `get_concept` / `patch_concept`
   * do not apply — the handoff then offers the call that creates the document first.
   * (Unset reads as documented, as before.)
   */
  documented?: boolean;
  kind: string;
  domainTitle: string | null;
  /** The same typed counts the panel's group headers show. */
  contains: number;
  usedBy: number;
  dependsOn: number;
  /** The parent, or a node with only a parent reads as an orphan. */
  belongsTo: number;
  related: number;
  evidence: number;
  /** Each group's shown row names. */
  containsNames: readonly string[];
  usedByNames: readonly string[];
  dependsNames: readonly string[];
  belongsToNames: readonly string[];
  relatedNames: readonly string[];
  /** A domain's partners as the panel lists them; absent for every other kind. */
  domainUsage?: DomainUsage | null;
}

/**
 * Agent-ready handoff payload for a single node: stable English field keys plus a suggested MCP call,
 * so it pastes into a coding agent in any UI locale (the button label is localized, this is not).
 * Deterministic; carries the typed buckets, and a domain's partners as the panel lists them.
 */
export function formatV2HandoffText(input: V2HandoffInput): string {
  const list = (names: readonly string[]) =>
    names.length > 0 ? names.join(", ") : "-";
  const documented = input.documented !== false;
  const next =
    input.source !== "loaded-vault"
      ? "next: open a markdown vault, then copy a node handoff from that loaded vault"
      : documented
        ? `next: get_concept("${input.slug}") → review context, then patch_concept / add_relation as needed`
        // A derived node with no document — `get_concept` would look up a name that does
        // not exist and stop there. The only form the vault knows this concept in is a
        // reference string written by another document, so the first step is creating a
        // document under that name.
        : `next: add_concept({slug:"${input.slug}", kind:"${input.kind}"}) — this concept has no document yet; it exists only as a reference written in another doc`;
  return [
    `source: ${input.source}`,
    `node: ${input.slug}`,
    `has_document: ${documented ? "yes" : "no"}`,
    `kind: ${input.kind}`,
    `domain: ${input.domainTitle ?? "-"}`,
    `contains: ${input.contains}`,
    `used_by: ${input.usedBy}`,
    `depends_on: ${input.dependsOn}`,
    `belongs_to: ${input.belongsTo}`,
    `related: ${input.related}`,
    `evidence: ${input.evidence}`,
    `contains_names: ${list(input.containsNames)}`,
    `used_by_names: ${list(input.usedByNames)}`,
    `depends_names: ${list(input.dependsNames)}`,
    `belongs_to_names: ${list(input.belongsToNames)}`,
    `related_names: ${list(input.relatedNames)}`,
    ...(input.domainUsage
      ? [
          `used_by_domains: ${list(input.domainUsage.usedBy.map((row) => `${row.label} (${row.links})`))}`,
          `needs_domains: ${list(input.domainUsage.needs.map((row) => `${row.label} (${row.links})`))}`,
          "domains_basis: depends_on links between the two domains' concepts, counted as the map draws them",
        ]
      : []),
    ...(input.source === "read-only-sample"
      ? [
          "write_guard: do not run get_concept / patch_concept / add_relation for this sample node",
        ]
      : []),
    next,
  ].join("\n");
}
