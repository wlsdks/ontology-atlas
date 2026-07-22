/**
 * Label level-of-detail — the top-K label budget for the overview/spine and
 * mid-zoom bands (`docs/TOPOLOGY-V2-DESIGN.md` semantic-zoom charter; Shneiderman
 * "overview first, zoom and filter" — `.claude/rules/design.md`).
 *
 * WHY (S3 마감 폴리시, fable 설계): at the constellation/circuit overview the
 * greedy label placement (`render/label-layout.ts`) already suppresses
 * overlaps, but on a dense vault it still tries to paint every in-viewport
 * label and the survivors read as noise. At overview altitude the reader's
 * question is "어디가 큰가 / 무엇이 허브인가" — so the label budget should go to
 * the highest-degree nodes (the hubs, the spine), not to whichever leaf won the
 * greedy race. This module picks the top-K labels by node degree, deterministic
 * on ties (slug ascending) so the same frame always keeps the same names.
 *
 * The gate is applied ONLY in the overview/spine and circuit bands; at the
 * deepest element zoom (`model/tier-visibility.ts#classifyZoomTier === "element"`)
 * the budget is lifted — you zoomed in to read leaves, so all labels return.
 * Exempt labels (ego focus members, expanded cluster-disc children, the hovered
 * node) are ALWAYS kept regardless of K — reading the thing you're focused on
 * or pointing at is never rationed.
 *
 * Pure + deterministic — no camera/canvas/DOM knowledge. The caller
 * (`ui/topology-frame-draw.ts`) builds the entries from the frame's already-
 * viewport-filtered label candidates and applies the returned allow-set before
 * greedy placement.
 */

/** Default label budget for the gated (overview/mid) bands — top 20 by degree. */
export const LABEL_TOP_K = 20;

export interface LabelRankEntry {
  /** Node id (== vault slug id) — the deterministic tiebreaker on equal degree. */
  id: string;
  /** Node degree (neighbor count) — the ranking key; higher wins the budget. */
  degree: number;
  /**
   * Always-keep flag: the node is an ego focus member, an expanded cluster-disc
   * child, or the hovered node. Exempt entries are returned unconditionally and
   * do NOT consume the K budget (so K non-exempt labels still show alongside).
   */
  exempt: boolean;
}

/**
 * Resolves the set of node ids allowed to paint a label this frame under the
 * top-K budget. Returns:
 *   - every exempt entry's id (unconditionally), PLUS
 *   - the top `k` non-exempt entries by degree (descending), breaking ties by
 *     id ascending (lexicographic) for frame-to-frame determinism.
 *
 * `k <= 0` keeps only the exempt set; `k >= nonExemptCount` keeps everything.
 * Does not mutate the input.
 */
export function selectTopKLabels(entries: readonly LabelRankEntry[], k: number): Set<string> {
  const allowed = new Set<string>();
  const rankable: LabelRankEntry[] = [];
  for (const entry of entries) {
    if (entry.exempt) allowed.add(entry.id);
    else rankable.push(entry);
  }
  if (k > 0 && rankable.length > 0) {
    rankable.sort((a, b) => (b.degree - a.degree) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const cap = Math.min(k, rankable.length);
    for (let i = 0; i < cap; i += 1) allowed.add(rankable[i].id);
  }
  return allowed;
}
