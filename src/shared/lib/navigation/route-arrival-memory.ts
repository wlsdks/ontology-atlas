"use client";

import { useCallback, useState } from "react";

import { readArrivalMemory, writeArrivalMemory } from "./route-arrival-memory-store";

/**
 * A `useState` whose first value is the last one this key resolved to in this tab; the fresh value
 * replaces it in place. Memory, not a cache: no expiry; files on disk stay the authority. Key it on
 * the vault; `null` means do not remember.
 */

/**
 * A `useState` that survives the unmount a route change causes.
 *
 * @param key what the value describes — `null` means "do not remember", which is the right
 *   answer while the thing it would describe (a vault path, a folder) is not known yet.
 * @param fallback the value to use when nothing has been remembered under this key.
 */
export function useArrivalMemory<T>(
  key: string | null,
  fallback: T,
): [T, (next: T) => void] {
  const resolve = (forKey: string | null): T =>
    forKey === null ? fallback : (readArrivalMemory<T>(forKey) ?? fallback);

  const [entry, setEntry] = useState<{ key: string | null; value: T }>(() => ({
    key,
    value: resolve(key),
  }));

  /*
   * Stable identity like a `useState` setter, so callers can list it in dependencies. The write is
   * deferred to a microtask because React may run an updater during render, where side effects are
   * forbidden (`tests/contract/architecture/pure-updater.contract.test.ts`).
   */
  const set = useCallback((next: T) => {
    setEntry((previous) => {
      const forKey = previous.key;
      if (forKey !== null) queueMicrotask(() => writeArrivalMemory(forKey, next));
      return { key: forKey, value: next };
    });
  }, []);

  /*
   * The key changed, so the value on screen describes something else. Deriving the new
   * key's value **during this render** is React's documented adjustment pattern, and it is
   * the only option that costs no extra paint: an effect would commit one frame showing the
   * previous key's value, which is the class of defect this module removes.
   */
  if (entry.key !== key) {
    const value = resolve(key);
    setEntry({ key, value });
    return [value, set];
  }

  return [entry.value, set];
}
