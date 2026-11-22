import type { Box } from './building-layout';

/**
 * One building update plays as three steps, so every frame shows exactly one copy of each room:
 * rooms that leave fade out, and rooms that will change size or cross another fade their content to
 * their own wall; then every room that moves goes to its new box; then the walls fill with their new
 * content and new rooms fade in. A step nothing needs is skipped.
 */
export const EXIT_MS = 240;
export const MOVE_MS = 540;
export const SHOW_MS = 300;

export interface RoomMove {
  from: Box;
  to: Box;
  /** The room keeps its content while it moves: same size, and its path crosses no other room. */
  carried: boolean;
  /** Which wave of the move step the room travels in, from 0. */
  wave: number;
}

/**
 * How rooms travel: all along straight lines, or every room along one axis and then the other, so
 * rooms that trade rows and columns slide past each other instead of across.
 */
export type RoomPath = 'straight' | 'acrossFirst' | 'downFirst';

export interface RoomSequence {
  exitMs: number;
  moveMs: number;
  showMs: number;
  moves: Map<string, RoomMove>;
  /** How many waves the rooms move in: 1 for all at once, more when some must wait for others. */
  waves: number;
  path: RoomPath;
}

/** A point a room passes during the move step: where it is drawn at that share of the step. */
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

/** The points a moving room passes, from the start of the move step (0) to its end (1). */
export function waypointsOf(move: RoomMove, waves: number, path: RoomPath = 'straight'): Waypoint[] {
  const { from, to } = move;
  if (path === 'acrossFirst') return [{ at: 0, box: from }, { at: 0.5, box: { x: to.x, w: to.w, y: from.y, h: from.h } }, { at: 1, box: to }];
  if (path === 'downFirst') return [{ at: 0, box: from }, { at: 0.5, box: { x: from.x, w: from.w, y: to.y, h: to.h } }, { at: 1, box: to }];
  const [start, end] = moveWindow(move.wave, waves);
  return [{ at: 0, box: from }, { at: start, box: from }, { at: end, box: to }, { at: 1, box: to }];
}

/** Where a moving room is drawn at a point of the move step, from 0 to 1, before easing. */
export function boxDuring(move: RoomMove, waves: number, progress: number, path: RoomPath = 'straight'): Box {
  const points = waypointsOf(move, waves, path);
  const next = points.findIndex(point => point.at >= progress);
  if (next <= 0) return points[Math.max(0, next)].box;
  const a = points[next - 1], b = points[next];
  const local = b.at === a.at ? 1 : (progress - a.at) / (b.at - a.at);
  return {
    x: lerp(a.box.x, b.box.x, local),
    y: lerp(a.box.y, b.box.y, local),
    w: lerp(a.box.w, b.box.w, local),
    h: lerp(a.box.h, b.box.h, local),
  };
}

const PATH_SAMPLES = 16;
/** Up to this many moving rooms every order of three waves is tried; up to `SEARCHED_MOVES`, of two. */
const THREE_WAVE_MOVES = 6;
const SEARCHED_MOVES = 9;
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
function crossings(moves: Moves, still: readonly Box[], { waves, path }: Plan): { touched: boolean[]; cost: number } {
  const largest = Math.max(...moves.map(([, move]) => area(move.from)), 1);
  const touched = moves.map(() => false);
  let cost = 0;
  for (let sample = 0; sample <= PATH_SAMPLES; sample += 1) {
    const progress = sample / PATH_SAMPLES;
    const boxes = moves.map(([, move]) => boxDuring(move, waves, progress, path));
    const waiting = moves.map(([, move]) => waves > 1 && progress <= moveWindow(move.wave, waves)[0]);
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
        if (!(mj.wave > mi.wave && !sameSize(mj.from, mj.to))) touched[i] = true;
        if (!(mi.wave > mj.wave && !sameSize(mi.from, mi.to))) touched[j] = true;
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
function planCost(moves: Moves, still: readonly Box[], plan: Plan): number {
  const { touched, cost } = crossings(moves, still, plan);
  return cost + WALL_COST * moves.filter(([, move], index) => touched[index] && sameSize(move.from, move.to)).length;
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

/**
 * How the rooms travel: the order and paths with the fewest crossings and bare frames, preferring
 * all together along straight lines, then one axis at a time, then fewer waves.
 */
function orderMoves(moves: Moves, still: readonly Box[]): Plan {
  if (moves.length < 2) return { waves: 1, path: 'straight' };
  const setOrder = (order: readonly number[]) => moves.forEach(([, move], index) => { move.wave = order[index] ?? 0; });
  let best: Plan & { cost: number; order: number[] } = { waves: 1, path: 'straight', cost: planCost(moves, still, { waves: 1, path: 'straight' }), order: [] };
  for (const path of ['acrossFirst', 'downFirst'] as const) {
    const cost = planCost(moves, still, { waves: 1, path });
    if (cost < best.cost) best = { waves: 1, path, cost, order: [] };
  }
  if (moves.length <= SEARCHED_MOVES) {
    for (const order of waveOrders(moves.length, moves.length <= THREE_WAVE_MOVES ? 3 : 2)) {
      if (best.cost === 0) break;
      setOrder(order);
      const plan: Plan = { waves: new Set(order).size, path: 'straight' };
      const cost = planCost(moves, still, plan);
      if (cost < best.cost) best = { ...plan, cost, order: [...order] };
    }
  } else {
    // Too many to search: arrivals first, the larger first in a trade.
    const first: RoomMove[] = [];
    const order = moves.map(() => 0);
    [...moves.keys()].sort((a, b) => area(moves[b][1].to) - area(moves[a][1].to)).forEach(index => {
      const move = moves[index][1];
      order[index] = first.some(other => overlaps(other.to, move.from)) ? 1 : 0;
      if (order[index] === 0) first.push(move);
    });
    setOrder(order);
    const plan: Plan = { waves: new Set(order).size, path: 'straight' };
    const cost = planCost(moves, still, plan);
    if (cost < best.cost) best = { ...plan, cost, order };
  }
  setOrder(best.order);
  return { waves: best.waves, path: best.path };
}

export function planSequence({ from, to, leaving, entering }: {
  /** Where each room is drawn now. */
  from: ReadonlyMap<string, Box>;
  /** Where each room of the new layout stands. */
  to: ReadonlyMap<string, Box>;
  /** Rooms that still have to fade where they stood. */
  leaving: number;
  entering: number;
}): RoomSequence {
  const moves = new Map<string, RoomMove>();
  const still: Box[] = [];
  for (const [key, target] of to) {
    const start = from.get(key);
    if (!start) continue;
    if (sameBox(start, target)) still.push(target);
    else moves.set(key, { from: start, to: target, carried: false, wave: 0 });
  }
  const all = [...moves.entries()];
  const plan = orderMoves(all, still);
  const { touched } = crossings(all, still, plan);
  all.forEach(([, move], index) => { move.carried = sameSize(move.from, move.to) && !touched[index]; });
  const walls = all.some(([, move]) => !move.carried);
  return {
    exitMs: leaving > 0 || walls ? EXIT_MS : 0,
    moveMs: moves.size > 0 ? MOVE_MS : 0,
    showMs: entering > 0 || walls ? SHOW_MS : 0,
    moves,
    ...plan,
  };
}
