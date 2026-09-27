'use client';

import { useState } from 'react';

/**
 * Holds what a count last settled on while the next read runs. The first read waits (`briefTotals`), but a recount
 * after a reload or rescan keeps the last settled value, which the screen marks as recounting, instead of
 * blanking the headline. `scope` is what the value answers (folder and recorded visit); a value from another
 * scope is never returned. `value` must keep its identity while unchanged (a `useMemo` result).
 */
export function useLastSettled<T>(value: T | null, scope: string): T | null {
  const [held, setHeld] = useState<{ scope: string; value: T } | null>(() =>
    value === null ? null : { scope, value },
  );
  // Stored during render (React's "adjust state while rendering"): an effect would land one frame late, the frame a
  // recount starts in.
  if (value !== null && (held === null || held.scope !== scope || held.value !== value)) {
    setHeld({ scope, value });
  } else if (value === null && held !== null && held.scope !== scope) {
    // Another question now: the last one's value is dropped, not parked for a return.
    setHeld(null);
  }
  if (value !== null) return value;
  return held !== null && held.scope === scope ? held.value : null;
}
