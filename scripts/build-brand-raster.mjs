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
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { appIconSvg, markSvg, lockupSvg, monoIconSvg, ogImageSvg } from './build-brand-assets.mjs';

const PORT = 8231;
const OUT = '.qa-scratch/brand/png';

/** 사양의 배선표 — 크기마다 어느 그림을 쓰는지가 여기 한 곳에 있다. */
export const RASTER_PLAN = [
  ['icon-1024', 'full', 1024], ['icon-512', 'full', 512], ['icon-256', 'full', 256],
  ['icon-128', 'full', 128], ['icon-64', 'nodash', 64], ['icon-48', 'compact', 48],
  ['icon-32', 'compact', 32], ['icon-16', 'micro', 16],
  // @2x 짝 — 레티나는 **같은 그림을 두 배 해상도로** 그리는 것이지 다른 그림이
  // 아니다. icon_16x16@2x 에 축약형을 넣으면 같은 논리 크기에서 그림이 바뀐다.
  ['micro-32', 'micro', 32], ['compact-64', 'compact', 64],
  ['tile-310', 'nodash', 310], ['tile-284', 'nodash', 284], ['tile-150', 'nodash', 150],
  ['tile-142', 'nodash', 142], ['tile-107', 'nodash', 107], ['tile-89', 'nodash', 89],
  ['tile-71', 'nodash', 71], ['tile-50', 'compact', 50], ['tile-44', 'compact', 44],
  ['tile-30', 'compact', 30], ['apple-180', 'apple', 180],
];

/**
 * 가로형 로고 — 뷰박스를 **브라우저가 재서** 잉크에 딱 맞춘다.
 *
 * 생성기는 글자 폭을 알 수 없다. 추정해서 넣었더니 자산의 25%가 오른쪽 빈
 * 공간이었고(실측 495 중 콘텐츠가 372.9 에서 끝났다), 로고 파일의 여백은
 * 그것을 쓰는 모든 곳의 정렬을 틀리게 만든다.
 *
 * 게다가 **폰트가 없는 브라우저로 재면 값이 통째로 다르다** — 이 단계가
 * Pretendard 를 `FontFace` 로 먼저 심는 이유다. 시스템 산세리프로 잰 값을
 * 상수로 박았다면 조용히 틀렸을 것이다.
 */
const LOCKUPS = {
  'lockup': lockupSvg(),
  'lockup-light': lockupSvg({ tone: 'light' }),
  'lockup-dark': lockupSvg({ tone: 'dark' }),
  'lockup-compact': lockupSvg({ tagline: false }),
};

/** 가로형 로고 PNG — [이름, 높이(px)]. 폭은 비율대로 따라간다. */
const LOCKUP_RASTERS = [['lockup', 96], ['lockup@2x', 192], ['lockup-light@2x', 192], ['lockup-dark@2x', 192]];

const MONO = { 'icon-mono-light': monoIconSvg('light'), 'icon-mono-dark': monoIconSvg('dark') };

/** 비정사각 래스터 — [이름, 폭, 높이]. OG 카드는 layout.tsx 선언과 같은 1200×630. */
const WIDE = [['og-image', ogImageSvg(), 1200, 630]];

const FONT_B64 = readFileSync('node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2').toString('base64');

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
const d = await (await fetch('/data')).json();

// 진짜 폰트를 먼저 심는다 — 없는 채로 재면 글자 폭이 통째로 다르다.
const font = new FontFace('Pretendard Variable',
  'url(data:font/woff2;base64,' + d.font + ') format("woff2")', { weight: '100 900' });
await font.load(); document.fonts.add(font); await document.fonts.ready;

const render = async (svgText, w, h) => {
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(url);
  return c.toDataURL('image/png').split(',')[1];
};

/** 잉크 바운딩박스를 재서 뷰박스를 딱 맞춘다. 광학 여백 0 — 로고 파일은 잉크가 경계다. */
const tighten = (svgText) => {
  const holder = document.createElement('div');
  holder.style.cssText = 'position:absolute;left:-9999px;top:0';
  holder.innerHTML = svgText;
  document.body.appendChild(holder);
  const svg = holder.querySelector('svg');
  const b = svg.getBBox();
  const vb = [b.x, b.y, b.width, b.height].map((n) => Math.round(n * 100) / 100);
  holder.remove();
  return svgText.replace(/viewBox="[^"]*"/, 'viewBox="' + vb.join(' ') + '"');
};

const png = {}, svgs = {};
for (const [name, variant, size] of d.plan) png[name] = await render(d.variants[variant], size, size);
for (const [name, body] of Object.entries(d.mono)) png[name] = await render(body, 512, 512);
for (const [name, body, w, h] of d.wide) png[name] = await render(body, w, h);
for (const [name, body] of Object.entries(d.lockups)) svgs[name] = tighten(body);
for (const [name, height] of d.lockupRasters) {
  const key = name.replace('@2x', '');
  const svg = svgs[key];
  const vb = svg.match(/viewBox="([^"]*)"/)[1].split(' ').map(Number);
  png[name] = await render(svg, Math.round(height * vb[2] / vb[3]), height);
}
await fetch('/save', { method: 'POST', body: JSON.stringify({ png, svgs }) });
document.getElementById('s').textContent =
  '완료 — PNG ' + Object.keys(png).length + '개, SVG ' + Object.keys(svgs).length + '개. 창을 닫아도 됩니다.';
</script></body>`;

const server = createServer((req, res) => {
  if (req.url === '/data') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      variants: VARIANTS, plan: RASTER_PLAN, lockups: LOCKUPS,
      lockupRasters: LOCKUP_RASTERS, mono: MONO, wide: WIDE, font: FONT_B64,
    }));
    return;
  }
  if (req.url === '/save' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const { png, svgs } = JSON.parse(body);
      mkdirSync(OUT, { recursive: true });
      for (const [name, b64] of Object.entries(png)) {
        writeFileSync(`${OUT}/${name}.png`, Buffer.from(b64, 'base64'));
      }
      // 뷰박스가 잉크에 맞춰진 가로형 로고를 public 으로 되돌려 쓴다.
      mkdirSync('public/brand', { recursive: true });
      for (const [name, text] of Object.entries(svgs)) {
        writeFileSync(`public/brand/${name}.svg`, text.endsWith('\n') ? text : `${text}\n`);
      }
      console.log(`[brand-raster] PNG ${Object.keys(png).length}개 → ${OUT}, 가로형 로고 SVG ${Object.keys(svgs).length}개 → public/brand`);
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
