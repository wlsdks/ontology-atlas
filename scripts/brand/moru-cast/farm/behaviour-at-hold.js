// The life runtime as the farm page used it when the farm was put off (2026-11-22). The floor strip's
// runtime has moved on in ../life/behaviour.mjs; this copy keeps the farm page working as it was.
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
const GAP = 96, REACH = 92, STRIDE = 16, QUICK_MS = 350;
// Stand-ins: in the app these are the shipped Work status clips.
const STATE_CLIP = { commit: 'laugh', merge: 'reply-idea', waiting: 'ask', stuck: 'huff' };
const IDLE = new Set(['rest', 'blink', 'sway', 'look-ahead', 'look-back']);
const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createWorld({ atlas, width, lanes = 3, seed = 1, spots = [] }) {
  return { atlas, width, lanes, spots, rand: rng(seed), now: 0, sinceDecide: 0, morus: [], lastReply: null, log: [],
    stats: { actions: {}, declines: 0, missed: 0, interactions: 0, pranks: 0, swaps: 0, eventLatency: [] } };
}
export function addMoru(world, { id, x, lane = 0, palette = 'original', wear = {}, room = false }) {
  const r = world.rand, m = { id, x, lane, depth: lane, facing: r() < 0.5 ? 1 : -1, palette, wear: { head: null, body: null, accessory: null, ...wear }, room,
    mood: { curiosity: r(), energy: 0.5 + r() * 0.5, sociability: 0.4 + r() * 0.6 }, clip: 'rest', frame: 0, t: 0, cur: {}, plan: [], memory: [], pairs: [],
    think: 300 + r() * 2500, idleIn: 400 + r() * 1500, hold: 0, waiting: null, event: null, claimed: 0, hail: 0, steps: 0, changed: true };
  world.morus.push(m); return m;
}
/** Where the body's centre stands at rest. The cell is mirrored about x = 68 when the Moru faces left. */
const stand = (m, dir = m.facing) => m.x + (dir > 0 ? 74 : 62);
const centre = m => stand(m);
const quiet = m => !m.plan.length && !m.waiting && !m.event && !m.claimed && !m.hold;
const free = m => m.clip === 'rest' && quiet(m);
const idle = m => quiet(m) && IDLE.has(m.clip);
const remember = (list, what, keep) => { list.unshift(what); list.length = Math.min(list.length, keep); };
const fits = (world, m, clip) => !m.room || world.atlas.clips[clip].maxWaitMs <= QUICK_MS;
/** A room's Moru only plays what a real event can cut short in time; anything longer becomes a glance. */
const soft = (world, m, clip) => fits(world, m, clip) ? clip : 'look-back';
const clear = (world, m, lane, at, room = GAP, but = null) => world.morus.every(o => o === m || (Math.abs(o.depth - lane) >= 0.9 && o.cur.laneTo !== lane) || Math.abs(centre(o) - at) >= (o === but ? REACH - 12 : room));

const roomToTurn = (world, m, but) => world.morus.every(o => o === m || o === but || Math.abs(o.depth - m.lane) >= 0.9 || (centre(o) - centre(m)) * -m.facing <= 0 || (centre(o) - centre(m)) * -m.facing >= GAP);
const roomAhead = (world, m, dir, far) => centre(m) + dir * far > 60 && centre(m) + dir * far < world.width - 60 && world.morus.every(o => o === m || Math.abs(o.depth - m.lane) >= 0.9 || (centre(o) - centre(m)) * dir <= 0 || (centre(o) - centre(m)) * dir >= GAP + far);

/** A real event for this Moru's room. It cuts in at the next pose close to the neutral and holds the Moru out of play. */
export function raise(world, id, state, holdMs = 4000) { const m = world.morus.find(m => m.id === id); if (m) m.event = { state, at: world.now, holdMs }; }

function play(world, m, clip, cur = {}) { m.clip = clip; m.frame = 0; m.t = 0; m.cur = cur; m.changed = true; world.stats.actions[clip] = (world.stats.actions[clip] ?? 0) + 1; }
function rest(m) { m.clip = 'rest'; m.frame = 0; m.t = 0; m.cur = {}; m.changed = true; }
const drop = m => { m.plan = []; m.steps = 0; };

/** Starts the next thing in the plan. Walking is planned one stride at a time, so a moving target is followed and neighbours are respected. */
function next(world, m) {
  for (;;) {
    const item = m.plan[0];
    if (!item) { rest(m); m.think = 300 + world.rand() * 1400; m.steps = 0; return; }
    if (item.go) {
      const lane = item.lane?.() ?? m.lane, d = item.go() - centre(m), dir = d >= 0 ? 1 : -1; item.left = (item.left ?? 40) - 1;
      // Whoever is being walked up to notices and stays put while the walker is on the way.
      if (item.toward && quiet(item.toward)) item.toward.hail = 1500;
      const near = Math.abs(d) < 2, wrongWay = !near && dir !== m.facing;
      if ((near && lane === m.lane) || item.left < 0) { m.plan.shift(); m.steps = 0; continue; }
      // Turning carries the body 12px the new way: never into a neighbour, and never past the target.
      if (wrongWay && Math.abs(d) >= 12) { m.steps = 0; if (!roomToTurn(world, m, item.toward)) { m.plan = item.blocked ?? []; continue; } play(world, m, 'turn'); return; }
      // Ease in: the first strides are short. Arrive: the last stride is what is left. Separation: never closer than GAP to a neighbour in the lane.
      let stride = near || wrongWay ? 0 : Math.min(STRIDE, Math.abs(d), m.steps === 0 ? 9 : m.steps === 1 ? 13 : STRIDE);
      for (const o of world.morus) if (o !== m && Math.abs(o.depth - m.lane) < 0.9) { const ahead = (centre(o) - centre(m)) * m.facing; if (ahead > 0) stride = Math.min(stride, Math.max(0, ahead - (o === item.toward ? REACH - 12 : GAP))); }
      if (centre(m) + m.facing * stride < 50 || centre(m) + m.facing * stride > world.width - 50) stride = 0;
      const laneNext = m.lane + Math.sign(lane - m.lane), laneTo = lane !== m.lane && clear(world, m, laneNext, centre(m) + m.facing * stride, GAP, item.toward) ? laneNext : null;
      if (stride < 2 && laneTo === null) { m.plan = wrongWay && lane === m.lane ? m.plan.slice(1) : item.blocked ?? []; m.steps = 0; continue; }
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

function advance(world, m, dt) {
  const clips = world.atlas.clips;
  if (m.hail > 0) m.hail -= dt;
  // A real event cuts in at rest or at any pose within one catalogue step of the neutral.
  if (m.event && (m.clip === 'rest' || clips[m.clip].f[m.frame].exit) && Number.isInteger(m.depth)) {
    if (m.cur.laneTo != null) m.lane = m.depth;
    const e = m.event; m.event = null; drop(m); m.hold = 0;
    if (m.waiting) { m.waiting.ready.delete(m); m.waiting.broken = true; m.waiting = null; }
    world.stats.eventLatency.push(world.now - e.at); world.log.push({ t: world.now, id: m.id, state: e.state, waited: world.now - e.at });
    m.claimed = e.holdMs; play(world, m, STATE_CLIP[e.state] ?? 'laugh', { state: e.state }); return;
  }
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
      play(world, m, passing ? ((centre(passing) - centre(m)) * m.facing > 0 ? 'look-ahead' : 'look-back') : world.rand() < 0.7 ? 'blink' : 'sway');
    }
    return;
  }
  const c = clips[m.clip]; m.t += dt;
  while (m.t >= c.ms[m.frame]) {
    m.t -= c.ms[m.frame];
    if (m.frame === c.n - 1) {
      if (m.clip === 'turn') m.facing = -m.facing;
      if (m.cur.laneTo != null) { m.lane = m.cur.laneTo; m.depth = m.lane; }
      if (m.plan.length) next(world, m); else { rest(m); if (!IDLE.has(c.id)) m.think = Math.max(m.think, 400 + world.rand() * 1600); }
      return;
    }
    m.frame++; m.changed = true;
    if (c.travel) m.x += m.facing * (c.travel[m.frame] - c.travel[m.frame - 1]) * (m.cur.scale ?? 1);
    if (m.cur.laneTo != null) m.depth = m.cur.laneFrom + (m.cur.laneTo - m.cur.laneFrom) * Math.min(1, m.frame / 5);
    if (c.wear && m.frame === c.wear.swapAt && m.cur.swapWith && m.id < m.cur.swapWith.id) { const o = m.cur.swapWith, s = c.wear.slot; [m.wear[s], o.wear[s]] = [o.wear[s], m.wear[s]]; o.changed = true; world.stats.swaps++; }
  }
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
  const away = -a.facing, back = Math.sign(centre(a) - centre(b)) || 1, room = clear(world, a, a.lane, centre(a) + away * 60, 70) && centre(a) + away * 110 > 60 && centre(a) + away * 110 < world.width - 60;
  a.plan = [{ clip: 'boo' }, { clip: 'laugh' }, ...(room ? [{ face: () => away }, { clip: 'run' }] : [])];
  b.plan = [{ pause: 250 }, { clip: 'startled' }, { face: () => back }, { clip: 'huff' }]; next(world, b);
  world.stats.pranks++; remember(a.pairs, b.id, 2); remember(b.pairs, a.id, 2);
}

/** Weighted choice among what is possible now. Memory makes a repeat unlikely. */
function decide(world, m, only = null) {
  const r = world.rand, { curiosity, energy, sociability } = m.mood, options = [], here = centre(m);
  const add = (kind, w, make) => options.push({ kind, w: w * (m.memory[0] === kind ? 0.1 : m.memory.includes(kind) ? 0.35 : 1), make });
  // Wander where there is room: ahead for preference, else behind (if there is room to turn), else to the next lane.
  const want = r() < 0.7 ? m.facing : -m.facing, open = d => roomAhead(world, m, d, 30) && (d === m.facing || roomToTurn(world, m)), dir = open(want) ? want : open(-want) ? -want : 0;
  const side = r() < 0.5 ? -1 : 1, lane = !dir || r() < 0.3 ? clamp(m.lane + side, 0, world.lanes - 1) === m.lane ? m.lane - side : m.lane + side : m.lane, to = clamp(here + dir * (70 + r() * 300), 70, world.width - 70);
  add('wander', 0.5 + curiosity, () => [{ go: () => to, lane: () => lane }]);
  if (!m.room) for (const spot of world.spots) if (clear(world, m, spot.lane, spot.x, GAP)) add('spot:' + spot.clip, (spot.clip === 'nap' ? 1.3 * (1 - energy) : 0.3 + 0.8 * curiosity), () => [{ go: () => spot.x, lane: () => spot.lane, left: 70 }, { face: () => spot.dir }, { clip: spot.clip === 'nap' ? 'yawn' : spot.clip }, ...(spot.clip === 'nap' ? [{ clip: 'nap' }] : [])]);
  const friends = world.morus.filter(o => o !== m && !o.claimed && !o.event && !m.pairs.includes(o.id) && Math.abs(centre(o) - here) < 420 && quiet(o) && !['nap', 'yawn'].includes(o.clip)).sort((p, q) => Math.abs(centre(p) - here) - Math.abs(centre(q) - here)).slice(0, 3);
  if (friends.length) {
    for (const b of only ? friends : [friends[Math.floor(r() * friends.length)]]) { const side = here < centre(b) ? -1 : 1;
    const kinds = m.room || b.room ? [['ask', 1.2]] : [['greet', 1], ['highfive', 1], ['ask', 1.3], ...(m.wear.head !== b.wear.head ? [['swap', 1.5]] : []), ['prank', 0.6 + curiosity], ['nap', (1 - energy) * 1.2]];
    for (const [kind, w] of kinds) add(kind, w * (0.3 + sociability), () => { if (idle(b)) b.hail = 7000; return kind === 'prank'
      ? [{ go: () => centre(b) - b.facing * REACH, lane: () => b.lane, left: 60, toward: b }, { face: () => b.facing }, { call: (w2, a) => prank(w2, a, b) }]
      : [{ go: () => stand(b, side) + side * REACH, lane: () => b.lane, left: 60, toward: b }, { face: () => -side }, { call: (w2, a) => propose(w2, a, b, kind) }]; });
  } }
  if (!m.room) {
    add('nap-alone', (1 - energy) * 0.5, () => [{ clip: 'yawn' }, { clip: 'nap' }]);
    for (const move of ['bound', 'belly-slide', 'run']) {
      const far = world.atlas.clips[move].travel.at(-1), ok = d => here + d * (far + 60) > 60 && here + d * (far + 60) < world.width - 60 && world.morus.every(o => o === m || Math.abs(o.depth - m.lane) >= 0.9 || (centre(o) - here) * d < 0 || (centre(o) - here) * d > far + GAP);
      const d = ok(m.facing) ? m.facing : ok(-m.facing) ? -m.facing : 0;
      if (d) add(move, energy * 0.45, () => [{ face: () => d }, { clip: move }]);
    }
  }
  const pool = only ? options.filter(o => o.kind === only).slice(0, 1) : options; if (!pool.length) return false;
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
  if (world.sinceDecide >= 100) { world.sinceDecide = 0; for (const m of world.morus) if (free(m) && m.think <= 0 && m.hail <= 0) decide(world, m); }
}
/** Milliseconds until anything can change: the host sleeps that long. */
export function due(world) {
  let ms = 100; const clips = world.atlas.clips;
  for (const m of world.morus) if (m.clip !== 'rest') ms = Math.min(ms, clips[m.clip].ms[m.frame] - m.t);
  return Math.max(33, ms);
}
