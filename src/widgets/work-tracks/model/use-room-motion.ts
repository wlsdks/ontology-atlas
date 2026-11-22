import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useLatestRef } from '@/shared/lib/use-latest-ref';
import { EXIT_TRANSITION, MOTION, MOTION_EASE } from '@/shared/motion';
import type { Box, RoomBox } from './building-layout';
import { EXIT_MS, boxDuring, planSequence, waypointsOf, type RoomMove, type RoomSequence } from './room-sequence';

const ms = (seconds: number) => seconds * 1000;
const EASE_CSS = `cubic-bezier(${MOTION_EASE.join(', ')})`;
const EXIT_EASE_CSS = `cubic-bezier(${EXIT_TRANSITION.ease.join(', ')})`;
const ENTER_RISE_PX = 16;
/** A face that finished fading out tells its room, which then stops drawing it. */
export const FACE_LEFT_EVENT = 'roomfaceleft';

export const translate = (box: Box, rise = 0) => `translate(${box.x}px, ${box.y + rise}px)`;

interface Playing {
  sequence: RoomSequence;
  startedAt: number;
  animations: Animation[];
}

const now = () => Number(document.timeline.currentTime ?? 0);

/** Where a room of a playing sequence is drawn at this moment. */
function drawnBox(playing: Playing, key: string): Box | null {
  const move = playing.sequence.moves.get(key);
  if (!move) return null;
  const { exitMs, moveMs } = playing.sequence;
  const progress = moveMs === 0 ? 1 : Math.min(1, Math.max(0, (now() - playing.startedAt - exitMs) / moveMs));
  return boxDuring(move, playing.sequence.waves, progress, playing.sequence.path);
}

const facesOf = (element: HTMLElement) => [...element.querySelectorAll<HTMLElement>(':scope > [data-room-face]')];
const isOld = (face: HTMLElement) => face.dataset.faceLeaving === 'true';
const opacityOf = (element: HTMLElement) => Number(getComputedStyle(element).opacity);
const dropOldFaces = (element: HTMLElement) => {
  for (const face of facesOf(element)) if (isOld(face)) face.dispatchEvent(new Event(FACE_LEFT_EVENT));
};

/**
 * Plays each building update as one sequence (`planSequence`): what leaves fades, what changes size
 * or crosses another room fades its content to its own wall, every room that moves goes to its new
 * box by transform with its plate scaling from the old size, then content fades in. Only one copy of
 * a room is ever drawn: its old face stays only until its content has faded. An update that lands
 * mid-sequence starts the next from where each room is drawn and how much of its content shows. A
 * window resize places rooms at once; reduced motion moves nothing.
 */
export function useRoomMotion(
  boardRef: RefObject<HTMLElement | null>,
  boxes: ReadonlyMap<string, RoomBox>,
  { reduced, sizeKey, onRemoved }: { reduced: boolean; sizeKey: string; onRemoved: (removed: Map<string, Box>) => void },
): void {
  const placed = useRef(new Map<string, Box>());
  const lastSize = useRef<string | null>(null);
  const onRemovedRef = useLatestRef(onRemoved);
  const playing = useRef<Playing | null>(null);
  /** Rooms drawn as merged last time: they fade where they stand before they leave, so the next update need not wait for them. */
  const faded = useRef(new Set<string>());

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const elements = new Map<string, HTMLElement>();
    for (const element of board.querySelectorAll<HTMLElement>('[data-room-key]')) elements.set(element.dataset.roomKey!, element);
    const arriving = placed.current.size === 0;
    const instant = lastSize.current !== null && lastSize.current !== sizeKey;
    lastSize.current = sizeKey;

    const previous = playing.current;
    const drawn = new Map<string, Box>();
    const shown = new Map<string, number>();
    for (const [key, box] of placed.current) {
      drawn.set(key, (previous && drawnBox(previous, key)) ?? box);
      const element = elements.get(key);
      const current = element && facesOf(element).find(face => !isOld(face));
      if (current) shown.set(key, opacityOf(current));
    }
    const removed = new Map<string, Box>();
    for (const [key, box] of drawn) if (!boxes.has(key)) removed.set(key, box);
    const fading = [...removed.keys()].filter(key => !faded.current.has(key)).length;
    faded.current = new Set([...elements].filter(([, element]) => element.dataset.roomRetiring === 'true').map(([key]) => key));
    previous?.animations.forEach(animation => animation.cancel());
    playing.current = null;
    placed.current = new Map(boxes);
    if (removed.size > 0) onRemovedRef.current(removed);

    if (arriving || instant || reduced) {
      for (const [key, element] of elements) {
        if (reduced && !arriving && !instant && !drawn.has(key)) {
          element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms(MOTION.fast.duration), easing: 'linear' });
        }
        dropOldFaces(element);
      }
      return;
    }

    const entering = [...boxes.keys()].filter(key => !drawn.has(key) && elements.has(key));
    const sequence = planSequence({ from: drawn, to: boxes, leaving: fading, entering: entering.length });
    const { exitMs, moveMs, showMs } = sequence;
    const total = exitMs + moveMs + showMs;
    const at = (time: number) => (total === 0 ? 0 : time / total);
    const animations: Animation[] = [];

    for (const [key, element] of elements) {
      const move = sequence.moves.get(key);
      if (move) {
        animations.push(...playMove(element, move, sequence, total, at));
        if (!move.carried) animations.push(...playWall(element, shown.get(key) ?? 1, sequence, total, at));
        continue;
      }
      dropOldFaces(element);
      const to = boxes.get(key);
      if (!to || drawn.has(key) || total === 0) continue;
      animations.push(element.animate(
        [
          { opacity: 0, transform: translate(to, ENTER_RISE_PX), offset: 0 },
          { opacity: 0, transform: translate(to, ENTER_RISE_PX), offset: at(exitMs + moveMs), easing: EASE_CSS },
          { opacity: 1, transform: translate(to), offset: 1 },
        ],
        { duration: total },
      ));
    }
    if (total > 0) playing.current = { sequence, startedAt: now(), animations };
  }, [boardRef, boxes, reduced, sizeKey, onRemovedRef]);
}

/**
 * A room going to its new box: it holds while the exit step plays, passes its waypoints during the
 * move step and, when its size changes, its plate scales with it, anchored at its corner. An
 * arriving room is drawn over the one whose box it takes.
 */
function playMove(element: HTMLElement, move: RoomMove, sequence: RoomSequence, total: number, at: (time: number) => number): Animation[] {
  // Earlier waves are drawn over later ones: a room arriving in a box covers the one about to leave it.
  const layer = 5 - move.wave;
  const points = waypointsOf(move, sequence.waves, sequence.path);
  const offsets = [0, ...points.map(point => at(sequence.exitMs + point.at * sequence.moveMs)), 1];
  const boxes = [move.from, ...points.map(point => point.box), move.to];
  const frames = (frame: (box: Box) => Keyframe): Keyframe[] => boxes.map((box, index) => ({ ...frame(box), offset: offsets[index], easing: EASE_CSS }));
  const played = [element.animate(frames(box => ({ transform: translate(box), zIndex: layer })), { duration: total })];
  const plate = element.querySelector<HTMLElement>(':scope > [data-room-plate]');
  const { w, h } = move.to;
  if (plate && w > 0 && h > 0 && (move.from.w !== w || move.from.h !== h)) {
    played.push(plate.animate(frames(box => ({ transform: `scale(${box.w / w}, ${box.h / h})` })), { duration: total }));
  }
  return played;
}

/** A room that moves as its own wall: its content fades out where it stood, and in once it has arrived. */
function playWall(element: HTMLElement, shown: number, sequence: RoomSequence, total: number, at: (time: number) => number): Animation[] {
  const faces = facesOf(element);
  const hasOld = faces.some(isOld);
  const hiddenAt = at(sequence.exitMs);
  const showFrom = at(sequence.exitMs + sequence.moveMs);
  return faces.map(face => {
    if (isOld(face)) {
      const fade = face.animate([{ opacity: shown }, { opacity: 0 }], { duration: Math.max(1, sequence.exitMs), easing: EASE_CSS, fill: 'forwards' });
      fade.addEventListener('finish', () => face.dispatchEvent(new Event(FACE_LEFT_EVENT)));
      return fade;
    }
    return face.animate(
      [
        { opacity: hasOld ? 0 : shown, offset: 0, easing: EASE_CSS },
        { opacity: 0, offset: hiddenAt },
        { opacity: 0, offset: showFrom, easing: EASE_CSS },
        { opacity: 1, offset: 1 },
      ],
      { duration: total },
    );
  });
}

/** A room that left the building without a merge to play: it fades where it stood during the exit step. */
export function exitRoom(element: HTMLElement, from: Box, reduced: boolean, onDone: () => void) {
  const keyframes = reduced
    ? [{ opacity: 1 }, { opacity: 0 }]
    : [{ opacity: 1, transform: translate(from) }, { opacity: 0, transform: `${translate(from, ENTER_RISE_PX / 2)} scale(0.97)` }];
  const timing = reduced ? { duration: ms(MOTION.fast.duration), easing: 'linear' } : { duration: EXIT_MS, easing: EXIT_EASE_CSS };
  element.animate(keyframes, { ...timing, fill: 'forwards' }).addEventListener('finish', onDone);
}
