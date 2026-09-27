'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Counts up once on first view (`docs/DECISIONS.md` (106)). The DOM text is the final value on
 * the server, in jsdom, under reduced motion and after the run, since the caption-honesty test
 * reads it. A plain span with no ARIA: a generic span may not carry `aria-label`.
 */
export function CountUp({ value, durationMs = 600 }: { value: number; durationMs?: number }) {
  const [shown, setShown] = useState(value);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') return;
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
      return;

    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - t0) / durationMs);
          const eased = 1 - (1 - p) * (1 - p);
          setShown(Math.round(value * eased));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        setShown(0);
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, durationMs]);

  return (
    <span ref={ref} className="[font-variant-numeric:tabular-nums]">
      {shown}
    </span>
  );
}
