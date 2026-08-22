import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";

/**
 * Derives the "dusty" nodes — long-untouched ones — and sinks them through the
 * engine's existing stale channel (dash [3,3] plus the opaque stale token pair,
 * `model/freshness.ts`) so neglect reads together with graph position. No new
 * draw code or tokens: it only wires `topology-world`'s `stale` flag.
 *
 * The test is relative (strictly below the median mtime) **and** absolute (older
 * than `max(30 days, 2 x median age)`). Ties count as fresh, which means a bulk
 * import or a fresh `git clone` — where every file shares one mtime — marks
 * nothing at all; that is the intended limit, since the alternative is
 * synthesizing dates.
 *
 * The multiplier is the fallback from the guardian's first review (2026-07-23):
 * a plain "below median and over 30 days" test marked the majority of the
 * dogfood vault dusty (56/105), i.e. half of a healthy but slowly maintained
 * vault was permanently dusty. Marking only the tail that lags 2x the median age
 * narrows the signal to real neglect.
 *
 * The bottom-quartile cap (dusty never exceeds 25% of nodes, oldest first) comes
 * from a second dogfood measurement: in an actively maintained vault (median 4
 * days) a large neglected tail escapes the multiplier too, because the
 * distribution is bimodal. This signal is meant to find the dustiest corner, not
 * to take a staleness inventory, and the cap is what preserves the map's
 * attention economy.
 *
 * Dates come from vault document mtime (`useVaultDocFreshnessIndex`:
 * `file.lastModified` locally, a build-time git stamp for dogfood), keyed by
 * `evidenceIds[0]`. A node with no date is fresh.
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
  // Bottom-quartile cap: oldest first, at most 25% of the population. Ties on
  // timestamp break by ascending id so the result is deterministic.
  candidates.sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1));
  // Floor of 1 so a genuinely old node is still visible in a small vault: under
  // four nodes, any that passes the conditions still shows.
  const cap = Math.max(1, Math.floor(mtimeById.size / 4));
  return new Set(candidates.slice(0, cap).map((c) => c.id));
}
