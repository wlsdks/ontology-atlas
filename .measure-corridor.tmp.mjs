/**
 * 관문 무대의 "빈 복도" 실측 — 판 오른끝과 지도 잉크 첫 x 사이의 거리.
 *
 * 위계석이 판정 근거로 쓴 그 측정이다. 캔버스 픽셀을 직접 읽어 배경(도트
 * 그리드)이 아니라 **그래프 잉크**의 첫 x 를 찾는다 — 예전에 배경을 잉크로
 * 세서 지도 크기를 3배 크게 보고한 전례가 있다.
 */
import { chromium } from '@playwright/test';

const WIDTHS = [1440, 1920, 2560];
const URL = 'http://localhost:3000/ko/download/?guides=off';

const browser = await chromium.launch();
const rows = [];

for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: 1080 } });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500); // 호밍 스프링 정착

  const m = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const plate =
      document.querySelector('[data-testid="download-plate"]') ??
      [...document.querySelectorAll('div')].find(
        (d) => d.className.includes('pointer-events-auto') && d.className.includes('max-w-')
      );
    const pr = plate.getBoundingClientRect();
    const canvas = document.querySelector('canvas');
    const cr = canvas.getBoundingClientRect();

    // 캔버스 픽셀에서 잉크 첫 x 를 찾는다. 배경 도트 그리드는 캔버스 색과
    // 거의 같으므로, 캔버스 배경보다 충분히 밝은 픽셀만 잉크로 센다.
    const ctx = canvas.getContext('2d');
    const dpr = canvas.width / cr.width;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let inkFirstX = null;
    let inkPixelsLeftOfPlateRight = 0;
    const plateRightCanvasPx = Math.round((pr.right - cr.left) * dpr);
    for (let x = 0; x < canvas.width; x++) {
      for (let y = 0; y < canvas.height; y++) {
        const i = (y * canvas.width + x) * 4;
        const lum = 0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2];
        if (lum > 70) {
          if (inkFirstX === null) inkFirstX = Math.round(x / dpr + cr.left);
          if (x < plateRightCanvasPx) inkPixelsLeftOfPlateRight++;
        }
      }
    }
    return {
      plateLeft: Math.round(pr.left),
      plateRight: Math.round(pr.right),
      inkFirstX,
      inkBehindPlate: inkPixelsLeftOfPlateRight,
      safeInset: cs.getPropertyValue('--topology-v2-safe-inset-left').trim(),
      gutter: cs.getPropertyValue('--gateway-gutter').trim(),
      plateGap: cs.getPropertyValue('--gateway-plate-gap').trim(),
    };
  });

  rows.push({ width, ...m, corridor: m.inkFirstX === null ? null : m.inkFirstX - m.plateRight });
  await page.close();
}

await browser.close();

console.log('\n폭     홈통  판 rect      틈    예약   잉크첫x  복도   판뒤잉크');
console.log('─'.repeat(70));
for (const r of rows) {
  console.log(
    `${String(r.width).padEnd(6)} ${String(r.gutter).padEnd(5)} ` +
      `${String(r.plateLeft + '..' + r.plateRight).padEnd(12)} ` +
      `${String(r.plateGap).padEnd(5)} ${String(r.safeInset).padEnd(6)} ` +
      `${String(r.inkFirstX ?? '—').padEnd(8)} ${String(r.corridor ?? '—').padEnd(6)} ${r.inkBehindPlate}`
  );
}
console.log();
