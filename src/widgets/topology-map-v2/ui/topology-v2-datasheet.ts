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
 * R+ unified count semantics: groups used to split by relation TYPE (containment
 * vs depends) while the metric line above counted by DIRECTION (incoming vs
 * outgoing) — the same words ("Contains"/"Depends" next to "Uses"/"Is Used By"), two
 * different axes, so the numbers never reconciled (persona finding: header
 * "used by 10 · depends on 73" vs groups "Contains 71 / Depends 12"). Groups are now
 * DIRECTION-based too, computed from the exact same connection set the metric
 * line counts — the header count and the group total are the SAME number by
 * construction, not just by convention. Relation TYPE (containment vs depends)
 * demotes to a per-row trace mark (`TopologyV2DetailPanel.tsx`'s `TraceMark`),
 * still visible, just no longer the grouping axis.
 *
 * R+ full-detail A1: the base connection derivation (`buildConnections`/
 * `groupConnectionsByDirection` + structural types) moved to
 * `entities/knowledge-graph/lib/ontology-tree/connections.ts` so the NEW `full-detail-a1` widget
 * (topology "Full Detail" / `/ontology` full-detail surface) can reuse
 * FSD forbids widget→widget imports, so shared derivation lives one layer
 * down. Re-exported here under the SAME `V2`-prefixed names so this file's
 * existing consumers (`HomePage.tsx`, `TopologyV2DetailPanel`, this module's
 * own tests) needed zero changes.
 */
export {
  buildConnections as buildV2Connections,
  groupConnectionsByDirection as groupV2ConnectionsByDirection,
  type DatasheetConnection as V2DatasheetConnection,
} from "@/entities/knowledge-graph";
import { groupConnectionsByRole } from "@/entities/knowledge-graph";
import type { DatasheetConnection as V2DatasheetConnection } from "@/entities/knowledge-graph";

/**
 * S2 part 3 — when the "Contains" (what this contains) list is long (>15), show an
 * aggregate summary by kind and path prefix instead of individual rows (e.g.
 * "cli/src/commands 48 · .claude/skills 6 · Other 12"). Pure and deterministic:
 * count per prefix → descending count, ties by key alphabetically → only the top
 * `maxGroups` are named, and the rest plus prefix-less rows become `otherCount`
 * ("Other", other).
 */
export interface V2ContainsGroupSummary {
  groups: { key: string; count: number }[];
  otherCount: number;
  total: number;
  /**
   * B4 (the H1 non-developer language layer) — does the summary actually carry
   * information? `false` means it collapsed into a single "Other" lump and
   * carries nothing, so the panel renders the individual list instead. `true` as
   * soon as one named group exists.
   */
  usable: boolean;
}

/** The threshold that turns the "Contains" group summary on — a total **above** this shows the summary. */
export const V2_CONTAINS_SUMMARY_THRESHOLD = 15;

/** Take only the slug part of a node id (`kind:slug`), dropping the `kind:` prefix. */
function idToSlug(id: string): string {
  const colon = id.indexOf(":");
  return colon === -1 ? id : id.slice(colon + 1);
}

/** The directory prefix up to the last slash — null with no slash (folds into "Other").
 * e.g. `cli/src/commands/add` → `cli/src/commands`. */
function deepPrefixKey(id: string): string | null {
  const slug = idToSlug(id);
  const slash = slug.lastIndexOf("/");
  if (slash === -1) return null;
  return slug.slice(0, slash);
}

/** The first path segment (one level) — null with no slash. e.g.
 * `cli/src/commands/add` → `cli`, `.claude/skills/x` → `.claude`. Used to re-split
 * more coarsely when deep prefixes all scatter to count 1 and collapse into "Other". */
function coarsePrefixKey(id: string): string | null {
  const slug = idToSlug(id);
  const slash = slug.indexOf("/");
  if (slash === -1) return null;
  return slug.slice(0, slash);
}

/** Build prefix buckets from one key function (pure). Descending count, ties by key
 * alphabetically. Only the top `cap` are named; the rest plus prefix-less rows become `otherCount`. */
function bucketByKey(
  rows: readonly V2DatasheetConnection[],
  keyOf: (id: string) => string | null,
  cap: number,
): { groups: { key: string; count: number }[]; otherCount: number } {
  const counts = new Map<string, number>();
  let noPrefix = 0;
  for (const row of rows) {
    const key = keyOf(row.id);
    if (key === null) {
      noPrefix += 1;
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
  );
  const named = sorted.slice(0, cap);
  let otherCount = noPrefix;
  for (const [, c] of sorted.slice(cap)) otherCount += c;
  return { groups: named.map(([key, count]) => ({ key, count })), otherCount };
}

/**
 * Aggregate "Contains" rows by path prefix. Deterministic: descending count, ties by
 * key alphabetically. Only the top `maxGroups` are named; the remaining prefixes plus
 * prefix-less rows fold into `otherCount`.
 *
 * B4 (H1) — when the deep prefixes all scatter and "Other" takes the majority (zero
 * information), re-split more coarsely on the first path segment and take whichever
 * actually divides. If still no group is named (no row has a slash), mark
 * `usable: false` so the panel renders the individual list instead.
 */
export function summarizeContainsByPathPrefix(
  rows: readonly V2DatasheetConnection[],
  maxGroups: number = 4,
): V2ContainsGroupSummary {
  const total = rows.length;
  const cap = Math.max(0, maxGroups);
  const deep = bucketByKey(rows, deepPrefixKey, cap);

  // If "Other" takes the majority or no group is named, retry with the coarser one-level prefix.
  let chosen = deep;
  if (deep.groups.length === 0 || deep.otherCount * 2 > total) {
    const coarse = bucketByKey(rows, coarsePrefixKey, cap);
    // Take whichever has the larger named coverage (= total - otherCount), keeping the
    // more specific deep split on a tie.
    const deepCovered = total - deep.otherCount;
    const coarseCovered = total - coarse.otherCount;
    if (coarseCovered > deepCovered) chosen = coarse;
  }

  return {
    groups: chosen.groups,
    otherCount: chosen.otherCount,
    total,
    usable: chosen.groups.length > 0,
  };
}

/** One relation-role group as the panel renders it: a capped preview of rows +
 * the group's TRUE total (so the header can say "Uses 23" while showing 6). */
export interface V2ConnectionGroupView {
  rows: V2DatasheetConnection[];
  total: number;
  /**
   * The uncapped full rows — the material that makes "+N" a door you open in place
   * rather than a dead number (2026-08-13, the same lineage as rejecting the project
   * detail's "N more capabilities"). It references the pre-cap array directly, so the extra
   * cost is one reference.
   */
  allRows?: V2DatasheetConnection[];
  /**
   * S2 part 3 — the path-prefix aggregate, filled only for the "Contains" group (shown
   * instead of the individual list once the total exceeds the threshold). Computed
   * over all rows, before the cap.
   */
  summary?: V2ContainsGroupSummary;
}
export interface V2ConnectionGroupsView {
  /** Outgoing containment — plain "Contains" (what this node contains). */
  contains: V2ConnectionGroupView;
  /** Incoming non-containment — plain "Uses" (places that use this). */
  usedBy: V2ConnectionGroupView;
  /** Outgoing non-containment — plain "Is Used By" (places this leans on). */
  dependsOn: V2ConnectionGroupView;
  /**
   * Incoming containment — plain "Belongs To" (the parent(s) this node belongs to).
   *
   * Scope correction (2026-07-26): for a while this bucket was neither rendered in the
   * compact popover nor counted in the "Connected" (connections) total. So the popover
   * for **a node with only a parent** (221 of the dogfood's 294 = 75%) said
   * "Connected 0" — while showing a clickable domain chip directly above it. That is a
   * checkable falsehood, so the popover now draws this group and counts it (the same
   * four buckets and the same words as the full detail).
   */
  belongsTo: V2ConnectionGroupView;
}

/** Default rows shown per group before the typed "+N" overflow. */
const V2_CONNECTION_ROW_CAP = 6;

/**
 * Group the full connection set by relation ROLE (contains / usedBy /
 * dependsOn / belongsTo) and cap each group to `perGroupCap` rows, keeping the
 * true total. M-2: containment is pulled into its OWN `contains`/`belongsTo`
 * groups instead of folding into usedBy/dependsOn by raw direction — so a
 * domain's 18 `contains` children read as "Contains 18", not "Is Used By". This
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
    allRows: rows.slice(),
  });
  return {
    // S2 part 3 — contains also carries a path-prefix summary computed over all rows
    // (past the threshold the panel renders that summary instead of individual rows).
    contains: { ...toView(grouped.contains), summary: summarizeContainsByPathPrefix(grouped.contains) },
    usedBy: toView(grouped.usedBy),
    dependsOn: toView(grouped.dependsOn),
    belongsTo: toView(grouped.belongsTo),
  };
}

export interface V2MetricValues {
  /** Outgoing containment — plain "Contains" (what this node contains). Only
   *  rendered when > 0 (leaf nodes contain nothing, so the segment is hidden
   *  for them rather than showing a noisy "Contains 0"). */
  contains: number;
  /** Direct incoming non-containment — plain "Uses" (places that use this). */
  usedBy: number;
  /** Direct outgoing non-containment — plain "Is Used By" (places this leans on). */
  dependsOn: number;
  /**
   * Direct incoming containment — plain "Belongs To" (the parent(s) this node sits
   * inside). Most nodes have nothing but a parent, so leaving this out zeroes the
   * total (see the `V2ConnectionGroupsView.belongsTo` comment).
   */
  belongsTo: number;
  /** Node-level evidence references — plain "Evidence". */
  evidence: number;
}

export interface V2MetricLabels {
  contains: string;
  usedBy: string;
  dependsOn: string;
  belongsTo: string;
  evidence: string;
}

/** One typed segment of the engraved metric line — `key` matches the
 * connection-group id below it (`data-datasheet-group`), so the strip and the
 * groups stay reconciled by construction. */
export interface V2MetricSegment {
  key: "contains" | "usedBy" | "dependsOn" | "belongsTo" | "evidence";
  label: string;
  value: number;
}

/**
 * The ONE engraved metric line's segments — "Contains 18 · Uses 4 · Is Used By
 * 2 · Evidence 1". Replaces the old subtitle + count boxes (the owner's
 * *"Information appears three times"* — the same information appears three times); every fact
 * appears exactly once. M-2: the leading "Contains" segment appears ONLY for
 * container nodes (`contains > 0`) — a leaf's line stays "Uses · Is Used By ·
 * Evidence", so the typed split adds signal for domains without adding a "Contains 0"
 * to every element.
 *
 * Datasheet internal refinement (2026-07-23) — segments are exposed structured (not
 * only joined) so the panel can set label ink (tertiary) apart from value ink
 * (`--topology-v2-panel-metric-text`): the numbers are the data, the words
 * are the scale markings (Tufte data-ink). Each segment's ink pairing is the
 * SAME pairing the group headers use, which is what visually links a strip
 * count to its group below without any new interaction.
 */
export function buildV2MetricSegments(
  values: V2MetricValues,
  labels: V2MetricLabels,
): V2MetricSegment[] {
  const segments: V2MetricSegment[] = [];
  if (values.contains > 0)
    segments.push({ key: "contains", label: labels.contains, value: values.contains });
  segments.push({ key: "usedBy", label: labels.usedBy, value: values.usedBy });
  segments.push({ key: "dependsOn", label: labels.dependsOn, value: values.dependsOn });
  // "Belongs To" follows the same rule as "Contains" — hidden only at 0, so a root or
  // orphan node never carries "Belongs To 0". Hiding it when it exists is the defect above.
  if (values.belongsTo > 0)
    segments.push({ key: "belongsTo", label: labels.belongsTo, value: values.belongsTo });
  segments.push({ key: "evidence", label: labels.evidence, value: values.evidence });
  return segments;
}

/** Joined-string form of `buildV2MetricSegments` — kept for handoff/plain
 * text consumers and as the single source of the "label value · …" grammar. */
export function formatV2MetricLine(
  values: V2MetricValues,
  labels: V2MetricLabels,
): string {
  return buildV2MetricSegments(values, labels)
    .map((s) => `${s.label} ${s.value}`)
    .join(" · ");
}

/** One row in the promoted evidence group — RATIO-SYSTEM §4 scale-up (owner:
 * *"The information is good but far too small."* — the information is good but far too small).
 * Built from `KnowledgeGraphNode.evidenceIds` (a vault slug like
 * "capabilities/product-owner-operating-system" — the node's own backing `.md`, see
 * `derivationToInsight`'s doc comment), split into a readable `title` (the last path
 * segment) and a `path` prefix (everything before it, trailing slash kept) so the row
 * reads like the mockup's doc-link ("PRODUCT-OWNER-OPERATING-SYSTEM.md" / "docs/").
 * Rows are read-only/informational — evidenceIds are vault slugs, a different
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

/**
 * Take only the last segment of a path-like string (a slug or vault path) — the
 * cleanup of the sticky footer permanently exposing the whole slug
 * (`ontology/capabilities/mcp-server`), from the 2026-07-24 Toss C2 audience-language
 * pass. With no `/` it returns the source unchanged (already short enough to cut).
 * Pure and deterministic — it reuses the same "split at the last slash" rule as
 * `buildV2EvidenceRows`'s title/path split.
 *
 * Only this result is on screen and the full source folds into the native `title=`
 * tooltip — no information is lost, because the 「All Details」 (full detail) link already
 * owns that destination (for the panel-side render see the sticky footer and evidence
 * rows in `TopologyV2DetailPanel.tsx`).
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
  /** Outgoing containment count (M-2) — `contains` edges, split out from the
   * old direction-only `depends_on` so an agent reading the handoff sees the
   * same typed facts the panel shows. */
  contains: number;
  usedBy: number;
  dependsOn: number;
  /** Incoming containment count — the parent. While this was missing, the handoff for a
   *  node with only a parent read `contains: 0 / used_by: 0 / depends_on: 0`, so an agent
   *  saw an orphan node — when it actually sits under a domain or capability. */
  belongsTo: number;
  evidence: number;
  /** Names of the containment-child (contains) group's rows. */
  containsNames: readonly string[];
  /** Names of the incoming non-containment (usedBy) group's rows. */
  usedByNames: readonly string[];
  /** Names of the outgoing non-containment (dependsOn) group's rows. */
  dependsNames: readonly string[];
  /** Names of the incoming containment (belongsTo) group's rows — the parent names. */
  belongsToNames: readonly string[];
}

/**
 * Agent-ready handoff payload (MCP/CLI-style) for a single node — the
 * 「Copy Next Action」 differentiation. Stable English field keys
 * + a suggested MCP call so it pastes cleanly into a coding agent regardless of UI
 * locale; the button label is localized, this payload is intentionally not.
 * Deterministic.
 *
 * M-2 payload shape change: containment is now its own `contains` /
 * `contains_names` fields, split OUT of `depends_on` / `depends_names` (which
 * previously folded containment children in via the direction-only grouping).
 * `used_by` no longer includes the parent either — the parent is its own
 * `belongs_to` / `belongs_to_names` pair (2026-07-26), so the payload carries
 * the same four typed buckets the panel and the full-detail surface render.
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
    `evidence: ${input.evidence}`,
    `contains_names: ${list(input.containsNames)}`,
    `used_by_names: ${list(input.usedByNames)}`,
    `depends_names: ${list(input.dependsNames)}`,
    `belongs_to_names: ${list(input.belongsToNames)}`,
    ...(input.source === "read-only-sample"
      ? [
          "write_guard: do not run get_concept / patch_concept / add_relation for this sample node",
        ]
      : []),
    next,
  ].join("\n");
}
