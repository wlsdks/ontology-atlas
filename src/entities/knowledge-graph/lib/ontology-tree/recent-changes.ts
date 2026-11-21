import type { KnowledgeGraphNode } from "../../model";

/**
 * Documents changed in the last N days, by caller-supplied dates (Git's last commit for untouched
 * files, since checkouts restamp mtimes). Map lens and docs sidebar share the window arithmetic.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const RECENT_CHANGES_DEFAULT_WINDOW_DAYS = 7;

/** `nowMs` is a session snapshot, so documents created later count as today within 24h. */
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

/** Unparseable dates are false: unknown is not recent. */
export function isWithinRecentWindow(
  updatedAtIso: string,
  nowMs: number,
  windowDays: number = RECENT_CHANGES_DEFAULT_WINDOW_DAYS,
): boolean {
  const updatedMs = Date.parse(updatedAtIso);
  if (!Number.isFinite(updatedMs)) return false;
  const ageMs = nowMs - updatedMs;
  if (ageMs < -FUTURE_TOLERANCE_MS) return false;
  return ageMs <= windowDays * DAY_MS;
}

/** Whole days, floored; +Infinity when unparseable. */
export function daysAgoFromIso(updatedAtIso: string, nowMs: number): number {
  const updatedMs = Date.parse(updatedAtIso);
  if (!Number.isFinite(updatedMs)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((nowMs - updatedMs) / DAY_MS));
}

/** Kinds with a document that are never drawn as nodes, so the lens does not count them. */
const NON_GRAPH_NODE_KINDS: ReadonlySet<string> = new Set(["document", "vault-readme"]);

export function isGraphDrawnKind(kind: string): boolean {
  return !NON_GRAPH_NODE_KINDS.has(kind);
}

interface RecentChangeRow {
  id: string;
  title: string;
  kind: string;
  /** 0 means today. */
  agoDays: number;
}

export interface RecentChangesResult {
  recentNodeIds: Set<string>;
  rows: RecentChangeRow[];
}

/** Node dates come from `freshnessIndex` via `evidenceIds[0]`; unknown and undrawn nodes are left out. */
export function computeRecentChanges(
  nodes: readonly KnowledgeGraphNode[],
  freshnessIndex: ReadonlyMap<string, string>,
  nowMs: number,
  windowDays: number = RECENT_CHANGES_DEFAULT_WINDOW_DAYS,
): RecentChangesResult {
  const recentNodeIds = new Set<string>();
  const rows: RecentChangeRow[] = [];

  for (const node of nodes) {
    // Undrawn kinds would make the count disagree with the rows.
    if (!isGraphDrawnKind(node.kind)) continue;
    const slug = node.evidenceIds[0];
    if (!slug) continue;
    const updatedAt = freshnessIndex.get(slug);
    if (!updatedAt) continue;
    if (!isWithinRecentWindow(updatedAt, nowMs, windowDays)) continue;

    recentNodeIds.add(node.id);
    rows.push({
      id: node.id,
      title: node.title,
      kind: node.kind,
      agoDays: daysAgoFromIso(updatedAt, nowMs),
    });
  }

  rows.sort((a, b) => a.agoDays - b.agoDays || a.title.localeCompare(b.title));
  return { recentNodeIds, rows };
}

/** Narrows until at most `maxShare` passes, never into an empty window; 1 day stands even overflowing. */
const RECENT_CHANGES_ADAPTIVE_LADDER_DAYS: readonly number[] = [7, 3, 1];

export interface AdaptiveRecentChangesResult extends RecentChangesResult {
  windowDays: number;
}

export function computeAdaptiveRecentChanges(
  nodes: readonly KnowledgeGraphNode[],
  freshnessIndex: ReadonlyMap<string, string>,
  nowMs: number,
  maxShare = 0.5,
): AdaptiveRecentChangesResult {
  // Only drawn nodes in the denominator too.
  const total = nodes.filter((node) => isGraphDrawnKind(node.kind)).length;
  let last: AdaptiveRecentChangesResult | null = null;
  for (const windowDays of RECENT_CHANGES_ADAPTIVE_LADDER_DAYS) {
    const result = computeRecentChanges(nodes, freshnessIndex, nowMs, windowDays);
    if (last && result.recentNodeIds.size === 0) return last;
    last = { ...result, windowDays };
    if (total === 0 || result.recentNodeIds.size / total <= maxShare) return last;
  }
  return last as AdaptiveRecentChangesResult;
}

export function selectRecentVaultDocs<T extends { updatedAt: string }>(
  docs: readonly T[],
  nowMs: number,
  windowDays: number = RECENT_CHANGES_DEFAULT_WINDOW_DAYS,
): T[] {
  return docs
    .filter((doc) => isWithinRecentWindow(doc.updatedAt, nowMs, windowDays))
    .slice()
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}
