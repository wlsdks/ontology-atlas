// Runs the life runtime for a minute with no renderer and measures continuity: the step of every Moru's body
// centre between consecutive ticks, the steps across chain boundaries, and how long real events waited.
import { readFile, writeFile } from 'node:fs/promises';
import { createWorld, addMoru, tick, raise } from './behaviour.mjs';
import { previewPath } from '../lib.mjs';
const atlas = JSON.parse(await readFile(previewPath('life/atlas.json'), 'utf8'));
const seconds = +(process.argv[2] ?? 60), n = +(process.argv[3] ?? 8), DT = 1000 / +(process.argv[4] ?? 10);
const width = +(process.argv[5] ?? 1280), busyMax = +(process.argv[6] ?? Infinity), TRAVEL = new Set(['roll', 'bound', 'run', 'belly-slide']), stillFor = new Map(); let longestStill = 0, piles = 0, through = 0, nearest = 1e9;
const world = createWorld({ atlas, busyMax, width, lanes: 3, seed: 7, spots: [{ x: 1150, dir: 1, clip: 'fish', lane: 2 }, { x: 200, dir: 1, clip: 'nap', lane: 0 }, { x: 640, dir: 1, clip: 'climb', lane: 0 }] });
const palettes = Object.keys(atlas.palettes), heads = Object.entries(atlas.pieces).filter(([, p]) => p.slot === 'head').map(([k]) => k);
for (let i = 0; i < n; i++) addMoru(world, { id: 'm' + i, x: 60 + i * ((width - 180) / n), lane: i % 3, palette: palettes[i % palettes.length], wear: { head: heads[i % heads.length] }, room: i < 2 });
const STAND = new Set(['rest', 'blink', 'sway', 'look-ahead', 'look-back', 'nap', 'yawn']), cx = m => m.x + (m.facing > 0 ? 63 : 74), coverRun = new Map(), coverNow = new Set(), homes = new Map(); let coverTicks = 0, longestCover = 0, longestRoomCover = 0;
const pos = m => { const f = atlas.clips[m.clip].f[m.frame]; return [m.facing > 0 ? m.x + f.cx : m.x + 136 - f.cx, f.cy + m.depth * 26 - m.height, f.air]; };
let prev = world.morus.map(m => ({ p: pos(m), clip: m.clip })), maxStep = 0, maxBoundary = 0, pops = 0, boundaries = 0, overlaps = 0, ticks = 0; const worst = [];
// A pop: further in one tick than the catalogue's airborne p90 plus the fastest room speed any clip uses (4 px per pose).
const POP = atlas.limits.air + 4;
for (let t = 0; t < seconds * 1000; t += DT) {
  if (Math.floor(t / 9000) > Math.floor((t - DT) / 9000)) { const k = Math.floor(t / 9000); raise(world, 'm' + (k % 2), ['commit', 'stuck', 'merge', 'waiting'][k % 4]); }
  tick(world, DT); ticks++;
  // Standing: no action of its own (blinks and glances do not count as doing something). A room's Moru may stand: it shows its room. A pile: three standing bodies within 60px, any lanes. Through: a travelling move with another body within 44px in another lane.
  for (const m of world.morus) { const st = (world.atlas.clips[m.clip] && ['rest', 'blink', 'sway', 'look-ahead', 'look-back'].includes(m.clip) && !m.plan.length && !m.claimed && !m.room) ? (stillFor.get(m) ?? 0) + DT : 0; stillFor.set(m, st); longestStill = Math.max(longestStill, st); }
  { const xs = world.morus.filter(m => !m.plan.length && ['rest', 'blink', 'sway', 'look-ahead', 'look-back', 'nap'].includes(m.clip)).map(m => m.x + (m.facing > 0 ? 74 : 62)).sort((a, b) => a - b); for (let i = 2; i < xs.length; i++) if (xs[i] - xs[i - 2] < 60) { piles++; break; } }
  for (const a of world.morus) if (TRAVEL.has(a.clip)) for (const b of world.morus) if (b !== a && Math.abs(a.depth - b.depth) >= 0.5 && Math.abs((a.x + (a.facing > 0 ? 74 : 62)) - (b.x + (b.facing > 0 ? 74 : 62))) < 44) { through++; if (process.env.DEBUG) console.log('through', t, a.id, a.clip, a.frame, a.lane, Math.round(cx(a)), a.facing, '|', b.id, b.clip, b.frame, b.depth, Math.round(cx(b)), b.facing, b.plan.length, b.cur.laneTo); break; }
  // Cover: two standing bodies (nothing planned; a nap counts) in different lanes nearer than a body's width. Its longest unbroken run is what a viewer sees as one hiding another.
  { const st = world.morus.filter(m => !m.plan.length && !m.waiting && !m.height && STAND.has(m.clip)); let any = false; for (const a of st) for (const b of st) if (a.id < b.id && Math.abs(a.depth - b.depth) >= 0.5 && Math.abs(cx(a) - cx(b)) < 97) { any = true; if (process.env.DEBUG) console.log('cover', t, a.id, a.clip, a.room, a.depth, Math.round(cx(a)), a.hail > 0, a.claimed > 0, '|', b.id, b.clip, b.room, b.depth, Math.round(cx(b)), b.hail > 0, b.claimed > 0); const k = a.id + b.id, run = (coverRun.get(k) ?? 0) + DT; coverRun.set(k, run); coverNow.add(k); longestCover = Math.max(longestCover, run); if ((a.room && b.depth > a.depth) || (b.room && a.depth > b.depth)) longestRoomCover = Math.max(longestRoomCover, run); } if (any) coverTicks++; for (const k of [...coverRun.keys()]) if (!coverNow.has(k)) coverRun.delete(k); coverNow.clear(); }
  for (const m of world.morus) { const h = homes.get(m) ?? { at: cx(m), n: 0, since: 0, longest: 0 }; if (Math.abs(cx(m) - h.at) > 60) { h.at = cx(m); h.n++; h.since = 0; } else { h.since += DT; h.longest = Math.max(h.longest, h.since); } homes.set(m, h); }
  world.morus.forEach((m, i) => { const p = pos(m), step = Math.hypot(p[0] - prev[i].p[0], p[1] - prev[i].p[1]); maxStep = Math.max(maxStep, step);
    if (m.clip !== prev[i].clip) { boundaries++; maxBoundary = Math.max(maxBoundary, step); }
    if (step > POP) { pops++; worst.push({ t, id: m.id, from: prev[i].clip, to: m.clip, step: +step.toFixed(2) }); }
    prev[i] = { p, clip: m.clip }; });
  for (const a of world.morus) for (const b of world.morus) if (a.id < b.id && Math.abs(a.depth - b.depth) < 0.5) { const gap = Math.abs((a.x + (a.facing > 0 ? 74 : 62)) - (b.x + (b.facing > 0 ? 74 : 62))); nearest = Math.min(nearest, gap); if (gap < 70) { overlaps++; if (process.env.DEBUG) console.log('overlap', t, a.id, a.clip, a.depth, Math.round(cx(a)), '|', b.id, b.clip, b.depth, Math.round(cx(b)), b.cur.laneTo, a.cur.laneTo); } }
}
const out = { seconds, morus: n, ticks, maxStepPx: +maxStep.toFixed(2), popLimitPx: +POP.toFixed(2), pops, worst: worst.slice(0, 8), chainBoundaries: boundaries, maxStepAcrossBoundaryPx: +maxBoundary.toFixed(2), overlapTicks: overlaps, nearestSameLanePx: +nearest.toFixed(0), longestStandingS: +(longestStill / 1000).toFixed(1), pileTicks: piles, travelThroughTicks: through, coverTicks, longestCoverS: +(longestCover / 1000).toFixed(1), longestInFrontOfRoomMoruS: +(longestRoomCover / 1000).toFixed(1), neverLeftSpot: [...homes.values()].filter(h => h.n === 0).length, leftSpotTimes: [...homes.values()].map(h => h.n).join(','), longestOnOneSpotS: +(Math.max(...[...homes.values()].map(h => h.longest)) / 1000).toFixed(0), ...world.stats, eventLatencyMaxMs: Math.max(0, ...world.stats.eventLatency) }; delete out.log;
await writeFile(previewPath('life/life-measure.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, actions: Object.entries(out.actions).map(([k, v]) => k + ':' + v).join(' ') }));
