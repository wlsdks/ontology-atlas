// node cover-page.mjs <query> <width> <seconds> [near] [seconds a pair must last]: runs the real page on its own clock and lists every time two Moru in
// different lanes stood with their bodies overlapping (the middles of their silhouettes nearer than a body's 97px) for longer than half a second,
// neither of them walking. `withRoom` counts the ones where one of the two is a room's Moru.
// `ticksAnyoneDrawnOverRoomMoru` counts every tick on which somebody, walking or standing, is drawn in front of a room's Moru.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { previewPath, REPO } from '../../lib.mjs';
const require = createRequire(join(REPO, 'package.json')), { chromium } = require('@playwright/test');
const [query, w, seconds, near = '97', least = '0.5'] = process.argv.slice(2), here = previewPath('life') + '/';
const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: +w, height: 400 }, deviceScaleFactor: 1 });
await page.goto(`file://${here}index.html?${query}&capture=1`); await page.waitForFunction(() => window.life);
const out = await page.evaluate(([seconds, NEAR, LEAST]) => { const world = window.life.world, cx = m => m.x + (m.facing > 0 ? 63 : 74), run = new Map(), done = [], moved = new Map(), MOVE = new Set(['step', 'turn', 'run', 'roll', 'bound', 'belly-slide']); let ticks = 0, covered = 0; let drawnOver = 0;
  for (let t = 0; t < seconds * 1000; t += 125) { window.life.advance(125); ticks++; const now = new Set(); let any = false;
    for (const m of world.morus) { const h = moved.get(m.id) ?? { at: cx(m), n: 0 }; if (Math.abs(cx(m) - h.at) > 60) { h.at = cx(m); h.n++; } moved.set(m.id, h); }
    if (world.morus.some(a => a.room && world.morus.some(b => b !== a && b.depth >= a.depth + 0.5 && Math.abs(cx(a) - cx(b)) < NEAR))) drawnOver++;
    for (const a of world.morus) for (const b of world.morus) if (a.id < b.id && Math.abs(a.depth - b.depth) >= 0.5 && Math.abs(cx(a) - cx(b)) < NEAR && !MOVE.has(a.clip) && !MOVE.has(b.clip)) { const k = a.id + '+' + b.id; now.add(k); const r = run.get(k) ?? { from: t, ms: 0, clips: new Set(), room: a.room || b.room }; r.ms += 125; r.clips.add(a.clip + (a.room ? '(room)' : '') + '/' + b.clip + (b.room ? '(room)' : '')); r.gap = Math.round(Math.abs(cx(a) - cx(b))); run.set(k, r); if (r.ms > LEAST) any = true; }
    if (any) covered++;
    for (const [k, r] of run) if (!now.has(k)) { if (r.ms > LEAST) done.push({ pair: k, room: r.room, fromS: r.from / 1000, s: r.ms / 1000, gap: r.gap, clips: [...r.clips].slice(0, 6).join(' ') }); run.delete(k); } }
  for (const [k, r] of run) if (r.ms > LEAST) done.push({ pair: k, room: r.room, fromS: r.from / 1000, s: r.ms / 1000, gap: r.gap, clips: [...r.clips].slice(0, 6).join(' '), open: true });
  return { ticks, inBetweenEarOrWingPictures: window.life.counters().between, ticksAnyoneDrawnOverRoomMoru: drawnOver, coveredTicks: covered, longestS: Math.max(0, ...done.map(d => d.s)), withRoom: done.filter(d => d.room).length, longestWithRoomS: Math.max(0, ...done.filter(d => d.room).map(d => d.s)), runs: done, leftSpot: [...moved.values()].map(h => h.n).join(',') }; }, [+seconds, +near, +least * 1000]);
console.log(JSON.stringify(out, null, 1)); await browser.close();
