import { useCallback, useState } from "react";

function retainCurrent<T>(values: ReadonlyMap<string, T>, stamps: readonly string[], overrides?: ReadonlyMap<string, T>): Map<string, T> {
  const retained = new Map<string, T>();
  for (const stamp of stamps) {
    const value = overrides?.has(stamp) ? overrides.get(stamp) : values.get(stamp);
    if (value !== undefined) retained.set(stamp, value);
  }
  return retained;
}

/** `items` as first seen while every stamp stays equal, so identity follows content; O(items) per new array. */
export function useStampStable<T extends { stamp: string }>(items: readonly T[]): readonly T[] {
  const [held, setHeld] = useState(items);
  if (held !== items && (held.length !== items.length || held.some((item, at) => item.stamp !== items[at].stamp))) {
    setHeld(items);
    return items;
  }
  return held;
}

/** O(current stamps): completed reads survive only while their exact input remains current. */
export function useStampedCache<T = string>(stamps: readonly string[]) {
  const [cache, setCache] = useState(() => ({ stamps, values: new Map<string, T>() }));
  if (cache.stamps !== stamps && (cache.stamps.length !== stamps.length ||
    cache.stamps.some((stamp, index) => stamp !== stamps[index]))) {
    setCache({ stamps, values: retainCurrent(cache.values, stamps) });
  }
  const publish = useCallback((read: ReadonlyMap<string, T>) => {
    setCache((current) => ({
      stamps: current.stamps,
      values: retainCurrent(current.values, current.stamps, read),
    }));
  }, []);
  return { values: cache.values, publish };
}
