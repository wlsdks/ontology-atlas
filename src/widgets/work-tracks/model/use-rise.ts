import { useEffect, useState } from 'react';

/**
 * Notices a count going up after the first render: `serial` changes with each rise, so an animation
 * keyed on it restarts, and `fresh` holds for `holdMs` after it. A count that falls or first appears
 * is no rise.
 */
export function useRise(value: number | null, holdMs: number): { serial: number; fresh: boolean } {
  const [seen, setSeen] = useState(value);
  const [serial, setSerial] = useState(0);
  const [fresh, setFresh] = useState(false);
  if (value !== seen) {
    setSeen(value);
    if (value !== null && seen !== null && value > seen) {
      setSerial(serial + 1);
      setFresh(true);
    }
  }
  useEffect(() => {
    if (!fresh) return;
    const timer = window.setTimeout(() => setFresh(false), holdMs);
    return () => window.clearTimeout(timer);
  }, [fresh, serial, holdMs]);
  return { serial, fresh };
}
