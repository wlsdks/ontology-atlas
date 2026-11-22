import companion from '@/shared/ui/marks/moru/moru-companion.json';
import reactions from '@/shared/ui/marks/moru/moru-reactions.json';

/**
 * The download page's "Play with Moru" game: a one-minute catch round built only from Moru's
 * existing 128px clips and pixel emotes. Everything here is pure or advances plain objects, so the
 * popup drives it from one fixed-step clock and the rules are checked without a browser.
 */

export const CELL = 128;
export const ITEM = 48;
/** In the neutral cell the feet stand on row 100 and the head starts at row 42. */
export const FEET = 100;
export const HEAD = 48;
export const REACH = 56;
export const BAND = 36;

export type Sheet = 'companion' | 'reactions';
export type PlayClip = 'wave' | 'clap' | 'laugh' | 'hearts' | 'success' | 'bow' | 'hop' | 'hurt';

/** `success` is the success row, which is the reactions sheet's `dance` cell for cell. */
const SOURCE: Record<PlayClip, { sheet: Sheet; id: string }> = {
  wave: { sheet: 'companion', id: 'wave' },
  clap: { sheet: 'reactions', id: 'clap' },
  laugh: { sheet: 'reactions', id: 'laugh' },
  hearts: { sheet: 'reactions', id: 'hearts' },
  success: { sheet: 'reactions', id: 'dance' },
  bow: { sheet: 'companion', id: 'soft-bow' },
  hop: { sheet: 'companion', id: 'hop' },
  hurt: { sheet: 'reactions', id: 'star-sneeze' },
};

export interface Timeline {
  sheet: Sheet;
  frames: number[];
  durations: number[];
  total: number;
}

function clipSource(sheet: Sheet, id: string): { firstFrame: number; durationsMs: number[] } {
  const clips: Record<string, { firstFrame: number; durationsMs: number[] }> = sheet === 'companion' ? companion.clips : reactions.clips;
  return clips[id];
}

function timeline(sheet: Sheet, frames: number[], durations: number[]): Timeline {
  return { sheet, frames, durations, total: durations.reduce((a, b) => a + b, 0) };
}

/**
 * A clip starts promptly and settles on the shared neutral pose, as a pet does; `pace` above 1
 * plays it quicker. `hurt` is the star sneeze's own squint and recovery (cells 7–21): it opens on
 * the squint, so a hit shows at once, and ends on the neutral pose about a second and a quarter later.
 */
export function clipTimeline(clip: PlayClip, pace = 1): Timeline {
  const { sheet, id } = SOURCE[clip];
  const source = clipSource(sheet, id);
  if (clip === 'hurt') {
    const cells = Array.from({ length: 15 }, (_, i) => i + 7);
    return timeline(sheet, cells.map((i) => source.firstFrame + i), cells.map((i) => Math.round(source.durationsMs[i] / 1.3 / pace)));
  }
  const durations = source.durationsMs.map((ms, i, all) => Math.round((i === 0 ? 120 : i === all.length - 1 ? 240 : ms) / pace));
  return timeline(sheet, durations.map((_, i) => source.firstFrame + i), durations);
}

export function fitTimeline(line: Timeline, ms: number): Timeline {
  const durations = line.durations.map((d) => (d * ms) / line.total);
  return { ...line, durations, total: ms };
}

const blink = clipSource('companion', 'blink');
const hop = clipSource('companion', 'hop');
export const IDLE = timeline('companion', blink.durationsMs.map((_, i) => blink.firstFrame + i), blink.durationsMs);
/**
 * A seal does not walk: Moru travels by bouncing on the hop clip's own crouch, flight and landing
 * cells (2–19), retimed faster so a bounce is under half a second.
 */
const BOUNCE_PACE = 0.4;
export const BOUNCE = timeline(
  'companion',
  Array.from({ length: 18 }, (_, i) => hop.firstFrame + 2 + i),
  hop.durationsMs.slice(2, 20).map((ms) => Math.round(ms * BOUNCE_PACE)),
);
export const SETTLE = timeline('companion', [20, 21, 22, 23].map((i) => hop.firstFrame + i), [60, 80, 120, 100]);
export const NEUTRAL_FRAME = blink.firstFrame;

/** The lowest drawn row of each hop cell, measured from the sheet: how high Moru is in the air. */
const HOP_FEET = [100, 100, 100, 100, 101, 99, 95, 87, 85, 81, 77, 74, 78, 81, 86, 90, 93, 94, 93, 92, 97, 97, 97, 100];

export function shadowScale(sheet: Sheet, frame: number): number {
  const index = frame - hop.firstFrame;
  if (sheet !== 'companion' || index < 0 || index >= HOP_FEET.length) return 1;
  return 1 - (Math.max(0, FEET - HOP_FEET[index]) / (FEET - 74)) * 0.35;
}

export function poseAt(line: Timeline, elapsed: number): { frame: number; done: boolean } {
  let at = Math.max(0, elapsed);
  for (let i = 0; i < line.durations.length; i += 1) {
    if (at < line.durations[i]) return { frame: line.frames[i], done: false };
    at -= line.durations[i];
  }
  return { frame: line.frames[line.frames.length - 1], done: true };
}

export function stillFrame(clip: PlayClip): { sheet: Sheet; frame: number } {
  const line = clipTimeline(clip);
  return { sheet: line.sheet, frame: line.frames[Math.floor(line.frames.length / 2)] };
}

export function smooth(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

export function easeOut(t: number): number {
  return 1 - (1 - clamp(t, 0, 1)) ** 3;
}

export function backOut(t: number): number {
  const x = clamp(t, 0, 1);
  const c = 1.7;
  return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface Mover {
  x: number;
  v: number;
  facing: 1 | -1;
}

export function topSpeed(width: number): number {
  return clamp(width * 0.85, 380, 720);
}

export const ACCEL_PER_SPEED = 6;

export function steer(
  m: Mover,
  dtMs: number,
  input: { target?: number; direction?: -1 | 0 | 1 },
  min: number,
  max: number,
  top = 380,
): Mover {
  const dt = dtMs / 1000;
  const accel = top * ACCEL_PER_SPEED;
  let wanted = 0;
  if (input.direction !== undefined && input.direction !== 0) wanted = input.direction * top;
  else if (input.target !== undefined) {
    const gap = clamp(input.target, min, max) - m.x;
    // A speed from which braking a little under the full rate stops on the target, leaving the
    // slack that whole steps need.
    wanted = Math.sign(gap) * Math.min(top, Math.sqrt(2 * accel * 0.8 * Math.abs(gap)));
  }
  const change = clamp(wanted - m.v, -accel * dt, accel * dt);
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

export function leanFor(v: number, top: number): number {
  return clamp(v / top, -1, 1) * (5 * Math.PI) / 180;
}

export const ROUND_MS = 60_000;
export const LIVES = 3;
/** The simulation advances in fixed steps; drawing interpolates between the last two. */
export const STEP_MS = 1000 / 120;

/** What falls. `magnet` is shown as Moru's fish and `slow` as the spark emote. */
export type ItemKind = 'note' | 'heart' | 'star' | 'gold' | 'bug' | 'magnet' | 'slow';
export type PowerKind = 'magnet' | 'slow';
const GOOD: readonly ItemKind[] = ['note', 'heart', 'star'];

export const POINTS: Record<ItemKind, number> = { note: 10, heart: 10, star: 10, gold: 50, bug: 0, magnet: 10, slow: 10 };
export const POWER_MS: Record<PowerKind, number> = { magnet: 5000, slow: 4000 };
/** After a bug Moru shrugs off further bugs for this long, so one cluster costs one life. */
const GRACE_MS = 900;
export const COMBO_STEP = 5;
export const MAX_MULTIPLIER = 4;
const MAX_FALLING = 9;

export interface Item {
  id: number;
  kind: ItemKind;
  x: number;
  y: number;
  px: number;
  py: number;
  homeX: number;
  age: number;
}

export interface Round {
  rng: number;
  t: number;
  score: number;
  lives: number;
  combo: number;
  bestCombo: number;
  caught: number;
  items: Item[];
  nextId: number;
  spawnIn: number;
  powerIn: number;
  power: { kind: PowerKind; left: number } | null;
  graceLeft: number;
  last: { x: number; t: number } | null;
  over: null | 'time' | 'lives';
}

export type RoundEvent =
  | { type: 'catch'; kind: ItemKind; x: number; y: number; points: number; multiplier: number }
  | { type: 'tier'; multiplier: number }
  | { type: 'miss'; kind: ItemKind; x: number; broke: boolean }
  | { type: 'dodge'; x: number }
  | { type: 'hit'; x: number; y: number; lives: number }
  | { type: 'power'; kind: PowerKind; ms: number }
  | { type: 'power-end'; kind: PowerKind }
  | { type: 'end'; reason: 'time' | 'lives' };

export interface Field {
  width: number;
  floor: number;
  scale?: number;
}

export function newRound(seed: number): Round {
  return {
    rng: seed >>> 0 || 1,
    t: 0,
    score: 0,
    lives: LIVES,
    combo: 0,
    bestCombo: 0,
    caught: 0,
    items: [],
    nextId: 1,
    spawnIn: 350,
    powerIn: 9000,
    power: null,
    graceLeft: 0,
    last: null,
    over: null,
  };
}

export function pace(t: number): number {
  return clamp(t / ROUND_MS, 0, 1) ** 1.6;
}

/** Ms an item takes to fall from the top to Moru's head: 2.6 s at first, 1.25 s at the end. */
export function fallMs(t: number): number {
  return 2600 - 1350 * pace(t);
}

/** Ms between drops: 0.95 s at first, 0.36 s at the end. */
export function spawnGap(t: number): number {
  return 950 - 590 * pace(t);
}

/** The share of drops that are bugs: none for four seconds, then 6% rising to 26%. */
export function bugShare(t: number): number {
  return t < 4000 ? 0 : 0.06 + 0.2 * pace(t);
}

export const GOLD_SHARE = 0.045;

export function multiplierFor(combo: number): number {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(combo / COMBO_STEP));
}

export function headLine(floor: number, scale = 1): number {
  return floor - (FEET - HEAD) * scale;
}

export function catches(item: Pick<Item, 'x' | 'y'>, moruX: number, floor: number, scale = 1): boolean {
  const head = headLine(floor, scale);
  return item.y >= head && item.y <= head + BAND * scale && Math.abs(item.x - moruX) <= REACH * scale;
}

function random(round: Round): number {
  const state = (round.rng + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  round.rng = state >>> 0;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const isGood = (kind: ItemKind) => kind !== 'bug';
const isPower = (kind: ItemKind): kind is PowerKind => kind === 'magnet' || kind === 'slow';

function speedOf(kind: ItemKind, head: number, t: number, slow: boolean): number {
  const base = head / fallMs(t);
  const kindPace = kind === 'gold' ? 1.15 : isPower(kind) ? 0.75 : 1;
  return base * kindPace * (slow ? 0.5 : 1);
}

function spawn(round: Round, field: Field, kind: ItemKind, x: number) {
  round.items.push({ id: round.nextId, kind, x, y: 0, px: x, py: 0, homeX: x, age: 0 });
  round.nextId += 1;
  round.last = { x, t: round.t };
}

function pickDrop(round: Round, field: Field) {
  const margin = ITEM / 2 + 8;
  const span = Math.max(0, field.width - margin * 2);
  const roll = random(round);
  let x = margin + random(round) * span;
  const kind: ItemKind =
    roll < bugShare(round.t) ? 'bug' : round.t > 6000 && roll > 1 - GOLD_SHARE ? 'gold' : GOOD[Math.floor(random(round) * GOOD.length)];
  // A bug never lands right beside the drop just before it, so dodging is always possible.
  if (kind === 'bug' && round.last && round.t - round.last.t < 600 && Math.abs(x - round.last.x) < ITEM * 1.4) {
    x = round.last.x + (round.last.x < field.width / 2 ? 1 : -1) * ITEM * 1.6;
    x = clamp(x, margin, margin + span);
  }
  spawn(round, field, kind, x);
}

export function stepRound(round: Round, dtMs: number, field: Field, moruX: number): RoundEvent[] {
  if (round.over) return [];
  const events: RoundEvent[] = [];
  const dt = Math.min(dtMs, 50);
  const scale = field.scale ?? 1;
  const head = headLine(field.floor, scale);
  round.t += dt;
  round.graceLeft = Math.max(0, round.graceLeft - dt);
  const slow = round.power?.kind === 'slow';
  const magnet = round.power?.kind === 'magnet';
  if (round.power) {
    round.power.left -= dt;
    if (round.power.left <= 0) {
      events.push({ type: 'power-end', kind: round.power.kind });
      round.power = null;
    }
  }

  const kept: Item[] = [];
  for (const item of round.items) {
    item.px = item.x;
    item.py = item.y;
    item.age += dt;
    item.y += speedOf(item.kind, head, round.t, slow) * dt;
    if (isPower(item.kind)) {
      item.x = item.homeX + Math.sin((item.age / 1600) * Math.PI * 2) * 18;
    } else if (magnet && isGood(item.kind)) {
      item.x += (moruX - item.x) * (1 - Math.exp(-dt / 240));
    }
    if (catches(item, moruX, field.floor, scale)) {
      if (item.kind === 'bug') {
        if (round.graceLeft > 0) {
          kept.push(item);
          continue;
        }
        round.lives -= 1;
        round.combo = 0;
        round.graceLeft = GRACE_MS;
        events.push({ type: 'hit', x: item.x, y: item.y, lives: round.lives });
        if (round.lives <= 0) {
          round.over = 'lives';
          events.push({ type: 'end', reason: 'lives' });
          round.items = kept.concat(round.items.slice(round.items.indexOf(item) + 1));
          return events;
        }
        continue;
      }
      const before = multiplierFor(round.combo);
      round.combo += 1;
      round.bestCombo = Math.max(round.bestCombo, round.combo);
      round.caught += 1;
      const multiplier = multiplierFor(round.combo);
      const points = POINTS[item.kind] * multiplier;
      round.score += points;
      events.push({ type: 'catch', kind: item.kind, x: item.x, y: item.y, points, multiplier });
      if (multiplier > before) events.push({ type: 'tier', multiplier });
      if (isPower(item.kind)) {
        round.power = { kind: item.kind, left: POWER_MS[item.kind] };
        events.push({ type: 'power', kind: item.kind, ms: POWER_MS[item.kind] });
      }
      continue;
    }
    if (item.y >= field.floor) {
      if (item.kind === 'bug') events.push({ type: 'dodge', x: item.x });
      else {
        // Only the everyday drops break the combo; gold and power items are a bonus to chase.
        const broke = GOOD.includes(item.kind) && round.combo > 0;
        if (broke) round.combo = 0;
        events.push({ type: 'miss', kind: item.kind, x: item.x, broke });
      }
      continue;
    }
    kept.push(item);
  }
  round.items = kept;

  if (round.t >= ROUND_MS) {
    round.over = 'time';
    events.push({ type: 'end', reason: 'time' });
    return events;
  }

  round.spawnIn -= dt * (slow ? 0.55 : 1);
  if (round.spawnIn <= 0) {
    if (round.items.length < MAX_FALLING) pickDrop(round, field);
    round.spawnIn += spawnGap(round.t);
  }
  round.powerIn -= dt;
  if (round.powerIn <= 0) {
    // At most one power at a time: none falls while one is running or already on its way.
    if (!round.power && !round.items.some((item) => isPower(item.kind))) {
      const margin = ITEM / 2 + 26;
      const x = margin + random(round) * Math.max(0, field.width - margin * 2);
      spawn(round, field, random(round) < 0.5 ? 'magnet' : 'slow', x);
      round.powerIn = 11_000 + random(round) * 5000;
    } else round.powerIn = 1500;
  }
  return events;
}

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
