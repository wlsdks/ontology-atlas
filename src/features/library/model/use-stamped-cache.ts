"use client";

import { useCallback, useState } from "react";

function retainCurrent(values: ReadonlyMap<string, string>, stamps: readonly string[]): Map<string, string> {
  const retained = new Map<string, string>();
  for (const stamp of stamps) {
    const value = values.get(stamp);
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
      values: retainCurrent(new Map([...current.values, ...read]), current.stamps),
    }));
  }, []);
  return { values: cache.values, publish };
}
