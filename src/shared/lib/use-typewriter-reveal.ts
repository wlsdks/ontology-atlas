'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { usePrefersReducedMotion } from './use-prefers-reduced-motion';

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
 * Reveals text the way it was written rather than the way it arrived.
 *
 * ⚠️ **Why** (owner, 2026-08-24): *"can the characters not come out one at a time, smoothly? right
 * now they burst out. …I would like it to be like the other agents."* An ACP adapter sends
 * `agent_message_chunk` in whatever sizes its transport happens to produce — sometimes a word,
 * sometimes a whole paragraph — and the panel rendered each chunk the instant it landed. The
 * content was correct and the delivery was not: a sentence appeared in three jerks, which reads as
 * a machine stuttering rather than as something being written.
 *
 * This does **not** slow the answer down. It only smooths the *reveal* of text that has already
 * arrived, and the stride grows with the backlog so it can never fall behind the stream. The moment
 * `streaming` goes false — the turn ended, or this is no longer the live bubble — the full text is
 * returned with no animation at all, so a finished conversation is never partially drawn.
 *
 * Reduced motion returns the full text immediately, which is the honest equivalent here: the
 * information is the text, and the animation carries none of it.
 *
 * **Graphemes, not bytes.** `Array.from` splits by code point, so a Hangul syllable emerges whole
 * instead of a byte at a time. Combining marks can still separate for a frame; that is the one case
 * where finer segmentation would cost an `Intl.Segmenter` allocation per frame for no gain a reader
 * can see.
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
