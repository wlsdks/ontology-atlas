'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A number that counts up to its value when it first becomes visible.
 *
 * Owner-picked from the 2026-08-23 reference survey (`docs/DECISIONS.md` (106)) — the pattern
 * every surveyed page with "big numbers" uses (Warp's stat cards being the plainest example).
 * Under this repository's motion charter it reads as **confirmation**: the number arriving is the
 * event, and the count is that arrival made visible. It is bounded (runs once, ~600ms), so it is
 * not perpetual decoration.
 *
 * ## The DOM always carries the final value
 *
 * The animated display is a client-side overlay on a truth that never changes: on the server, in
 * jsdom (no `IntersectionObserver`), under reduced motion, and after the run, the rendered text is
 * exactly `value`. This is not just test convenience — the evidence caption's honesty contract
 * (`DownloadPage.test.tsx`: the caption equals the graph it draws) reads this text, and a caption
 * that is momentarily wrong is momentarily dishonest. The animation therefore only ever shows
 * values on the way **to** the truth, never a made-up resting state, and every non-browser reader
 * (crawler, screen reader via the stable `aria-label`, test) sees the final number only.
 */
export function CountUp({ value, durationMs = 600 }: { value: number; durationMs?: number }) {
  const [shown, setShown] = useState(value);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') return; // jsdom/SSR: final value stays
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
      return; // reduced motion: the finished number, immediately

    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - t0) / durationMs);
          // Ease-out: fast start, settling landing — the settle is the confirmation.
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
    // `tabular-nums` so the digits do not jitter sideways while counting; the stable
    // `aria-label` so assistive tech never hears the intermediate values.
    <span ref={ref} aria-label={String(value)} className="[font-variant-numeric:tabular-nums]">
      <span aria-hidden>{shown}</span>
    </span>
  );
}
