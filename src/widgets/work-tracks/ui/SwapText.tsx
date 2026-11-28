import { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/shared/lib/cn';
import { EXIT_WINDOW_MS, useSurfaceSwap } from '@/shared/lib/render-timing/use-presence';
import { EXIT_TRANSITION, MOTION, MOTION_EASE } from '@/shared/motion';

const ENTER_EASE_CSS = `cubic-bezier(${MOTION_EASE.join(', ')})`;
const INK_SEPARATOR = '\u0001';
const EXIT_EASE_CSS = `cubic-bezier(${EXIT_TRANSITION.ease.join(', ')})`;

/**
 * Text that cross-fades when it changes: the old words fade out over the new ones in the same
 * cell, so a count or a station's caption never snaps. The first value appears with its row.
 */
export function SwapText({ value, ink, className, wrap = false }: {
  value: string;
  /** The text colour of this value; a change of colour cross-fades with the words. */
  ink?: string;
  className?: string;
  wrap?: boolean;
}) {
  const { leaving } = useSurfaceSwap(`${ink ?? ''}${INK_SEPARATOR}${value}`, EXIT_WINDOW_MS);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  const enter = useCallback((element: HTMLSpanElement | null) => {
    if (!element || !mounted.current) return;
    element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.base.duration * 1000, easing: ENTER_EASE_CSS });
  }, []);
  const leave = useCallback((element: HTMLSpanElement | null) => {
    element?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: EXIT_WINDOW_MS, easing: EXIT_EASE_CSS, fill: 'forwards' });
  }, []);
  const cell = cn('col-start-1 row-start-1 min-w-0', wrap ? 'line-clamp-2' : 'truncate');
  const [leavingInk, leavingValue] = leaving === null ? [] : leaving.split(INK_SEPARATOR);
  return (
    <span className={cn('inline-grid min-w-0 max-w-full', className)}>
      <span key={`in:${ink}:${value}`} ref={enter} className={cn(cell, ink)}>{value}</span>
      {leaving !== null ? (
        <span key={`out:${leaving}`} ref={leave} aria-hidden className={cn(cell, 'pointer-events-none', leavingInk)}>{leavingValue}</span>
      ) : null}
    </span>
  );
}
