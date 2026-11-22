/**
 * Moru life: what each Moru on a floor does next. Pure: no DOM and no timer; the host passes the time that
 * passed and the random source. The host calls `tick(world, dtMs)` from one shared timer and draws what it finds
 * in `world.morus`. Ported from `scripts/brand/moru-cast/life/behaviour.mjs`; the plan and its measurements are
 * in `docs/specs/2026-11-22-moru-cast.md`, "Life runtime".
 */
import type { LifeAtlas, WearSlot } from './atlas';

export const GAP = 96;
export const REACH = 92;
export const STRIDE = 16;
export const QUICK_MS = 350;
/** A body is 97px wide: two that stand nearer than this, in any lanes, are one in front of the other. */
export const SEP = 100;
/** How far past the floor's edge a Moru that comes or goes stands: its whole body out of sight. */
export const OFFSTAGE = 80;

/** What a room's Moru plays for a real event. The lobby has no room Moru; the measurements raise them. */
const STATE_CLIP: Record<string, string> = { commit: 'laugh', merge: 'reply-idea', waiting: 'ask', stuck: 'huff' };
const IDLE = new Set(['rest', 'blink', 'sway', 'look-ahead', 'look-back']);
/** The travelling moves the verdicts approved for the floor. */
export const TRAVEL = new Set(['roll']);

export type Random = () => number;
export interface Mood { curiosity: number; energy: number; sociability: number }
export type Wear = Record<WearSlot, string | null>;
export interface Spot { x: number; dir: 1 | -1; clip: string; lane: number }

interface Token { ready: Set<Moru>; size: number; broken?: boolean }
interface Current { scale?: number; laneFrom?: number; laneTo?: number | null; reverse?: boolean; swapWith?: Moru; state?: string }
interface PlanItem extends Current {
  go?: () => number;
  lane?: () => number;
  left?: number;
  toward?: Moru;
  blocked?: PlanItem[];
  face?: () => number;
  call?: (world: World, m: Moru) => void;
  pause?: number;
  wait?: Token;
  clip?: string;
}

export interface Moru {
  id: string;
  /** The left edge of the 128px cell. */
  x: number;
  lane: number;
  /** The lane it stands in, fractional while it changes lane. */
  depth: number;
  facing: 1 | -1;
  palette: string;
  wear: Wear;
  /** Stands for an agent's room, so it must always be free for a real event. */
  room: boolean;
  mood: Mood;
  clip: string;
  frame: number;
  changed: boolean;
  i: number;
  t: number;
  cur: Current;
  plan: PlanItem[];
  memory: string[];
  pairs: string[];
  think: number;
  idleIn: number;
  hold: number;
  waiting: Token | null;
  event: { state: string; at: number; holdMs: number } | null;
  claimed: number;
  hail: number;
  steps: number;
  height: number;
  still: number;
  rooted: number;
  home: number | null;
  goal: number | null;
  aside?: number;
  /** On its way in from an edge, or out through one: the only walks that may leave the floor. */
  door: 'in' | 'out' | null;
}

export interface World {
  atlas: Pick<LifeAtlas, 'clips'>;
  width: number;
  lanes: number;
  spots: Spot[];
  busyMax: number;
  /** Middles nearer than this, in any lanes, are one Moru in front of another. */
  sep: number;
  /** Short things on the spot allowed beyond `busyMax` for one that has stood long. */
  extra: number;
  /**
   * Resting between the screen's turns: nothing new starts, a walk stops at the end of its stride and
   * the Moru stands, and only a blink the screen asks for (`breathe`) moves the floor.
   */
  calm: boolean;
  /** A resting floor is asked for one blink: the first Moru standing free plays it. */
  breathe: boolean;
  /** A Moru standing (or napping) with its centre at `at`, `depth` lanes from the back, covers no fixture. */
  standsClear: (at: number, depth: number, napping: boolean) => boolean;
  rand: Random;
  now: number;
  sinceDecide: number;
  morus: Moru[];
  lastReply: string | null;
  log: { t: number; id: string; state: string; waited: number }[];
  stats: { actions: Record<string, number>; declines: number; missed: number; interactions: number; pranks: number; swaps: number; eventLatency: number[]; entered: number; left: number };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A seeded random source, for tests and measurements: the same seed draws the same floor. */
export function seeded(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `busyMax` is how many Moru may be doing something at once; the rest stand, and the one that has stood longest goes next. */
export function createWorld({ atlas, width, rand, lanes = 3, spots = [], busyMax = Infinity, sep = SEP, extra = 2, standsClear = () => true }: {
  atlas: Pick<LifeAtlas, 'clips'>; width: number; rand: Random; lanes?: number; spots?: Spot[]; busyMax?: number; sep?: number; extra?: number;
  standsClear?: World['standsClear'];
}): World {
  return {
    atlas, width, lanes, spots, busyMax, sep, extra, calm: false, breathe: false, standsClear, rand, now: 0, sinceDecide: 0, morus: [], lastReply: null, log: [],
    stats: { actions: {}, declines: 0, missed: 0, interactions: 0, pranks: 0, swaps: 0, eventLatency: [], entered: 0, left: 0 },
  };
}

export function addMoru(world: World, { id, x, lane = 0, palette = 'original', wear = {}, room = false }: {
  id: string; x: number; lane?: number; palette?: string; wear?: Partial<Wear>; room?: boolean;
}): Moru {
  // A room's Moru is the one the room is read by, so it lives in the front lane: whoever walks past it passes behind.
  if (room) lane = world.lanes - 1;
  const r = world.rand;
  const m: Moru = {
    id, x, lane, depth: lane, facing: r() < 0.5 ? 1 : -1, palette, wear: { head: null, body: null, accessory: null, ...wear }, room,
    mood: { curiosity: r(), energy: 0.5 + r() * 0.5, sociability: 0.4 + r() * 0.6 }, clip: 'rest', frame: 0, i: 0, t: 0, cur: {}, plan: [], memory: [], pairs: [],
    think: 300 + r() * 2500, idleIn: 400 + r() * 1500, hold: 0, waiting: null, event: null, claimed: 0, hail: 0, steps: 0, height: 0, still: 0, rooted: 0,
    home: null, goal: null, changed: true, door: null,
  };
  world.morus.push(m);
  return m;
}

/** Where the body's centre stands at rest. The cell is mirrored about x = 68 when the Moru faces left. */
const stand = (m: Moru, dir: number = m.facing) => m.x + (dir > 0 ? 74 : 62);
export const centre = (m: Moru) => stand(m);
/** The middle of the silhouette, tail included: `centre` is 11px toward the way it faces from the middle of its body. */
const body = (at: number, facing: number) => at - 11 * facing;
export const middle = (m: Moru) => body(centre(m), m.facing);
const quiet = (m: Moru) => !m.plan.length && !m.waiting && !m.event && !m.claimed && !m.hold;
const free = (m: Moru) => m.clip === 'rest' && quiet(m) && !m.door;
const idle = (m: Moru) => quiet(m) && IDLE.has(m.clip) && !m.height && !m.door;
/** Standing: on its spot with nothing planned (a nap counts; a walk past does not). */
export const standing = (m: Moru) => !m.plan.length && !m.waiting && (IDLE.has(m.clip) || m.clip === 'nap' || m.clip === 'yawn') && !m.height;
/** Staying where it is: standing, or doing something on the spot with no walk still to come. */
const staying = (o: Moru) => standing(o) || (!o.height && !['step', 'turn'].includes(o.clip) && !TRAVEL.has(o.clip) && !o.plan.some(i => i.go || (i.clip && TRAVEL.has(i.clip))));
/** A floor too full for everyone to stand clear. */
const packed = (world: World) => world.morus.length * world.sep > world.width - 140;
const clearSpot = (world: World, m: Moru, at: number, facing: number, but: Moru | null = null) =>
  world.morus.every(o => o === m || o === but || (packed(world) && !o.room && !m.room) || Math.abs(middle(o) - body(at, facing)) >= world.sep + (o.room || m.room ? 6 : 0));
/** Another Moru standing in front of or behind this one, in a different lane. */
export const coveredBy = (world: World, m: Moru) =>
  world.morus.find(o => o !== m && staying(o) && Math.abs(middle(o) - middle(m)) < world.sep
    // A floor that keeps its Moru further apart than a body (the lobby) also parts two in one lane.
    && (Math.abs(o.depth - m.depth) >= 0.5 || (world.sep > SEP && o.pairs[0] !== m.id && m.pairs[0] !== o.id)));
const remember = (list: string[], what: string, keep: number) => { list.unshift(what); list.length = Math.min(list.length, keep); };
const fits = (world: World, m: Moru, clip: string) => !m.room || world.atlas.clips[clip].maxWaitMs <= QUICK_MS;
/** A room's Moru only plays what a real event can cut short in time; anything longer becomes a glance. */
const soft = (world: World, m: Moru, clip: string) => (fits(world, m, clip) ? clip : 'look-back');
const clear = (world: World, m: Moru, lane: number, at: number, room = GAP, but: Moru | null = null) =>
  world.morus.every(o => o === m || (Math.abs(o.depth - lane) >= 0.9 && o.cur.laneTo !== lane) || Math.abs(centre(o) - at) >= (o === but ? REACH - 12 : room));
const roomToTurn = (world: World, m: Moru, but?: Moru) =>
  world.morus.every(o => o === m || o === but || Math.abs(o.depth - m.lane) >= 0.9 || (centre(o) - centre(m)) * -m.facing <= 0 || (centre(o) - centre(m)) * -m.facing >= GAP);
const roomAhead = (world: World, m: Moru, dir: number, far: number) =>
  centre(m) + dir * far > 60 && centre(m) + dir * far < world.width - 60
  && world.morus.every(o => o === m || Math.abs(o.depth - m.lane) >= 0.9 || (centre(o) - centre(m)) * dir <= 0 || (centre(o) - centre(m)) * dir >= GAP + far);
/** Nobody stands, or is headed, anywhere between `from` and 80px past `at`, in any lane. */
const openWay = (world: World, m: Moru, from: number, at: number, but: Moru | null = null) =>
  world.morus.every(o => o === m || o === but || [centre(o), o.goal ?? centre(o)].every(x => {
    const ahead = (x - from) * Math.sign(at - from);
    return ahead <= 0 || ahead > Math.abs(at - from) + 80;
  }));

/** A real event for this Moru's room. It cuts in at the next pose close to the neutral and holds the Moru out of play. */
export function raise(world: World, id: string, state: string, holdMs = 4000) {
  const m = world.morus.find(o => o.id === id);
  if (m) m.event = { state, at: world.now, holdMs };
}

function play(world: World, m: Moru, clip: string, cur: Current = {}) {
  m.clip = clip; m.i = 0; m.frame = cur.reverse ? world.atlas.clips[clip].n - 1 : 0; m.t = 0; m.cur = cur; m.changed = true;
  world.stats.actions[clip] = (world.stats.actions[clip] ?? 0) + 1;
}
function rest(m: Moru) { m.clip = 'rest'; m.i = 0; m.frame = 0; m.t = 0; m.cur = {}; m.changed = true; }
/** On a resting floor a walk ends with the stride under way; a walk through a doorway still finishes. */
/** At the spot it uses a fixture from, facing the way the spot asks: drawn on the fixture, not off its end. */
const atSpot = (world: World, at: number, lane: number, facing: number | null) =>
  world.spots.some(s => Math.abs(s.x - at) <= 2 && Math.abs(s.lane - lane) < 0.1 && (facing === null || facing === s.dir));
/** A Moru may stop here: clear of every fixture, or on one at the spot it uses it from, where it is drawn on it. */
export const mayStop = (world: World, at: number, lane: number, napping = false) => world.standsClear(at, lane, napping) || atSpot(world, at, lane, null);
/** Where a Moru stands now is a place it may stay: one turned on a fixture hangs off it and walks on. */
const mayStay = (world: World, m: Moru) => world.standsClear(centre(m), m.lane, false) || atSpot(world, centre(m), m.lane, m.facing);
/** One at a spot is busy with its fixture: nobody walks up to it, so it never turns there to greet them. */
const onASpot = (world: World, m: Moru) => atSpot(world, centre(m), m.lane, null);
/** Resting between turns, a walk stops at the end of its stride, unless that would leave it standing on a fixture. */
const stopWalking = (world: World, m: Moru) => { if (world.calm && !m.door && m.plan[0]?.go && mayStay(world, m)) drop(m); };
const drop = (m: Moru) => { m.plan = []; m.steps = 0; };

/** One small thing on the spot for a Moru standing free: a blink, a glance or a sway. Returns whether it started. */
export function fidget(world: World, m: Moru, clip: string): boolean {
  if (m.clip !== 'rest' || m.door || m.plan.length || m.waiting || m.hold || !world.atlas.clips[clip]) return false;
  play(world, m, clip);
  return true;
}

/** Set while a Moru left on a fixture chooses where to walk off to, so a walk blocked at once does not choose again. */
let walkingOff = false;
/**
 * Nobody comes to rest on a fixture: one that stopped there steps into the nearest lane where it stands clear, or
 * else walks on to the nearest clear place.
 */
function walkOff(world: World, m: Moru) {
  if (walkingOff || m.door || mayStay(world, m)) return;
  walkingOff = true;
  try {
    const here = centre(m);
    const lane = Array.from({ length: world.lanes }, (_, L) => L).filter(L => L !== m.lane && mayStop(world, here, L) && clear(world, m, L, here))
      .sort((a, b) => Math.abs(a - m.lane) - Math.abs(b - m.lane))[0];
    if (lane === undefined) { decide(world, m, 'wander'); return; }
    m.goal = here;
    m.plan = [{ go: () => here, lane: () => lane }];
    next(world, m);
  } finally { walkingOff = false; }
}

/** Starts the next thing in the plan. Walking is planned one stride at a time, so a moving target is followed and neighbours are respected. */
function next(world: World, m: Moru): void {
  // A walk that ends short of its place on a fixture leaves out what was to be done there.
  const stranded = () => { if (!m.door && !m.plan[0]?.go && !mayStay(world, m)) m.plan = []; };
  for (;;) {
    const item = m.plan[0];
    if (!item) { rest(m); m.think = 300 + world.rand() * 1400; m.steps = 0; walkOff(world, m); return; }
    if (item.go) {
      const lane = item.lane?.() ?? m.lane, d = item.go() - centre(m), dir = d >= 0 ? 1 : -1;
      item.left = (item.left ?? 40) - 1;
      // The one walked up to waits only once the walker is close: a far walker does not freeze it.
      if (item.toward && quiet(item.toward) && Math.abs(centre(item.toward) - centre(m)) < 130) item.toward.hail = 1500;
      // The one walked up to may have moved on: if the place beside it is now in front of somebody, the walk turns into a walk to the nearest free place.
      if (item.toward && (!clearSpot(world, m, item.go(), Math.sign(centre(item.toward) - item.go()) || m.facing, item.toward) || !mayStop(world, item.go(), lane))) {
        m.plan = []; m.steps = 0; world.stats.missed++;
        if ((clearSpot(world, m, centre(m), m.facing) && mayStay(world, m)) || !decide(world, m, 'wander')) continue;
        return;
      }
      const near = Math.abs(d) < 2, wrongWay = !near && dir !== m.facing;
      if ((near && lane === m.lane) || item.left < 0) { m.plan.shift(); m.steps = 0; if (!near) stranded(); continue; }
      // Turning carries the body 12px the new way: never into a neighbour, and never past the target.
      if (wrongWay && Math.abs(d) >= 12) {
        m.steps = 0;
        if (!roomToTurn(world, m, item.toward)) { m.plan = item.blocked ?? []; stranded(); continue; }
        play(world, m, 'turn');
        return;
      }
      // Ease in: the first strides are short. Arrive: the last stride is what is left. Never closer than GAP to a neighbour in the lane.
      let stride = near || wrongWay ? 0 : Math.min(STRIDE, Math.abs(d), m.steps === 0 ? 9 : m.steps === 1 ? 13 : STRIDE);
      for (const o of world.morus) if (o !== m && (Math.abs(o.depth - m.lane) < 0.9 || o === item.toward)) {
        const ahead = (centre(o) - centre(m)) * m.facing;
        if (ahead > 0) stride = Math.min(stride, Math.max(0, ahead - (o === item.toward ? REACH - 12 : GAP)));
      }
      // Nor does it walk past anybody, whatever the lane: it stops a body's width short (by the silhouettes' middles), a stride more
      // for one walking its way. A floor too full to stand clear lets them pass.
      if (!packed(world)) for (const o of world.morus) if (o !== m && o !== item.toward) {
        const ahead = (middle(o) - middle(m)) * m.facing;
        if (ahead >= 60) stride = Math.min(stride, Math.max(0, ahead - world.sep - (o.clip === 'step' && o.facing !== m.facing ? STRIDE : 0)));
      }
      // Only a Moru coming in or going out walks past the floor's edge.
      if (!m.door && (centre(m) + m.facing * stride < 50 || centre(m) + m.facing * stride > world.width - 50)) stride = 0;
      // A lane is changed half a lane to a stride, so the body never moves more than a walking step a pose.
      const laneNext = m.lane + Math.sign(lane - m.lane) * 0.5;
      const laneTo = lane !== m.lane && clear(world, m, laneNext, centre(m) + m.facing * stride, GAP, item.toward) ? laneNext : null;
      if (stride < 2 && laneTo === null) { m.plan = wrongWay && lane === m.lane ? m.plan.slice(1) : item.blocked ?? []; m.steps = 0; stranded(); continue; }
      const into = centre(m) + m.facing * stride;
      const crossing = world.morus.some(o => {
        const c = o !== m && TRAVEL.has(o.clip) ? world.atlas.clips[o.clip] : null;
        if (!c?.travel || Math.abs(o.depth - m.lane) < 0.9) return false;
        const left = (c.travel.at(-1)! - c.travel[o.frame]) * (o.cur.scale ?? 1), a = centre(o), z = a + o.facing * left;
        return into > Math.min(a, z) - 60 && into < Math.max(a, z) + 60 && !(centre(m) > Math.min(a, z) - 60 && centre(m) < Math.max(a, z) + 60);
      });
      if (crossing) { m.steps = 0; rest(m); m.hold = 250; return; }
      m.steps++;
      play(world, m, 'step', { scale: stride / STRIDE, laneFrom: m.lane, laneTo });
      return;
    }
    m.plan.shift();
    if (item.face) { if (item.face() !== m.facing) { play(world, m, 'turn'); return; } continue; }
    if (item.call) { item.call(world, m); continue; }
    if (item.pause) { rest(m); m.hold = item.pause; return; }
    if (item.wait) { rest(m); m.waiting = item.wait; item.wait.ready.add(m); return; }
    play(world, m, soft(world, m, item.clip!), item);
    return;
  }
}

/** A real event cuts in at rest or at any pose within one catalogue step of the neutral; it is looked for before and after every new pose. */
function cutIn(world: World, m: Moru) {
  const clips = world.atlas.clips;
  if (!m.event || !(m.clip === 'rest' || clips[m.clip].f[m.frame].exit) || !Number.isInteger(m.depth) || m.height) return false;
  if (m.cur.laneTo != null) m.lane = m.depth;
  if (m.clip === 'turn' && m.frame === clips.turn.n - 1) m.facing = -m.facing as 1 | -1;
  const e = m.event;
  m.event = null; drop(m); m.hold = 0;
  if (m.waiting) { m.waiting.ready.delete(m); m.waiting.broken = true; m.waiting = null; }
  world.stats.eventLatency.push(world.now - e.at);
  world.log.push({ t: world.now, id: m.id, state: e.state, waited: world.now - e.at });
  m.claimed = e.holdMs;
  play(world, m, STATE_CLIP[e.state] ?? 'laugh', { state: e.state });
  return true;
}

function advance(world: World, m: Moru, dt: number) {
  const clips = world.atlas.clips;
  if (m.hail > 0) m.hail -= dt;
  if (cutIn(world, m)) return;
  if (m.clip === 'rest') {
    if (m.claimed > 0) m.claimed = Math.max(0, m.claimed - dt);
    if (m.waiting) { if (m.waiting.broken) { m.waiting = null; drop(m); } else return; }
    if (m.hold > 0) { m.hold -= dt; if (m.hold <= 0) { m.hold = 0; stopWalking(world, m); next(world, m); } return; }
    stopWalking(world, m);
    if (m.plan.length) { next(world, m); return; }
    m.think -= dt; m.idleIn -= dt;
    // One left standing on a fixture walks off it, turn or not.
    if (!m.door && !mayStay(world, m)) { walkOff(world, m); return; }
    // A resting floor only blinks, once when the screen asks.
    if (world.calm) {
      if (world.breathe && !m.door) { world.breathe = false; play(world, m, 'blink'); }
      return;
    }
    if (m.idleIn <= 0) {
      // Micro-motion: a look toward whoever is passing, else a blink or a small sway.
      m.idleIn = 900 + world.rand() * 2600;
      const passing = world.morus.find(o => o !== m && o.clip === 'step' && Math.abs(centre(o) - centre(m)) < 260);
      // Under an activity budget the idle beat is the cheap one: a blink redraws the eyes only.
      const cheap = world.busyMax < Infinity && world.rand() < 0.85;
      play(world, m, cheap ? 'blink' : passing ? ((centre(passing) - centre(m)) * m.facing > 0 ? 'look-ahead' : 'look-back') : world.rand() < 0.7 ? 'blink' : 'sway');
    }
    return;
  }
  // The shared clock shows at most one new pose per tick; a clip played backwards (climbing down) counts its poses from the end.
  const c = clips[m.clip], back = !!m.cur.reverse, at = back ? c.n - 1 - m.i : m.i;
  m.t += dt;
  if (m.t < c.ms[at]) return;
  m.t = Math.min(m.t - c.ms[at], 40);
  if (m.i === c.n - 1) {
    if (m.clip === 'turn') m.facing = -m.facing as 1 | -1;
    if (m.cur.laneTo != null) { m.lane = m.cur.laneTo; m.depth = m.lane; }
    stopWalking(world, m);
    if (m.plan.length) next(world, m);
    else { rest(m); if (!IDLE.has(m.clip)) m.think = Math.max(m.think, 400 + world.rand() * 1600); walkOff(world, m); }
    return;
  }
  m.i++;
  m.frame = back ? c.n - 1 - m.i : m.i;
  m.changed = true;
  if (c.travel && !back) m.x += m.facing * (c.travel[m.frame] - c.travel[m.frame - 1]) * (m.cur.scale ?? 1);
  if (c.travelY) m.height = c.travelY[m.frame];
  // Half a lane over the whole stride, so the body never moves more than 2px a pose sideways in depth.
  if (m.cur.laneTo != null) m.depth = m.cur.laneFrom! + (m.cur.laneTo - m.cur.laneFrom!) * Math.min(1, m.frame / (c.n - 1));
  if (c.wear && m.frame === c.wear.swapAt && m.cur.swapWith && m.id < m.cur.swapWith.id) {
    const o = m.cur.swapWith, slot = c.wear.slot;
    [m.wear[slot], o.wear[slot]] = [o.wear[slot], m.wear[slot]];
    o.changed = true;
    world.stats.swaps++;
  }
  cutIn(world, m);
}

type Script = (world: World, a: Moru, b: Moru) => [PlanItem[], PlanItem[]];
const SCRIPTS: Record<string, Script> = {
  greet: () => [[{ clip: 'wave' }], [{ pause: 300 }, { clip: 'wave' }]],
  highfive: () => [[{ clip: 'highfive' }], [{ clip: 'highfive' }]],
  ask: (world, _a, b) => {
    // The reply is drawn from a set and never the one given last time. It says nothing about any agent's work.
    const set = ['reply-fish', 'reply-idea', 'shrug'].filter(r => r !== world.lastReply && fits(world, b, r));
    const reply = set[Math.floor(world.rand() * set.length)] ?? 'reply-fish';
    world.lastReply = reply;
    return [[{ clip: 'ask' }, { pause: 1500 }, { clip: reply === 'shrug' ? 'huff' : 'laugh' }], [{ pause: 1300 }, { clip: reply }]];
  },
  swap: (_world, a, b) => [[{ clip: 'swap', swapWith: b }, { clip: 'laugh' }], [{ clip: 'swap', swapWith: a }]],
  nap: () => [[{ clip: 'yawn' }, { clip: 'nap' }], [{ pause: 900 }, { clip: 'yawn' }, { clip: 'nap' }]],
};
const FOLLOW: Record<string, string[]> = { greet: ['ask', 'highfive', 'swap'], highfive: ['swap', 'ask'], ask: ['highfive'], swap: ['highfive'], nap: [] };
const apartBy = (a: Moru, b: Moru) => Math.abs(Math.abs(centre(a) - centre(b)) - REACH);

/** After playing, or being turned down, a Moru standing nearer anybody than a body's room walks off to a clear place. */
const backOff = (world: World, m: Moru) => {
  if (world.morus.some(o => o !== m && Math.abs(middle(o) - middle(m)) < world.sep)) decide(world, m, 'wander');
};
const thenBackOff: PlanItem = { call: (w, m) => { if (!m.plan.length) backOff(w, m); } };

/** A asks B. B agrees only when free and close; otherwise it shrugs and A sulks. */
function propose(world: World, a: Moru, b: Moru, asked: string, tries = 0, chain = 0) {
  let kind = asked;
  const side = Math.sign(centre(a) - centre(b)) || 1;
  const close = a.lane === b.lane && b.depth === b.lane && Math.abs(Math.abs(centre(a) - stand(b, side)) - REACH) <= 8;
  if (!idle(b) || !close) {
    if (close && quiet(b) && tries < 5) a.plan = [{ pause: 400 }, { call: (w, m) => propose(w, m, b, kind, tries + 1, chain) }];
    else { a.plan = [{ clip: 'look-ahead' }, thenBackOff]; world.stats.missed++; b.hail = 0; }
    return;
  }
  if (b.clip !== 'rest') { a.plan = [{ pause: 300 }, { call: (w, m) => propose(w, m, b, kind, tries, chain) }]; return; }
  b.hail = 0;
  if (kind === 'swap' && a.wear.head === b.wear.head) kind = 'highfive';
  const willing = chain ? 0.75 : 0.35 + 0.6 * b.mood.sociability, usable = !b.room || kind === 'ask';
  if (!usable || world.rand() > willing) {
    world.stats.declines++;
    remember(a.pairs, b.id, 2);
    b.plan = [{ face: () => side }, { clip: 'shrug' }];
    a.plan = [{ pause: 1500 }, { clip: 'huff' }, thenBackOff];
    next(world, b);
    return;
  }
  const [sa, sb] = SCRIPTS[kind](world, a, b), token: Token = { ready: new Set(), size: 2 };
  const more = FOLLOW[kind].filter(k => k !== 'swap' || a.wear.head !== b.wear.head);
  const follow = chain < 2 && more.length && !a.room && !b.room && world.rand() < 0.55 ? more[Math.floor(world.rand() * more.length)] : null;
  a.plan = [{ wait: token }, ...sa, ...(follow ? [{ pause: 500 }, { call: (w: World, m: Moru) => propose(w, m, b, follow, 0, chain + 1) }] : [{ pause: 600 }, thenBackOff])];
  b.plan = [{ face: () => side }, { wait: token }, ...sb, ...(follow ? [{ pause: 900 }] : [])];
  for (const [m, o] of [[a, b], [b, a]] as const) { remember(m.pairs, o.id, 2); m.mood.sociability = clamp(m.mood.sociability - 0.25, 0, 1); }
  world.stats.interactions++;
  next(world, b);
}

/** A prank needs no yes, only a victim who is free, close and looking the other way. The prankster laughs and stays. */
function prank(world: World, a: Moru, b: Moru, tries = 0) {
  const set = idle(b) && a.lane === b.lane && apartBy(a, b) <= 8 && (centre(a) - centre(b)) * b.facing < 0;
  if (set && b.clip !== 'rest' && tries < 6) { a.plan = [{ pause: 250 }, { call: (w, m) => prank(w, m, b, tries + 1) }]; return; }
  if (!set || b.clip !== 'rest') { a.plan = [{ clip: 'look-ahead' }, thenBackOff]; world.stats.missed++; return; }
  const back = Math.sign(centre(a) - centre(b)) || 1;
  a.plan = [{ clip: 'boo' }, { clip: 'laugh' }, { pause: 400 }, thenBackOff];
  b.plan = [{ pause: 250 }, { clip: 'startled' }, { face: () => back }, { clip: 'huff' }];
  next(world, b);
  world.stats.pranks++;
  remember(a.pairs, b.id, 2);
  remember(b.pairs, a.id, 2);
}

interface Option { kind: string; w: number; make: () => PlanItem[] }

/** Weighted choice among what is possible now. Memory makes a repeat unlikely. */
function decide(world: World, m: Moru, only: string | null = null): boolean {
  const r = world.rand, { curiosity, energy, sociability } = m.mood, options: Option[] = [], here = centre(m);
  const add = (kind: string, w: number, make: () => PlanItem[]) =>
    options.push({ kind, w: w * (m.memory[0] === kind ? 0.1 : m.memory.includes(kind) ? 0.35 : 1), make });
  // Wander where there is room: ahead for preference, else behind (if there is room to turn), else to the next lane.
  // A crowd thins itself: with more company on one side than the other, the emptier side is the way to wander.
  const beside = (d: number) => world.morus.filter(o => o !== m && (centre(o) - here) * d > 0 && Math.abs(centre(o) - here) < 320).length;
  const crowd = beside(1) - beside(-1);
  const want = crowd > 1 ? -1 : crowd < -1 ? 1 : r() < 0.7 ? m.facing : -m.facing;
  const open = (d: number) => roomAhead(world, m, d, 30) && (d === m.facing || roomToTurn(world, m));
  const dir = open(want) ? want : open(-want) ? -want : 0;
  const crowded = packed(world), side = r() < 0.5 ? -1 : 1;
  const lane = m.room ? m.lane : !dir || r() < 0.3 ? (clamp(m.lane + side, 0, world.lanes - 1) === m.lane ? m.lane - side : m.lane + side) : m.lane;
  const apart = (at: number, but: Moru | null = null, sep = world.sep, facing = Math.sign(at - here) || m.facing) => world.morus.every(o => {
    if (o === m || o === but) return true;
    const mine = body(at, facing), wide = sep + (o.room || m.room ? 6 : 0);
    if (o.goal == null) return Math.abs(middle(o) - mine) >= wide;
    const ends = [middle(o), body(o.goal, Math.sign(o.goal - centre(o)) || o.facing)];
    // A room's Moru on a walk can be called to work at any step of it, so the whole of its way is kept clear.
    return o.room && !crowded ? mine <= Math.min(...ends) - wide || mine >= Math.max(...ends) + wide : ends.every(x => Math.abs(x - mine) >= wide);
  });
  // A lane to walk in: its own if nobody stands on the way, else the nearest lane that is open all the way.
  const wayIn = (at: number, L: number) => world.morus.every(o => o === m || (Math.abs(o.depth - L) >= 0.9 && o.cur.laneTo !== L)
    || (centre(o) - here) * Math.sign(at - here) < 0 || (centre(o) - here) * Math.sign(at - here) > Math.abs(at - here) + GAP);
  const laneFor = (at: number) => [m.lane, ...(m.room ? [] : [m.lane - 1, m.lane + 1, m.lane - 2, m.lane + 2])].find(L => L >= 0 && L < world.lanes && wayIn(at, L) && mayStop(world, at, L));
  const onFixture = !mayStay(world, m);
  const stuck = !apart(here) || m.rooted > 12000 || onFixture;
  let to = here, toLane = m.lane, strict = !crowded;
  const tryAt = (at: number, sep = world.sep) => {
    if (to !== here || at < 70 || at > world.width - 70 || !apart(at, null, sep)) return;
    const L = laneFor(at) ?? (sep < world.sep ? lane : !apart(here) ? m.lane : undefined);
    // Nobody walks past anybody, in any lane: a walk is taken only where nobody stands, or is headed, along the whole way.
    if ((m.room || strict) && !openWay(world, m, here, at)) return;
    // Nor does anyone set off beside one already walking the same way.
    if (!onFixture && world.morus.some(o => o !== m && o.goal != null && Math.sign(o.goal - centre(o)) === Math.sign(at - here) && Math.abs(middle(o) - middle(m)) < world.sep + 40)) return;
    if (L === undefined || (Math.sign(at - here) !== m.facing && !roomToTurn(world, m))) return;
    // It stops only where it stands clear of every fixture.
    if (!mayStop(world, at, L)) return;
    to = at; toLane = L;
  };
  for (let k = 0; k < 8 && dir; k++) tryAt(here + dir * (60 + r() * 150));
  // A floor too full for everyone to stand clear falls back to the nearest place that is at least mostly clear.
  if (stuck) for (const pass of !apart(here) && strict ? [true, false] : [strict]) {
    strict = pass;
    const first = r() < 0.5 ? 1 : -1;
    for (const sep of crowded || onFixture || !apart(here, null, 76) ? [world.sep, 76] : [world.sep])
      // One on a fixture looks from right beside it, so a sidestep off it is found first.
      for (let far = onFixture ? 12 : !apart(here) && !crowded ? 24 : sep < world.sep ? 60 : 110; far <= 700 && to === here; far += far < 110 ? 12 : 30)
        for (const d of [first, -first]) tryAt(here + d * (far + (far < 110 ? 0 : r() * 20)), sep);
  }
  add('wander', (to === here ? 0.05 : 0.5 + curiosity + 0.5 * Math.max(0, beside(1) + beside(-1) - 3)) * (apart(here) && !onFixture ? 1 : 6) * (1 + Math.min(5, m.rooted / 5000)),
    () => { m.goal = to; return [{ go: () => to, lane: () => toLane }]; });
  // The place is spoken for from the moment it is chosen (`goal`), so nobody comes to stand in front of the ladder while it is climbed.
  if (!m.room) for (const spot of world.spots) if (clear(world, m, spot.lane, spot.x, GAP) && apart(spot.x) && (crowded || openWay(world, m, here, spot.x)))
    add(`spot:${spot.clip}`, spot.clip === 'nap' ? 1.3 * (1 - energy) : 0.3 + 0.8 * curiosity, () => {
      m.goal = spot.x;
      // Turning carries the body 12px the new way: one arriving facing away stops 12px short, so its turn ends on the spot.
      return [{ go: () => (m.facing === spot.dir ? spot.x : spot.x - 12 * spot.dir), lane: () => spot.lane, left: 70 }, { face: () => spot.dir }, { clip: spot.clip === 'nap' ? 'yawn' : spot.clip },
        ...(spot.clip === 'nap' ? [{ clip: 'nap' }] : []),
        // Up the ladder, a look round and a wave from the shelf, and down the way it came.
        ...(spot.clip === 'climb' ? [{ clip: 'look-back' }, { clip: 'wave' }, { pause: 900 }, { clip: 'look-ahead' }, { clip: 'climb', reverse: true }] : [])];
    });
  const friends = world.morus.filter(o => o !== m && !o.door && !onASpot(world, o) && (!m.room || o.lane === m.lane) && !o.height && !o.claimed && !o.event
    && !(crowded ? m.pairs.includes(o.id) : m.pairs[0] === o.id) && Math.abs(centre(o) - here) < 420 && quiet(o) && o.still < (crowded ? 4000 : 12000) && !['nap', 'yawn'].includes(o.clip)
    // Only a friend it can walk straight up to, with nobody between or headed between.
    && !(m.room && o.lane !== m.lane) && (!(m.room || !crowded) || openWay(world, m, here, centre(o), o)))
    .sort((p, q) => Math.abs(centre(p) - here) - Math.abs(centre(q) - here)).slice(0, 5);
  if (friends.length) {
    // Every near friend with a free place beside it is a candidate and the weight is shared.
    const share = 1.6 / friends.length;
    const friendLane = (b: Moru) => (m.room ? world.lanes - 1 : b.lane);
    for (const b of friends) {
      const near = here < centre(b) ? -1 : 1;
      const sides = crowded ? [near, -near] : [near];
      const found = sides.find(sd => apart(stand(b, sd) + sd * REACH, b, world.sep, -sd)) ?? (crowded ? sides.find(sd => apart(stand(b, sd) + sd * REACH, b, 76, -sd)) ?? near : undefined);
      if (found === undefined) continue;
      const by = found;
      const behind = centre(b) - b.facing * (REACH + 24);
      // Beside a friend only where it stands clear of the fixtures, and for a nap clear of them lying down too.
      const place = stand(b, by) + by * REACH;
      if (!mayStop(world, place, friendLane(b))) continue;
      const kinds: [string, number][] = m.room || b.room ? [['ask', 1.2]] : [['greet', 1], ['highfive', 1], ['ask', 1.3],
        ...(m.wear.head !== b.wear.head ? [['swap', 1.5] as [string, number]] : []),
        ...(apart(behind, b) && mayStop(world, behind, friendLane(b)) ? [['prank', 0.6 + curiosity] as [string, number]] : []),
        ...(mayStop(world, place, friendLane(b), true) && mayStop(world, centre(b), b.lane, true) ? [['nap', (1 - energy) * 1.2] as [string, number]] : [])];
      for (const [kind, w] of kinds) add(kind, w * share * (0.3 + sociability), () => {
        if (idle(b) && Math.abs(centre(b) - here) < 130) b.hail = 2500;
        m.goal = kind === 'prank' ? behind : stand(b, by) + by * REACH;
        return kind === 'prank'
          ? [{ go: () => centre(b) - b.facing * (REACH + 24), lane: () => friendLane(b), left: 60, toward: b }, { face: () => b.facing }, { clip: 'tiptoe' }, { call: (w2, a) => prank(w2, a, b) }]
          : [{ go: () => stand(b, by) + by * REACH, lane: () => friendLane(b), left: 60, toward: b }, { face: () => -by }, { call: (w2, a) => propose(w2, a, b, kind) }];
      });
    }
  }
  if (!m.room) {
    if (mayStop(world, here, m.lane, true)) add('nap-alone', (1 - energy) * 0.5, () => [{ clip: 'yawn' }, { clip: 'nap' }]);
    for (const move of TRAVEL) {
      const far = world.atlas.clips[move].travel!.at(-1)!;
      const ok = (d: number) => here + d * (far + 60) > 60 && here + d * (far + 60) < world.width - 60 && world.morus.every(o => o === m
        || (crowded && Math.abs(o.depth - m.lane) >= 0.9
          ? ((centre(o) - here) * d < -56 || (centre(o) - here) * d > far + 76) && (o.goal == null || (o.goal - here) * d < -56 || (o.goal - here) * d > far + 76)
          : [centre(o), o.goal ?? centre(o)].every(x => (x - here) * d < (crowded ? 0 : -30) || (x - here) * d > far + GAP + 22)));
      // One travelling move at a time in a neighbourhood: two that set off toward each other in different lanes would cross.
      const alone = world.morus.every(o => o === m || !(TRAVEL.has(o.clip) || o.plan.some(i => i.clip && TRAVEL.has(i.clip))) || Math.abs(centre(o) - here) > 2 * far + 240);
      const fine = (d: number) => ok(d) && mayStop(world, here + d * far, m.lane);
      const d = !alone ? 0 : fine(m.facing) ? m.facing : fine(-m.facing) ? -m.facing : 0;
      if (d) add(move, energy * 0.45, () => { m.goal = here + d * far; return [{ face: () => d }, { clip: move }]; });
    }
  }
  const pool = only ? options.filter(o => o.kind === only).slice(0, 1) : options;
  if (!pool.length || (only === 'wander' && to === here)) return false;
  let pick = r() * pool.reduce((sum, o) => sum + o.w, 0);
  const chosen = pool.find(o => (pick -= o.w) <= 0) ?? pool[0];
  remember(m.memory, chosen.kind, 4);
  m.plan = chosen.make();
  next(world, m);
  return true;
}

/** The edge a Moru comes in at: the left or the right, each only while nobody stands or walks near it in any lane. */
function freeEdge(world: World, prefer: 1 | -1): 1 | -1 | 0 {
  const clearAt = (side: 1 | -1) => {
    const edge = side < 0 ? 0 : world.width;
    return world.morus.every(o => [centre(o), o.goal ?? centre(o)].every(x => Math.abs(x - edge) > 2 * world.sep + 60));
  };
  return clearAt(prefer) ? prefer : clearAt(-prefer as 1 | -1) ? (-prefer as 1 | -1) : 0;
}

/**
 * Brings one Moru in from an edge: it starts out of sight and walks onto the floor to the first clear place,
 * like any other walk (stride by stride, stopping short of anybody). Returns it, or null when both edges are busy.
 */
export function enter(world: World, moru: { id: string; palette?: string; wear?: Partial<Wear> }): Moru | null {
  const side = freeEdge(world, world.rand() < 0.5 ? -1 : 1);
  if (!side) return null;
  const lane = Math.floor(world.rand() * world.lanes);
  const edgeCentre = side < 0 ? -OFFSTAGE : world.width + OFFSTAGE;
  const facing = side < 0 ? 1 : -1;
  const m = addMoru(world, { ...moru, x: edgeCentre - (facing > 0 ? 74 : 62), lane });
  // The first place in from the edge that stands clear of the fixtures; with none, nobody comes in.
  const from = side < 0 ? 100 + world.rand() * 80 : world.width - 100 - world.rand() * 80;
  let goal: number | null = null;
  for (let far = 0; far <= world.width / 2 && goal === null; far += 8) {
    const at = from - side * far;
    if (at > 70 && at < world.width - 70 && mayStop(world, at, lane)) goal = at;
  }
  if (goal === null) { world.morus.pop(); return null; }
  m.facing = facing;
  m.door = 'in';
  m.goal = goal;
  const stop = goal, inside = { call: (_w: World, it: Moru) => { it.door = null; } };
  // Stopped short by somebody, it is in all the same and finds its own place.
  m.plan = [{ go: () => stop, left: 80, blocked: [inside] }, inside];
  world.stats.entered++;
  next(world, m);
  return m;
}

/**
 * Sends one free Moru out through the nearer edge it can reach without walking past anybody. Returns whether one left;
 * it is taken off the floor once its whole body is out of sight.
 */
export function leave(world: World): boolean {
  const candidates = world.morus.filter(m => free(m) && !m.room && m.depth === m.lane)
    .map(m => ({ m, side: (centre(m) < world.width / 2 ? -1 : 1) as 1 | -1 }))
    .filter(({ m, side }) => openWay(world, m, centre(m), side < 0 ? -OFFSTAGE : world.width + OFFSTAGE))
    .sort((a, b) => Math.min(centre(a.m), world.width - centre(a.m)) - Math.min(centre(b.m), world.width - centre(b.m)));
  const pick = candidates[0];
  if (!pick) return false;
  const { m, side } = pick, out = side < 0 ? -OFFSTAGE : world.width + OFFSTAGE;
  m.door = 'out';
  m.goal = out;
  m.plan = [{ go: () => out, left: 120 }];
  next(world, m);
  return true;
}

/** Who is on the floor: off-floor walkers that finished going out are taken away. */
function sweep(world: World) {
  for (const m of [...world.morus]) if (m.door === 'out' && !m.plan.length && (centre(m) < -OFFSTAGE / 2 || centre(m) > world.width + OFFSTAGE / 2)) {
    world.morus.splice(world.morus.indexOf(m), 1);
    world.stats.left++;
  }
  // A walk out that stopped short (somebody stepped into the way) becomes an ordinary Moru on the floor again.
  for (const m of world.morus) if (m.door === 'out' && !m.plan.length && centre(m) >= 0 && centre(m) <= world.width) m.door = null;
}

/** One shared tick. `dt` in ms. Moods drift, clips advance, and free Moru decide at most ten times a second. */
export function tick(world: World, dt: number) {
  world.now += dt;
  world.sinceDecide += dt;
  for (const m of world.morus) {
    const busy = !IDLE.has(m.clip), s = dt / 1000;
    m.mood.energy = clamp(m.mood.energy + (m.clip === 'nap' ? 0.09 : busy ? -0.02 : 0.003) * s, 0, 1);
    m.mood.sociability = clamp(m.mood.sociability + 0.04 * s, 0, 1);
    m.mood.curiosity = clamp(m.mood.curiosity + (world.rand() - 0.5) * 0.12 * s, 0, 1);
    advance(world, m, dt);
  }
  // Two who agreed start together, each from the neutral pose.
  for (const m of world.morus) if (m.waiting && m.waiting.ready.size === m.waiting.size) {
    const token = m.waiting;
    for (const o of [...token.ready]) { o.waiting = null; next(world, o); }
    token.ready.clear();
  }
  sweep(world);
  for (const m of world.morus) {
    m.still = IDLE.has(m.clip) && !m.plan.length ? m.still + dt : 0;
    if (!m.plan.length) m.goal = null;
    // Rooted: how long since it last left its spot (60px or more). A wave on the spot does not reset it; a walk does.
    if (m.home === null || Math.abs(centre(m) - m.home) > 60) { m.home = centre(m); m.rooted = 0; } else m.rooted += dt;
  }
  // A resting floor decides nothing new, not even a step aside.
  if (world.sinceDecide >= 100 && !world.calm) {
    world.sinceDecide = 0;
    let doing = world.morus.filter(o => !IDLE.has(o.clip) || o.plan.length || o.waiting).length;
    // One that stands in front of another steps aside before anything else: the one without a room for preference.
    for (const m of [...world.morus].sort((a, b) => Number(a.room) - Number(b.room))) if (free(m) && (m.aside ?? 0) <= world.now) {
      const o = coveredBy(world, m);
      if (o && (o.room || m.room || (m.hail <= 0 && doing < world.busyMax + world.extra)) && !(m.room && free(o) && !o.room && (o.aside ?? 0) <= world.now)) {
        if (decide(world, m, 'wander')) { doing++; m.aside = world.now + 1500; } else m.aside = world.now + 375;
      }
    }
    // Then the one longest on its spot, then the longest still; after eight seconds of standing a Moru no longer waits to think.
    for (const m of [...world.morus].sort((a, b) => (b.still + b.rooted / 2) - (a.still + a.rooted / 2))) if (free(m) && m.hail <= 0) {
      if (doing < world.busyMax && (m.think <= 0 || m.still > 8000)) { if (decide(world, m, m.rooted > 25000 ? 'wander' : null) || decide(world, m)) doing++; }
      // No room in the budget, and it has stood eight seconds: a short thing on the spot, so nobody is a statue.
      else if (m.still > 8000 && !m.room && doing < world.busyMax + world.extra) {
        doing++;
        const tired = m.mood.energy < 0.4, pick = world.rand();
        const roomy = world.morus.every(o => o === m || (Math.abs(middle(o) - middle(m)) > world.sep + 30 && (Math.abs(centre(o) - centre(m)) > 130 || Math.abs(o.depth - m.lane) >= 0.9)));
        m.plan = pick < 0.4 && roomy ? [{ face: () => -m.facing }] : [{ clip: tired ? 'yawn' : pick < 0.7 ? 'wave' : 'laugh' }];
        next(world, m);
      }
    }
  }
}
