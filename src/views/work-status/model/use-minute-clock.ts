import { useEffect, useState } from 'react';

/** Relative ages on the rows read in minutes, so they move once a minute between reads. */
export const AGE_TICK_MS = 60_000;

/** The later of the last read and the last minute tick; a hidden screen does not re-render. */
export function useMinuteClock(readAtMs: number): number {
  const [tickMs, setTickMs] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') setTickMs(Date.now());
    }, AGE_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);
  return Math.max(readAtMs, tickMs);
}
