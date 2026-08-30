import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { isEvidenceOnlyConcept, buildContainmentParents, nearestDomainId } from "@/entities/knowledge-graph";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HEATSTRIP_WEEKS = 12;
export const FRESHNESS_WINDOW_WEEKS = HEATSTRIP_WEEKS;
const STALE_DAYS = 90;

/** A week's update intensity — 0 (none) to 3 (three or more). Derived from real counts; no decorative randomness. */
type FreshnessLevel = 0 | 1 | 2 | 3;

interface FreshnessWeekCell {
  level: FreshnessLevel;
  /** Whether this is the most recent week (this week) — emphasized separately in indigo. */
  isCurrentWeek: boolean;
  /** The week's real update count — the source of truth for the cell tooltip ("N weeks ago · M updates").
   * `level` saturates at 3, so the raw count is exposed alongside. */
  count: number;
}

export interface DomainFreshnessRow {
  domainId: string;
  domainTitle: string;
  /** Oldest week → newest, with length HEATSTRIP_WEEKS. */
  weeks: FreshnessWeekCell[];
  /** The most recent update time in this domain — null when no date is known at all. */
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
  /**
   * The slug of the document that wrote this name down. Filled **only on evidence-layer rows** —
   * it is the single fact separating two derived nodes with the same title (measured: the two hook
   * paths `.claude/` and `.codex/` produced two "Inject Ontology Summary" nodes from the basename
   * alone, making two of eight rows identical down to the characters).
   */
  ref?: string;
}

export interface FreshnessSummary {
  domainRows: DomainFreshnessRow[];
  /**
   * **The concept layer** — only nodes with their own `.md`. The only layer where "recently
   * updated" meaning "someone changed this, then" actually holds.
   */
  recent: RecentUpdateRow[];
  /**
   * **The evidence layer** — derived nodes whose names another document merely wrote down. Split
   * off into a folded area by **the same verdict** (`isEvidenceOnlyConcept`) as the impact ranking
   * on the "connections" tab.
   *
   * Why the layer is separate: a derived node's "update date" is not its own but **the mtime of
   * the document that cited it**. Standing that at the same weight as a concept makes the screen
   * say "this concept was changed today" when in fact someone else's document was (measured
   * 2026-07-26 against the dogfood vault: 7 of 8 rows were derived, two of them byte-identical).
   */
  recentEvidence: RecentUpdateRow[];
  /** The evidence layer's total — the folded toggle carries the scale in its label. */
  recentEvidenceTotal: number;
  /** How many domain/capability/element nodes have a known update date older than STALE_DAYS.
   * A node with an unknown date is "unknown", not "old", so it is excluded from the tally — missing
   * data is not asserted as an inaccurate value. */
  staleCount: number;
  /** Weekly update counts summed across all domains — the same 12-week window and the same count
   * source as the heat strip (summing each domain's weekly buckets). The source of truth for the
   * freshness tab's sparkline: not a hardcoded array but the value this function already computed. */
  weeklyTotals: number[];
}

function levelFromCount(count: number): FreshnessLevel {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  return 3;
}

/**
 * Resolves a node to its update date (an ISO string). `node.evidenceIds[0]` is the vault document
 * slug the node originated from (the `derivationToInsight` contract — the evidence document is the
 * document of first appearance). `docUpdatedAtBySlug` is a lookup built from
 * `VaultManifest.docs[].updatedAt` — the real `file.lastModified` in local mode, and a build-time
 * value in static (dogfood) mode.
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
 * Tab 3, freshness — a heat strip (domain × 12 weeks), the recently-updated list, and the count of
 * nodes not updated in 90 days. Cell values are aggregated from real document update dates rather
 * than a hardcoded array.
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
  // The short display title for a domain.
  const domainTitleById = new Map(domainNodes.map((d) => [d.id, d.display ?? d.title]));

  // Resolve (updatedAt, domainId) per node — once.
  type Resolved = { node: KnowledgeGraphNode; updatedAt: string | null; domainId: string | null };
  const resolved: Resolved[] = nodes.map((node) => ({
    node,
    updatedAt: resolveNodeUpdatedAt(node, docUpdatedAtBySlug),
    domainId: nearestDomainId(node, parentOf, nodeById),
  }));

  // Weekly bucket counts per domain. `weeksAgo=0` is the last seven days from `referenceDate` —
  // relative weeks from `referenceDate` rather than epoch-aligned week boundaries, so a value like
  // "1 day ago" does not fall into last week by boundary coincidence.
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
  // Domains with a known recent date first (newest first); unknown ones last.
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
    // The recently-updated list uses the short display title too.
    title: r.node.display ?? r.node.title,
    kind: r.node.kind,
    domainTitle: r.domainId ? (domainTitleById.get(r.domainId) ?? null) : null,
    updatedAt: r.updatedAt,
    // Only derived rows carry the reference string — a concept row already has its own document,
    // so the same information would appear twice.
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
    recentEvidence,
    recentEvidenceTotal: evidenceRows.length,
    staleCount,
    weeklyTotals,
  };
}
