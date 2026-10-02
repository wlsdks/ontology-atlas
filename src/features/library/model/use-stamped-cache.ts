"use client";

import { useCallback, useState } from "react";

function retainCurrent(values: ReadonlyMap<string, string>, stamps: readonly string[], overrides?: ReadonlyMap<string, string>): Map<string, string> {
  const retained = new Map<string, string>();
  for (const stamp of stamps) {
    const value = overrides?.has(stamp) ? overrides.get(stamp) : values.get(stamp);
    if (value !== undefined) retained.set(stamp, value);
  }
  return retained;
}

/** O(current stamps): completed reads survive only while their exact input remains current. */
export function useStampedCache(stamps: readonly string[]) {
  const [cache, setCache] = useState(() => ({ stamps, values: new Map<string, string>() }));
  if (cache.stamps !== stamps && (cache.stamps.length !== stamps.length ||
    cache.stamps.some((stamp, index) => stamp !== stamps[index]))) {
    setCache({ stamps, values: retainCurrent(cache.values, stamps) });
  }
  const publish = useCallback((read: ReadonlyMap<string, string>) => {
    setCache((current) => ({
      stamps: current.stamps,
      values: retainCurrent(current.values, current.stamps, read),
    }));
  }, []);
  return { values: cache.values, publish };
}
