import { useEffect, useMemo, useRef, useState } from 'react';

import { usePrefersReducedMotion } from '../render-timing/use-prefers-reduced-motion';

/** Frames a burst is given to catch up (about 200ms at 60Hz). The stride is recomputed every frame from what is still hidden, so a slow trickle comes out a character at a time and a large paste finishes in about this many frames. A count of frames, not a duration, so the reveal tracks the display's refresh. */
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
