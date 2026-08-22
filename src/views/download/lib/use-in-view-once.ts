'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A hook that becomes true once, the first time an element enters the viewport — the trigger for
 * the gateway's "still forever after it appears" grammar. The entrance choreography happens once
 * when the section comes into view and never rewinds (a screen that moves on every scroll is noise,
 * not information).
 *
 * Where `IntersectionObserver` is unavailable (jsdom, older browsers) it reports **visible
 * immediately** — losing the choreography is better than losing the content.
 */
export function useInViewOnce<T extends HTMLElement>(
  threshold = 0.18,
): { ref: React.RefObject<T | null>; inView: boolean } {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      // Inside a rAF callback, so this is not a synchronous setState in the effect body.
      const id = requestAnimationFrame(() => setInView(true));
      return () => cancelAnimationFrame(id);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, threshold]);

  return { ref, inView };
}
