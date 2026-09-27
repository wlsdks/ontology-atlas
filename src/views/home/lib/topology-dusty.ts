import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";

/**
 * Derives long-untouched "dusty" nodes and wires them to `topology-world`'s existing `stale` flag
 * (no new draw code).
 * Dusty is strictly below the median mtime and older than `max(30 days, 2 x median age)`; ties are
 * fresh,
 * so a bulk import or fresh clone marks nothing rather than inventing dates. The multiplier and
 * the 25%
 * cap keep a healthy, slowly maintained vault from reading mostly dusty. Dates come
 * from `useVaultDocFreshnessIndex` keyed by `evidenceIds[0]`; a node without a date is fresh. O(n log
 * n) for the sort.
 */
export const DUSTY_MIN_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function deriveDustySlugs(
  nodes: readonly Pick<KnowledgeGraphNode, "id" | "evidenceIds">[],
  freshnessIndex: ReadonlyMap<string, string>,
  nowMs: number,
): ReadonlySet<string> {
  const mtimeById = new Map<string, number>();
  for (const node of nodes) {
    const sourceSlug = node.evidenceIds[0];
    if (!sourceSlug) continue;
    const raw = freshnessIndex.get(sourceSlug);
    if (!raw) continue;
    const ts = Date.parse(raw);
    if (Number.isNaN(ts)) continue;
    mtimeById.set(node.id, ts);
  }
  if (mtimeById.size === 0) return new Set();

  const sorted = [...mtimeById.values()].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median =
    sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  const medianAgeMs = Math.max(0, nowMs - median);
  const minAgeMs = Math.max(DUSTY_MIN_AGE_MS, 2 * medianAgeMs);

  const candidates: Array<{ id: string; ts: number }> = [];
  for (const [id, ts] of mtimeById) {
    if (ts < median && nowMs - ts > minAgeMs) candidates.push({ id, ts });
  }
  // Oldest first; ties break by id so the result is deterministic.
  candidates.sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1));
  // Floor of 1 so a genuinely old node still shows in a vault under four nodes.
  const cap = Math.max(1, Math.floor(mtimeById.size / 4));
  return new Set(candidates.slice(0, cap).map((c) => c.id));
}
