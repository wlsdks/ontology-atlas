import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useLatestRef } from '@/shared/lib/use-latest-ref';
import { EXIT_TRANSITION, MOTION, MOTION_EASE } from '@/shared/motion';
import type { Box, RoomBox } from './building-layout';

const ms = (seconds: number) => seconds * 1000;
const EASE_CSS = `cubic-bezier(${MOTION_EASE.join(', ')})`;
const EXIT_EASE_CSS = `cubic-bezier(${EXIT_TRANSITION.ease.join(', ')})`;
/** A room travels across the building in two slow steps; the ease never overshoots, so nothing reverses. */
export const GLIDE_MS = ms(MOTION.slow.duration) * 2;
const ENTER_MS = ms(MOTION.expressive.duration);
const ENTER_RISE_PX = 16;
/** A room's old face is gone before it has travelled a third of the way; its new face arrives in the last half. */
export const FACE_OUT_MS = ms(MOTION.settle.duration);
export const FACE_IN_DELAY_MS = ms(MOTION.slow.duration);
export const FACE_IN_MS = ms(MOTION.slow.duration);
/** Sub-pixel differences are layout rounding, not a move. */
const MOVE_EPSILON_PX = 0.5;

interface Glide {
  move: Animation;
  plate: Animation | null;
  from: Box;
  to: Box;
}

export const translate = (box: Box, rise = 0) => `translate(${box.x}px, ${box.y + rise}px)`;

const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress;

/**
 * Where a gliding room is drawn now: its eased progress between the boxes it set out from and
 * lands on. Both the move and the plate share one timing, so one progress places both.
 */
function drawnBox(glide: Glide): Box {
  const progress = glide.move.effect?.getComputedTiming().progress;
  if (typeof progress !== 'number') return glide.to;
  return {
    x: lerp(glide.from.x, glide.to.x, progress),
    y: lerp(glide.from.y, glide.to.y, progress),
    w: lerp(glide.from.w, glide.to.w, progress),
    h: lerp(glide.from.h, glide.to.h, progress),
  };
}

const same = (a: Box, b: Box) =>
  Math.abs(a.x - b.x) < MOVE_EPSILON_PX && Math.abs(a.y - b.y) < MOVE_EPSILON_PX && Math.abs(a.w - b.w) < MOVE_EPSILON_PX && Math.abs(a.h - b.h) < MOVE_EPSILON_PX;

/**
 * Moves every room of the building from where it was drawn to its new box: each room's element sits
 * at its box by `transform`, so a glide is a transform from the old place and its plate a scale from
 * the old size. An update that lands mid-glide starts the next glide from the drawn box rather than
 * restarting. A room new to the building fades in rising; a resize places rooms without motion.
 * Reduced motion moves nothing. Rooms that left are reported with the box they were drawn at.
 */
export function useRoomMotion(
  boardRef: RefObject<HTMLElement | null>,
  boxes: ReadonlyMap<string, RoomBox>,
  { reduced, sizeKey, onRemoved }: { reduced: boolean; sizeKey: string; onRemoved: (removed: Map<string, Box>) => void },
): void {
  const placed = useRef(new Map<string, Box>());
  const lastSize = useRef<string | null>(null);
  const onRemovedRef = useLatestRef(onRemoved);
  const glides = useRef(new Map<string, Glide>());

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const elements = new Map<string, HTMLElement>();
    for (const element of board.querySelectorAll<HTMLElement>('[data-room-key]')) elements.set(element.dataset.roomKey!, element);
    const arriving = placed.current.size === 0;
    const instant = lastSize.current !== null && lastSize.current !== sizeKey;
    lastSize.current = sizeKey;
    const next = new Map<string, Box>();
    const removed = new Map<string, Box>();
    for (const [key, box] of placed.current) {
      if (boxes.has(key)) continue;
      const running = glides.current.get(key);
      removed.set(key, running ? drawnBox(running) : box);
      running?.move.cancel();
      running?.plate?.cancel();
      glides.current.delete(key);
    }

    for (const [key, to] of boxes) {
      next.set(key, to);
      const element = elements.get(key);
      if (!element) continue;
      const running = glides.current.get(key);
      const before = running ? drawnBox(running) : placed.current.get(key);
      running?.move.cancel();
      running?.plate?.cancel();
      glides.current.delete(key);

      if (!before) {
        if (arriving || instant) continue;
        if (reduced) element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms(MOTION.fast.duration), easing: 'linear' });
        else element.animate(
              [{ opacity: 0, transform: translate(to, ENTER_RISE_PX) }, { opacity: 1, transform: translate(to) }],
              { duration: ENTER_MS, easing: EASE_CSS, delay: FACE_IN_DELAY_MS, fill: 'backwards' },
            );
        continue;
      }
            if (instant || reduced || same(before, to)) continue;
      const plateElement = element.querySelector<HTMLElement>('[data-room-plate]');
      const timing: KeyframeAnimationOptions = { duration: GLIDE_MS, easing: EASE_CSS };
      const move = element.animate([{ transform: translate(before) }, { transform: translate(to) }], timing);
      const resized = Math.abs(before.w - to.w) >= MOVE_EPSILON_PX || Math.abs(before.h - to.h) >= MOVE_EPSILON_PX;
      const plate = plateElement && resized && to.w > 0 && to.h > 0
        ? plateElement.animate([{ transform: `scale(${before.w / to.w}, ${before.h / to.h})` }, { transform: 'scale(1, 1)' }], timing)
        : null;
      const glide = { move, plate, from: before, to };
      glides.current.set(key, glide);
      move.addEventListener('finish', () => {
        if (glides.current.get(key) === glide) glides.current.delete(key);
      });
    }
    placed.current = next;
    if (removed.size > 0) onRemovedRef.current(removed);
  }, [boardRef, boxes, reduced, sizeKey, onRemovedRef]);
}

/** A room that left the building: it fades and sinks a little, accelerating away. */
export function exitRoom(element: HTMLElement, from: Box, reduced: boolean, onDone: () => void) {
  const duration = ms(EXIT_TRANSITION.duration) * (reduced ? 1 : 2);
  const keyframes = reduced
    ? [{ opacity: 1 }, { opacity: 0 }]
    : [{ opacity: 1, transform: translate(from) }, { opacity: 0, transform: `${translate(from, ENTER_RISE_PX / 2)} scale(0.97)` }];
  element.animate(keyframes, { duration, easing: reduced ? 'linear' : EXIT_EASE_CSS, fill: 'forwards' }).addEventListener('finish', onDone);
}

/** One face of a room fading out while the room changes size; the room's new face fades in after it. */
export function fadeFace(element: HTMLElement, direction: 'in' | 'out', reduced: boolean): Animation {
  const keyframes = direction === 'in' ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }];
  if (reduced) return element.animate(keyframes, { duration: ms(MOTION.fast.duration), easing: 'linear', fill: 'both' });
  return direction === 'in'
    ? element.animate(keyframes, { duration: FACE_IN_MS, delay: FACE_IN_DELAY_MS, easing: EASE_CSS, fill: 'backwards' })
    : element.animate(keyframes, { duration: FACE_OUT_MS, easing: EASE_CSS, fill: 'forwards' });
}
