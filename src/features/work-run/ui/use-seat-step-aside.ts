'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

/** The card's own gap from the window's right edge and from whatever it steps aside for. */
export const SEAT_GUTTER_PX = 16;

/** A wall that faded and set `aria-hidden` keeps its box but no longer takes the corner. */
function standing(element: HTMLElement): boolean {
  if (element.closest('[aria-hidden="true"]')) return false;
  const style = window.getComputedStyle(element);
  return style.visibility !== 'hidden' && Number.parseFloat(style.opacity) > 0.05;
}

/**
 * px the card glides left, past `--app-toast-right-offset` and each standing right wall in the
 * seat's own frame; no room beside a wall keeps the corner. O(nodes in that frame) per changed frame.
 */
export function useSeatStepAside(active: boolean, card: RefObject<HTMLElement | null>): {
  probe: RefObject<HTMLSpanElement | null>;
  shiftPx: number;
} {
  const probe = useRef<HTMLSpanElement | null>(null);
  const [shiftPx, setShiftPx] = useState(0);
  useEffect(() => {
    if (!active || typeof ResizeObserver === 'undefined') return undefined;
    let frame = 0;
    const observed = new Set<Element>();
    const resize = new ResizeObserver(() => schedule());
    // The seat's siblings in the shell frame hold every route's docks; portals never declare walls.
    const frameRoot = card.current?.parentElement?.parentElement ?? document.body;
    const measure = () => {
      frame = 0;
      const viewport = document.documentElement.clientWidth || window.innerWidth;
      const cardWidth = card.current?.offsetWidth ?? 0;
      let inset = Math.max(0, (probe.current?.offsetWidth ?? SEAT_GUTTER_PX) - SEAT_GUTTER_PX);
      for (const wall of frameRoot.querySelectorAll<HTMLElement>('[data-toast-wall="right"]')) {
        if (!observed.has(wall)) {
          observed.add(wall);
          resize.observe(wall);
        }
        if (!standing(wall)) continue;
        const rect = wall.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) inset = Math.max(inset, viewport - rect.left);
      }
      const room = viewport - inset - SEAT_GUTTER_PX - cardWidth;
      setShiftPx(room >= SEAT_GUTTER_PX ? Math.round(inset) : 0);
    };
    function schedule() {
      if (frame === 0) frame = window.requestAnimationFrame(measure);
    }
    if (probe.current) resize.observe(probe.current);
    schedule();
    const mutations = new MutationObserver(schedule);
    mutations.observe(frameRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-toast-wall', 'aria-hidden', 'class'],
    });
    window.addEventListener('resize', schedule);
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [active, card]);
  return { probe, shiftPx };
}
