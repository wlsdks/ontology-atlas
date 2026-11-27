import { useState } from 'react';

/**
 * Counts a count going up after the first render: the serial changes with each rise, so an
 * animation keyed on it restarts. A count that falls or first appears is no rise.
 */
export function useRise(value: number | null): number {
  const [seen, setSeen] = useState(value);
  const [serial, setSerial] = useState(0);
  if (value !== seen) {
    setSeen(value);
    if (value !== null && seen !== null && value > seen) setSerial(serial + 1);
  }
  return serial;
}
