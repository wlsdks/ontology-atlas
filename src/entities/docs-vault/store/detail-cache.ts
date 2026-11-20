/** The most recent details kept per source; a surface shows a handful, so this covers several screens. */
export const DETAIL_CACHE_CAPACITY = 256;

/** Least-recently-used by insertion order of a `Map`: get, set and evict are O(1). */
export interface LruCache<V> {
  /** Reads without touching recency, so a render can look without reordering. */
  peek(key: string): V | undefined;
  get(key: string): V | undefined;
  set(key: string, value: V): void;
}

export function createLruCache<V>(capacity: number = DETAIL_CACHE_CAPACITY): LruCache<V> {
  const entries = new Map<string, V>();
  return {
    peek: (key) => entries.get(key),
    get(key) {
      const value = entries.get(key);
      if (value === undefined) return undefined;
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, value);
      if (entries.size > capacity) entries.delete(entries.keys().next().value as string);
    },
  };
}

/** Path and stamp together, so an edited file never answers with its old detail. */
export function detailCacheKey(path: string, stamp: number | undefined): string {
  return `${stamp ?? ''}\u0000${path}`;
}
