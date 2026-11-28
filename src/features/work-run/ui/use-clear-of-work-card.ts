import { useEffect, useRef, useState } from 'react';

import { useWorkRunSnapshot, workCardHoldsSeat } from '../model/use-work-run';
import { SEAT_GUTTER_PX } from './use-seat-step-aside';

export const WORK_CARD_ATTRIBUTE = 'data-work-run-card';

/** How far `translate` on the element and its ancestors moves it from where it is laid out. */
function translatedPx(element: Element) {
  let x = 0;
  let y = 0;
  for (let node: Element | null = element; node; node = node.parentElement) {
    const [dx = '0', dy = '0'] = (getComputedStyle(node).translate || 'none').split(' ');
    if (dx === 'none') continue;
    x += Number.parseFloat(dx) || 0;
    y += Number.parseFloat(dy) || 0;
  }
  return { x, y };
}

/** The box an element is laid out in, without the translate its entry or a lift draws it at for now. */
function restingBox(element: Element) {
  const box = element.getBoundingClientRect();
  const shift = translatedPx(element);
  return { left: box.left - shift.x, right: box.right - shift.x, top: box.top - shift.y, bottom: box.bottom - shift.y };
}

/**
 * px a centred stack rises so the open card never covers it, and 0 once they no longer meet.
 * `target` names the stack's own box; the caller draws the result as `translate`.
 */
export function useLiftClearOfWorkCard(target: () => HTMLElement | null): number {
  const open = workCardHoldsSeat(useWorkRunSnapshot());
  const [liftPx, setLiftPx] = useState(0);
  const targetRef = useRef(target);
  useEffect(() => {
    targetRef.current = target;
  });
  useEffect(() => {
    if (!open || typeof ResizeObserver === 'undefined') return undefined;
    let frame = 0;
    const resize = new ResizeObserver(() => schedule());
    // The card or the stack can mount after the card's seat opens: watch for them until both are here.
    const arrivals = new MutationObserver(() => schedule());
    let watching = false;
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
      if (!stack || !card) {
        setLiftPx(0);
        if (!watching) arrivals.observe(document.body, { childList: true, subtree: true });
        watching = true;
        return;
      }
      if (watching) arrivals.disconnect();
      watching = false;
      observe(stack);
      observe(card);
      const box = restingBox(stack);
      const seat = restingBox(card);
      const meets = box.left < seat.right && box.right > seat.left && box.bottom > seat.top;
      setLiftPx(meets ? Math.round(Math.max(0, Math.min(box.bottom - seat.top + SEAT_GUTTER_PX, box.top - SEAT_GUTTER_PX))) : 0);
    };
    function schedule() {
      if (frame === 0) frame = window.requestAnimationFrame(measure);
    }
    // The card glides beside a dock by transition; measure where it lands.
    const settled = (event: TransitionEvent) => {
      if ((event.target as Element | null)?.hasAttribute?.(WORK_CARD_ATTRIBUTE)) schedule();
    };
    schedule();
    window.addEventListener('resize', schedule);
    document.addEventListener('transitionend', settled, true);
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      resize.disconnect();
      arrivals.disconnect();
      window.removeEventListener('resize', schedule);
      document.removeEventListener('transitionend', settled, true);
    };
  }, [open]);
  return open ? liftPx : 0;
}
