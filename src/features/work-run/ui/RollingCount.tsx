'use client';

import { useLayoutEffect, useRef, useState } from 'react';

import { cn } from '@/shared/lib/cn';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { MOTION, MOTION_EASE } from '@/shared/motion';

const ROLL = { duration: MOTION.settle.duration * 1_000, easing: `cubic-bezier(${MOTION_EASE.join(',')})` };

/**
 * A count that rolls to its next value: the old figure rises out as the new one rises in, from
 * the value last drawn. A mount draws the value still, so a route change never replays it; under
 * reduced motion the figure changes in place.
 */
export function RollingCount({ value, className }: { value: number; className?: string }) {
  const reducedMotion = usePrefersReducedMotion();
  const [figures, setFigures] = useState<{ current: number; previous: number | null }>({ current: value, previous: null });
  if (figures.current !== value) setFigures({ current: value, previous: reducedMotion ? null : figures.current });
  const incoming = useRef<HTMLSpanElement>(null);
  const outgoing = useRef<HTMLSpanElement>(null);
  const { current, previous } = figures;

  useLayoutEffect(() => {
    if (previous === null) return undefined;
    const rise = incoming.current?.animate(
      [{ translate: '0 0.55em', opacity: 0 }, { translate: '0 0', opacity: 1 }],
      ROLL,
    );
    const leave = outgoing.current?.animate(
      [{ translate: '0 0', opacity: 1 }, { translate: '0 -0.55em', opacity: 0 }],
      { ...ROLL, fill: 'forwards' },
    );
    let settled = false;
    if (leave) leave.onfinish = () => {
      settled = true;
      setFigures((state) => (state.previous === previous ? { ...state, previous: null } : state));
    };
    return () => {
      rise?.cancel();
      if (!settled) leave?.cancel();
    };
  }, [current, previous]);

  return (
    <span className={cn('relative inline-grid overflow-clip align-bottom tabular-nums', className)}>
      {previous !== null ? (
        // Drawn, not written: the text of the count is only ever the current value.
        <span ref={outgoing} aria-hidden data-figure={previous} className="col-start-1 row-start-1 before:content-[attr(data-figure)]" />
      ) : null}
      <span ref={incoming} className="col-start-1 row-start-1">{current}</span>
    </span>
  );
}
