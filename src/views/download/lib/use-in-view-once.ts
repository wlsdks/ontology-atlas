'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * True from the first time the element enters the viewport, so entrances never rewind. With no
 * IntersectionObserver it is visible at once: losing choreography beats losing content.
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
      // In rAF, not a synchronous setState in the effect body.
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
