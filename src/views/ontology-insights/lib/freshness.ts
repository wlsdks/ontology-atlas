import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { isEvidenceOnlyConcept, buildContainmentParents, nearestDomainId } from "@/entities/knowledge-graph";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * The window every dated claim on this board uses: one month as four weekly cells, a horizon a person acts in.
 * Copy reaches it through `{weeks}` placeholders, so changing it cannot leave a caption wrong.
 */
const HEATSTRIP_WEEKS = 4;
export const FRESHNESS_WINDOW_WEEKS = HEATSTRIP_WEEKS;
const STALE_DAYS = 90;

/** 0 (none) to 3 (three or more), from real counts. */
type FreshnessLevel = 0 | 1 | 2 | 3;

interface FreshnessWeekCell {
  level: FreshnessLevel;
  /** The current week, emphasized in indigo. */
  isCurrentWeek: boolean;
  /** The raw count behind the tooltip; `level` saturates at 3. */
  count: number;
}

export interface DomainFreshnessRow {
  domainId: string;
  domainTitle: string;
  /** Oldest week to newest, HEATSTRIP_WEEKS long. */
  weeks: FreshnessWeekCell[];
  /** Null when no date is known at all. */
  mostRecentUpdatedAt: string | null;
  daysAgo: number | null;
  /** True when even the most recent update is older than STALE_DAYS. */
  stale: boolean;
}

export interface RecentUpdateRow {
  nodeId: string;
  title: string;
  kind: string;
  domainTitle: string | null;
  updatedAt: string;
  /** The citing document's slug, on evidence-layer rows only: it tells apart derived nodes with the same title. */
  ref?: string;
}

export interface FreshnessSummary {
  domainRows: DomainFreshnessRow[];
  /** The concept layer: only nodes with their own `.md`, where "recently updated" means someone changed this concept. */
  recent: RecentUpdateRow[];
  /**
   * The evidence layer: derived nodes another document merely named, split off by `isEvidenceOnlyConcept` like the
   * connections tab's impact ranking. Their date is the citing document's mtime, not a change to the concept.
   */
  recentEvidence: RecentUpdateRow[];
  /** How many concept-layer rows are datable in all; `recent` is capped at `recentLimit`. */
  recentTotal: number;
  /** The evidence layer's total, which the folded toggle states. */
  recentEvidenceTotal: number;
  /**
   * Domain, capability and element nodes with a known date older than STALE_DAYS; an unknown date is excluded,
   * since missing data is not an old value.
   */
  staleCount: number;
  /** Weekly counts summed across all domains over the heat strip's window; the census strip draws them. */
  weeklyTotals: number[];
}

function levelFromCount(count: number): FreshnessLevel {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  return 3;
}

/**
 * Resolves a node's update date from its first evidence document (`evidenceIds[0]`) via the
 * manifest's `updatedAt`. The build writes the commit day, falling back to mtime for dirty or untracked files; a local folder
 * in a browser uses `lastModified`, which a clone or checkout moves. So no surface may phrase this date as what the
 * person did: only Git (`vault-history.ts`) says what was worked on.
 */
function resolveNodeUpdatedAt(
  node: KnowledgeGraphNode,
  docUpdatedAtBySlug: ReadonlyMap<string, string>,
): string | null {
  const slug = node.evidenceIds[0];
  if (!slug) return null;
  return docUpdatedAtBySlug.get(slug) ?? null;
}

const CONTENT_KINDS = new Set(["domain", "capability", "element"]);

/**
 * Tab 3, freshness: a domain x week heat strip, the recently updated list, and nodes not updated in STALE_DAYS,
 * all from real document dates.
 */
export function computeFreshnessSummary(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  docUpdatedAtBySlug: ReadonlyMap<string, string>,
  referenceDate: Date,
  options?: { recentLimit?: number; recentEvidenceLimit?: number },
): FreshnessSummary {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const parentOf = buildContainmentParents(edges, nodeById);
  const domainNodes = nodes.filter((n) => n.kind === "domain");
  const domainTitleById = new Map(domainNodes.map((d) => [d.id, d.display ?? d.title]));

  type Resolved = { node: KnowledgeGraphNode; updatedAt: string | null; domainId: string | null };
  const resolved: Resolved[] = nodes.map((node) => ({
    node,
    updatedAt: resolveNodeUpdatedAt(node, docUpdatedAtBySlug),
    domainId: nearestDomainId(node, parentOf, nodeById),
  }));

  // Weekly buckets per domain, counted back from `referenceDate` (weeksAgo 0 is the last seven days) rather than on
  // calendar week boundaries, so "1 day ago" never lands in last week.
  const nowMs = referenceDate.getTime();
  const countsByDomain = new Map<string, number[]>();
  const latestByDomain = new Map<string, number>();
  const weeklyTotals = new Array(HEATSTRIP_WEEKS).fill(0);
  for (const domain of domainNodes) {
    countsByDomain.set(domain.id, new Array(HEATSTRIP_WEEKS).fill(0));
  }

  for (const { node, updatedAt, domainId } of resolved) {
    if (!domainId || !updatedAt || !CONTENT_KINDS.has(node.kind)) continue;
    const counts = countsByDomain.get(domainId);
    if (!counts) continue;
    const updatedMs = Date.parse(updatedAt);
    if (!Number.isFinite(updatedMs)) continue;
    const weeksAgo = Math.floor((nowMs - updatedMs) / WEEK_MS);
    const bucketFromOldest = HEATSTRIP_WEEKS - 1 - weeksAgo;
    if (bucketFromOldest >= 0 && bucketFromOldest < HEATSTRIP_WEEKS) {
      counts[bucketFromOldest] += 1;
      weeklyTotals[bucketFromOldest] += 1;
    }
    const currentLatest = latestByDomain.get(domainId);
    if (currentLatest === undefined || updatedMs > currentLatest) {
      latestByDomain.set(domainId, updatedMs);
    }
  }

  const domainRows: DomainFreshnessRow[] = domainNodes
    .map((domain) => {
      const counts = countsByDomain.get(domain.id) ?? new Array(HEATSTRIP_WEEKS).fill(0);
      const weeks: FreshnessWeekCell[] = counts.map((count, i) => ({
        level: levelFromCount(count),
        isCurrentWeek: i === HEATSTRIP_WEEKS - 1,
        count,
      }));
      const latestMs = latestByDomain.get(domain.id) ?? null;
      const daysAgo = latestMs !== null ? Math.floor((referenceDate.getTime() - latestMs) / DAY_MS) : null;
      return {
        domainId: domain.id,
        domainTitle: domain.display ?? domain.title,
        weeks,
        mostRecentUpdatedAt: latestMs !== null ? new Date(latestMs).toISOString() : null,
        daysAgo,
        stale: daysAgo !== null && daysAgo > STALE_DAYS,
      };
    })
    .sort((a, b) => {
  // Domains with a known date first (newest first); unknown ones last.
      if (a.daysAgo === null && b.daysAgo === null) return a.domainTitle.localeCompare(b.domainTitle);
      if (a.daysAgo === null) return 1;
      if (b.daysAgo === null) return -1;
      return a.daysAgo - b.daysAgo;
    });

  const dated = resolved
    .filter((r): r is Resolved & { updatedAt: string } => r.updatedAt !== null)
    .sort(
      (a, b) =>
        Date.parse(b.updatedAt) - Date.parse(a.updatedAt) ||
        a.node.title.localeCompare(b.node.title),
    );
  const toRow = (r: Resolved & { updatedAt: string }, withRef: boolean): RecentUpdateRow => ({
    nodeId: r.node.id,
    title: r.node.display ?? r.node.title,
    kind: r.node.kind,
    domainTitle: r.domainId ? (domainTitleById.get(r.domainId) ?? null) : null,
    updatedAt: r.updatedAt,
    // Only derived rows carry the reference; a concept row already names its own document.
    ref: withRef ? (r.node.ref ?? r.node.evidenceIds[0]) : undefined,
  });
  const recentLimit = options?.recentLimit ?? 8;
  const evidenceLimit = options?.recentEvidenceLimit ?? 4;
  const ownDocRows = dated.filter((r) => !isEvidenceOnlyConcept(r.node));
  const evidenceRows = dated.filter((r) => isEvidenceOnlyConcept(r.node));
  const recent: RecentUpdateRow[] = ownDocRows.slice(0, recentLimit).map((r) => toRow(r, false));
  const recentEvidence: RecentUpdateRow[] = evidenceRows
    .slice(0, evidenceLimit)
    .map((r) => toRow(r, true));

  const staleCount = resolved.filter(({ node, updatedAt }) => {
    if (!CONTENT_KINDS.has(node.kind) || !updatedAt) return false;
    const updatedMs = Date.parse(updatedAt);
    if (!Number.isFinite(updatedMs)) return false;
    const daysAgo = (referenceDate.getTime() - updatedMs) / DAY_MS;
    return daysAgo > STALE_DAYS;
  }).length;

  return {
    domainRows,
    recent,
    recentTotal: ownDocRows.length,
    recentEvidence,
    recentEvidenceTotal: evidenceRows.length,
    staleCount,
    weeklyTotals,
  };
}
