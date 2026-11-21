'use client';

import { useEffect, useRef, useState } from 'react';

/** A rate from fewer seconds than this swings with each chunk; none is shown before it. */
const MIN_SPAN_MS = 3000;
/** The newest stretch the rate is measured over, so a slower start stops counting. */
const WINDOW_MS = 10_000;
/** No new byte for this long is a stall: the last speed no longer says anything. */
const STALL_MS = 5000;

/**
 * Bytes per second over the newest ten seconds of `doneBytes`, or `null` until three seconds were
 * measured and after five seconds without a new byte. `null` or a value that goes back (a new
 * download) starts over.
 */
export function useByteRate(doneBytes: number | null): number | null {
  const samples = useRef<{ at: number; bytes: number }[]>([]);
  const [rate, setRate] = useState<number | null>(null);

  useEffect(() => {
    const now = performance.now();
    let next: number | null = null;
    if (doneBytes === null) samples.current = [];
    else {
      const last = samples.current.at(-1);
      if (last && doneBytes < last.bytes) samples.current = [];
      samples.current.push({ at: now, bytes: doneBytes });
      while (samples.current.length > 2 && now - samples.current[1]!.at >= WINDOW_MS) samples.current.shift();
      const first = samples.current[0]!;
      const span = now - first.at;
      if (span >= MIN_SPAN_MS) next = ((doneBytes - first.bytes) * 1000) / span;
    }
    // Set from the frame after the value, which also lets a burst of events settle to its last.
    const frame = requestAnimationFrame(() => setRate(next));
    const stall = window.setTimeout(() => setRate(null), STALL_MS);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(stall);
    };
  }, [doneBytes]);

  return rate;
}
