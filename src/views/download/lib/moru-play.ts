import companion from '@/shared/ui/marks/moru-companion.json';
import reactions from '@/shared/ui/marks/moru-reactions.json';

/**
 * The download page's "Play with Moru" toy: a catch game with no lives and no end, built only
 * from Moru's existing 128px clips and the three pixel emotes. Everything here is pure so the
 * popup can drive it from one clock and the rules can be checked without a browser.
 */

/** Moru's native cell; the sheets are drawn at this size so every drawn pixel stays square. */
export const CELL = 128;
/** The 12-unit emote grid drawn at four times its size. */
export const ITEM = 48;
/** In the neutral cell the feet stand on row 100 and the head starts at row 42. */
export const FEET = 100;
const HEAD = 48;
/** Half the drawn body (columns 15–112) plus a little forgiveness. */
export const REACH = 56;
/** How far past the head line an item may fall and still land in Moru's arms. */
const BAND = 36;
const MISS_FADE_MS = 520;
const POP_MS = 720;

export type Sheet = 'companion' | 'reactions';
export type PlayClip = 'sing' | 'hearts' | 'flipper-groove' | 'magic-fish' | 'success' | 'clap' | 'hop';
export type Emote = 'note' | 'heart' | 'spark';

/** `success` is the success row, which is the reactions sheet's `dance` cell for cell. */
const SOURCE: Record<PlayClip, { sheet: Sheet; id: string }> = {
  sing: { sheet: 'reactions', id: 'sing' },
  hearts: { sheet: 'reactions', id: 'hearts' },
  'flipper-groove': { sheet: 'reactions', id: 'flipper-groove' },
  'magic-fish': { sheet: 'reactions', id: 'magic-fish' },
  success: { sheet: 'reactions', id: 'dance' },
  clap: { sheet: 'reactions', id: 'clap' },
  hop: { sheet: 'companion', id: 'hop' },
};

export const TOYS = ['sing', 'hearts', 'magic-fish', 'clap'] as const satisfies readonly PlayClip[];
export const CELEBRATIONS = ['hop', 'clap', 'success'] as const satisfies readonly PlayClip[];
export const PLAYS = ['sing', 'hearts', 'flipper-groove'] as const satisfies readonly PlayClip[];

export interface Timeline {
  sheet: Sheet;
  firstFrame: number;
  /** Absolute sheet cells, one per pose. */
  frames: number[];
  durations: number[];
  total: number;
}

function clipSource(sheet: Sheet, id: string): { firstFrame: number; durationsMs: number[] } {
  const clips: Record<string, { firstFrame: number; durationsMs: number[] }> = sheet === 'companion' ? companion.clips : reactions.clips;
  return clips[id];
}

function timeline(sheet: Sheet, frames: number[], durations: number[]): Timeline {
  return { sheet, firstFrame: frames[0], frames, durations, total: durations.reduce((a, b) => a + b, 0) };
}

/** A requested clip starts promptly and settles on the shared neutral pose, as a pet does. */
export function clipTimeline(clip: PlayClip): Timeline {
  const { sheet, id } = SOURCE[clip];
  const source = clipSource(sheet, id);
  const durations = source.durationsMs.map((ms, i, all) => (i === 0 ? 120 : i === all.length - 1 ? 240 : ms));
  return timeline(sheet, durations.map((_, i) => source.firstFrame + i), durations);
}

const blink = clipSource('companion', 'blink');
const hop = clipSource('companion', 'hop');
/** Idle is the authored blink, looped; its first and last cells are the neutral pose. */
export const IDLE = timeline('companion', blink.durationsMs.map((_, i) => blink.firstFrame + i), blink.durationsMs);
/**
 * A seal does not walk: Moru travels by bouncing on the hop clip's own crouch, flight and landing
 * cells (2–19), retimed a little faster so a bounce is about six tenths of a second.
 */
const BOUNCE_PACE = 0.55;
export const BOUNCE = timeline(
  'companion',
  Array.from({ length: 18 }, (_, i) => hop.firstFrame + 2 + i),
  hop.durationsMs.slice(2, 20).map((ms) => Math.round(ms * BOUNCE_PACE)),
);
/** The hop's own settle back to the neutral pose (cells 20–23). */
export const SETTLE = timeline('companion', [20, 21, 22, 23].map((i) => hop.firstFrame + i), [65, 95, 150, 120]);
export const NEUTRAL_FRAME = blink.firstFrame;

/** The lowest drawn row of each hop cell, measured from the sheet: how high Moru is in the air. */
const HOP_FEET = [100, 100, 100, 100, 101, 99, 95, 87, 85, 81, 77, 74, 78, 81, 86, 90, 93, 94, 93, 92, 97, 97, 97, 100];

/** How wide Moru's floor shadow is for a companion-sheet cell: narrower the higher he flies. */
export function shadowScale(sheet: Sheet, frame: number): number {
  const index = frame - hop.firstFrame;
  if (sheet !== 'companion' || index < 0 || index >= HOP_FEET.length) return 1;
  return 1 - (Math.max(0, FEET - HOP_FEET[index]) / (FEET - 74)) * 0.35;
}

/** Which pose is showing `elapsed` ms into a timeline; past the end it holds the last pose. */
export function poseAt(line: Timeline, elapsed: number): { frame: number; done: boolean } {
  let at = Math.max(0, elapsed);
  for (let i = 0; i < line.durations.length; i += 1) {
    if (at < line.durations[i]) return { frame: line.frames[i], done: false };
    at -= line.durations[i];
  }
  return { frame: line.frames[line.frames.length - 1], done: true };
}

/** The still a clip shows under reduced motion: its middle pose, as the hero companion's is. */
export function stillFrame(clip: PlayClip): { sheet: Sheet; frame: number } {
  const line = clipTimeline(clip);
  return { sheet: line.sheet, frame: line.frames[Math.floor(line.frames.length / 2)] };
}

/** The hero companion's emote choice; clips that carry their own prop keep the headroom clear. */
export function emoteFor(clip: PlayClip): Emote | null {
  if (clip === 'sing') return null;
  if (clip === 'flipper-groove' || clip === 'hop') return 'note';
  if (clip === 'clap' || clip === 'magic-fish') return 'spark';
  return 'heart';
}

/** Opacity and lift of an emote `progress` (0–1) through its clip. */
export function emoteAt(progress: number): { opacity: number; lift: number } {
  if (progress <= 0 || progress >= 0.9) return { opacity: 0, lift: progress <= 0 ? 0 : 6 };
  if (progress < 0.08) return { opacity: smooth(progress / 0.08), lift: 6 * smooth(progress / 0.08) };
  if (progress < 0.72) return { opacity: 1, lift: 6 };
  return { opacity: 1 - smooth((progress - 0.72) / 0.18), lift: 6 };
}

function smooth(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/* Steering ---------------------------------------------------------------------------------- */

export interface Mover {
  x: number;
  v: number;
  facing: 1 | -1;
}
export const TOP_SPEED = 340;
const ACCEL = 1700;

/**
 * Moves Moru toward a pointer `target` or along a held arrow `direction` at a constant top speed,
 * easing in and braking just in time so he never overshoots or snaps to a stop.
 */
export function steer(m: Mover, dtMs: number, input: { target?: number; direction?: -1 | 0 | 1 }, min: number, max: number): Mover {
  const dt = dtMs / 1000;
  let wanted = 0;
  if (input.direction !== undefined && input.direction !== 0) wanted = input.direction * TOP_SPEED;
  else if (input.target !== undefined) {
    const gap = clamp(input.target, min, max) - m.x;
    // A speed from which braking a little under ACCEL stops on the target, leaving the slack
    // that whole frames need.
    wanted = Math.sign(gap) * Math.min(TOP_SPEED, Math.sqrt(2 * ACCEL * 0.8 * Math.abs(gap)));
  }
  const change = clamp(wanted - m.v, -ACCEL * dt, ACCEL * dt);
  let v = m.v + change;
  let x = m.x + v * dt;
  if (input.direction === undefined || input.direction === 0) {
    const goal = input.target === undefined ? null : clamp(input.target, min, max);
    const passed = goal !== null && Math.sign(goal - x) !== Math.sign(goal - m.x) && goal !== m.x;
    if (goal !== null && (passed || (Math.abs(goal - x) < 0.5 && Math.abs(v) < 40))) {
      x = goal;
      v = 0;
    } else if (goal === null && Math.abs(v) < 4) v = 0;
  }
  if (x <= min || x >= max) {
    x = clamp(x, min, max);
    v = 0;
  }
  const facing = v > 1 ? 1 : v < -1 ? -1 : m.facing;
  return { x, v, facing };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/* The catch game ---------------------------------------------------------------------------- */

export interface FallingItem {
  id: number;
  kind: Emote;
  /** Horizontal centre. */
  x: number;
  /** Bottom edge. */
  y: number;
  state: 'falling' | 'caught' | 'missed';
  /** Ms since the item was caught or touched the floor. */
  age: number;
}

export interface Game {
  seed: number;
  elapsed: number;
  score: number;
  best: number;
  nextSpawn: number;
  nextId: number;
  items: FallingItem[];
  celebrations: number;
  plays: number;
}

export interface Field {
  width: number;
  /** The floor line Moru stands on, from the field's top. */
  floor: number;
}

export interface Step {
  game: Game;
  caught: number;
  /** A clip Moru plays for a round number of catches; the caller holds spawning while it runs. */
  milestone: PlayClip | null;
}

const KINDS: readonly Emote[] = ['note', 'heart', 'spark'];
const FIRST_SPAWN_MS = 700;

export function newGame(seed: number, best = 0): Game {
  return { seed: seed >>> 0 || 1, elapsed: 0, score: 0, best, nextSpawn: FIRST_SPAWN_MS, nextId: 1, items: [], celebrations: 0, plays: 0 };
}

/** Falling speed in px/s: gentle at first, a little quicker each minute, never frantic. */
export function fallSpeed(elapsedMs: number): number {
  return 120 + Math.min(90, (elapsedMs / 1000) * 0.75);
}

/** Ms between drops, shrinking slowly from 1.5 s to 0.75 s. */
export function spawnGap(elapsedMs: number): number {
  return Math.max(750, 1500 - (elapsedMs / 1000) * 6);
}

/** True when the item is over Moru's arms in the band just below his head. */
export function catches(item: Pick<FallingItem, 'x' | 'y'>, moruX: number, floor: number): boolean {
  const head = floor - FEET + HEAD;
  return item.y >= head && item.y <= head + BAND && Math.abs(item.x - moruX) <= REACH;
}

/** The clip a score earns: a play clip every 15 catches, otherwise a celebration every 5. */
export function milestoneFor(score: number, game: Pick<Game, 'celebrations' | 'plays'>): PlayClip | null {
  if (score <= 0) return null;
  if (score % 15 === 0) return PLAYS[game.plays % PLAYS.length];
  if (score % 5 === 0) return CELEBRATIONS[game.celebrations % CELEBRATIONS.length];
  return null;
}

/** mulberry32: a tiny seeded generator, so a game replays exactly in a test. */
function next(seed: number): [number, number] {
  const state = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, state >>> 0];
}

/**
 * Advances the game by `dtMs`. `hold` stops new drops (Moru is busy with a clip) and `canCatch`
 * is false while he is; nothing ever ends the game, and a miss only fades on the floor.
 */
export function stepGame(game: Game, dtMs: number, field: Field, moru: { x: number; canCatch: boolean; hold: boolean }): Step {
  const dt = Math.min(dtMs, 50);
  const elapsed = game.elapsed + dt;
  let { seed, nextSpawn, nextId, score, best, celebrations, plays } = game;
  const speed = fallSpeed(elapsed);
  let caught = 0;
  let milestone: PlayClip | null = null;
  const items: FallingItem[] = [];
  for (const item of game.items) {
    if (item.state !== 'falling') {
      const age = item.age + dt;
      if (age < (item.state === 'caught' ? POP_MS : MISS_FADE_MS)) items.push({ ...item, age });
      continue;
    }
    const moved = { ...item, y: item.y + (speed * dt) / 1000 };
    if (moru.canCatch && milestone === null && catches(moved, moru.x, field.floor)) {
      caught += 1;
      score += 1;
      best = Math.max(best, score);
      items.push({ ...moved, state: 'caught', age: 0 });
      milestone = milestoneFor(score, { celebrations, plays });
      if (milestone && score % 15 === 0) plays += 1;
      else if (milestone) celebrations += 1;
      continue;
    }
    if (moved.y >= field.floor) items.push({ ...moved, y: field.floor, state: 'missed', age: 0 });
    else items.push(moved);
  }
  if (moru.hold || milestone) nextSpawn = Math.max(nextSpawn, elapsed + FIRST_SPAWN_MS);
  else if (elapsed >= nextSpawn) {
    const [a, s1] = next(seed);
    const [b, s2] = next(s1);
    seed = s2;
    const margin = ITEM / 2 + 8;
    items.push({ id: nextId, kind: KINDS[Math.floor(b * KINDS.length)], x: margin + a * Math.max(0, field.width - margin * 2), y: 0, state: 'falling', age: 0 });
    nextId += 1;
    nextSpawn = elapsed + spawnGap(elapsed);
  }
  return { game: { seed, elapsed, score, best, nextSpawn, nextId, items, celebrations, plays }, caught, milestone };
}

/** How a caught item pops: it dips into Moru's arms as it fades, a ring opens and a +1 rises. */
export function popAt(age: number): { scale: number; drop: number; opacity: number; ring: number; ringOpacity: number; plus: number; plusOpacity: number } {
  const t = Math.min(1, age / POP_MS);
  const gulp = smooth(Math.min(1, age / 260));
  const ring = smooth(Math.min(1, age / 420));
  return {
    scale: 1 - 0.45 * gulp,
    drop: 18 * gulp,
    opacity: 1 - gulp,
    ring: 0.6 + 0.9 * ring,
    ringOpacity: 1 - ring,
    plus: 28 * smooth(t),
    plusOpacity: t < 0.6 ? smooth(t / 0.15) : 1 - smooth((t - 0.6) / 0.4),
  };
}

/** A missed item rests on the floor and fades. */
export function missAt(age: number): number {
  return 1 - smooth(age / MISS_FADE_MS);
}

/* Best score, kept in this browser only ------------------------------------------------------ */

const BEST_KEY = 'atlas.download.moru-play.best';

export function readBest(storage: Pick<Storage, 'getItem'> | undefined): number {
  try {
    const value = Number(storage?.getItem(BEST_KEY));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

export function writeBest(storage: Pick<Storage, 'setItem'> | undefined, best: number): void {
  try {
    storage?.setItem(BEST_KEY, String(best));
  } catch {
    /* Storage may be blocked; the best score still holds while the popup is open. */
  }
}
