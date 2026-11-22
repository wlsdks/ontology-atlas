// Drives the page with its own clock (no real time), so every frame is exact, and writes stills or a frame sequence.
// Usage: node capture.mjs <name> <query> <width> <height> <seconds> [fps] [startAtSeconds]
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { previewPath, REPO } from '../../lib.mjs';
import { mkdir, rm } from 'node:fs/promises';
const require = createRequire(join(REPO, 'package.json')), { chromium } = require('@playwright/test');
const [name, query, w, h, seconds, fps = '25', from = '0'] = process.argv.slice(2), here = previewPath('life') + '/';
const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`file://${here}index.html?${query}&capture=1`); await page.waitForFunction(() => window.life, null, { timeout: 30000 }).catch(() => {});
if (errors.length) { console.log('page errors:', errors.slice(0, 3).join(' | ')); await browser.close(); process.exit(1); }
if (+from) await page.evaluate(ms => window.life.advance(ms), +from * 1000);
if (+seconds === 0) { await page.screenshot({ path: `${here}${name}.png` }); console.log(`${here}${name}.png`); }
else {
  const dir = `${here}frames-${name}/`; await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
  const total = Math.round(+seconds * +fps), dt = 1000 / +fps;
  for (let i = 0; i < total; i++) { await page.evaluate(ms => window.life.advance(ms), dt); await page.screenshot({ path: `${dir}f${String(i).padStart(5, '0')}.png` }); }
  console.log(dir, total, 'frames', JSON.stringify(await page.evaluate(() => ({ ...window.life.world.stats, log: undefined, counters: window.life.counters(), memory: window.life.memory() }))));
}
await browser.close();
