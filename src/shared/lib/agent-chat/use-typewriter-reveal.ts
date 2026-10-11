'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { usePrefersReducedMotion } from '../render-timing/use-prefers-reduced-motion';

/**
 * How many frames a burst is given to catch up. The stride is recomputed every frame from what is
 * still hidden, so the reveal is **rate-adaptive**: a slow trickle comes out a character at a time,
 * and a large paste is finished in about this many frames rather than crawling.
 *
 * 12 frames is ~200ms at 60Hz — long enough to read as motion, short enough that nobody waits for
 * the machine. It is a count of frames rather than a duration on purpose: the reveal should track
 * the display's refresh, not a wall clock.
 */
const CATCH_UP_FRAMES = 12;

/**
 * Smooths the reveal of already-arrived text; the stride grows with the backlog so it never falls
 * behind. When `streaming` is false or reduced motion is set, the full text returns with no
 * animation. Splits by code point so a Hangul syllable emerges whole.
 */
export function useTypewriterReveal(text: string, streaming: boolean): string {
  const reducedMotion = usePrefersReducedMotion();
  const units = useMemo(() => Array.from(text), [text]);
  const total = units.length;
  const animate = streaming && !reducedMotion;

  const [revealed, setRevealed] = useState(0);
  const revealedRef = useRef(0);

  useEffect(() => {
    if (!animate || revealedRef.current >= total) return;
    let frame = 0;
    const step = () => {
      const hidden = total - revealedRef.current;
      if (hidden <= 0) return;
      // Recomputed each frame: what is left decides the pace, so a burst arriving mid-reveal
      // speeds the remainder up instead of queueing behind it.
      revealedRef.current = Math.min(total, revealedRef.current + Math.max(1, Math.ceil(hidden / CATCH_UP_FRAMES)));
      setRevealed(revealedRef.current);
      if (revealedRef.current < total) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [animate, total]);

  // Not animating is decided in render, never by writing state from an effect — so a finished turn
  // paints its full text on the first frame rather than one frame later.
  if (!animate) return text;
  return units.slice(0, Math.min(revealed, total)).join('');
}
