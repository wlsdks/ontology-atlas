// Moru life: what each Moru does next. Pure: no DOM, no timers, no clock and no randomness of its own.
// The host calls tick(world, dtMs) from one shared timer and draws what it finds in world.morus.
/**
 * @typedef {{ curiosity: number, energy: number, sociability: number }} Mood  each 0..1, drifting
 * @typedef {{ head: string|null, body: string|null, accessory: string|null }} Wear  one wardrobe piece per slot
 * @typedef {{ id: string, x: number, lane: number, depth: number, facing: 1|-1, palette: string, wear: Wear, room: boolean,
 *   mood: Mood, clip: string, frame: number, changed: boolean }} Moru
 *   `x` is the left edge of the 128px cell, `depth` the lane it stands in (fractional while it changes lane),
 *   `room` marks a Moru that stands for an agent's room and so must always be free for a real event.
 */
export const GAP = 96, REACH = 92, STRIDE = 16, QUICK_MS = 350;
/** A body is 97px wide: two that stand nearer than this, in any lanes, are one in front of the other. */
export const SEP = 100;
// Stand-ins: in the app these are the shipped Work status clips.
const STATE_CLIP = { commit: 'laugh', merge: 'reply-idea', waiting: 'ask', stuck: 'huff' };
const IDLE = new Set(['rest', 'blink', 'sway', 'look-ahead', 'look-back']), TRAVEL = new Set(['roll', 'bound', 'run', 'belly-slide']);
const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** `busyMax` is how many Moru may be doing something at once; the rest stand, and the one that has stood longest goes next. */
export function createWorld({ atlas, width, lanes = 3, seed = 1, spots = [], busyMax = Infinity }) {
  return { atlas, width, lanes, spots, busyMax, rand: rng(seed), now: 0, sinceDecide: 0, morus: [], lastReply: null, log: [],
    stats: { actions: {}, declines: 0, missed: 0, interactions: 0, pranks: 0, swaps: 0, eventLatency: [] } };
}
export function addMoru(world, { id, x, lane = 0, palette = 'original', wear = {}, room = false }) {
  // A room's Moru is the one the room is read by, so it lives in the front lane: whoever walks past it passes behind, and nobody is ever drawn over it.
  if (room) lane = world.lanes - 1;
  const r = world.rand, m = { id, x, lane, depth: lane, facing: r() < 0.5 ? 1 : -1, palette, wear: { head: null, body: null, accessory: null, ...wear }, room,
    mood: { curiosity: r(), energy: 0.5 + r() * 0.5, sociability: 0.4 + r() * 0.6 }, clip: 'rest', frame: 0, i: 0, t: 0, cur: {}, plan: [], memory: [], pairs: [],
    think: 300 + r() * 2500, idleIn: 400 + r() * 1500, hold: 0, waiting: null, event: null, claimed: 0, hail: 0, steps: 0, height: 0, still: 0, rooted: 0, home: null, goal: null, changed: true };
  world.morus.push(m); return m;
}
/** Where the body's centre stands at rest. The cell is mirrored about x = 68 when the Moru faces left. */
const stand = (m, dir = m.facing) => m.x + (dir > 0 ? 74 : 62);
export const centre = m => stand(m);
/** The middle of the silhouette, tail included: `centre` is where a Moru stands, 11px toward the way it faces from the middle of its body. */
const body = (at, facing) => at - 11 * facing, middle = m => body(centre(m), m.facing);
const quiet = m => !m.plan.length && !m.waiting && !m.event && !m.claimed && !m.hold;
const free = m => m.clip === 'rest' && quiet(m);
const idle = m => quiet(m) && IDLE.has(m.clip) && !m.height;
/** Standing: on its spot with nothing planned (a nap counts; a walk past does not). */
const standing = m => !m.plan.length && !m.waiting && (IDLE.has(m.clip) || m.clip === 'nap' || m.clip === 'yawn') && !m.height;
/** Another Moru standing in front of or behind this one, in a different lane. */
/** Staying where it is: standing, or doing something on the spot (talking, working, napping) with no walk still to come. */
const staying = o => standing(o) || (!o.height && !['step', 'turn'].includes(o.clip) && !TRAVEL.has(o.clip) && !o.plan.some(i => i.go || TRAVEL.has(i.clip)));
/** Nobody's body, in any lane, would overlap one standing at `at` facing `facing` (a room's Moru is given 6px more).
 * A floor too full for everyone to stand clear (`packed`: twenty in one strip) keeps only the room's Moru clear. */
const packed = world => world.morus.length * SEP > world.width - 140;
const clearSpot = (world, m, at, facing, but = null) => world.morus.every(o => o === m || o === but || (packed(world) && !o.room && !m.room) || Math.abs(middle(o) - body(at, facing)) >= SEP + (o.room || m.room ? 6 : 0));
export const coveredBy = (world, m) => world.morus.find(o => o !== m && staying(o) && Math.abs(o.depth - m.depth) >= 0.5 && Math.abs(middle(o) - middle(m)) < SEP);
const remember = (list, what, keep) => { list.unshift(what); list.length = Math.min(list.length, keep); };
const fits = (world, m, clip) => !m.room || world.atlas.clips[clip].maxWaitMs <= QUICK_MS;
/** A room's Moru only plays what a real event can cut short in time; anything longer becomes a glance. */
const soft = (world, m, clip) => fits(world, m, clip) ? clip : 'look-back';
const clear = (world, m, lane, at, room = GAP, but = null) => world.morus.every(o => o === m || (Math.abs(o.depth - lane) >= 0.9 && o.cur.laneTo !== lane) || Math.abs(centre(o) - at) >= (o === but ? REACH - 12 : room));

const roomToTurn = (world, m, but) => world.morus.every(o => o === m || o === but || Math.abs(o.depth - m.lane) >= 0.9 || (centre(o) - centre(m)) * -m.facing <= 0 || (centre(o) - centre(m)) * -m.facing >= GAP);
const roomAhead = (world, m, dir, far) => centre(m) + dir * far > 60 && centre(m) + dir * far < world.width - 60 && world.morus.every(o => o === m || Math.abs(o.depth - m.lane) >= 0.9 || (centre(o) - centre(m)) * dir <= 0 || (centre(o) - centre(m)) * dir >= GAP + far);

/** A real event for this Moru's room. It cuts in at the next pose close to the neutral and holds the Moru out of play. */
export function raise(world, id, state, holdMs = 4000) { const m = world.morus.find(m => m.id === id); if (m) m.event = { state, at: world.now, holdMs }; }

function play(world, m, clip, cur = {}) { m.clip = clip; m.i = 0; m.frame = cur.reverse ? world.atlas.clips[clip].n - 1 : 0; m.t = 0; m.cur = cur; m.changed = true; world.stats.actions[clip] = (world.stats.actions[clip] ?? 0) + 1; }
function rest(m) { m.clip = 'rest'; m.i = 0; m.frame = 0; m.t = 0; m.cur = {}; m.changed = true; }
const drop = m => { m.plan = []; m.steps = 0; };

/** Starts the next thing in the plan. Walking is planned one stride at a time, so a moving target is followed and neighbours are respected. */
function next(world, m) {
  for (;;) {
    const item = m.plan[0];
    if (!item) { rest(m); m.think = 300 + world.rand() * 1400; m.steps = 0; return; }
    if (item.go) {
      const lane = item.lane?.() ?? m.lane, d = item.go() - centre(m), dir = d >= 0 ? 1 : -1; item.left = (item.left ?? 40) - 1;
      // Whoever is being walked up to notices and stays put while the walker is on the way.
      // The one walked up to waits only once the walker is close: a far walker does not freeze it.
      if (item.toward && quiet(item.toward) && Math.abs(centre(item.toward) - centre(m)) < 130) item.toward.hail = 1500;
      // The one walked up to may have moved on: if the place beside it is now in front of somebody, the walk is not ended there.
      // Nor is it dropped on the spot, which may itself be in front of somebody: it turns into a walk to the nearest free place.
      if (item.toward && !clearSpot(world, m, item.go(), Math.sign(centre(item.toward) - item.go()) || m.facing, item.toward)) { m.plan = []; m.steps = 0; world.stats.missed++; if (clearSpot(world, m, centre(m), m.facing) || !decide(world, m, 'wander')) continue; return; }
      const near = Math.abs(d) < 2, wrongWay = !near && dir !== m.facing;
      if ((near && lane === m.lane) || item.left < 0) { m.plan.shift(); m.steps = 0; continue; }
      // Turning carries the body 12px the new way: never into a neighbour, and never past the target.
      if (wrongWay && Math.abs(d) >= 12) { m.steps = 0; if (!roomToTurn(world, m, item.toward)) { m.plan = item.blocked ?? []; continue; } play(world, m, 'turn'); return; }
      // Ease in: the first strides are short. Arrive: the last stride is what is left. Separation: never closer than GAP to a neighbour in the lane.
      let stride = near || wrongWay ? 0 : Math.min(STRIDE, Math.abs(d), m.steps === 0 ? 9 : m.steps === 1 ? 13 : STRIDE);
      for (const o of world.morus) if (o !== m && (Math.abs(o.depth - m.lane) < 0.9 || o === item.toward)) { const ahead = (centre(o) - centre(m)) * m.facing; if (ahead > 0) stride = Math.min(stride, Math.max(0, ahead - (o === item.toward ? REACH - 12 : GAP))); }
      // Nor does it walk past anybody, whatever the lane, which would draw one body over the other for seconds: it stops a body's width short (by the
      // silhouettes' middles), a stride more for one walking its way, and the walk ends there. One it stands deep inside it walks on from, and a floor
      // too full to stand clear lets them pass.
      if (!packed(world)) for (const o of world.morus) if (o !== m && o !== item.toward) { const ahead = (middle(o) - middle(m)) * m.facing; if (ahead >= 60) stride = Math.min(stride, Math.max(0, ahead - SEP - (o.clip === 'step' && o.facing !== m.facing ? STRIDE : 0))); }
      if (centre(m) + m.facing * stride < 50 || centre(m) + m.facing * stride > world.width - 50) stride = 0;
      // A lane is changed half a lane to a stride, so the body never moves more than a walking step a pose.
      const laneNext = m.lane + Math.sign(lane - m.lane) * 0.5, laneTo = lane !== m.lane && clear(world, m, laneNext, centre(m) + m.facing * stride, GAP, item.toward) ? laneNext : null;
      if (stride < 2 && laneTo === null) { m.plan = wrongWay && lane === m.lane ? m.plan.slice(1) : item.blocked ?? []; m.steps = 0; continue; }
      const into = centre(m) + m.facing * stride, crossing = world.morus.some(o => { const c = o !== m && TRAVEL.has(o.clip) ? world.atlas.clips[o.clip] : null; if (!c || Math.abs(o.depth - m.lane) < 0.9) return false; const left = (c.travel.at(-1) - c.travel[o.frame]) * (o.cur.scale ?? 1), a = centre(o), z = a + o.facing * left; return into > Math.min(a, z) - 60 && into < Math.max(a, z) + 60 && !(centre(m) > Math.min(a, z) - 60 && centre(m) < Math.max(a, z) + 60); });
      if (crossing) { m.steps = 0; rest(m); m.hold = 250; return; }
      m.steps++; play(world, m, 'step', { scale: stride / STRIDE, laneFrom: m.lane, laneTo }); return;
    }
    m.plan.shift();
    if (item.face) { if (item.face() !== m.facing) { play(world, m, 'turn'); return; } continue; }
    if (item.call) { item.call(world, m); continue; }
    if (item.pause) { rest(m); m.hold = item.pause; return; }
    if (item.wait) { rest(m); m.waiting = item.wait; item.wait.ready.add(m); return; }
    play(world, m, soft(world, m, item.clip), item); return;
  }
}

/** A real event cuts in at rest or at any pose within one catalogue step of the neutral; it is looked for before and after every new pose. */
function cutIn(world, m) {
  const clips = world.atlas.clips;
  if (!m.event || !(m.clip === 'rest' || clips[m.clip].f[m.frame].exit) || !Number.isInteger(m.depth) || m.height) return false;
  if (m.cur.laneTo != null) m.lane = m.depth;
  if (m.clip === 'turn' && m.frame === clips.turn.n - 1) m.facing = -m.facing;
  const e = m.event; m.event = null; drop(m); m.hold = 0;
  if (m.waiting) { m.waiting.ready.delete(m); m.waiting.broken = true; m.waiting = null; }
  world.stats.eventLatency.push(world.now - e.at); world.log.push({ t: world.now, id: m.id, state: e.state, waited: world.now - e.at });
  m.claimed = e.holdMs; play(world, m, STATE_CLIP[e.state] ?? 'laugh', { state: e.state }); return true;
}
function advance(world, m, dt) {
  const clips = world.atlas.clips;
  if (m.hail > 0) m.hail -= dt;
  if (cutIn(world, m)) return;
  if (m.clip === 'rest') {
    if (m.claimed > 0) m.claimed = Math.max(0, m.claimed - dt);
    if (m.waiting) { if (m.waiting.broken) { m.waiting = null; drop(m); } else return; }
    if (m.hold > 0) { m.hold -= dt; if (m.hold <= 0) { m.hold = 0; next(world, m); } return; }
    if (m.plan.length) { next(world, m); return; }
    m.think -= dt; m.idleIn -= dt;
    if (m.idleIn <= 0) {
      // Micro-motion: a look toward whoever is passing, else a blink or a small sway.
      m.idleIn = 900 + world.rand() * 2600;
      const passing = world.morus.find(o => o !== m && o.clip === 'step' && Math.abs(centre(o) - centre(m)) < 260);
      // Under an activity budget the idle beat is the cheap one: a blink redraws the eyes only; a glance or a sway is the exception.
      const cheap = world.busyMax < Infinity && world.rand() < 0.85;
      play(world, m, cheap ? 'blink' : passing ? ((centre(passing) - centre(m)) * m.facing > 0 ? 'look-ahead' : 'look-back') : world.rand() < 0.7 ? 'blink' : 'sway');
    }
    return;
  }
  // The shared clock shows at most one new pose per tick; a clip played backwards (climbing down) counts its poses from the end.
  const c = clips[m.clip], back = !!m.cur.reverse, at = back ? c.n - 1 - m.i : m.i; m.t += dt;
  if (m.t < c.ms[at]) return;
  m.t = Math.min(m.t - c.ms[at], 40);
  if (m.i === c.n - 1) {
    if (m.clip === 'turn') m.facing = -m.facing;
    if (m.cur.laneTo != null) { m.lane = m.cur.laneTo; m.depth = m.lane; }
    if (m.plan.length) next(world, m); else { rest(m); if (!IDLE.has(m.clip)) m.think = Math.max(m.think, 400 + world.rand() * 1600); }
    return;
  }
  m.i++; m.frame = back ? c.n - 1 - m.i : m.i; m.changed = true;
  if (c.travel && !back) m.x += m.facing * (c.travel[m.frame] - c.travel[m.frame - 1]) * (m.cur.scale ?? 1);
  if (c.travelY) m.height = c.travelY[m.frame];
  if (m.cur.laneTo != null) m.depth = m.cur.laneFrom + (m.cur.laneTo - m.cur.laneFrom) * Math.min(1, m.frame / 5);
  if (c.wear && m.frame === c.wear.swapAt && m.cur.swapWith && m.id < m.cur.swapWith.id) { const o = m.cur.swapWith, w = c.wear.slot; [m.wear[w], o.wear[w]] = [o.wear[w], m.wear[w]]; o.changed = true; world.stats.swaps++; }
  cutIn(world, m);
}

const SCRIPTS = {
  greet: () => [[{ clip: 'wave' }], [{ pause: 300 }, { clip: 'wave' }]],
  highfive: () => [[{ clip: 'highfive' }], [{ clip: 'highfive' }]],
  ask: (world, a, b) => {
    // The reply is drawn from a set and never the one given last time. It says nothing about any agent's work.
    const set = ['reply-fish', 'reply-idea', 'shrug'].filter(r => r !== world.lastReply && fits(world, b, r)), reply = set[Math.floor(world.rand() * set.length)] ?? 'reply-fish'; world.lastReply = reply;
    return [[{ clip: 'ask' }, { pause: 1500 }, { clip: reply === 'shrug' ? 'huff' : 'laugh' }], [{ pause: 1300 }, { clip: reply }]];
  },
  swap: (world, a, b) => [[{ clip: 'swap', swapWith: b }, { clip: 'laugh' }], [{ clip: 'swap', swapWith: a }]],
  nap: () => [[{ clip: 'yawn' }, { clip: 'nap' }], [{ pause: 900 }, { clip: 'yawn' }, { clip: 'nap' }]],
};
const FOLLOW = { greet: ['ask', 'highfive', 'swap'], highfive: ['swap', 'ask'], ask: ['highfive'], swap: ['highfive'], nap: [] };
const apart = (a, b) => Math.abs(Math.abs(centre(a) - centre(b)) - REACH);

/** A asks B. B agrees only when free and close; otherwise it shrugs (a beat of its own) and A sulks. */
function propose(world, a, b, kind, tries = 0, chain = 0) {
  const side = Math.sign(centre(a) - centre(b)) || 1, close = a.lane === b.lane && b.depth === b.lane && Math.abs(Math.abs(centre(a) - stand(b, side)) - REACH) <= 8;
  if (!idle(b) || !close) { if (close && quiet(b) && tries < 5) a.plan = [{ pause: 400 }, { call: (w, m) => propose(w, m, b, kind, tries + 1, chain) }]; else { a.plan = [{ clip: 'look-ahead' }]; world.stats.missed++; b.hail = 0; } return; }
  if (b.clip !== 'rest') { a.plan = [{ pause: 300 }, { call: (w, m) => propose(w, m, b, kind, tries, chain) }]; return; }
  b.hail = 0;
  if (kind === 'swap' && a.wear.head === b.wear.head) kind = 'highfive';
  const willing = chain ? 0.75 : 0.35 + 0.6 * b.mood.sociability, usable = !b.room || kind === 'ask';
  if (!usable || world.rand() > willing) {
    world.stats.declines++; remember(a.pairs, b.id, 2);
    b.plan = [{ face: () => side }, { clip: 'shrug' }]; a.plan = [{ pause: 1500 }, { clip: 'huff' }]; next(world, b); return;
  }
  const [sa, sb] = SCRIPTS[kind](world, a, b), token = { ready: new Set(), size: 2 }, more = FOLLOW[kind].filter(k => k !== 'swap' || a.wear.head !== b.wear.head);
  const follow = chain < 2 && more.length && !a.room && !b.room && world.rand() < 0.55 ? more[Math.floor(world.rand() * more.length)] : null;
  a.plan = [{ wait: token }, ...sa, ...(follow ? [{ pause: 500 }, { call: (w, m) => propose(w, m, b, follow, 0, chain + 1) }] : [])];
  b.plan = [{ face: () => side }, { wait: token }, ...sb, ...(follow ? [{ pause: 900 }] : [])];
  for (const [m, o] of [[a, b], [b, a]]) { remember(m.pairs, o.id, 2); m.mood.sociability = clamp(m.mood.sociability - 0.25, 0, 1); }
  world.stats.interactions++; next(world, b);
}
/** A prank needs no yes, only a victim who is free, close and looking the other way. */
function prank(world, a, b, tries = 0) {
  const set = idle(b) && a.lane === b.lane && apart(a, b) <= 8 && (centre(a) - centre(b)) * b.facing < 0;
  if (set && b.clip !== 'rest' && tries < 6) { a.plan = [{ pause: 250 }, { call: (w, m) => prank(w, m, b, tries + 1) }]; return; }
  if (!set || b.clip !== 'rest') { a.plan = [{ clip: 'look-ahead' }]; world.stats.missed++; return; }
  const away = -a.facing, back = Math.sign(centre(a) - centre(b)) || 1, far = world.atlas.clips.run.travel.at(-1),
    // It runs off only where the run ends clear of everybody, in any lane (on a packed floor, of its own lane).
    room = clear(world, a, a.lane, centre(a) + away * 60, 70) && centre(a) + away * 110 > 60 && centre(a) + away * 110 < world.width - 60 && (packed(world) || world.morus.every(o => o === a || o === b || [centre(o), o.goal ?? centre(o)].every(x => (x - centre(a)) * away < 0 || (x - centre(a)) * away > far + GAP + 22)));
  a.plan = [{ clip: 'boo' }, { clip: 'laugh' }, ...(room ? [{ face: () => away }, { clip: 'run' }] : [])];
  b.plan = [{ pause: 250 }, { clip: 'startled' }, { face: () => back }, { clip: 'huff' }]; next(world, b);
  world.stats.pranks++; remember(a.pairs, b.id, 2); remember(b.pairs, a.id, 2);
}

/** Weighted choice among what is possible now. Memory makes a repeat unlikely. */
function decide(world, m, only = null) {
  const r = world.rand, { curiosity, energy, sociability } = m.mood, options = [], here = centre(m);
  const add = (kind, w, make) => options.push({ kind, w: w * (m.memory[0] === kind ? 0.1 : m.memory.includes(kind) ? 0.35 : 1), make });
  // Wander where there is room: ahead for preference, else behind (if there is room to turn), else to the next lane.
  // A crowd thins itself: with more company on one side than the other, the emptier side is the way to wander.
  const beside = d => world.morus.filter(o => o !== m && (centre(o) - here) * d > 0 && Math.abs(centre(o) - here) < 320).length, crowd = beside(1) - beside(-1);
  const want = crowd > 1 ? -1 : crowd < -1 ? 1 : r() < 0.7 ? m.facing : -m.facing, open = d => roomAhead(world, m, d, 30) && (d === m.facing || roomToTurn(world, m)), dir = open(want) ? want : open(-want) ? -want : 0;
  const crowded = packed(world), side = r() < 0.5 ? -1 : 1, lane = m.room ? m.lane : !dir || r() < 0.3 ? clamp(m.lane + side, 0, world.lanes - 1) === m.lane ? m.lane - side : m.lane + side : m.lane, apart = (at, but = null, sep = SEP, facing = Math.sign(at - here) || m.facing) => world.morus.every(o => { if (o === m || o === but) return true; const mine = body(at, facing), wide = sep + (o.room || m.room ? 6 : 0);
    if (o.goal == null) return Math.abs(middle(o) - mine) >= wide; const ends = [middle(o), body(o.goal, Math.sign(o.goal - centre(o)) || o.facing)];
    // A room's Moru on a walk can be called to work at any step of it, so the whole of its way is kept clear, not only the two ends.
    return o.room && !crowded ? mine <= Math.min(...ends) - wide || mine >= Math.max(...ends) + wide : ends.every(x => Math.abs(x - mine) >= wide); });
  // A lane to walk in: its own if nobody stands on the way, else the nearest lane that is open all the way (a room's Moru keeps its lane).
  const wayIn = (at, L) => world.morus.every(o => o === m || (Math.abs(o.depth - L) >= 0.9 && o.cur.laneTo !== L) || (centre(o) - here) * Math.sign(at - here) < 0 || (centre(o) - here) * Math.sign(at - here) > Math.abs(at - here) + GAP);
  const laneFor = at => [m.lane, ...(m.room ? [] : [m.lane - 1, m.lane + 1, m.lane - 2, m.lane + 2])].find(L => L >= 0 && L < world.lanes && wayIn(at, L));
  // Nobody stops in front of or behind another, whatever the lane: a few places are tried and the first free one is taken.
  // Nobody stops in front of or behind another, whatever the lane: a few places are tried and the first free one with an open way is taken.
  // One that has stood long on its spot, or stands in front of another, looks further and on both sides.
  // Open: nobody stands, or is headed, anywhere ahead up to 80px past the end, in any lane. One behind does not count: walking on only parts them.
  const openWay = (at, but = null) => world.morus.every(o => o === m || o === but || [centre(o), o.goal ?? centre(o)].every(x => { const ahead = (x - here) * Math.sign(at - here); return ahead <= 0 || ahead > Math.abs(at - here) + 80; }));
  const stuck = !apart(here) || m.rooted > 12000;
  let to = here, toLane = m.lane, strict = !crowded; const tryAt = (at, sep = SEP) => { if (to !== here || at < 70 || at > world.width - 70 || !apart(at, null, sep)) return; const L = laneFor(at) ?? (sep < SEP ? lane : !apart(here) ? m.lane : undefined);
    // Nobody walks past anybody, in any lane: a walk is taken only where nobody stands, or is headed, along the whole way. (A room's Moru must:
    // it can be called to work at any step and works where it stands.) Only one stepping out of a body it overlaps, or a packed floor, may.
    if ((m.room || strict) && !openWay(at)) return;
    // Nor does anyone set off beside one already walking the same way: at one pace, the two would stay one over the other the whole walk.
    if (world.morus.some(o => o !== m && o.goal != null && Math.sign(o.goal - centre(o)) === Math.sign(at - here) && Math.abs(middle(o) - middle(m)) < SEP + 40)) return;
    if (L === undefined || (Math.sign(at - here) !== m.facing && !roomToTurn(world, m))) return; to = at; toLane = L; };
  for (let k = 0; k < 8 && dir; k++) tryAt(here + dir * (60 + r() * 150));
  // A floor too full for everyone to stand clear (twenty in one strip) falls back to the nearest place that is at least mostly clear.
  if (stuck) for (const pass of !apart(here) && strict ? [true, false] : [strict]) { strict = pass; const first = r() < 0.5 ? 1 : -1; for (const sep of crowded || !apart(here, null, 76) ? [SEP, 76] : [SEP]) for (let far = !apart(here) && !crowded ? 24 : sep < SEP ? 60 : 110; far <= 700 && to === here; far += far < 110 ? 12 : 30) for (const d of [first, -first]) tryAt(here + d * (far + (far < 110 ? 0 : r() * 20)), sep); }
  add('wander', (to === here ? 0.05 : 0.5 + curiosity + 0.5 * Math.max(0, beside(1) + beside(-1) - 3)) * (apart(here) ? 1 : 6) * (1 + Math.min(5, m.rooted / 5000)), () => { m.goal = to; return [{ go: () => to, lane: () => toLane }]; });
  // The place is spoken for from the moment it is chosen (`goal`), so nobody comes to stand in front of the ladder while it is climbed.
  if (!m.room) for (const spot of world.spots) if (clear(world, m, spot.lane, spot.x, GAP) && apart(spot.x) && (crowded || openWay(spot.x))) add('spot:' + spot.clip, (spot.clip === 'nap' ? 1.3 * (1 - energy) : 0.3 + 0.8 * curiosity), () => { m.goal = spot.x; return [{ go: () => spot.x, lane: () => spot.lane, left: 70 }, { face: () => spot.dir }, { clip: spot.clip === 'nap' ? 'yawn' : spot.clip }, ...(spot.clip === 'nap' ? [{ clip: 'nap' }] : []),
    // Up the ladder, a look round and a wave from the shelf, and down the way it came.
    ...(spot.clip === 'climb' ? [{ clip: 'look-back' }, { clip: 'wave' }, { pause: 900 }, { clip: 'look-ahead' }, { clip: 'climb', reverse: true }] : [])]; });
  const friends = world.morus.filter(o => o !== m && (!m.room || o.lane === m.lane) && !o.height && !o.claimed && !o.event && !(crowded ? m.pairs.includes(o.id) : m.pairs[0] === o.id) && Math.abs(centre(o) - here) < 420 && quiet(o) && o.still < (crowded ? 4000 : 12000) && !['nap', 'yawn'].includes(o.clip)
    // Only a friend it can walk straight up to, with nobody between or headed between: nobody is walked past (a packed floor has no such way). That
    // leaves the two neighbours, so only the one it played with last is passed over, not the last two.
    && !(m.room && o.lane !== m.lane) && (!(m.room || !crowded) || openWay(centre(o), o))).sort((p, q) => Math.abs(centre(p) - here) - Math.abs(centre(q) - here)).slice(0, 5);
  if (friends.length) {
    // Every near friend with a free place beside it is a candidate and the weight is shared, so a full floor still finds someone to play with.
    // A floor too full for all to stand clear (twenty in one strip) takes the near side whatever stands behind it.
    const full = crowded, share = 1.6 / friends.length;
    // A room's Moru never leaves the front lane, even when the friend it walks up to changes lane on the way.
    const friendLane = b => m.room ? world.lanes - 1 : b.lane;
    for (const b of friends) { const near = here < centre(b) ? -1 : 1, side = (full ? [near, -near] : [near]).find(sd => apart(stand(b, sd) + sd * REACH, b, SEP, -sd)) ?? (full ? [near, -near].find(sd => apart(stand(b, sd) + sd * REACH, b, 76, -sd)) ?? near : undefined); if (side === undefined) continue;
    const behind = centre(b) - b.facing * (REACH + 24), kinds = m.room || b.room ? [['ask', 1.2]] : [['greet', 1], ['highfive', 1], ['ask', 1.3], ...(m.wear.head !== b.wear.head ? [['swap', 1.5]] : []), ...(apart(behind, b) ? [['prank', 0.6 + curiosity]] : []), ['nap', (1 - energy) * 1.2]];
    for (const [kind, w] of kinds) add(kind, w * share * (0.3 + sociability), () => { if (idle(b) && Math.abs(centre(b) - here) < 130) b.hail = 2500; m.goal = kind === 'prank' ? behind : stand(b, side) + side * REACH; return kind === 'prank'
      ? [{ go: () => centre(b) - b.facing * (REACH + 24), lane: () => friendLane(b), left: 60, toward: b }, { face: () => b.facing }, { clip: 'tiptoe' }, { call: (w2, a) => prank(w2, a, b) }]
      : [{ go: () => stand(b, side) + side * REACH, lane: () => friendLane(b), left: 60, toward: b }, { face: () => -side }, { call: (w2, a) => propose(w2, a, b, kind) }]; });
  } }
  if (!m.room) {
    add('nap-alone', (1 - energy) * 0.5, () => [{ clip: 'yawn' }, { clip: 'nap' }]);
    for (const move of ['bound', 'belly-slide', 'run', 'roll']) {
      const far = world.atlas.clips[move].travel.at(-1), ok = d => here + d * (far + 60) > 60 && here + d * (far + 60) < world.width - 60 && world.morus.every(o => o === m || (crowded && Math.abs(o.depth - m.lane) >= 0.9 ? ((centre(o) - here) * d < -56 || (centre(o) - here) * d > far + 76) && (o.goal == null || (o.goal - here) * d < -56 || (o.goal - here) * d > far + 76) : [centre(o), o.goal ?? centre(o)].every(x => (x - here) * d < (crowded ? 0 : -30) || (x - here) * d > far + GAP + 22)));
      // One travelling move at a time in a neighbourhood: two that set off toward each other in different lanes would cross.
      const alone = world.morus.every(o => o === m || !(TRAVEL.has(o.clip) || o.plan.some(i => TRAVEL.has(i.clip))) || Math.abs(centre(o) - here) > 2 * far + 240);
      const d = !alone ? 0 : ok(m.facing) ? m.facing : ok(-m.facing) ? -m.facing : 0;
      if (d) add(move, energy * 0.45, () => { m.goal = here + d * far; return [{ face: () => d }, { clip: move }]; });
    }
  }
  const pool = only ? options.filter(o => o.kind === only).slice(0, 1) : options; if (!pool.length || (only === 'wander' && to === here)) return false;
  let pick = r() * pool.reduce((a, o) => a + o.w, 0); const chosen = pool.find(o => (pick -= o.w) <= 0) ?? pool[0];
  remember(m.memory, chosen.kind, 4); m.plan = chosen.make(); next(world, m); return true;
}
/** Gives a free Moru one intention out of its own repertoire (used to open a demonstration; the choice after that is its own). */
export function nudge(world, id, kind) { const m = world.morus.find(m => m.id === id); return !!m && free(m) && decide(world, m, kind); }

/** One shared tick. `dt` in ms. Moods drift, clips advance, and free Moru decide at most ten times a second. */
export function tick(world, dt) {
  world.now += dt; world.sinceDecide += dt;
  for (const m of world.morus) {
    const busy = !IDLE.has(m.clip), s = dt / 1000;
    m.mood.energy = clamp(m.mood.energy + (m.clip === 'nap' ? 0.09 : busy ? -0.02 : 0.003) * s, 0, 1);
    m.mood.sociability = clamp(m.mood.sociability + 0.04 * s, 0, 1);
    m.mood.curiosity = clamp(m.mood.curiosity + (world.rand() - 0.5) * 0.12 * s, 0, 1);
    advance(world, m, dt);
  }
  // Two who agreed start together, each from the neutral pose.
  for (const m of world.morus) if (m.waiting && m.waiting.ready.size === m.waiting.size) { const t = m.waiting; for (const o of [...t.ready]) { o.waiting = null; next(world, o); } t.ready.clear(); }
  for (const m of world.morus) { m.still = IDLE.has(m.clip) && !m.plan.length ? m.still + dt : 0; if (!m.plan.length) m.goal = null;
    // Rooted: how long since it last left its spot (60px or more). A wave on the spot does not reset it; a walk does.
    if (m.home === null || Math.abs(centre(m) - m.home) > 60) { m.home = centre(m); m.rooted = 0; } else m.rooted += dt; }
  if (world.sinceDecide >= 100) { world.sinceDecide = 0; let doing = world.morus.filter(o => !IDLE.has(o.clip) || o.plan.length || o.waiting).length;
    // One that stands in front of another steps aside before anything else: the one without a room for preference, and only one of the pair.
    // In front of a room's Moru it does so whatever the budget and whoever hails it (it is rare, and one walk).
    for (const m of [...world.morus].sort((a, b) => a.room - b.room)) if (free(m) && (m.aside ?? 0) <= world.now) { const o = coveredBy(world, m); if (o && (o.room || m.room || (m.hail <= 0 && doing < world.busyMax + 2)) && !(m.room && free(o) && !o.room && (o.aside ?? 0) <= world.now)) { if (decide(world, m, 'wander')) { doing++; m.aside = world.now + 1500; } else m.aside = world.now + 375; } }
    // Then the one longest on its spot, then the longest still; after eight seconds of standing a Moru no longer waits to think.
    for (const m of [...world.morus].sort((a, b) => (b.still + b.rooted / 2) - (a.still + a.rooted / 2))) if (free(m) && m.hail <= 0) {
      if (doing < world.busyMax && (m.think <= 0 || m.still > 8000)) { if (decide(world, m, m.rooted > 25000 ? 'wander' : null) || decide(world, m)) doing++; }
      // No room in the budget, and it has stood eight seconds: a short thing on the spot (a turn, a wave, a yawn), so nobody is a statue.
      else if (m.still > 8000 && !m.room && doing < world.busyMax + 2) { doing++; const tired = m.mood.energy < 0.4, pick = world.rand(); m.plan = pick < 0.4 && world.morus.every(o => o === m || (Math.abs(middle(o) - middle(m)) > SEP + 30 && (Math.abs(centre(o) - centre(m)) > 130 || Math.abs(o.depth - m.lane) >= 0.9))) ? [{ face: () => -m.facing }] : [{ clip: tired ? 'yawn' : pick < 0.7 ? 'wave' : 'laugh' }]; next(world, m); } } }
}
/** Milliseconds until anything can change: the host sleeps that long. */
export function due(world) {
  let ms = 100; const clips = world.atlas.clips;
  for (const m of world.morus) if (m.clip !== 'rest') ms = Math.min(ms, clips[m.clip].ms[m.frame] - m.t);
  return Math.max(33, ms);
}
