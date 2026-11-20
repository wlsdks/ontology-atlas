/** The constant of reciprocal rank fusion: an item at rank r in one list scores 1 / (k + r). */
const RRF_K = 60;

export interface FusedLead<T> {
  item: T;
  /** Indexes of the input lists that held this item, ascending. */
  lists: number[];
}

/**
 * Reciprocal rank fusion of ranked lists. An item's score is the sum over the lists that hold it
 * of 1 / (60 + rank), rank counted from 1; equal scores fall to `tieBreak`, then to the key, so
 * the order is total and does not depend on the order of the input lists. An item is matched
 * across lists by its key, and the copy from the first list that holds it is returned.
 *
 * O(N log N) for N items across all lists.
 */
export function fuseRankedLists<T>(
  lists: readonly (readonly T[])[],
  key: (item: T) => string,
  tieBreak: (a: T, b: T) => number,
): FusedLead<T>[] {
  const fused = new Map<string, { key: string; item: T; lists: number[]; ranks: number[]; score: number }>();
  lists.forEach((list, listIndex) => {
    const seen = new Set<string>();
    list.forEach((item, rank) => {
      const id = key(item);
      if (seen.has(id)) return;
      seen.add(id);
      const entry = fused.get(id);
      if (entry) {
        entry.ranks.push(rank + 1);
        entry.lists.push(listIndex);
      } else fused.set(id, { key: id, item, lists: [listIndex], ranks: [rank + 1], score: 0 });
    });
  });
  /* Summed in rank order, so the same ranks give the same float whichever list came first. */
  for (const entry of fused.values()) {
    entry.score = [...entry.ranks].sort((a, b) => a - b).reduce((sum, rank) => sum + 1 / (RRF_K + rank), 0);
  }
  return [...fused.values()]
    .sort((a, b) => b.score - a.score || tieBreak(a.item, b.item) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ item, lists: held }) => ({ item, lists: held }));
}
