'use client';

import { useEffect } from 'react';

import { isMotionPaused } from '@/shared/motion/motion-pause';

/** How far ahead, as a share of the window's height, a section start may be and still pull. */
export const PULL_REACH = 0.42;
/** How long after a wheel turn or a scrolling key the next rest may still pull. */
const ARMED_MS = 1200;
/** Where `scrollend` is missing, a rest is this long without a `scroll` event. */
const REST_MS = 140;
/** A rest this close to a start already sits on it. */
const ON_TARGET_PX = 2;

/**
 * The films sit at the pane's top edge, under the overlaid header as they do today; the other
 * sections rest 96px down, where their `scroll-mt-24` puts them for a hash link, so a pull and a
 * link end in the same place. The hero is not a target: the top of the page stays free.
 */
const TARGETS: readonly { selector: string; offset: number }[] = [
  { selector: '[data-testid="gateway-film"], [data-testid="gateway-harness"]', offset: 0 },
  { selector: '#how, #screens, #start, #source, #faq, [data-testid="gateway-closing"]', offset: 96 },
];

const SCROLL_KEYS = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ']);

/** On a phone, a tablet or a short window the sections are taller than the window; no pull there. */
const ALLOWED_QUERY = '(min-width: 64rem) and (min-height: 40rem) and (not (pointer: coarse))';
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * The section start a rest moves to: the nearest one past `top` in the direction the reader was
 * going, if it is no further than `reach`. Never one behind the reader.
 */
export function pullTarget(starts: readonly number[], top: number, direction: 1 | -1, reach: number): number | null {
  let next: number | null = null;
  for (const start of starts) {
    const ahead = direction > 0 ? start > top + ON_TARGET_PX : start < top - ON_TARGET_PX;
    if (ahead && (next === null || Math.abs(start - top) < Math.abs(next - top))) next = start;
  }
  return next !== null && Math.abs(next - top) <= reach ? next : null;
}

function sectionStarts(pane: HTMLElement): number[] {
  const origin = pane.getBoundingClientRect().top - pane.scrollTop;
  const max = pane.scrollHeight - pane.clientHeight;
  const starts: number[] = [];
  for (const { selector, offset } of TARGETS) {
    for (const element of document.querySelectorAll(selector)) {
      starts.push(Math.max(0, Math.min(max, Math.round(element.getBoundingClientRect().top - origin - offset))));
    }
  }
  return starts;
}

/** A key the page scrolls with: not typed into a field, not a press of a focused control. */
function scrollsPage(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || !SCROLL_KEYS.has(event.key)) {
    return false;
  }
  const target = event.target;
  if (!(target instanceof HTMLElement)) return true;
  if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return false;
  return event.key !== ' ' || !target.closest('button, a, [role="button"], [role="tab"]');
}

/**
 * When a scroll the reader made with the wheel or a scrolling key comes to rest close before a
 * section's start, it glides on to that start, so a rest is not left showing two half sections.
 * It only ever carries on in the direction of travel and only within `PULL_REACH` of the window,
 * so a single wheel notch away from a section stays where the reader put it. Hash links, Tab focus,
 * find-in-page and scripted scrolls never pull; neither does anything under reduced motion, while
 * the page's motion is paused, or below 64rem by 40rem or on a coarse pointer. The page scroller is
 * the app shell's pane, not the document.
 */
export function useSectionPull(): void {
  useEffect(() => {
    const pane = document.querySelector<HTMLElement>('[data-app-shell-pane]');
    if (!pane || typeof matchMedia !== 'function') return;
    const allowedQuery = matchMedia(ALLOWED_QUERY);
    const reducedQuery = matchMedia(REDUCED_QUERY);
    /* Read at each rest, so a change of window, motion setting or pause holds at once. */
    const allowed = () => allowedQuery.matches && !reducedQuery.matches && !isMotionPaused();

    let armedAt = -Infinity;
    let gliding = false;
    let last = pane.scrollTop;
    let direction: 1 | -1 | 0 = 0;
    let restTimer: ReturnType<typeof setTimeout> | undefined;
    const hasScrollEnd = 'onscrollend' in pane;

    const arm = () => {
      armedAt = performance.now();
      gliding = false;
    };
    const disarm = () => {
      armedAt = -Infinity;
    };
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.deltaY === 0) disarm();
      else arm();
    };
    const onKey = (event: KeyboardEvent) => {
      if (scrollsPage(event)) arm();
      else disarm();
    };
    const onRest = () => {
      if (gliding) {
        gliding = false;
        return;
      }
      if (!direction || performance.now() - armedAt > ARMED_MS || !allowed()) return;
      const top = pane.scrollTop;
      const target = pullTarget(sectionStarts(pane), top, direction, PULL_REACH * pane.clientHeight);
      disarm();
      if (target === null) return;
      gliding = true;
      pane.scrollTo({ top: target, behavior: 'smooth' });
    };
    const onScroll = () => {
      const top = pane.scrollTop;
      if (top !== last) direction = top > last ? 1 : -1;
      last = top;
      if (!hasScrollEnd) {
        clearTimeout(restTimer);
        restTimer = setTimeout(onRest, REST_MS);
      }
    };
    const passive = { passive: true } as const;
    pane.addEventListener('wheel', onWheel, passive);
    pane.addEventListener('scroll', onScroll, passive);
    if (hasScrollEnd) pane.addEventListener('scrollend', onRest, passive);
    window.addEventListener('keydown', onKey, passive);
    window.addEventListener('pointerdown', disarm, passive);
    window.addEventListener('hashchange', disarm, passive);
    return () => {
      clearTimeout(restTimer);
      pane.removeEventListener('wheel', onWheel);
      pane.removeEventListener('scroll', onScroll);
      pane.removeEventListener('scrollend', onRest);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', disarm);
      window.removeEventListener('hashchange', disarm);
    };
  }, []);
}
