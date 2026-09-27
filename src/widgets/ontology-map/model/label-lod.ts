/**
 * Top-K label budget by degree for the overview and circuit bands, so hubs and the spine
 * are named rather than whichever leaf wins the greedy race (`docs/design/ontology-map.md`;
 * overview first, `.claude/rules/design.md`). Lifted at element zoom. Exempt labels (ego
 * members, the hovered node) are always kept. Deterministic on ties by id; the caller
 * (`ui/topology-frame-draw.ts`) applies the allow set before greedy placement.
 */

import { DEFAULT_EXPAND } from "@/shared/lib/appearance-preferences";

export const LABEL_TOP_K = 20;

/**
 * Only each expanded disc's DOI top K children become label candidates, so an expand does
 * not punch a wall of labels. The preference (on expand, how many names to attempt) is the
 * single source; this is its default, as with `focus-state.ts` `EGO_NEIGHBOR_LIMIT`.
 */
export const DISC_LABEL_TOP_K = DEFAULT_EXPAND.labelAttempts;

/** The caller ranks each disc (`rankEgoNeighborsByDOI`); this is the union of each top `k`. */
export function selectDiscLabelEligible(
  rankedChildrenByDisc: readonly (readonly string[])[],
  k: number = DISC_LABEL_TOP_K,
): Set<string> {
  const eligible = new Set<string>();
  const cap = Math.max(0, k);
  for (const ranked of rankedChildrenByDisc) {
    const take = Math.min(cap, ranked.length);
    for (let i = 0; i < take; i += 1) eligible.add(ranked[i]);
  }
  return eligible;
}

/**
 * Below the cap every focused neighbour stays exempt (`doiEligibleIds === null`); at or
 * above it only the DOI top K do, and the rest compete normally, so only colliding labels
 * drop to dots.
 */
export function isEgoNeighborLabelExempt(
  neighborId: string,
  doiEligibleIds: ReadonlySet<string> | null,
): boolean {
  return doiEligibleIds === null || doiEligibleIds.has(neighborId);
}

export interface LabelRankEntry {
  /** The tiebreaker on equal degree. */
  id: string;
  degree: number;
  /** Kept unconditionally without consuming the K budget; expanded disc children are not exempt. */
  exempt: boolean;
}

/**
 * Every exempt id plus the top `k` non-exempt by degree, ties by id for frame-to-frame
 * determinism. O(n log n).
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
