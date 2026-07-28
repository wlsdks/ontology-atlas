import { chromium } from '@playwright/test';

const viewports = [
  { name: '1920', width: 1920, height: 1080 },
  { name: '1512', width: 1512, height: 982 },
  { name: '390', width: 390, height: 844 },
];

const browser = await chromium.launch({ executablePath: '/Users/jinan/Library/Caches/ms-playwright/chromium-1229/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' });
for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto('http://localhost:3000/ko/download/?guides=off', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="download-plate"]');
  await page.waitForTimeout(600); // fonts/hydration settle

  const data = await page.evaluate(() => {
    const out = {};
    // section rhythm
    const nav = document.querySelector('[data-testid="download-gnb"]');
    const stage = document.querySelector('[data-testid="download-stage"]');
    const install = document.querySelector('[data-testid="download-install"]');
    const footer = document.querySelector('footer');
    const plate = document.querySelector('[data-testid="download-plate"]');
    const caption = document.querySelector('[data-testid="download-portrait-caption"]');

    function rect(el) { return el ? el.getBoundingClientRect() : null; }
    out.nav = rect(nav);
    out.stage = rect(stage);
    out.install = rect(install);
    out.footer = rect(footer);
    out.plate = rect(plate);
    out.caption = rect(caption);

    // gap between stage bottom and install top
    if (out.stage && out.install) out.gapStageInstall = out.install.top - out.stage.bottom;
    if (out.install && out.footer) out.gapInstallFooter = out.footer.top - out.install.bottom;

    // hero text size
    const h1 = document.querySelector('h1');
    const h1cs = h1 ? getComputedStyle(h1) : null;
    out.h1 = h1cs ? { fontSize: h1cs.fontSize, lineHeight: h1cs.lineHeight, rect: rect(h1) } : null;

    // body text (lead)
    const lead = plate ? plate.querySelector('p') : null;
    const leadcs = lead ? getComputedStyle(lead) : null;
    out.lead = leadcs ? { fontSize: leadcs.fontSize, lineHeight: leadcs.lineHeight, text: lead.textContent.slice(0,30) } : null;

    // stage rect
    out.stageHeight = out.stage ? out.stage.height : null;
    out.viewportHeight = window.innerHeight;

    // overlap check: plate vs map svg/canvas
    const mapCanvas = document.querySelector('[data-testid="download-stage"] canvas');
    out.mapCanvasRect = rect(mapCanvas);

    return out;
  });

  console.log(`\n=== ${vp.name} (${vp.width}x${vp.height}) ===`);
  console.log(JSON.stringify(data, null, 1));

  await page.close();
}
await browser.close();
