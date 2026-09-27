'use client';

import { useState } from 'react';

/** Data compared by content: primitives, arrays and plain objects of them; a function or a Map does not fit. */
type SettledData<T> = T extends string | number | boolean | null | undefined
  ? T
  : T extends (...args: never[]) => unknown
    ? never
    : { readonly [K in keyof T]: SettledData<T[K]> };

/** O(size of the value). */
function sameContent(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && sameContent(a[key], b[key]));
}

/**
 * Holds what a count last settled on while the next read runs. The first read waits (`briefTotals`), but a recount
 * after a reload or rescan keeps the last settled value, which the screen marks as recounting, instead of
 * blanking the headline. `scope` is what the value answers (folder and recorded visit); a value from another
 * scope is never returned. An unchanged value keeps the identity it settled with.
 */
export function useLastSettled<T>(value: (T & SettledData<T>) | null, scope: string): T | null {
  const [held, setHeld] = useState<{ scope: string; value: T } | null>(() =>
    value === null ? null : { scope, value },
  );
  const heldHere = held !== null && held.scope === scope ? held.value : null;
  // Stored during render (React's "adjust state while rendering"): an effect would land one frame late, the frame a
  // recount starts in.
  if (value === null) {
    if (held !== null && heldHere === null) setHeld(null);
    return heldHere;
  }
  if (heldHere !== null && sameContent(heldHere, value)) return heldHere;
  setHeld({ scope, value });
  return value;
}
