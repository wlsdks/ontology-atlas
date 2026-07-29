/**
 * 브랜드 자산 래스터 — `build-brand-assets.mjs` 가 만든 SVG 를 정확한 픽셀
 * 크기의 PNG 로 굽는다.
 *
 * ## 왜 브라우저인가
 *
 * 저장소에 이미지 래스터 의존성(sharp·resvg·librsvg)을 새로 들이지 않기 위해서다
 * (`forbidden.md` — 새 dependency 는 이유를 대야 한다). 대신 이미 개발에 쓰는
 * Chrome 의 캔버스를 빌린다: 이 스크립트가 잠깐 로컬 서버를 띄우고, 브라우저가
 * SVG 를 그려 base64 로 POST 하면 여기서 파일로 쓴다.
 *
 * 그래서 **자동 실행이 아니다** — 아이콘을 바꿀 때 사람이 한 번 돌린다. 결과물
 * (PNG·icns·ico)은 저장소에 커밋되므로 빌드가 이 스크립트에 의존하지 않는다.
 *
 * 사용:
 *   node scripts/build-brand-raster.mjs        # 서버 띄우고 대기
 *   → 브라우저로 http://127.0.0.1:8231/ 열면 자동으로 굽고 POST 한다
 */
import { createServer } from 'node:http';
import { writeFileSync, mkdirSync } from 'node:fs';
import { appIconSvg, markSvg } from './build-brand-assets.mjs';

const PORT = 8231;
const OUT = '.qa-scratch/brand/png';

/** 사양의 배선표 — 크기마다 어느 그림을 쓰는지가 여기 한 곳에 있다. */
export const RASTER_PLAN = [
  ['icon-1024', 'full', 1024], ['icon-512', 'full', 512], ['icon-256', 'full', 256],
  ['icon-128', 'full', 128], ['icon-64', 'nodash', 64], ['icon-48', 'compact', 48],
  ['icon-32', 'compact', 32], ['icon-16', 'micro', 16],
  ['tile-310', 'nodash', 310], ['tile-284', 'nodash', 284], ['tile-150', 'nodash', 150],
  ['tile-142', 'nodash', 142], ['tile-107', 'nodash', 107], ['tile-89', 'nodash', 89],
  ['tile-71', 'nodash', 71], ['tile-50', 'compact', 50], ['tile-44', 'compact', 44],
  ['tile-30', 'compact', 30], ['apple-180', 'apple', 180],
];

const VARIANTS = {
  full: appIconSvg(),
  nodash: appIconSvg({ withDash: false }),
  compact: appIconSvg({ detail: 'compact' }),
  micro: appIconSvg({ detail: 'micro' }),
  // iOS 는 모서리를 자기가 깎으므로 판을 정사각 풀블리드로 준다.
  apple: appIconSvg().replace(/rx="186" ry="186"/, 'rx="0" ry="0"')
    .replace(/x="100" y="100" width="824" height="824"/, 'x="0" y="0" width="1024" height="1024"'),
  bare: markSvg('full'),
};

const PAGE = `<!doctype html><meta charset="utf-8"><body style="background:#111;color:#888;font:13px system-ui">
<p id="s">굽는 중…</p><script type="module">
const { variants, plan } = await (await fetch('/data')).json();
const render = async (svgText, size) => {
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const c = document.createElement('canvas'); c.width = c.height = size;
  c.getContext('2d').drawImage(img, 0, 0, size, size);
  URL.revokeObjectURL(url);
  return c.toDataURL('image/png').split(',')[1];
};
const out = {};
for (const [name, variant, size] of plan) out[name] = await render(variants[variant], size);
await fetch('/save', { method: 'POST', body: JSON.stringify(out) });
document.getElementById('s').textContent = '완료 — ' + Object.keys(out).length + '개. 창을 닫아도 됩니다.';
</script></body>`;

const server = createServer((req, res) => {
  if (req.url === '/data') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ variants: VARIANTS, plan: RASTER_PLAN }));
    return;
  }
  if (req.url === '/save' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const files = JSON.parse(body);
      mkdirSync(OUT, { recursive: true });
      for (const [name, b64] of Object.entries(files)) {
        writeFileSync(`${OUT}/${name}.png`, Buffer.from(b64, 'base64'));
      }
      console.log(`[brand-raster] ${Object.keys(files).length}개 저장 → ${OUT}`);
      res.writeHead(200).end('ok');
      server.close();
    });
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[brand-raster] http://127.0.0.1:${PORT}/ 를 브라우저로 여세요`);
  });
}
