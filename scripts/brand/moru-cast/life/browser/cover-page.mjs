// node cover-page.mjs <query> <width> <seconds>: runs the real page on its own clock and lists every time two Moru in different lanes kept nearer than 80px for over two seconds.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { previewPath, REPO } from '../../lib.mjs';
const require = createRequire(join(REPO, 'package.json')), { chromium } = require('@playwright/test');
const [query, w, seconds, near = '80'] = process.argv.slice(2), here = previewPath('life') + '/';
const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: +w, height: 400 }, deviceScaleFactor: 1 });
await page.goto(`file://${here}index.html?${query}&capture=1`); await page.waitForFunction(() => window.life);
const out = await page.evaluate(([seconds, NEAR]) => { const world = window.life.world, cx = m => m.x + (m.facing > 0 ? 74 : 62), run = new Map(), done = [], moved = new Map(), MOVE = new Set(['step', 'turn', 'run', 'roll', 'bound', 'belly-slide']); let ticks = 0, covered = 0;
  for (let t = 0; t < seconds * 1000; t += 125) { window.life.advance(125); ticks++; const now = new Set(); let any = false;
    for (const m of world.morus) { const h = moved.get(m.id) ?? { at: cx(m), n: 0 }; if (Math.abs(cx(m) - h.at) > 60) { h.at = cx(m); h.n++; } moved.set(m.id, h); }
    for (const a of world.morus) for (const b of world.morus) if (a.id < b.id && Math.abs(a.depth - b.depth) >= 0.5 && Math.abs(cx(a) - cx(b)) < NEAR && !MOVE.has(a.clip) && !MOVE.has(b.clip)) { const k = a.id + '+' + b.id; now.add(k); const r = run.get(k) ?? { from: t, ms: 0, clips: new Set() }; r.ms += 125; r.clips.add(a.clip + (a.room ? '(room)' : '') + '/' + b.clip + (b.room ? '(room)' : '')); r.gap = Math.round(Math.abs(cx(a) - cx(b))); run.set(k, r); if (r.ms > 2000) any = true; }
    if (any) covered++;
    for (const [k, r] of run) if (!now.has(k)) { if (r.ms > 2000) done.push({ pair: k, fromS: r.from / 1000, s: r.ms / 1000, gap: r.gap, clips: [...r.clips].slice(0, 6).join(' ') }); run.delete(k); } }
  for (const [k, r] of run) if (r.ms > 2000) done.push({ pair: k, fromS: r.from / 1000, s: r.ms / 1000, gap: r.gap, clips: [...r.clips].slice(0, 6).join(' '), open: true });
  return { ticks, inBetweenEarOrWingPictures: window.life.counters().between, coveredTicks: covered, runs: done, leftSpot: [...moved.values()].map(h => h.n).join(',') }; }, [+seconds, +near]);
console.log(JSON.stringify(out, null, 1)); await browser.close();
