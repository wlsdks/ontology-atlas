import type { KnowledgeGraphNode } from "../../model";

/**
 * Single source of truth for the "recent changes" lens. The semantics are an
 * **mtime window of N days** — a different question from `ontology-changeset.ts`,
 * which asks "what changed since the last baseline". This module answers "which
 * documents were actually modified in the last N days".
 *
 * Two surfaces share the window arithmetic: the map lens
 * (`computeRecentChanges`, ontology node → `evidenceIds[0]` → the vault
 * document's real update date, looked up indirectly) and the docs sidebar strip
 * (`selectRecentVaultDocs`, reading `VaultDoc.updatedAt` directly, since the
 * document already carries the real date). Both call the same
 * `isWithinRecentWindow` / `daysAgoFromIso` helpers so that "recent" cannot come
 * to mean different things on different surfaces.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** The lens's default window — 7 days, matching the question it answers ("what changed in the last 7 days"). */
export const RECENT_CHANGES_DEFAULT_WINDOW_DAYS = 7;

/**
 * Tolerance for timestamps slightly in the future. `nowMs` is a snapshot taken at
 * the session's first render, so a document created later in the session (the
 * first bootstrap, for instance) has an mtime *after* that snapshot. Excluding
 * all of those produced the observed contradiction "6 nodes just created, 0
 * recent changes". Anything within 24h ahead counts as today; beyond that is real
 * clock skew or bad data and is excluded.
 */
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

/**
 * Whether `updatedAtIso` falls inside the past `windowDays` relative to `nowMs`.
 * An unparseable value is false — unknown is not the same as recent. A future
 * timestamp counts as today when it is inside the 24h tolerance.
 */
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

/** Whole days between `updatedAtIso` and `nowMs`, rounded down. +Infinity when unparseable. */
export function daysAgoFromIso(updatedAtIso: string, nowMs: number): number {
  const updatedMs = Date.parse(updatedAtIso);
  if (!Number.isFinite(updatedMs)) return Number.POSITIVE_INFINITY;
  // A future timestamp inside the tolerance (created mid-session) is day 0, "today" — never negative.
  return Math.max(0, Math.floor((nowMs - updatedMs) / DAY_MS));
}

interface RecentChangeRow {
  id: string;
  title: string;
  kind: string;
  /** From `daysAgoFromIso` — 0 means today. */
  agoDays: number;
}

export interface RecentChangesResult {
  recentNodeIds: Set<string>;
  /** Newest first (ascending `agoDays`). */
  rows: RecentChangeRow[];
}

/**
 * Ontology nodes → the "recent changes" lens. A node carries no timestamp of its
 * own (frontmatter has none), but `node.evidenceIds[0]` is the slug of the vault
 * document it derives from (the `derivationToInsight` contract, same convention
 * as `use-vault-doc-freshness.ts`), so the date is looked up indirectly through
 * `freshnessIndex` (slug → real `updatedAt` ISO). A node with no `evidenceIds`,
 * or one absent from `freshnessIndex`, is treated as unknown and left out of the
 * lens rather than assumed present.
 */
export function computeRecentChanges(
  nodes: readonly KnowledgeGraphNode[],
  freshnessIndex: ReadonlyMap<string, string>,
  nowMs: number,
  windowDays: number = RECENT_CHANGES_DEFAULT_WINDOW_DAYS,
): RecentChangesResult {
  const recentNodeIds = new Set<string>();
  const rows: RecentChangeRow[] = [];

  for (const node of nodes) {
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

/**
 * Adaptive lens window. On a day with a bulk commit, a 7-day window let 80% of the
 * graph through and the lens stopped filtering anything. The window narrows down
 * this ramp and uses the first step whose pass rate is at or under `maxShare`
 * (default 50%). If even 1 day overflows, the 1-day result is returned as is — a
 * vault where everything really did change today is not lied about by narrowing
 * the window until the answer is 0.
 */
const RECENT_CHANGES_ADAPTIVE_LADDER_DAYS: readonly number[] = [7, 3, 1];

export interface AdaptiveRecentChangesResult extends RecentChangesResult {
  /** The window actually used, in days. */
  windowDays: number;
}

export function computeAdaptiveRecentChanges(
  nodes: readonly KnowledgeGraphNode[],
  freshnessIndex: ReadonlyMap<string, string>,
  nowMs: number,
  maxShare = 0.5,
): AdaptiveRecentChangesResult {
  const total = nodes.length;
  let last: AdaptiveRecentChangesResult | null = null;
  for (const windowDays of RECENT_CHANGES_ADAPTIVE_LADDER_DAYS) {
    const result = computeRecentChanges(nodes, freshnessIndex, nowMs, windowDays);
    last = { ...result, windowDays };
    if (total === 0 || result.recentNodeIds.size / total <= maxShare) return last;
  }
  return last as AdaptiveRecentChangesResult;
}

/**
 * Vault documents (the minimal `VaultDoc`-compatible shape) → the "recent
 * changes" list, newest first. The document already carries a real `updatedAt`
 * (local mode: `file.lastModified`; static/dogfood: the build-time value), so the
 * indirect `freshnessIndex` lookup `computeRecentChanges` needs is unnecessary
 * here — but the same `isWithinRecentWindow` arithmetic is shared so the two
 * surfaces cannot diverge on what "recent" means.
 */
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

// The node id behind the "agent just touched this" badge is deliberately not
// derived here. `HomePage.tsx` already normalises heartbeat focus → graph node id
// through `resolveAgentFocusNodeId`
// (`views/home/lib/resolve-agent-focus-node.ts`), so the badge is one set lookup
// against `recentNodeIds`. A second matching heuristic would let the two surfaces
// disagree about which node the agent is looking at.
