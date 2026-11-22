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
/**
 * A room that changes size crossfades its faces while it travels: the new face fades in over the old
 * one from the start, and the old one stays fully drawn underneath until the new one covers it, so
 * no frame shows an empty plate.
 */
const FACE_IN_MS = GLIDE_MS * 0.6;
const FACE_HOLD = 0.7;
/** A new room rises in after the rooms around it have begun to make space. */
const ENTER_DELAY_MS = ms(MOTION.slow.duration);
const NOTCH_PX = 4;
/** Sub-pixel differences are layout rounding, not a move. */
const MOVE_EPSILON_PX = 0.5;

interface Glide {
  move: Animation;
  /** The plate's scale and each face's clip, sharing the move's timing. */
  sized: Animation[];
  from: Box;
  to: Box;
}

/** The room's notched outline at a size, in the same twelve points as the `.notched` class. */
export function notchedOutline(w: number, h: number): string {
  const n = NOTCH_PX;
  const points = [[n, 0], [w - n, 0], [w - n, n], [w, n], [w, h - n], [w - n, h - n], [w - n, h], [n, h], [n, h - n], [0, h - n], [0, n], [n, n]];
  return `polygon(${points.map(([x, y]) => `${x}px ${y}px`).join(', ')})`;
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
      running?.sized.forEach(animation => animation.cancel());
      glides.current.delete(key);
    }

    for (const [key, to] of boxes) {
      next.set(key, to);
      const element = elements.get(key);
      if (!element) continue;
      const running = glides.current.get(key);
      const before = running ? drawnBox(running) : placed.current.get(key);
      running?.move.cancel();
      running?.sized.forEach(animation => animation.cancel());
      glides.current.delete(key);

      if (!before) {
        if (arriving || instant) continue;
        if (reduced) element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms(MOTION.fast.duration), easing: 'linear' });
        else element.animate(
              [{ opacity: 0, transform: translate(to, ENTER_RISE_PX) }, { opacity: 1, transform: translate(to) }],
              { duration: ENTER_MS, easing: EASE_CSS, delay: ENTER_DELAY_MS, fill: 'backwards' },
            );
        continue;
      }
      if (instant || reduced || same(before, to)) continue;
      const timing: KeyframeAnimationOptions = { duration: GLIDE_MS, easing: EASE_CSS };
      const move = element.animate([{ transform: translate(before) }, { transform: translate(to) }], timing);
      const resized = Math.abs(before.w - to.w) >= MOVE_EPSILON_PX || Math.abs(before.h - to.h) >= MOVE_EPSILON_PX;
      const sized: Animation[] = [];
      if (resized && to.w > 0 && to.h > 0) {
        // The plate scales from the old size and every face is clipped to the same outline, so a
        // face larger than the plate never spills over the rooms beside it.
        const plate = element.querySelector<HTMLElement>(':scope > [data-room-plate]');
        if (plate) sized.push(plate.animate([{ transform: `scale(${before.w / to.w}, ${before.h / to.h})` }, { transform: 'scale(1, 1)' }], timing));
        for (const face of element.querySelectorAll<HTMLElement>(':scope > [data-room-face]')) {
          sized.push(face.animate([{ clipPath: notchedOutline(before.w, before.h) }, { clipPath: notchedOutline(to.w, to.h) }], timing));
        }
      }
      const glide = { move, sized, from: before, to };
      glides.current.set(key, glide);
      move.addEventListener('finish', () => {
        if (glides.current.get(key) === glide) glides.current.delete(key);
      });
    }
    placed.current = next;
    if (removed.size > 0) onRemovedRef.current(removed);
  }, [boardRef, boxes, reduced, sizeKey, onRemovedRef]);
}

/**
 * A room that left the building fades where it stood, as long as a room gliding into its place
 * takes to arrive, so its slot is never empty; it stays drawn as it was, lights and all.
 */
export function exitRoom(element: HTMLElement, from: Box, reduced: boolean, onDone: () => void) {
  const keyframes = reduced
    ? [{ opacity: 1 }, { opacity: 0 }]
    : [{ opacity: 1, transform: translate(from) }, { opacity: 0, transform: `${translate(from, ENTER_RISE_PX / 2)} scale(0.97)` }];
  const timing = reduced ? { duration: ms(MOTION.fast.duration), easing: 'linear' } : { duration: GLIDE_MS, easing: EXIT_EASE_CSS };
  element.animate(keyframes, { ...timing, fill: 'forwards' }).addEventListener('finish', onDone);
}

/**
 * The faces of a room that changes size: the new one fades in over the old (`in`), which stays drawn
 * beneath it until covered (`out`); or, when the old face is the smaller, it fades away over the new
 * one (`away`), which is drawn from the start.
 */
export function fadeFace(element: HTMLElement, direction: 'in' | 'out' | 'away', reduced: boolean): Animation {
  if (reduced) {
    const keyframes = direction === 'in' ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }];
    return element.animate(keyframes, { duration: ms(MOTION.fast.duration), easing: 'linear', fill: 'both' });
  }
  if (direction === 'in') return element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FACE_IN_MS, easing: EASE_CSS, fill: 'backwards' });
  if (direction === 'away') return element.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FACE_IN_MS, easing: EASE_CSS, fill: 'forwards' });
  return element.animate([{ opacity: 1 }, { opacity: 1, offset: FACE_HOLD }, { opacity: 0 }], { duration: GLIDE_MS, easing: 'linear', fill: 'forwards' });
}
