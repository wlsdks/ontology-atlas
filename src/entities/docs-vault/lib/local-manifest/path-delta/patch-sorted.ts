/** Upper bound: the first index whose item sorts after `item`. O(log n) comparisons. */
export function insertionIndex<T>(list: readonly T[], item: T, compare: (a: T, b: T) => number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compare(list[mid], item) <= 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Index of the item with `key`, or -1; `probe` builds a comparable stand-in. O(log n). */
export function findSorted<T>(list: readonly T[], probe: T, compare: (a: T, b: T) => number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const order = compare(list[mid], probe);
    if (order === 0) return mid;
    if (order < 0) lo = mid + 1;
    else hi = mid;
  }
  return -1;
}

/** Few edits splice in O(k log n + k·n) moves; many filter and merge in O(n + k log n). */
const SPLICE_MAX = 32;

/**
 * A new sorted list without the items whose key is in `remove`, plus `add`. Keys are unique and
 * `compare` orders by key, so a removal is found by binary search. The old list is not touched.
 */
export function patchSorted<T>(
  list: readonly T[],
  remove: ReadonlySet<string>,
  add: readonly T[],
  keyOf: (item: T) => string,
  probeOf: (key: string) => T,
  compare: (a: T, b: T) => number,
): T[] {
  let kept: T[];
  if (remove.size <= SPLICE_MAX) {
    kept = list.slice();
    for (const key of remove) {
      const at = findSorted(kept, probeOf(key), compare);
      if (at >= 0) kept.splice(at, 1);
    }
  } else {
    kept = list.filter((item) => !remove.has(keyOf(item)));
  }
  if (add.length === 0) return kept;
  const sorted = [...add].sort(compare);
  if (sorted.length <= SPLICE_MAX) {
    for (const item of sorted) kept.splice(insertionIndex(kept, item, compare), 0, item);
    return kept;
  }
  const out: T[] = [];
  let from = 0;
  for (const item of sorted) {
    const at = insertionIndex(kept, item, compare);
    while (from < at) out.push(kept[from++]);
    out.push(item);
  }
  while (from < kept.length) out.push(kept[from++]);
  return out;
}
