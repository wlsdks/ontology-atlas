// Where the script time of a tick goes, in one engine: node where.mjs webkit|chromium [seconds]
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { previewPath, REPO } from '../../lib.mjs';
const pw = createRequire(join(REPO, 'package.json'))('@playwright/test'), engine = process.argv[2] ?? 'webkit', seconds = +(process.argv[3] ?? 15), here = previewPath('life') + '/';
const browser = await (engine === 'webkit' ? pw.webkit.launch() : pw.chromium.launch({ channel: 'chromium' })), page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }); page.on('pageerror', e => console.log('page error', e.message));
await page.goto(`file://${here}index.html?mode=strip&n=20&seed=5${process.argv[4] ?? ''}`); await page.waitForFunction(() => window.life); await new Promise(r => setTimeout(r, 3000));
const a = await page.evaluate(() => window.life.counters()); await new Promise(r => setTimeout(r, seconds * 1000)); const b = await page.evaluate(() => window.life.counters()), ticks = b.wakes - a.wakes;
console.log(engine, 'ticks', ticks, 'ms per tick', ((b.busy - a.busy) / ticks).toFixed(2), Object.fromEntries(Object.keys(b.spent).map(k => [k, +((b.spent[k] - a.spent[k]) / ticks).toFixed(3)])), 'rects per tick', ((b.redrawn - a.redrawn) / ticks).toFixed(1), 'kilopixels per tick', ((b.sent - a.sent) / ticks / 1000).toFixed(0), 'poses laid per tick', ((b.painted - a.painted) / ticks).toFixed(1));
await browser.close();
