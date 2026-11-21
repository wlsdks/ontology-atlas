import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useLatestRef } from '@/shared/lib/use-latest-ref';
import { EXIT_TRANSITION, MOTION, MOTION_EASE, STAGGER } from '@/shared/motion';
import { SPRING, springEasing, springSettleMs } from '@/shared/motion/spring';

/**
 * How an element of the board answers a change. `move` glides from where it was drawn last
 * (rows, session headers, group labels); `move-x` glides along its row only (head dots and
 * chips); `scale-x` and `scale-y` stretch a line from its fixed end (row lines, session trunks).
 * New elements enter by `data-enter`: `draw-x`, `draw-y`, `place` or `fade`.
 */
type FlipKind = 'move' | 'move-x' | 'scale-x' | 'scale-y';
type EnterKind = 'draw-x' | 'draw-y' | 'place' | 'fade';

interface Box { x: number; y: number; w: number; h: number }

/** A running move: where it set out from and where it lands, so its drawn box can be recomputed. */
interface Move { animation: Animation; element: Element; from: Box | null; to: Box }

export interface RemovedElement {
  id: string;
  box: Box;
}

const MOTION_EASE_CSS = `cubic-bezier(${MOTION_EASE.join(', ')})`;
const PLACE_EASE_CSS = 'var(--motion-ease-place)';
const EXIT_EASE_CSS = `cubic-bezier(${EXIT_TRANSITION.ease.join(', ')})`;
const MOVE_EASING = springEasing(SPRING.surface);
const MOVE_MS = springSettleMs(SPRING.surface);
const ms = (seconds: number) => seconds * 1000;
/** Arrival staggers rows a row height apart in time; past this many the rest arrive together. */
const ARRIVAL_STAGGER_CAP = 14;
/** Sub-pixel differences are layout rounding, not a move. */
const MOVE_EPSILON_PX = 0.5;

/**
 * An element's box relative to the nearest moving element around it (else the board), so a chip
 * inside a row that glides measures only its own move and never repeats its row's.
 */
function boxOf(element: Element, board: HTMLElement): Box {
  const holder = element.parentElement?.closest('[data-flip]');
  const origin = (holder && board.contains(holder) ? holder : board).getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return { x: rect.left - origin.left, y: rect.top - origin.top, w: rect.width, h: rect.height };
}

/**
 * Where a move is drawn now. A row that changed group is a new element, so its last drawn box is
 * read from its old animation's eased progress rather than from the detached element.
 */
function drawnBox(move: Move): Box | null {
  if (!move.from) return null;
  const progress = move.animation.effect?.getComputedTiming().progress;
  if (typeof progress !== 'number') return null;
  const lerp = (from: number, to: number) => from + (to - from) * progress;
  return { x: lerp(move.from.x, move.to.x), y: lerp(move.from.y, move.to.y), w: lerp(move.from.w, move.to.w), h: lerp(move.from.h, move.to.h) };
}

function placeEasing(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--motion-ease-place').trim();
  return value || PLACE_EASE_CSS;
}

function enterKeyframes(kind: EnterKind, reduced: boolean): Keyframe[] {
  if (reduced) return [{ opacity: 0 }, { opacity: 1 }];
  switch (kind) {
    case 'draw-x': return [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }];
    case 'draw-y': return [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }];
    case 'place': return [{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, transform: 'scale(1)' }];
    case 'fade': return [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }];
  }
}

function enterTiming(kind: EnterKind, reduced: boolean, delayMs: number): KeyframeAnimationOptions {
  if (reduced) return { duration: ms(MOTION.fast.duration), easing: 'linear', fill: 'backwards' };
  const duration = kind === 'fade' ? ms(MOTION.base.duration) : ms(MOTION.slow.duration);
  const easing = kind === 'place' ? placeEasing() : MOTION_EASE_CSS;
  const lag = kind === 'place' || kind === 'fade' ? ms(MOTION.base.duration) : 0;
  return { duration, easing, delay: delayMs + lag, fill: 'backwards' };
}

function flipKeyframes(kind: FlipKind, from: Box, to: Box): Keyframe[] | null {
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  if (kind === 'move') {
    if (Math.abs(dx) < MOVE_EPSILON_PX && Math.abs(dy) < MOVE_EPSILON_PX) return null;
    return [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }];
  }
  if (kind === 'move-x') {
    if (Math.abs(dx) < MOVE_EPSILON_PX) return null;
    return [{ transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }];
  }
  if (kind === 'scale-x') {
    if (to.w <= 0 || (Math.abs(dx) < MOVE_EPSILON_PX && Math.abs(from.w - to.w) < MOVE_EPSILON_PX)) return null;
    return [{ transform: `translateX(${dx}px) scaleX(${from.w / to.w})` }, { transform: 'translateX(0) scaleX(1)' }];
  }
  if (to.h <= 0 || (Math.abs(dy) < MOVE_EPSILON_PX && Math.abs(from.h - to.h) < MOVE_EPSILON_PX)) return null;
  return [{ transform: `translateY(${dy}px) scaleY(${from.h / to.h})` }, { transform: 'translateY(0) scaleY(1)' }];
}

/**
 * Animates every change of the board from where each element was last drawn, so an update that
 * lands mid-motion retargets from the current position instead of restarting. Only transform and
 * opacity move; reduced motion cross-fades whatever changed place. Runs once per `layoutKey`.
 */
export function useTrackMotion(
  boardRef: RefObject<HTMLElement | null>,
  layoutKey: string,
  reduced: boolean,
  onRemoved: (removed: RemovedElement[]) => void,
) {
  const laidOut = useRef(new Map<string, Box>());
  const running = useRef(new Map<string, Move>());
  const arrived = useRef(false);
  const onRemovedRef = useLatestRef(onRemoved);

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const elements = [...board.querySelectorAll<HTMLElement>('[data-flip]')];
    const drawn = new Map(elements.map(element => [element.dataset.flip!, boxOf(element, board)]));
    const replaced = new Map<string, Box>();
    for (const element of elements) {
      const id = element.dataset.flip!;
      const move = running.current.get(id);
      if (!move) continue;
      const box = move.element === element ? null : drawnBox(move);
      if (box) replaced.set(id, box);
      move.animation.cancel();
      running.current.delete(id);
    }
    const next = new Map(elements.map(element => [element.dataset.flip!, boxOf(element, board)]));

    const removed = [...laidOut.current].filter(([id]) => !next.has(id)).map(([id, box]) => ({ id, box }));
    const isArrival = !arrived.current;
    arrived.current = true;
    let arrivalIndex = 0;

    for (const element of elements) {
      const id = element.dataset.flip!;
      const to = next.get(id)!;
      const before = laidOut.current.get(id);
      let animation: Animation;
      let from: Box | null = null;
      if (!before) {
        const kind = element.dataset.enter as EnterKind | undefined;
        if (!kind) continue;
        if (element.dataset.arrivalOrder) arrivalIndex = Number(element.dataset.arrivalOrder);
        const delay = isArrival ? Math.min(arrivalIndex, ARRIVAL_STAGGER_CAP) * ms(STAGGER) : 0;
        animation = element.animate(enterKeyframes(kind, reduced), enterTiming(kind, reduced, delay));
      } else {
        const now = drawn.get(id)!;
        from = replaced.get(id) ?? {
          x: before.x + (now.x - to.x),
          y: before.y + (now.y - to.y),
          w: to.w > 0 ? before.w * (now.w / to.w) : before.w,
          h: to.h > 0 ? before.h * (now.h / to.h) : before.h,
        };
        const keyframes = flipKeyframes(element.dataset.flipKind as FlipKind, from, to);
        if (!keyframes) continue;
        animation = reduced
          ? element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms(MOTION.fast.duration), easing: 'linear' })
          : element.animate(keyframes, { duration: MOVE_MS, easing: MOVE_EASING });
        if (reduced) from = null;
      }
      running.current.set(id, { animation, element, from, to });
      animation.addEventListener('finish', () => {
        if (running.current.get(id)?.animation === animation) running.current.delete(id);
      });
    }
    laidOut.current = next;
    if (removed.length > 0) onRemovedRef.current(removed);
  }, [boardRef, layoutKey, reduced, onRemovedRef]);

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      for (const element of board.querySelectorAll<HTMLElement>('[data-flip]')) {
        const id = element.dataset.flip!;
        if (!running.current.has(id)) laidOut.current.set(id, boxOf(element, board));
      }
    });
    observer.observe(board);
    return () => observer.disconnect();
  }, [boardRef]);
}

/** A row that left: it fades and its line draws back toward the trunk, accelerating away. */
export function exitRow(element: HTMLElement, reduced: boolean, onDone: () => void) {
  const timing = { duration: ms(EXIT_TRANSITION.duration) * (reduced ? 1 : 2), easing: reduced ? 'linear' : EXIT_EASE_CSS, fill: 'forwards' as const };
  const line = element.querySelector<HTMLElement>('[data-exit-line]');
  if (line && !reduced) line.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], timing);
  element.animate([{ opacity: 1 }, { opacity: 0 }], timing).addEventListener('finish', onDone);
}
