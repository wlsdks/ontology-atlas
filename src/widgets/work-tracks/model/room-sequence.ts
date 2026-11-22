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
 * How rooms travel: all along straight lines, or every room on an arc that sets off along one axis and
 * bends into the other with both moving through the middle, so rooms that trade rows and columns
 * slide past each other on one curve. A room never runs one axis and then the other: that reads as
 * two moves with a stop between them.
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
  /** On an arc, the share of the move both axes run together. */
  overlap: number;
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

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** The stretch at each end of a glide where a room eases in or out. */
const EASE_END = 0.22;
const GLIDE_SAMPLES = 240;

/** A glide's progress, tabulated from its speed: it eases in over `EASE_END`, cruises, and eases out. */
const GLIDE_TABLE = (() => {
  const raised = (share: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(share));
  const table = [0];
  for (let index = 1; index <= GLIDE_SAMPLES; index += 1) {
    const t = (index - 0.5) / GLIDE_SAMPLES;
    table.push(table[index - 1] + raised(t / EASE_END) * raised((1 - t) / EASE_END));
  }
  return table.map(value => value / table[GLIDE_SAMPLES]);
})();

/** A move's progress along one curve: it eases in, cruises and eases out, never far faster in one step than the rest. */
function glide(t: number): number {
  const at = clamp01(t) * GLIDE_SAMPLES;
  const index = Math.min(GLIDE_SAMPLES - 1, Math.floor(at));
  return GLIDE_TABLE[index] + (GLIDE_TABLE[index + 1] - GLIDE_TABLE[index]) * (at - index);
}

/** The size of a wall's side at a share of its own window: eased in and out on a cosine, no long tail. */
const sizeGlide = (share: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(share));

/** The earliest and latest a room's arc centres its bend, so neither leg is rushed into a sliver of the move. */
const BEND_RANGE: [number, number] = [0.25, 0.75];

/** How far a room travels along each axis: the farther of its two sides. */
function legsOf({ from, to }: RoomMove): { sideways: number; upright: number } {
  return {
    sideways: Math.max(Math.abs(to.x - from.x), Math.abs(to.x + to.w - from.x - from.w)),
    upright: Math.max(Math.abs(to.y - from.y), Math.abs(to.y + to.h - from.y - from.h)),
  };
}

/**
 * An arc: the leading leg glides from the start and the other to the end, both running together for
 * `overlap` of the move around the room's bend. The bend sits at the share of its travel the leading
 * leg covers, so the room keeps one pace instead of darting one way and creeping the other.
 */
function arcAt(t: number, first: number, second: number, overlap: number): [number, number] {
  if (first <= NEAR_PX || second <= NEAR_PX) return [glide(t), glide(t)];
  const bend = Math.min(BEND_RANGE[1], Math.max(BEND_RANGE[0], first / (first + second)));
  const leads = Math.min(1, bend + overlap / 2);
  const follows = Math.max(0, bend - overlap / 2);
  return [glide(t / leads), glide((t - follows) / (1 - follows))];
}

/** Where a wall's shrinking sides finish, and its growing sides start, as shares of its travel. */
const WALL_SHRUNK = 0.4;
const WALL_GROWS = 0.5;

/**
 * A wall changes size away from its neighbours: it shrinks in the first part of its travel and grows
 * in the rest, so a small card is what passes other rooms. Each side follows its own direction, and
 * growing starts while the wall still travels, so it never comes to rest before it grows.
 */
function wallSide(from: number, to: number, t: number): number {
  if (to < from) return lerp(from, to, sizeGlide(t / WALL_SHRUNK));
  return lerp(from, to, sizeGlide((t - WALL_GROWS) / (1 - WALL_GROWS)));
}

/**
 * Where a moving room is drawn at a share of the shared move step, eased: within its wave's window
 * on a straight line, or on an arc that sets off along one axis and bends into the other.
 */
export function boxOnPath(move: RoomMove, waves: number, path: RoomPath, progress: number, overlap = 1): Box {
  const { from, to } = move;
  const [start, end] = path === 'straight' ? moveWindow(move.wave, waves) : [0, 1];
  const t = clamp01((progress - start) / (end - start));
  let across = glide(t), down = across;
  // A wall travels on the move's one curve: it shrinks and grows on its own windows.
  if (path !== 'straight' && move.mode !== 'wall') {
    const { sideways, upright } = legsOf(move);
    const acrossFirst = path === 'acrossFirst';
    const [first, second] = arcAt(t, acrossFirst ? sideways : upright, acrossFirst ? upright : sideways, overlap);
    [across, down] = acrossFirst ? [first, second] : [second, first];
  }
  const box = { x: lerp(from.x, to.x, across), y: lerp(from.y, to.y, down), w: lerp(from.w, to.w, across), h: lerp(from.h, to.h, down) };
  if (move.mode !== 'wall') return box;
  return { ...box, w: wallSide(from.w, to.w, t), h: wallSide(from.h, to.h, t) };
}

type Timing = Pick<RoomSequence, 'moveAtMs' | 'moveMs' | 'waves' | 'path' | 'overlap'>;

/** Where a moving room is drawn at a time after the sequence's start. */
export function boxAt(move: RoomMove, timing: Timing, timeMs: number): Box {
  const progress = timing.moveMs === 0 ? 1 : clamp01((timeMs - timing.moveAtMs) / timing.moveMs);
  return boxOnPath(move, timing.waves, timing.path, progress, timing.overlap);
}

/** Frames of the move each candidate plan is checked at: enough to see two rooms meet, few enough to plan within a frame. */
const SAMPLES = 64;
/** Frames each candidate is ranked at; only the best few are checked at `SAMPLES`. */
const RANK_SAMPLES = 16;
/** How many of the best-ranked plans are checked closely before one is taken. */
const CONFIRMED_PLANS = 3;
/** Up to this many moving rooms every order of three waves is tried; up to `SEARCHED_MOVES`, of two. */
const THREE_WAVE_MOVES = 4;
const SEARCHED_MOVES = 6;
/** A frame where a box one room hands to another shows bare background, for the largest box. */
const BARE_COST = 6;
/**
 * How far round a handed-over box's centre a plan must keep it covered. A plan is checked at
 * `SAMPLES` frames, not every frame; a room that covers the centre only just at two samples can
 * leave it bare in a frame between them.
 */
const COVER_MARGIN = 12;
/** A room arriving over one that waits to give up its box hides it rather than crossing it. */
const COVERING_COST = 0.25;
/** A room that could keep its content but crosses another on the way, and so moves as its wall. */
const WALL_COST = 48;

type Moves = [string, RoomMove][];

interface Plan {
  waves: number;
  path: RoomPath;
  overlap: number;
}

/** How much of the move an arc's two axes may run together, the most first. */
const ARC_OVERLAPS = [0.6, 0.4, 0.2];

/** Which rooms cross a still room or another moving room on their way, and what the crossings and bare frames cost. */
function crossings(moves: Moves, still: readonly Box[], timing: Timing, samples = SAMPLES): { touched: boolean[]; cost: number } {
  const touched = moves.map(() => false);
  if (moves.length === 0) return { touched, cost: 0 };
  const largest = Math.max(...moves.map(([, move]) => area(move.from)), 1);
  const span = timing.moveAtMs + timing.moveMs;
  // Handed over: another room takes this very box, as when a room rising to the stage takes a stopped room's slot.
  const handed = moves.flatMap(([, move]) => moves.some(([, other]) => other !== move && sameBox(other.to, move.from))
    ? [{ centre: { x: move.from.x + move.from.w / 2 - COVER_MARGIN, y: move.from.y + move.from.h / 2 - COVER_MARGIN, w: 2 * COVER_MARGIN, h: 2 * COVER_MARGIN }, cost: (BARE_COST * area(move.from)) / largest }]
    : []);
  let cost = 0;
  for (let sample = 0; sample <= samples; sample += 1) {
    const time = (sample / samples) * span;
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
    for (const slot of handed) if (!boxes.some(box => covers(box, slot.centre))) cost += slot.cost;
  }
  return { touched, cost };
}

/** Crossings and bare frames, plus each room that could keep its content but loses it to a crossing. */
function planCost(moves: Moves, still: readonly Box[], timing: Timing, samples = SAMPLES): number {
  const { touched, cost } = crossings(moves, still, timing, samples);
  return (cost * SAMPLES) / samples + WALL_COST * moves.filter(([, move], index) => touched[index] && move.mode !== 'wall').length;
}

/** Whether a room meets a still room, or a moving room that keeps its content, at any frame of the move. */
function meetsDrawn(moves: Moves, still: readonly Box[], timing: Timing, index: number): boolean {
  const span = timing.moveAtMs + timing.moveMs;
  const move = moves[index][1];
  for (let sample = 0; sample <= SAMPLES; sample += 1) {
    const time = (sample / SAMPLES) * span;
    const box = boxAt(move, timing, time);
    if (still.some(other => overlaps(box, other))) return true;
    if (moves.some(([, other], at) => at !== index && other.mode !== 'wall' && overlaps(box, boxAt(other, timing, time)))) return true;
  }
  return false;
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
 * all together along straight lines, then on arcs, then fewer waves.
 */
function orderMoves(moves: Moves, still: readonly Box[]): Plan {
  if (moves.length === 0) return { waves: 1, path: 'straight', overlap: 1 };
  const timing = (plan: Plan): Timing => ({ ...plan, moveAtMs: 0, moveMs: MOVE_MS });
  const setOrder = (order: readonly number[]) => moves.forEach(([, move], index) => { move.wave = order[index] ?? 0; });
  type Ranked = Plan & { cost: number; bend: number; order: number[] };
  // Fewer crossings first; between plans that cross alike, the one whose rooms move their two axes most together.
  const better = (a: Ranked, b: Ranked) => a.cost - b.cost || a.bend - b.bend;
  const ranked = (plan: Plan, bend: number, order: number[] = []): Ranked => {
    setOrder(order);
    return { ...plan, cost: planCost(moves, still, timing(plan), RANK_SAMPLES), bend, order };
  };
  let best: Ranked | null = null;
  /**
   * Ranks a group of plans coarsely and checks its best few closely, since a brief crossing can hide
   * between coarse frames. Groups come in order of preference, so the first plan that is clear ends it.
   */
  const tryGroup = (group: Ranked[]): boolean => {
    for (const plan of group.sort(better).slice(0, CONFIRMED_PLANS)) {
      setOrder(plan.order);
      const confirmed = { ...plan, cost: planCost(moves, still, timing(plan)) };
      if (!best || better(confirmed, best) < 0) best = confirmed;
      if (confirmed.cost === 0) return true;
    }
    return false;
  };
  const groups: (() => Ranked[])[] = [
    () => [ranked({ waves: 1, path: 'straight', overlap: 1 }, 0)],
    () => (['acrossFirst', 'downFirst'] as const).flatMap(path => ARC_OVERLAPS.map(overlap => ranked({ waves: 1, path, overlap }, 1 - overlap))),
    () => moves.length >= 2 && moves.length <= SEARCHED_MOVES
      // Each order is ranked as it is yielded: the generator reuses one array for every order.
      ? Array.from(waveOrders(moves.length, moves.length <= THREE_WAVE_MOVES ? 3 : 2), order => ranked({ waves: new Set(order).size, path: 'straight', overlap: 1 }, 0, [...order]))
      : [],
  ];
  for (const group of groups) if (tryGroup(group())) break;
  const chosen = best as Ranked | null ?? { waves: 1, path: 'straight' as const, overlap: 1, order: [] };
  setOrder(chosen.order);
  return { waves: chosen.waves, path: chosen.path, overlap: chosen.overlap };
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
  const timing: Timing = { ...plan, moveAtMs: 0, moveMs: MOVE_MS };
  const { touched } = crossings(all, still, timing);
  const kept = all.map(([, move]) => move.mode);
  all.forEach(([, move], index) => { if (touched[index]) move.mode = 'wall'; });
  // A crossing room keeps its content where everything it meets travels as a wall beneath it, the
  // largest first, so the stage keeps a name tag in every frame.
  const byArea = all.map((_, index) => index).filter(index => touched[index] && kept[index] !== 'wall').sort((a, b) => area(all[b][1].to) - area(all[a][1].to));
  for (const index of byArea) {
    const move = all[index][1];
    move.mode = kept[index];
    if (meetsDrawn(all, still, timing, index)) move.mode = 'wall';
  }
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
