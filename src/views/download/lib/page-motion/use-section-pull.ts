import { useEffect } from 'react';

import { isMotionPaused } from '@/shared/motion/motion-pause';

export const PULL_REACH = 0.42;
const ARMED_MS = 1200;
const REST_MS = 140;
const ON_TARGET_PX = 2;
export const PULL_DWELL_MS = 120;
const GLIDE_MS_PER_PX = 1.6;
const GLIDE_MIN_MS = 480;
const GLIDE_MAX_MS = 640;

/**
 * The films sit at the pane's top edge, under the overlaid header as they do today; the other
 * sections rest 96px down, where their `scroll-mt-24` puts them for a hash link, so a pull and a
 * link end in the same place. A section with a `stage` (something played or looked at whole) rests
 * there only while its stage fits under it; otherwise the stage is centred under the header, since a
 * title in view is worth less than a game cut off at the bottom. The hero is not a target: the top
 * of the page stays free.
 */
const TARGETS: readonly { selector: string; offset: number; stage?: string }[] = [
  { selector: '[data-testid="gateway-film"], [data-testid="gateway-harness"]', offset: 0 },
  { selector: '#build', offset: 96, stage: '.build-frame' },
  { selector: '#screens', offset: 96, stage: '[data-testid="gateway-screens-map"], .gateway-scroll-stage' },
  { selector: '#start, #source, #faq, [data-testid="gateway-closing"]', offset: 96 },
];

const STAGE_MARGIN = 16;

/**
 * Where a section with a stage rests, in the pane's scroll coordinates: at `start - offset` while
 * everything down to the stage's bottom fits above the window's bottom margin, else with the stage
 * centred in the room under the header, never closer than `STAGE_MARGIN` to it.
 */
export function stageRest({
  start,
  offset,
  stageTop,
  stageBottom,
  header,
  height,
}: {
  start: number;
  offset: number;
  stageTop: number;
  stageBottom: number;
  header: number;
  height: number;
}): number {
  const atStart = start - offset;
  if (stageBottom - atStart <= height - STAGE_MARGIN) return atStart;
  const room = height - header;
  const above = Math.max(STAGE_MARGIN, (room - (stageBottom - stageTop)) / 2);
  return stageTop - header - above;
}

const SCROLL_KEYS = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ']);

const ALLOWED_QUERY = '(min-width: 64rem) and (min-height: 40rem) and (not (pointer: coarse))';
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

export type PullStop = { near: number; rest: number };

export function pullTarget(stops: readonly (number | PullStop)[], top: number, direction: 1 | -1, reach: number): number | null {
  let next: PullStop | null = null;
  const away = (stop: PullStop) => Math.min(Math.abs(stop.near - top), Math.abs(stop.rest - top));
  for (const entry of stops) {
    const stop = typeof entry === 'number' ? { near: entry, rest: entry } : entry;
    const ahead = direction > 0 ? stop.rest > top + ON_TARGET_PX : stop.rest < top - ON_TARGET_PX;
    if (ahead && (next === null || away(stop) < away(next))) next = stop;
  }
  return next !== null && away(next) <= reach ? next.rest : null;
}

/** Long enough to read as a pull, never a jump: 594ms for a 371px glide, which peaks near 980px/s. */
export function glideDuration(distance: number): number {
  return Math.min(GLIDE_MAX_MS, Math.max(GLIDE_MIN_MS, Math.abs(distance) * GLIDE_MS_PER_PX));
}

export function glideProgress(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return (1 - Math.cos(Math.PI * clamped)) / 2;
}

function layoutBox(part: Element): { top: number; bottom: number } {
  const box = part.getBoundingClientRect();
  const transform = getComputedStyle(part).transform;
  const rise = transform && transform !== 'none' && typeof DOMMatrixReadOnly === 'function' ? new DOMMatrixReadOnly(transform).m42 : 0;
  return { top: box.top - rise, bottom: box.bottom - rise };
}

function sectionStops(pane: HTMLElement): PullStop[] {
  const origin = pane.getBoundingClientRect().top - pane.scrollTop;
  const max = pane.scrollHeight - pane.clientHeight;
  const header = pane.querySelector('[data-testid="download-gnb"]')?.getBoundingClientRect().height ?? 0;
  const clamp = (value: number) => Math.max(0, Math.min(max, Math.round(value)));
  const stops: PullStop[] = [];
  for (const { selector, offset, stage } of TARGETS) {
    for (const element of document.querySelectorAll(selector)) {
      const start = element.getBoundingClientRect().top - origin;
      const boxes = stage ? [...element.querySelectorAll(stage)].map(layoutBox) : [];
      const rest =
        boxes.length > 0
          ? stageRest({
              start,
              offset,
              stageTop: Math.min(...boxes.map((box) => box.top)) - origin,
              stageBottom: Math.max(...boxes.map((box) => box.bottom)) - origin,
              header,
              height: pane.clientHeight,
            })
          : start - offset;
      stops.push({ near: clamp(start - offset), rest: clamp(rest) });
    }
  }
  return stops;
}

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
      const target = pullTarget(sectionStops(pane), top, direction, PULL_REACH * pane.clientHeight);
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
