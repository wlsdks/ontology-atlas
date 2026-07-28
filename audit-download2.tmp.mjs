import { chromium } from '@playwright/test';
const EXE = '/Users/jinan/Library/Caches/ms-playwright/chromium-1229/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const widths = [1024, 1440, 1600, 1920, 2560];
const browser = await chromium.launch({ executablePath: EXE });
for (const w of widths) {
  const page = await browser.newPage({ viewport: { width: w, height: 1000 } });
  await page.goto('http://localhost:3000/ko/download/?guides=off', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="download-plate"]');
  await page.waitForTimeout(400);
  const rect = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="download-plate"]');
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, width: r.width };
  });
  console.log(w, JSON.stringify(rect), 'plate.right =', rect.right, ' vs configured safe-inset-left(544) diff =', (rect.right - 544).toFixed(1));
  await page.close();
}
await browser.close();
