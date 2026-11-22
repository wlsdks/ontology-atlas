// Peak JS heap of the life page in Chromium (WebKit does not report it), sampled every second.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { previewPath, REPO } from '../../lib.mjs';
const pw = createRequire(join(REPO, 'package.json'))('@playwright/test'), seconds = +(process.argv[2] ?? 40), here = previewPath('life') + '/';
const browser = await pw.chromium.launch({ channel: 'chromium' }), page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }), cdp = await page.context().newCDPSession(page);
await page.goto(`file://${here}index.html?mode=strip&n=20&seed=5`); await page.waitForFunction(() => window.life); let peak = 0, last;
for (let i = 0; i < seconds; i++) { await new Promise(r => setTimeout(r, 1000)); await cdp.send("Performance.enable"); const m = (await cdp.send('Performance.getMetrics')).metrics.find(x => x.name === 'JSHeapUsedSize').value / 1048576; peak = Math.max(peak, m); last = await page.evaluate(() => window.life.counters()); }
console.log(JSON.stringify({ seconds, peakJsHeapMB: +peak.toFixed(1), storeHitPct: +(100 * last.found / (last.found + last.composed)).toFixed(1), keptPictures: last.keptPoses, keptMB: last.keptMB, peakKeptMB: last.peakKeptMB, dropped: last.dropped }));
await browser.close();
