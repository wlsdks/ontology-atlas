// Real time, 20 Moru on the floor strip at 1920x1080. CPU time of every process of the browser over a half minute, moving and standing still
// (reduced motion), in Chromium (GPU compositing) and in WebKit; then checks that nothing runs hidden or off screen.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { previewPath, REPO } from '../../lib.mjs';
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const require = createRequire(join(REPO, 'package.json')), { chromium, webkit } = require('@playwright/test');
const here = previewPath('life') + '/', seconds = +(process.argv[2] ?? 30), sleep = ms => new Promise(r => setTimeout(r, ms)), out = { seconds, viewport: '1920x1080', morus: 20 };
// CPU seconds so far of every process whose binary lives in the given Playwright browser folder, by process kind.
const cpuOf = match => { const rows = execFileSync('ps', ['-axo', 'pid=,time=,rss=,command=']).toString().split('\n').filter(l => l.includes(match)), by = {};
  for (const l of rows) { const [, pid, time, rss, cmd] = l.trim().match(/^(\d+)\s+(\S+)\s+(\d+)\s+(.*)$/) ?? []; if (!pid) continue; const parts = time.split(':').map(Number), secs = parts.reduce((a, v) => a * 60 + v, 0);
    const kind = /--type=([\w-]+)/.exec(cmd)?.[1] ?? (/WebContent/.test(cmd) ? 'WebContent' : /GPU/.test(cmd) ? 'GPU' : /Networking/.test(cmd) ? 'Networking' : 'browser'); by[pid] = { kind, secs, rssMB: +rss / 1024 }; }
  return by; };
async function run(engine, launch, match, name, query, checks) {
  // Other sessions on this Mac run the same browsers: only processes that appear with this launch are counted.
  const others = new Set(Object.keys(cpuOf(match))), browser = await launch(), page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(`file://${here}${query}`); await page.waitForFunction(() => window.life); await sleep(+(process.env.WARM ?? 4000));
  const a = Object.fromEntries(Object.entries(cpuOf(match)).filter(([pid]) => !others.has(pid))), ca = await page.evaluate(() => window.life.counters()), t0 = Date.now(); await sleep(seconds * 1000);
  const b = cpuOf(match), cb = await page.evaluate(() => window.life.counters()), wall = (Date.now() - t0) / 1000, by = {};
  for (const [pid, p] of Object.entries(b)) if (a[pid]) by[p.kind] = (by[p.kind] ?? 0) + p.secs - a[pid].secs;
  const pct = Object.fromEntries(Object.entries(by).map(([k, v]) => [k, +(100 * v / wall).toFixed(2)]));
  (out[engine] ??= {})[name] = { processCpuPct: pct, rendererPlusGpuPct: +['renderer', 'gpu-process', 'WebContent', 'GPU'].reduce((x, k) => x + (pct[k] ?? 0), 0).toFixed(2), totalPct: +Object.values(pct).reduce((x, y) => x + y, 0).toFixed(2), clockTicksPerSecond: +((cb.wakes - ca.wakes) / wall).toFixed(1), spriteRedrawsPerSecond: +((cb.painted - ca.painted) / wall).toFixed(1), rectanglesPerSecond: +((cb.redrawn - ca.redrawn) / wall).toFixed(1), megapixelsRedrawnPerSecond: +((cb.sent - ca.sent) / wall / 1e6).toFixed(2), scriptPct: +((cb.busy - ca.busy) / wall / 10).toFixed(2), storeHitPct: cb.found === undefined ? null : +(100 * (cb.found - ca.found) / Math.max(1, cb.found - ca.found + cb.composed - ca.composed)).toFixed(1), storeHitPctSinceLoad: cb.found === undefined ? null : +(100 * cb.found / Math.max(1, cb.found + cb.composed)).toFixed(1), keptPoses: cb.keptPoses, peakKeptMB: cb.peakKeptMB, dropped: cb.dropped, jsHeapMB: cb.jsHeapMB, rssMB: Object.fromEntries(Object.values(b).reduce((m, p) => m.set(p.kind, +((m.get(p.kind) ?? 0) + p.rssMB).toFixed(0)), new Map())), ...(await page.evaluate(() => window.life.memory())) };
  if (checks) {
    const wakes = async ms => { const x = await page.evaluate(() => window.life.counters().wakes); await sleep(ms); return (await page.evaluate(() => window.life.counters().wakes)) - x; };
    await page.evaluate(() => { document.getElementById('view').style.display = 'none'; }); await sleep(400); out[engine].ticksIn3sOffScreen = await wakes(3000);
    await page.evaluate(() => { document.getElementById('view').style.display = 'block'; }); await sleep(400); out[engine].ticksIn3sBackOnScreen = await wakes(3000);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }); await sleep(400); out[engine].ticksIn3sTabHidden = await wakes(3000);
  }
  await browser.close(); await sleep(1500);
}
const engines = [['chromium', () => chromium.launch({ channel: 'chromium' }), 'ms-playwright/chromium-'], ['webkit', () => webkit.launch(), 'ms-playwright/webkit-']];
// Usage: node cpu.mjs <seconds> name=page?query ...   (default: the strip moving and still, twice)
const runs = process.argv.slice(3).map(a => a.split(/=(.*)/s).slice(0, 2));
// The default: the browser's own cost of a 12 Hz picture (a 2D canvas, and a WebGL canvas, the size of the strip, with next to nothing drawn),
// then the floor of 20 Moru moving on its 10 Hz clock (twice), on a 12 Hz clock, and standing still.
if (!runs.length) runs.push(['floor2d', 'floor.html?op=fill&size=1920x300&hz=8'], ['moving1', 'index.html?mode=strip&n=20&seed=5'], ['still1', 'index.html?mode=strip&n=20&seed=5&reduced=1'], ['moving2', 'index.html?mode=strip&n=20&seed=6'], ['moving10hz', 'index.html?mode=strip&n=20&seed=5&hz=10'], ['floor2dAgain', 'floor.html?op=fill&size=1920x300&hz=8']);
for (const [engine, launch, match] of engines.filter(e => !process.env.ENGINE || e[0] === process.env.ENGINE)) for (const [name, target] of runs) await run(engine, launch, match, name, target, name === 'moving1');
await writeFile(previewPath('life', process.argv[3] ? 'life-cpu-trials.json' : 'life-cpu.json'), JSON.stringify(out, null, 1));
for (const e of ['chromium', 'webkit']) if (out[e]) console.log(e, Object.entries(out[e]).filter(([, v]) => v?.totalPct !== undefined).map(([k, v]) => `${k} r+g ${v.rendererPlusGpuPct} all ${v.totalPct} (${Object.entries(v.processCpuPct).filter(([, x]) => x >= 0.2).map(([n, x]) => n[0] + x).join(' ')})`).join(' | '), 'off', out[e].ticksIn3sOffScreen, 'hidden', out[e].ticksIn3sTabHidden);
