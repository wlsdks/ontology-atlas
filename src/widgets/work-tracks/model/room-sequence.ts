import type { Box } from './building-layout';

/**
 * One building update plays as a sequence in which every frame shows exactly one copy of each room:
 * each moving room fades what must not show while it travels, every room moves at once to its new
 * box, and each brings back what faded. The fades and returns are staggered room by room, so the
 * stage never empties at once; the move is shared, so no stagger makes two rooms cross. Rooms that
 * leave fade where they stood; new rooms fade in once every move is done. A step nothing needs is
 * skipped.
 */
export const FADE_MS = 160;
export const MOVE_MS = 480;
export const SHOW_MS = 240;
const STAGGER_MS = 80;
const STAGGER_SPAN_MS = 160;

/**
 * How a room travels. `carried`: same size on a clear path, all of it shows. `resized`: a stage room
 * that stays one, its box growing or shrinking as it goes; its Moru, name tag, plaque and hue edge
 * stay, and only its monitor and belt fade. `wall`: a room that changes tier or scale travels as its
 * wall with its hue edge and branch plaque, and its content fades.
 */
export type MoveMode = 'carried' | 'resized' | 'wall';

export interface RoomMove {
  from: Box;
  to: Box;
  mode: MoveMode;
  /** Which wave of the move step the room travels in, from 0. */
  wave: number;
  /** How far this room's fade and return lag the first room's. */
  offsetMs: number;
}

/**
 * How rooms travel: all along straight lines, or every room along one axis and then the other, so
 * rooms that trade rows and columns slide past each other instead of across.
 */
export type RoomPath = 'straight' | 'acrossFirst' | 'downFirst';

export interface RoomSequence {
  /** Each moving room's fade step; 0 when no room needs one. */
  exitMs: number;
  /** When every room starts to move: once the last fade is done. */
  moveAtMs: number;
  moveMs: number;
  showMs: number;
  /** The whole sequence: the last room's return after the move. */
  totalMs: number;
  /** When new rooms start to fade in: once every move is done. */
  enterAtMs: number;
  moves: Map<string, RoomMove>;
  /** How many waves the rooms move in: 1 for all at once, more when some must wait for others. */
  waves: number;
  path: RoomPath;
}

/** A point a room passes during its move step: where it is drawn at that share of the step. */
export interface Waypoint {
  at: number;
  box: Box;
}

const NEAR_PX = 1;
const near = (a: number, b: number) => Math.abs(a - b) <= NEAR_PX;
const sameBox = (a: Box, b: Box) => near(a.x, b.x) && near(a.y, b.y) && near(a.w, b.w) && near(a.h, b.h);
const sameSize = (a: Box, b: Box) => near(a.w, b.w) && near(a.h, b.h);
const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress;
const area = (box: Box) => box.w * box.h;
const covers = (box: Box, point: Box) => box.x <= point.x && box.y <= point.y && box.x + box.w >= point.x + point.w && box.y + box.h >= point.y + point.h;

function overlaps(a: Box, b: Box): boolean {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 2 && h > 2;
}

/**
 * The part of the move step a room of a wave travels in. Two waves take a half each; three overlap a
 * little, so no room has to cross its distance in a third of the step.
 */
export function moveWindow(wave: number, waves: number): [number, number] {
  if (waves <= 1) return [0, 1];
  if (waves === 2) return wave === 0 ? [0, 0.5] : [0.5, 1];
  return [[0, 0.4], [0.3, 0.7], [0.6, 1]][Math.min(wave, 2)] as [number, number];
}

/** The points a moving room passes, from the start of its move step (0) to its end (1). */
export function waypointsOf(move: RoomMove, waves: number, path: RoomPath = 'straight'): Waypoint[] {
  const { from, to } = move;
  if (path === 'acrossFirst') return [{ at: 0, box: from }, { at: 0.5, box: { x: to.x, w: to.w, y: from.y, h: from.h } }, { at: 1, box: to }];
  if (path === 'downFirst') return [{ at: 0, box: from }, { at: 0.5, box: { x: from.x, w: from.w, y: to.y, h: to.h } }, { at: 1, box: to }];
  const [start, end] = moveWindow(move.wave, waves);
  return [{ at: 0, box: from }, { at: start, box: from }, { at: end, box: to }, { at: 1, box: to }];
}

function boxAtProgress(points: readonly Waypoint[], progress: number): Box {
  const next = points.findIndex(point => point.at >= progress);
  if (next <= 0) return points[Math.max(0, next)].box;
  const a = points[next - 1], b = points[next];
  const local = b.at === a.at ? 1 : (progress - a.at) / (b.at - a.at);
  return { x: lerp(a.box.x, b.box.x, local), y: lerp(a.box.y, b.box.y, local), w: lerp(a.box.w, b.box.w, local), h: lerp(a.box.h, b.box.h, local) };
}

type Timing = Pick<RoomSequence, 'moveAtMs' | 'moveMs' | 'waves' | 'path'>;

/** Where a moving room is drawn at a time after the sequence's start, before easing. */
export function boxAt(move: RoomMove, timing: Timing, timeMs: number): Box {
  const progress = timing.moveMs === 0 ? 1 : Math.min(1, Math.max(0, (timeMs - timing.moveAtMs) / timing.moveMs));
  return boxAtProgress(waypointsOf(move, timing.waves, timing.path), progress);
}

const SAMPLES = 24;
/** Up to this many moving rooms every order of three waves is tried; up to `SEARCHED_MOVES`, of two. */
const THREE_WAVE_MOVES = 5;
const SEARCHED_MOVES = 8;
/** A frame where a box one room hands to another shows bare background, for the largest box. */
const BARE_COST = 3;
/** A room arriving over one that waits to give up its box hides it rather than crossing it. */
const COVERING_COST = 0.25;
/** A room that could keep its content but crosses another on the way, and so moves as its wall. */
const WALL_COST = 24;

type Moves = [string, RoomMove][];

interface Plan {
  waves: number;
  path: RoomPath;
}

/** Which rooms cross a still room or another moving room on their way, and what the crossings and bare frames cost. */
function crossings(moves: Moves, still: readonly Box[], timing: Timing): { touched: boolean[]; cost: number } {
  const touched = moves.map(() => false);
  if (moves.length === 0) return { touched, cost: 0 };
  const largest = Math.max(...moves.map(([, move]) => area(move.from)), 1);
  const span = timing.moveAtMs + timing.moveMs;
  let cost = 0;
  for (let sample = 0; sample <= SAMPLES; sample += 1) {
    const time = (sample / SAMPLES) * span;
    const boxes = moves.map(([, move]) => boxAt(move, timing, time));
    const waiting = moves.map(([, move]) => timing.waves > 1 && time - timing.moveAtMs <= moveWindow(move.wave, timing.waves)[0] * timing.moveMs);
    for (let i = 0; i < boxes.length; i += 1) {
      if (still.some(other => overlaps(boxes[i], other))) {
        cost += 1;
        touched[i] = true;
      }
      for (let j = i + 1; j < boxes.length; j += 1) {
        if (!overlaps(boxes[i], boxes[j])) continue;
        cost += waiting[i] !== waiting[j] ? COVERING_COST : 1;
        // A wall sliding beneath a room of an earlier wave leaves that room its content; it is drawn on top.
        const [mi, mj] = [moves[i][1], moves[j][1]];
        if (!(mj.wave > mi.wave && mj.mode === 'wall')) touched[i] = true;
        if (!(mi.wave > mj.wave && mi.mode === 'wall')) touched[j] = true;
      }
    }
    for (const [, move] of moves) {
      // Handed over: another room takes this very box, as when a room rising to the stage takes a stopped room's slot.
      const handed = moves.some(([, other]) => other !== move && sameBox(other.to, move.from));
      const centre = { x: move.from.x + move.from.w / 2 - 1, y: move.from.y + move.from.h / 2 - 1, w: 2, h: 2 };
      if (handed && !boxes.some(box => covers(box, centre))) cost += (BARE_COST * area(move.from)) / largest;
    }
  }
  return { touched, cost };
}

/** Crossings and bare frames, plus each room that could keep its content but loses it to a crossing. */
function planCost(moves: Moves, still: readonly Box[], timing: Timing): number {
  const { touched, cost } = crossings(moves, still, timing);
  return cost + WALL_COST * moves.filter(([, move], index) => touched[index] && move.mode !== 'wall').length;
}

/** Every way to put `count` rooms in two up to `most` waves, numbered from 0 with none skipped, fewer waves first. */
function* waveOrders(count: number, most: number): Generator<number[]> {
  for (let waves = 2; waves <= most; waves += 1) {
    const order = new Array<number>(count).fill(0);
    for (;;) {
      if (new Set(order).size === waves) yield order;
      let index = 0;
      while (index < count && order[index] === waves - 1) order[index++] = 0;
      if (index === count) break;
      order[index] += 1;
    }
  }
}

/** Each room's fade and return after the one before it in reading order; the stagger spans at most 160 ms. */
function stagger(moves: Moves) {
  const step = moves.length > 1 ? Math.min(STAGGER_MS, STAGGER_SPAN_MS / (moves.length - 1)) : 0;
  [...moves].sort(([, a], [, b]) => a.from.y - b.from.y || a.from.x - b.from.x).forEach(([, move], index) => { move.offsetMs = index * step; });
}

/**
 * How the rooms travel: the order and paths with the fewest crossings and bare frames, preferring
 * all together along straight lines, then one axis at a time, then fewer waves.
 */
function orderMoves(moves: Moves, still: readonly Box[]): Plan {
  if (moves.length === 0) return { waves: 1, path: 'straight' };
  const timing = (plan: Plan): Timing => ({ ...plan, moveAtMs: 0, moveMs: MOVE_MS });
  const setOrder = (order: readonly number[]) => moves.forEach(([, move], index) => { move.wave = order[index] ?? 0; });
  let best: Plan & { cost: number; order: number[] } = { waves: 1, path: 'straight', cost: Number.POSITIVE_INFINITY, order: [] };
  for (const path of ['straight', 'acrossFirst', 'downFirst'] as const) {
    const cost = planCost(moves, still, timing({ waves: 1, path }));
    if (cost < best.cost) best = { waves: 1, path, cost, order: [] };
  }
  if (moves.length >= 2 && moves.length <= SEARCHED_MOVES) {
    for (const order of waveOrders(moves.length, moves.length <= THREE_WAVE_MOVES ? 3 : 2)) {
      if (best.cost === 0) break;
      setOrder(order);
      const plan: Plan = { waves: new Set(order).size, path: 'straight' };
      const cost = planCost(moves, still, timing(plan));
      if (cost < best.cost) best = { ...plan, cost, order: [...order] };
    }
  }
  setOrder(best.order);
  return { waves: best.waves, path: best.path };
}

export function planSequence({ from, to, leaving, entering, keepsContent }: {
  /** Where each room is drawn now. */
  from: ReadonlyMap<string, Box>;
  /** Where each room of the new layout stands. */
  to: ReadonlyMap<string, Box>;
  /** Rooms that still have to fade where they stood. */
  leaving: number;
  entering: number;
  /** Whether a room whose size changes stays a stage room at its scale, so it can travel resized. */
  keepsContent: (key: string) => boolean;
}): RoomSequence {
  const moves = new Map<string, RoomMove>();
  const still: Box[] = [];
  for (const [key, target] of to) {
    const start = from.get(key);
    if (!start) continue;
    if (sameBox(start, target)) still.push(target);
    else moves.set(key, { from: start, to: target, mode: sameSize(start, target) ? 'carried' : keepsContent(key) ? 'resized' : 'wall', wave: 0, offsetMs: 0 });
  }
  const all = [...moves.entries()];
  const plan = orderMoves(all, still);
  const { touched } = crossings(all, still, { ...plan, moveAtMs: 0, moveMs: MOVE_MS });
  all.forEach(([, move], index) => { if (touched[index]) move.mode = 'wall'; });
  stagger(all.filter(([, move]) => move.mode !== 'carried'));
  const fading = all.some(([, move]) => move.mode !== 'carried');
  const exitMs = leaving > 0 || fading ? FADE_MS : 0;
  const lastOffset = Math.max(0, ...all.map(([, move]) => move.offsetMs));
  const moveAtMs = lastOffset + exitMs;
  const moveMs = moves.size > 0 ? MOVE_MS : 0;
  const showMs = entering > 0 || fading ? SHOW_MS : 0;
  return {
    exitMs,
    moveAtMs,
    moveMs,
    showMs,
    totalMs: moveAtMs + moveMs + lastOffset + showMs,
    enterAtMs: moveAtMs + moveMs,
    moves,
    ...plan,
  };
}
