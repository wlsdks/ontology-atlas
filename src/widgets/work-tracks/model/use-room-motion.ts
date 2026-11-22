import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useLatestRef } from '@/shared/lib/use-latest-ref';
import { MOTION, MOTION_EASE } from '@/shared/motion';
import { WIDE_ROOM_W, type Box, type RoomBox } from './building-layout';
import { FADE_MS, SHOW_MS, boxAt, boxOnPath, planSequence, type RoomMove, type RoomSequence } from './room-sequence';

const ms = (seconds: number) => seconds * 1000;
const EASE_CSS = `cubic-bezier(${MOTION_EASE.join(', ')})`;
const ENTER_RISE_PX = 16;
/** A face that finished fading out tells its room, which then stops drawing it. */
export const FACE_LEFT_EVENT = 'roomfaceleft';
/** Dispatched on a leaving face when the room's move keeps its content: the face stays the room's own. */
export const FACE_KEPT_EVENT = 'roomfacekept';

export const translate = (box: Box, rise = 0) => `translate(${box.x}px, ${box.y + rise}px)`;

interface Playing {
  sequence: RoomSequence;
  startedAt: number;
  animations: Animation[];
  /** Rooms this sequence animates, moving, fading or arriving: the only ones it can leave mid-way. */
  keys: Set<string>;
}

const now = () => Number(document.timeline.currentTime ?? 0);

/** Where a room of a playing sequence is drawn at this moment. */
function drawnBox(playing: Playing, key: string): Box | null {
  const move = playing.sequence.moves.get(key);
  return move ? boxAt(move, playing.sequence, now() - playing.startedAt) : null;
}

const facesOf = (element: HTMLElement) => [...element.querySelectorAll<HTMLElement>(':scope > [data-room-face]')];
const isOld = (face: HTMLElement) => face.dataset.faceLeaving === 'true';
/** The face on screen: one that may leave while the room's new face waits, else the room's own. */
const shownFace = (element: HTMLElement) => facesOf(element).find(isOld) ?? facesOf(element).find(face => !isOld(face));
/** The parts of a stage room that fade while it travels resized: its monitor and its belt. */
const partsOf = (element: HTMLElement) => [...(shownFace(element)?.querySelectorAll<HTMLElement>('[data-room-part]') ?? [])];
const opacityOf = (element: HTMLElement) => Number(getComputedStyle(element).opacity);
/** A move that keeps the room's content: the face on screen stays the room's own, and the waiting one goes. */
const keepShownFace = (element: HTMLElement) => {
  for (const face of facesOf(element)) if (isOld(face)) face.dispatchEvent(new Event(FACE_KEPT_EVENT));
};

/** What one room shows as an update lands: where it is, its content, its fading parts and its scene's unit. */
interface Drawn {
  box: Box;
  face: number;
  parts: number;
  unit: number;
}

/**
 * Plays each building update as one sequence (`planSequence`). Each moving room, a little after the
 * one before it, fades what must not show while it travels, goes to its new box and brings it back:
 * a stage room that stays one keeps its Moru, tag, plaque and hue edge and fades only its monitor and
 * belt while its box and scale glide; a room that changes tier travels as its wall with its hue edge
 * and plaque. Only one copy of a room is ever drawn. Fades out are linear, so no frame cuts. An update
 * that lands mid-sequence starts the next from what each room shows. A window resize places rooms at
 * once; reduced motion moves nothing.
 */
export function useRoomMotion(
  boardRef: RefObject<HTMLElement | null>,
  boxes: ReadonlyMap<string, RoomBox>,
  { reduced, sizeKey, onRemoved }: { reduced: boolean; sizeKey: string; onRemoved: (removed: Map<string, Box>) => void },
): void {
  const placed = useRef(new Map<string, RoomBox>());
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
    // Only a room of a sequence still playing can be drawn part-faded, mid-path or mid-scale; reading
    // any other room's styles would force the whole building's style before the frame does it anyway.
    const playingNow = previous?.animations.some(animation => animation.playState === 'running') ? previous : null;
    const drawn = new Map<string, Drawn>();
    for (const [key, box] of placed.current) {
      const element = elements.get(key);
      if (!playingNow?.keys.has(key)) {
        drawn.set(key, { box, face: 1, parts: 1, unit: box.unit });
        continue;
      }
      const face = element && shownFace(element);
      const scene = face?.querySelector<HTMLElement>('[data-scene]');
      drawn.set(key, {
        box: drawnBox(playingNow, key) ?? box,
        face: face ? opacityOf(face) : 1,
        parts: element ? Math.min(1, ...partsOf(element).map(opacityOf)) : 1,
        // React has already drawn the new unit, so only a glide still playing tells where the scale is now.
        unit: scene && scene.getAnimations().some(glide => glide.playState === 'running')
          ? Number(getComputedStyle(scene).getPropertyValue('--u')) || box.unit
          : box.unit,
      });
    }
    const before = placed.current;
    const removed = new Map<string, Box>();
    for (const [key, { box }] of drawn) if (!boxes.has(key)) removed.set(key, box);
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
        keepShownFace(element);
      }
      return;
    }

    const entering = [...boxes.keys()].filter(key => !drawn.has(key) && elements.has(key));
    const sequence = planSequence({
      from: new Map([...drawn].map(([key, { box }]) => [key, box])),
      to: boxes,
      leaving: fading,
      entering: entering.length,
      keepsContent: key => {
        const next = boxes.get(key);
        const width = drawn.get(key)?.box.w ?? 0;
        return before.get(key)?.size === 'large' && next?.size === 'large' && (width >= WIDE_ROOM_W) === (next.w >= WIDE_ROOM_W);
      },
    });
    const { totalMs, enterAtMs } = sequence;
    const at = (time: number) => (totalMs === 0 ? 0 : Math.min(1, time / totalMs));
    const animations: Animation[] = [];

    for (const [key, element] of elements) {
      const move = sequence.moves.get(key);
      const shows = drawn.get(key);
      if (move && shows) {
        const timing: MoveTiming = { sequence, total: totalMs, at, shows };
        if (move.mode === 'resized') {
          keepShownFace(element);
          animations.push(...playResized(element, move, timing, boxes.get(key)!.unit));
        } else {
          animations.push(...playMove(element, move, timing));
          if (move.mode === 'wall') animations.push(...playWall(element, move, timing));
          else keepShownFace(element);
        }
        continue;
      }
      keepShownFace(element);
      const to = boxes.get(key);
      if (shows && (shows.face < 0.99 || shows.parts < 0.99)) {
        // Interrupted while some of it was faded: it comes back from where it was, not at once.
        const face = shownFace(element);
        if (face) animations.push(face.animate([{ opacity: shows.face }, { opacity: 1 }], { duration: SHOW_MS, easing: EASE_CSS }));
        for (const part of partsOf(element)) animations.push(part.animate([{ opacity: shows.parts }, { opacity: 1 }], { duration: SHOW_MS, easing: EASE_CSS }));
      }
      if (!to || shows || totalMs === 0) continue;
      animations.push(element.animate(
        [
          { opacity: 0, transform: translate(to, ENTER_RISE_PX), offset: 0 },
          { opacity: 0, transform: translate(to, ENTER_RISE_PX), offset: at(enterAtMs), easing: EASE_CSS },
          { opacity: 1, transform: translate(to), offset: 1 },
        ],
        { duration: totalMs },
      ));
    }
    if (animations.length > 0) {
      const keys = new Set(animations.map(animation => (animation.effect as KeyframeEffect | null)?.target?.closest<HTMLElement>('[data-room-key]')?.dataset.roomKey).filter((key): key is string => key !== undefined));
      playing.current = { sequence, startedAt: now(), animations, keys };
    }
  }, [boardRef, boxes, reduced, sizeKey, onRemovedRef]);
}

interface MoveTiming {
  sequence: RoomSequence;
  total: number;
  at: (time: number) => number;
  shows: Drawn;
}

/** When a room's own fade and return begin and end, as offsets of the whole sequence; the move between is shared. */
function stepsOf(move: RoomMove, { sequence, at }: MoveTiming) {
  const returns = sequence.moveAtMs + sequence.moveMs + move.offsetMs;
  return {
    start: at(move.offsetMs),
    faded: at(move.offsetMs + sequence.exitMs),
    returns: at(returns),
    shown: at(returns + sequence.showMs),
  };
}

/** Keyframes per drawn frame of the move step, so the path's own curve plays without a stop between legs. */
const PATH_SAMPLES = 30;

/** Keyframes along a room's path: held until the move step, sampled through it, held after. */
function pathFrames(move: RoomMove, { sequence, at }: MoveTiming, frame: (box: Box) => Keyframe): Keyframe[] {
  const frames: Keyframe[] = [{ ...frame(move.from), offset: 0, easing: 'linear' }];
  for (let index = 0; index <= PATH_SAMPLES; index += 1) {
    const progress = index / PATH_SAMPLES;
    frames.push({ ...frame(boxOnPath(move, sequence.waves, sequence.path, progress)), offset: at(sequence.moveAtMs + progress * sequence.moveMs), easing: 'linear' });
  }
  frames.push({ ...frame(move.to), offset: 1 });
  return frames;
}

/** An opacity that fades out linearly in a room's fade step, waits while it travels and returns after. */
function fadeFrames(from: number, steps: ReturnType<typeof stepsOf>): Keyframe[] {
  return [
    { opacity: from, offset: 0, easing: 'linear' },
    { opacity: from, offset: steps.start, easing: 'linear' },
    { opacity: 0, offset: steps.faded },
    { opacity: 0, offset: steps.returns, easing: EASE_CSS },
    { opacity: 1, offset: steps.shown },
    { opacity: 1, offset: 1 },
  ];
}

/** Earlier waves are drawn over later ones: a room arriving in a box covers the one about to leave it. */
const layerOf = (move: RoomMove) => 5 - move.wave;

/**
 * A stage room that stays one: its box itself grows or shrinks along its path, so its Moru, name tag,
 * plaque and hue edge lay out at every frame, and its scale glides to the new unit with it. Only its
 * monitor and belt fade while it travels.
 */
function playResized(element: HTMLElement, move: RoomMove, timing: MoveTiming, unit: number): Animation[] {
  const steps = stepsOf(move, timing);
  const played = [element.animate(pathFrames(move, timing, box => ({ transform: translate(box), width: `${box.w}px`, height: `${box.h}px`, zIndex: layerOf(move) })), { duration: timing.total })];
  for (const part of partsOf(element)) played.push(part.animate(fadeFrames(timing.shows.parts, steps), { duration: timing.total }));
  const scene = shownFace(element)?.querySelector<HTMLElement>('[data-scene]');
  const from = timing.shows.unit;
  if (scene && from !== unit) {
    played.push(scene.animate([
      { ['--u' as string]: from, offset: 0 },
      { ['--u' as string]: from, offset: timing.at(timing.sequence.moveAtMs), easing: EASE_CSS },
      { ['--u' as string]: unit, offset: timing.at(timing.sequence.moveAtMs + timing.sequence.moveMs) },
      { ['--u' as string]: unit, offset: 1 },
    ], { duration: timing.total }));
  }
  return played;
}

/**
 * A room going to its new box by transform: it holds while its fade step plays and passes its
 * waypoints in its move step; when its size changes, its plate scales with it from its corner.
 */
function playMove(element: HTMLElement, move: RoomMove, timing: MoveTiming): Animation[] {
  const played = [element.animate(pathFrames(move, timing, box => ({ transform: translate(box), zIndex: layerOf(move) })), { duration: timing.total })];
  const plate = element.querySelector<HTMLElement>(':scope > [data-room-plate]');
  const edge = element.querySelector<HTMLElement>(':scope > [data-room-edge]');
  const { w, h } = move.to;
  if (plate && w > 0 && h > 0 && (move.from.w !== w || move.from.h !== h)) {
    played.push(plate.animate(pathFrames(move, timing, box => ({ transform: `scale(${box.w / w}, ${box.h / h})` })), { duration: timing.total }));
    // The hue edge follows the wall's width only, so it stays as thick as it is drawn.
    if (edge) played.push(edge.animate(pathFrames(move, timing, box => ({ transform: `scaleX(${box.w / w})` })), { duration: timing.total }));
  }
  return played;
}

/**
 * A room that travels as its wall: its content fades linearly where it stood, its branch plaque and
 * the plate's hue edge stay with it, and its new content fades in once it has arrived.
 */
function playWall(element: HTMLElement, move: RoomMove, timing: MoveTiming): Animation[] {
  const steps = stepsOf(move, timing);
  const faces = facesOf(element);
  const hasOld = faces.some(isOld);
  const played: Animation[] = [];
  for (const face of faces) {
    if (isOld(face)) {
      // The old face fades on its own clock and goes when that fade has finished, never by wall time,
      // so a slow frame cannot remove it while it still shows.
      const fadeEnd = Math.max(1, steps.faded * timing.total);
      const fade = face.animate([
        { opacity: timing.shows.face, offset: 0, easing: 'linear' },
        { opacity: timing.shows.face, offset: Math.min(1, (steps.start * timing.total) / fadeEnd), easing: 'linear' },
        { opacity: 0, offset: 1 },
      ], { duration: fadeEnd, fill: 'forwards' });
      fade.addEventListener('finish', () => face.dispatchEvent(new Event(FACE_LEFT_EVENT)));
      played.push(fade);
      continue;
    }
    played.push(face.animate(fadeFrames(hasOld ? 0 : timing.shows.face, steps), { duration: timing.total }));
  }
  const plaque = element.querySelector<HTMLElement>(':scope > [data-room-plaque]');
  if (plaque) {
    played.push(plaque.animate([
      { opacity: 0, offset: 0, easing: 'linear' },
      { opacity: 0, offset: steps.start, easing: 'linear' },
      { opacity: 1, offset: steps.faded },
      { opacity: 1, offset: steps.returns, easing: 'linear' },
      { opacity: 0, offset: Math.min(1, steps.returns + (steps.faded - steps.start)) },
      { opacity: 0, offset: 1 },
    ], { duration: timing.total }));
  }
  return played;
}

/** A room that left the building without a merge to play: it fades linearly where it stood. */
export function exitRoom(element: HTMLElement, from: Box, reduced: boolean, onDone: () => void) {
  const keyframes = reduced
    ? [{ opacity: 1 }, { opacity: 0 }]
    : [{ opacity: 1, transform: translate(from) }, { opacity: 0, transform: `${translate(from, ENTER_RISE_PX / 2)} scale(0.97)` }];
  const timing = { duration: reduced ? ms(MOTION.fast.duration) : FADE_MS, easing: 'linear' };
  element.animate(keyframes, { ...timing, fill: 'forwards' }).addEventListener('finish', onDone);
}
