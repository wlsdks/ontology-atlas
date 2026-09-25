'use client';

import { useState } from 'react';

/**
 * **What a count last settled on, kept while the next one runs.**
 *
 * The brief's sums wait for every core (`briefTotals`). Waiting is right the first time, when
 * there is nothing to show but a partial sum; it is wrong on every later recount. The Git walk
 * starts again whenever the folder reloads, which the watcher does after each file an agent
 * writes, and the harness scans again when the reader comes back from another question. Dropping
 * to "counting" there blanked the hero line for a few frames at a time while an agent worked.
 * The last settled value is still the truth about the folder as it was last read, so it stays,
 * and the screen marks it as being recounted.
 *
 * `scope` is what the value is an answer to: the open folder and the recorded visit. A value
 * settled for another folder, or before "Seen up to here" moved the anchor, answers a different
 * question and is never returned for this one.
 *
 * `value` must keep its identity while it is unchanged (a `useMemo` result): a new object on
 * every render would be stored on every render.
 */
export function useLastSettled<T>(value: T | null, scope: string): T | null {
  const [held, setHeld] = useState<{ scope: string; value: T } | null>(() =>
    value === null ? null : { scope, value },
  );
  // Stored during render, React's documented "adjust state while rendering" pattern: an effect
  // would store it one frame late, and that frame is exactly the one a recount starts in.
  if (value !== null && (held === null || held.scope !== scope || held.value !== value)) {
    setHeld({ scope, value });
  } else if (value === null && held !== null && held.scope !== scope) {
    // Another question now: what the last one settled on is dropped, not parked for a return.
    setHeld(null);
  }
  if (value !== null) return value;
  return held !== null && held.scope === scope ? held.value : null;
}
