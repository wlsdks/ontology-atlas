'use client';

import { useEffect, useRef, useState } from 'react';

/** Before a second event there is no interval to match, so the first glide takes the slowest rate. */
const FIRST_GLIDE_MS = 250;
const MIN_GLIDE_MS = 100;
/** Rust sends an event at least every two seconds while a job runs. */
const MAX_GLIDE_MS = 2000;

interface Glide {
  from: number;
  to: number;
  startAt: number;
  durationMs: number;
  lastTargetAt: number | null;
  value: number;
  track: string;
}

/**
 * Travels from the value last drawn to each new target at a constant rate, over the time the
 * previous event took to arrive, so a steady stream of events reads as one continuous motion. A
 * new `track` (another quantity) or a lower target starts at the target; under reduced motion
 * every value is its end value.
 */
export function useGlide(target: number, track: string, reduced: boolean): number {
  const [drawn, setDrawn] = useState({ value: target, track });
  const glide = useRef<Glide>({ from: target, to: target, startAt: 0, durationMs: 0, lastTargetAt: null, value: target, track });

  useEffect(() => {
    const motion = glide.current;
    const now = performance.now();
    let frame = 0;
    if (reduced || motion.track !== track || target < motion.value) {
      Object.assign(motion, { from: target, to: target, value: target, track, lastTargetAt: now });
      frame = requestAnimationFrame(() => setDrawn({ value: target, track }));
      return () => cancelAnimationFrame(frame);
    }
    if (target === motion.to) return;
    const interval = motion.lastTargetAt === null ? FIRST_GLIDE_MS : now - motion.lastTargetAt;
    Object.assign(motion, {
      from: motion.value,
      to: target,
      startAt: now,
      durationMs: Math.min(MAX_GLIDE_MS, Math.max(MIN_GLIDE_MS, interval)),
      lastTargetAt: now,
    });
    const tick = (time: number) => {
      const progress = Math.min(1, Math.max(0, (time - motion.startAt) / motion.durationMs));
      motion.value = motion.from + (motion.to - motion.from) * progress;
      setDrawn({ value: motion.value, track });
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, track, reduced]);

  return reduced || drawn.track !== track ? target : drawn.value;
}
