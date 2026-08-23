/**
 * Brand asset rasteriser — bakes the SVGs `build-brand-assets.mjs` produces into
 * PNGs at exact pixel sizes.
 *
 * **Why a browser.** To avoid adding an image rasterising dependency (sharp, resvg,
 * librsvg) to the repository (`forbidden.md` — a new dependency needs a reason).
 * Instead it borrows the canvas of the Chrome already used for development: this
 * script briefly starts a local server, the browser draws the SVG and POSTs it as
 * base64, and it is written to a file here.
 *
 * So it **does not run automatically** — a person runs it once when the icons
 * change. The outputs (PNG, icns, ico) are committed, so the build does not depend
 * on this script.
 *
 * Usage:
 *   node scripts/build-brand-raster.mjs        # start the server and wait
 *   → open http://127.0.0.1:8231/ in a browser; it bakes and POSTs automatically
 */
import { createServer } from 'node:http';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { appIconSvg, markSvg, lockupSvg, monoIconSvg, ogImageSvg } from './build-brand-assets.mjs';

const PORT = 8231;
const OUT = '.qa-scratch/brand/png';

/** The spec's wiring table — which artwork each size uses lives here in one place. */
const RASTER_PLAN = [
  ['icon-1024', 'full', 1024], ['icon-512', 'full', 512], ['icon-256', 'full', 256],
  ['icon-128', 'full', 128], ['icon-64', 'nodash', 64], ['icon-48', 'compact', 48],
  ['icon-32', 'compact', 32], ['icon-16', 'micro', 16],
  // The @2x pairs — retina draws **the same artwork at twice the resolution**, not a
  // different artwork. Putting the abbreviated form in icon_16x16@2x changes the
  // artwork at the same logical size.
  ['micro-32', 'micro', 32], ['compact-64', 'compact', 64],
  ['tile-310', 'nodash', 310], ['tile-284', 'nodash', 284], ['tile-150', 'nodash', 150],
  ['tile-142', 'nodash', 142], ['tile-107', 'nodash', 107], ['tile-89', 'nodash', 89],
  ['tile-71', 'nodash', 71], ['tile-50', 'compact', 50], ['tile-44', 'compact', 44],
  ['tile-30', 'compact', 30], ['apple-180', 'apple', 180],
];

/**
 * The horizontal logo — the viewBox is **measured by the browser** to fit the ink
 * exactly.
 *
 * The generator cannot know the text width. Estimating it left 25% of the asset as
 * empty space on the right (measured: content ended at 372.9 of 495), and padding
 * inside a logo file misaligns everywhere that logo is used.
 *
 * Also, **measuring in a browser without the font gives a completely different
 * value** — which is why this step installs Pretendard through `FontFace` first.
 * Pinning a value measured with the system sans-serif would have been silently
 * wrong.
 */
const LOCKUPS = {
  'lockup': lockupSvg(),
  'lockup-light': lockupSvg({ tone: 'light' }),
  'lockup-dark': lockupSvg({ tone: 'dark' }),
  'lockup-compact': lockupSvg({ tagline: false }),
};

/** Horizontal logo PNGs — [name, height in px]. Width follows the aspect ratio. */
const LOCKUP_RASTERS = [['lockup', 96], ['lockup@2x', 192], ['lockup-light@2x', 192], ['lockup-dark@2x', 192]];

const MONO = { 'icon-mono-light': monoIconSvg('light'), 'icon-mono-dark': monoIconSvg('dark') };

/** Non-square rasters — [name, width, height]. The OG card is 1200×630, matching the layout.tsx declaration. */
const WIDE = [['og-image', ogImageSvg(), 1200, 630]];

export const RASTER_OUTPUT_NAMES = Object.freeze({
  png: Object.freeze([
    ...RASTER_PLAN.map(([name]) => name),
    ...Object.keys(MONO),
    ...WIDE.map(([name]) => name),
    ...LOCKUP_RASTERS.map(([name]) => name),
  ]),
  svg: Object.freeze(Object.keys(LOCKUPS)),
});

const FONT_B64 = readFileSync('node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2').toString('base64');

const VARIANTS = {
  full: appIconSvg(),
  nodash: appIconSvg({ withDash: false }),
  compact: appIconSvg({ detail: 'compact' }),
  micro: appIconSvg({ detail: 'micro' }),
  // iOS rounds the corners itself, so the plate is given as a full-bleed square.
  apple: appIconSvg().replace(/rx="186" ry="186"/, 'rx="0" ry="0"')
    .replace(/x="100" y="100" width="824" height="824"/, 'x="0" y="0" width="1024" height="1024"'),
  bare: markSvg('full'),
};

const MAX_SAVE_BODY_BYTES = 64 * 1024 * 1024;
const pageForSaveToken = (saveToken) => `<!doctype html><meta charset="utf-8"><body style="background:#111;color:#888;font:13px system-ui">
<p id="s">굽는 중…</p><script type="module">
const d = await (await fetch('/data')).json();
const saveToken = ${JSON.stringify(saveToken)};

// Install the real font first — measuring without it gives a completely different text width.
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

/** Measures the ink bounding box and fits the viewBox to it. Zero optical padding — in a logo file the ink is the boundary. */
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
await fetch('/save?token=' + encodeURIComponent(saveToken), {
  method: 'POST', body: JSON.stringify({ png, svgs }),
});
document.getElementById('s').textContent =
  '완료 — PNG ' + Object.keys(png).length + '개, SVG ' + Object.keys(svgs).length + '개. 창을 닫아도 됩니다.';
</script></body>`;

function assertExactOutputNames(record, expectedNames, label) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error(`${label} outputs must be an object`);
  }
  const expected = new Set(expectedNames);
  for (const name of Object.keys(record)) {
    if (!expected.has(name)) throw new Error(`unexpected ${label} output name: ${name}`);
  }
  for (const name of expectedNames) {
    if (!Object.hasOwn(record, name)) throw new Error(`missing ${label} output name: ${name}`);
  }
}

export function saveRasterPayload(payload, { pngOut = OUT, brandOut = 'public/brand' } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('raster payload must be an object');
  }
  const { png, svgs } = payload;
  assertExactOutputNames(png, RASTER_OUTPUT_NAMES.png, 'PNG');
  assertExactOutputNames(svgs, RASTER_OUTPUT_NAMES.svg, 'SVG');

  const decodedPng = new Map();
  for (const name of RASTER_OUTPUT_NAMES.png) {
    if (typeof png[name] !== 'string') throw new Error(`PNG output must be base64 text: ${name}`);
    const bytes = Buffer.from(png[name], 'base64');
    if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
      throw new Error(`PNG output has an invalid signature: ${name}`);
    }
    decodedPng.set(name, bytes);
  }
  for (const name of RASTER_OUTPUT_NAMES.svg) {
    if (typeof svgs[name] !== 'string' || !/^\s*<svg(?:\s|>)/.test(svgs[name])) {
      throw new Error(`SVG output is invalid: ${name}`);
    }
  }

  mkdirSync(pngOut, { recursive: true });
  for (const [name, bytes] of decodedPng) {
    writeFileSync(`${pngOut}/${name}.png`, bytes);
  }
  mkdirSync(brandOut, { recursive: true });
  for (const name of RASTER_OUTPUT_NAMES.svg) {
    const text = svgs[name];
    writeFileSync(`${brandOut}/${name}.svg`, text.endsWith('\n') ? text : `${text}\n`);
  }
  return { png: decodedPng.size, svg: RASTER_OUTPUT_NAMES.svg.length };
}

export function createBrandRasterServer({
  saveToken = randomUUID(),
  pngOut = OUT,
  brandOut = 'public/brand',
} = {}) {
  const page = pageForSaveToken(saveToken);
  const server = createServer((req, res) => {
    const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (requestUrl.pathname === '/data') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        variants: VARIANTS, plan: RASTER_PLAN, lockups: LOCKUPS,
        lockupRasters: LOCKUP_RASTERS, mono: MONO, wide: WIDE, font: FONT_B64,
      }));
      return;
    }
    if (requestUrl.pathname === '/save' && req.method === 'POST') {
      if (requestUrl.searchParams.get('token') !== saveToken) {
        res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }).end('forbidden');
        return;
      }
      let body = '';
      let bodyBytes = 0;
      req.on('data', (chunk) => {
        bodyBytes += chunk.length;
        if (bodyBytes <= MAX_SAVE_BODY_BYTES) body += chunk;
      });
      req.on('end', () => {
        if (bodyBytes > MAX_SAVE_BODY_BYTES) {
          res.writeHead(413, { 'content-type': 'text/plain; charset=utf-8' }).end('payload too large');
          return;
        }
        try {
          const saved = saveRasterPayload(JSON.parse(body), { pngOut, brandOut });
          console.log(`[brand-raster] PNG ${saved.png}개 → ${pngOut}, 가로형 로고 SVG ${saved.svg}개 → ${brandOut}`);
          res.writeHead(200).end('ok');
          server.close();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[brand-raster] save rejected: ${message}`);
          res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('invalid payload');
        }
      });
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page);
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createBrandRasterServer();
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[brand-raster] http://127.0.0.1:${PORT}/ 를 브라우저로 여세요`);
  });
}
