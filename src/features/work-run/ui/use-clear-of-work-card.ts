'use client';

import { useEffect, useRef, useState } from 'react';

import { useWorkRunSnapshot, workCardHoldsSeat } from '../model/use-work-run';
import { SEAT_GUTTER_PX } from './use-seat-step-aside';

export const WORK_CARD_ATTRIBUTE = 'data-work-run-card';

/**
 * px a centred stack rises so the open card never covers it, and 0 once they no longer meet.
 * `target` names the stack's own box; the caller draws the result as `translate`.
 */
export function useLiftClearOfWorkCard(target: () => HTMLElement | null): number {
  const open = workCardHoldsSeat(useWorkRunSnapshot());
  const [liftPx, setLiftPx] = useState(0);
  const liftRef = useRef(0);
  const targetRef = useRef(target);
  useEffect(() => {
    targetRef.current = target;
  });
  useEffect(() => {
    if (!open || typeof ResizeObserver === 'undefined') return undefined;
    let frame = 0;
    const resize = new ResizeObserver(() => schedule());
    const observed = new Set<Element>();
    const observe = (element: Element) => {
      if (observed.has(element)) return;
      observed.add(element);
      resize.observe(element);
    };
    const measure = () => {
      frame = 0;
      const stack = targetRef.current();
      const card = document.querySelector<HTMLElement>(`[${WORK_CARD_ATTRIBUTE}][data-state="open"]`);
      if (!stack || !card) return;
      observe(stack);
      observe(card);
      const box = stack.getBoundingClientRect();
      const top = box.top + liftRef.current;
      const bottom = box.bottom + liftRef.current;
      const seat = card.getBoundingClientRect();
      const meets = box.left < seat.right && box.right > seat.left && bottom > seat.top;
      const next = meets ? Math.max(0, Math.min(bottom - seat.top + SEAT_GUTTER_PX, top - SEAT_GUTTER_PX)) : 0;
      liftRef.current = Math.round(next);
      setLiftPx(liftRef.current);
    };
    function schedule() {
      if (frame === 0) frame = window.requestAnimationFrame(measure);
    }
    // The card settles its entry and its glide beside a dock by transition; measure where it lands.
    const settled = (event: TransitionEvent) => {
      if ((event.target as Element | null)?.hasAttribute?.(WORK_CARD_ATTRIBUTE)) schedule();
    };
    schedule();
    window.addEventListener('resize', schedule);
    document.addEventListener('transitionend', settled, true);
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener('resize', schedule);
      document.removeEventListener('transitionend', settled, true);
      liftRef.current = 0;
    };
  }, [open]);
  return open ? liftPx : 0;
}
