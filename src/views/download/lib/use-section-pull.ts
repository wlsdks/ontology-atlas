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
/** The pause after a rest before the glide sets off, so the pull reads as the page's tension. */
export const PULL_DWELL_MS = 120;
const GLIDE_MS_PER_PX = 1.6;
const GLIDE_MIN_MS = 480;
const GLIDE_MAX_MS = 640;

/**
 * The films sit at the pane's top edge, under the overlaid header as they do today; the other
 * sections rest 96px down, where their `scroll-mt-24` puts them for a hash link, so a pull and a
 * link end in the same place. The hero is not a target: the top of the page stays free.
 */
const TARGETS: readonly { selector: string; offset: number }[] = [
  { selector: '[data-testid="gateway-film"], [data-testid="gateway-harness"]', offset: 0 },
  { selector: '#build, #screens, #start, #source, #faq, [data-testid="gateway-closing"]', offset: 96 },
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

/** Long enough to read as a pull, never a jump: 594ms for a 371px glide, which peaks near 980px/s. */
export function glideDuration(distance: number): number {
  return Math.min(GLIDE_MAX_MS, Math.max(GLIDE_MIN_MS, Math.abs(distance) * GLIDE_MS_PER_PX));
}

/** Sine ease-in-out: no jolt at either end, and it never steps back. */
export function glideProgress(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return (1 - Math.cos(Math.PI * clamped)) / 2;
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
 *
 * The glide is its own frame loop, not `behavior: 'smooth'`, whose length and curve each browser
 * picks (Chromium ends 371px in 300ms at 4,900px/s): it waits `PULL_DWELL_MS`, then eases over
 * `glideDuration`. Any wheel, key, pointer or touch input lets go of it at once.
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
    let last = pane.scrollTop;
    let direction: 1 | -1 | 0 = 0;
    let restTimer: ReturnType<typeof setTimeout> | undefined;
    let dwellTimer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    /** True from the moment a pull is decided until it lands or is let go. */
    let pulling = false;
    const hasScrollEnd = 'onscrollend' in pane;

    const letGo = () => {
      if (!pulling) return;
      pulling = false;
      clearTimeout(dwellTimer);
      cancelAnimationFrame(frame);
    };
    const arm = () => {
      letGo();
      armedAt = performance.now();
    };
    const disarm = () => {
      armedAt = -Infinity;
    };
    const release = () => {
      letGo();
      disarm();
    };
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.deltaY === 0) release();
      else arm();
    };
    const onKey = (event: KeyboardEvent) => {
      if (scrollsPage(event)) arm();
      else release();
    };
    const glide = (target: number) => {
      const from = pane.scrollTop;
      const distance = target - from;
      const duration = glideDuration(distance);
      let startedAt: number | null = null;
      const step = (now: number) => {
        if (!pulling) return;
        startedAt ??= now;
        const t = (now - startedAt) / duration;
        pane.scrollTo({ top: from + distance * glideProgress(t), behavior: 'instant' });
        if (t < 1) frame = requestAnimationFrame(step);
        else pulling = false;
      };
      frame = requestAnimationFrame(step);
    };
    const onRest = () => {
      if (pulling) return;
      if (!direction || performance.now() - armedAt > ARMED_MS || !allowed()) return;
      const top = pane.scrollTop;
      const target = pullTarget(sectionStarts(pane), top, direction, PULL_REACH * pane.clientHeight);
      disarm();
      if (target === null) return;
      pulling = true;
      dwellTimer = setTimeout(() => {
        if (!pulling) return;
        if (!allowed()) {
          pulling = false;
          return;
        }
        glide(target);
      }, PULL_DWELL_MS);
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
    window.addEventListener('pointerdown', release, passive);
    window.addEventListener('touchstart', release, passive);
    window.addEventListener('hashchange', release, passive);
    return () => {
      clearTimeout(restTimer);
      letGo();
      pane.removeEventListener('wheel', onWheel);
      pane.removeEventListener('scroll', onScroll);
      pane.removeEventListener('scrollend', onRest);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', release);
      window.removeEventListener('touchstart', release);
      window.removeEventListener('hashchange', release);
    };
  }, []);
}
