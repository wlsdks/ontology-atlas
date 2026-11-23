export interface FusedLead<T> {
  item: T;
  /** Indexes of the input lists that held this item, ascending. */
  lists: number[];
}

/** An item a list holds and how strongly that list holds it, from 0 to 1. */
export interface ScoredItem<T> { item: T; score: number }

/**
 * Score fusion of lists of items. An item's score is the sum over the lists that hold it of the
 * list's weight times the item's score there (its best, when a list repeats it); equal scores fall
 * to `tieBreak`, then to the key, so the order is total and does not depend on the order of the
 * input lists. An item is matched across lists by its key, and the copy from the first list that
 * holds it is returned.
 *
 * `foldInto` names, for an item, the keys of items it belongs under. When one of them is in the
 * result, the item is dropped and the host takes, list by list, the better of its own score and
 * the item's (the best-scoring host, then the lowest key), so folding never lowers a host. An item
 * that is folded hosts nothing.
 *
 * O(N log N) for N items across all lists, plus the candidates `foldInto` returns.
 */
export function fuseScoredLists<T>(
  lists: readonly (readonly ScoredItem<T>[])[],
  weights: readonly number[],
  key: (item: T) => string,
  tieBreak: (a: T, b: T) => number,
  foldInto?: (item: T) => readonly string[],
): FusedLead<T>[] {
  type Entry = { key: string; item: T; scores: Map<number, number>; score: number };
  const fused = new Map<string, Entry>();
  const hold = (scores: Map<number, number>, listIndex: number, score: number) => {
    scores.set(listIndex, Math.max(scores.get(listIndex) ?? Number.NEGATIVE_INFINITY, score));
  };
  lists.forEach((list, listIndex) => {
    for (const { item, score } of list) {
      const id = key(item);
      const entry = fused.get(id) ?? { key: id, item, scores: new Map(), score: 0 };
      fused.set(id, entry);
      hold(entry.scores, listIndex, score);
    }
  });
  /* Summed smallest first, so the same contributions give the same float whichever list came first. */
  const total = (scores: ReadonlyMap<number, number>) => [...scores].map(([listIndex, score]) => (weights[listIndex] ?? 0) * score)
    .sort((a, b) => a - b).reduce((sum, part) => sum + part, 0);
  for (const entry of fused.values()) entry.score = total(entry.scores);
  if (foldInto) {
    const moves: Array<[Entry, Entry]> = [];
    for (const entry of fused.values()) {
      let host: Entry | undefined;
      for (const id of foldInto(entry.item)) {
        const candidate = id === entry.key ? undefined : fused.get(id);
        if (!candidate) continue;
        if (!host || candidate.score > host.score || (candidate.score === host.score && candidate.key < host.key)) host = candidate;
      }
      if (host) moves.push([entry, host]);
    }
    const folded = new Set(moves.map(([entry]) => entry));
    for (const [entry, host] of moves) {
      if (folded.has(host)) continue;
      fused.delete(entry.key);
      for (const [listIndex, score] of entry.scores) hold(host.scores, listIndex, score);
    }
    for (const entry of fused.values()) entry.score = total(entry.scores);
  }
  return [...fused.values()]
    .sort((a, b) => b.score - a.score || tieBreak(a.item, b.item) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ item, scores }) => ({ item, lists: [...scores.keys()].sort((a, b) => a - b) }));
}
