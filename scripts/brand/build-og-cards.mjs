#!/usr/bin/env node
/**
 * Bakes the 1200x630 link-preview card for each locale into `public/og/<locale>.png`, and the
 * English card into `public/og-image.png` for the root layout and `x-default`.
 *
 * The headline and the fact line are read from `messages/<locale>/download.json` on every run,
 * so a copy change regenerates the same layout. Moru is the presentation master enlarged three
 * times with nearest-neighbour sampling and placed at (106, 123): the same whole pixels
 * `build-brand-raster.test.mjs` audits in the Open Graph image.
 *
 * Japanese and Chinese draw kana and Han from the operating system face, as the site does
 * (`app/styles/lang-cjk.css`); run it on macOS, where Hiragino Sans and PingFang SC exist.
 *
 * Usage: node scripts/brand/build-og-cards.mjs [--out <dir>]
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next/package.json'))('sharp');

const LOCALES = ['en', 'ko', 'ja', 'zh'];
const WIDTH = 1200;
const HEIGHT = 630;
const MORU = { path: 'assets/brand/mascot/mascot-presentation-128.png', scale: 3, x: 106, y: 123 };
const PLATFORMS = 'macOS · Windows';

const LANG = { en: 'en', ko: 'ko', ja: 'ja', zh: 'zh-Hans' };
const CJK_STACK = {
  en: '',
  ko: '',
  ja: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", "Noto Sans CJK JP",',
  zh: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Noto Sans CJK SC",',
};
const LATIN_RANGE = 'U+0000-024F, U+2000-206F, U+20A0-20CF, U+2100-214F, U+2190-21FF';

/*
 * A faint constellation: map nodes and the lines between them, kept sparse behind the
 * headline so the copy keeps its contrast. Coordinates are card pixels.
 */
const NODES = [
  [70, 96, 3], [188, 62, 2.5], [318, 112, 4], [446, 70, 2.5], [252, 196, 2],
  [56, 268, 2.5], [92, 432, 3.5], [212, 520, 2.5], [356, 566, 3], [486, 486, 2.5],
  [520, 152, 2], [640, 584, 2.5], [812, 548, 3], [968, 590, 2.5], [1104, 512, 3.5],
  [1150, 402, 2], [1146, 214, 3], [1068, 72, 2.5], [900, 44, 2], [742, 96, 2.5],
  [30, 590, 2], [1180, 618, 2], [620, 40, 2],
];
const EDGES = [
  [0, 1], [1, 2], [2, 3], [2, 4], [4, 0], [0, 5], [5, 6], [6, 7], [7, 8], [8, 9],
  [3, 10], [10, 22], [22, 19], [19, 18], [18, 17], [17, 16], [16, 15], [15, 14],
  [14, 13], [13, 12], [12, 11], [11, 9], [6, 20], [14, 21], [4, 5],
];
/** Nodes that carry a soft light, as the map lights the concepts a commit touched. */
const LIT = new Set([2, 6, 12, 16]);

function messagesFor(locale) {
  const file = join(ROOT, 'messages', locale, 'download.json');
  const json = JSON.parse(readFileSync(file, 'utf8'));
  for (const key of ['heroTitleLine1', 'heroTitleLine2', 'eyebrow']) {
    if (typeof json[key] !== 'string' || !json[key].trim()) throw new Error(`${file} lacks ${key}`);
  }
  return { line1: json.heroTitleLine1, line2: json.heroTitleLine2, fact: `${json.eyebrow} · ${PLATFORMS}` };
}

const escapeHtml = (text) =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const dataUrl = (buffer, type) => `data:${type};base64,${buffer.toString('base64')}`;

async function moruDataUrl() {
  const file = join(ROOT, MORU.path);
  const { width, height } = await sharp(file).metadata();
  const scaled = await sharp(file)
    .resize(width * MORU.scale, height * MORU.scale, { kernel: 'nearest' })
    .png()
    .toBuffer();
  return { url: dataUrl(scaled, 'image/png'), width: width * MORU.scale, height: height * MORU.scale };
}

async function compassDataUrl() {
  const scaled = await sharp(join(ROOT, 'public/brand/icon-dark.png')).resize(96, 96).png().toBuffer();
  return dataUrl(scaled, 'image/png');
}

function constellationSvg() {
  const lines = EDGES.map(([a, b]) => {
    const [x1, y1] = NODES[a];
    const [x2, y2] = NODES[b];
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }).join('');
  const halos = [...LIT].map((i) => `<circle cx="${NODES[i][0]}" cy="${NODES[i][1]}" r="22" fill="url(#halo)"/>`).join('');
  const dots = NODES.map(([x, y, r], i) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${LIT.has(i) ? '#c9cfff' : 'rgba(201,207,255,0.5)'}"/>`,
  ).join('');
  return `<svg class="constellation" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <defs><radialGradient id="halo"><stop offset="0" stop-color="#8b97ff" stop-opacity="0.55"/><stop offset="1" stop-color="#8b97ff" stop-opacity="0"/></radialGradient></defs>
    <g stroke="rgba(139,151,255,0.22)" stroke-width="1.25">${lines}</g>${halos}${dots}</svg>`;
}

function cardHtml({ locale, copy, fontUrl, moru, compass }) {
  const stack = `"OG Latin", ${locale === 'ko' ? '"OG Sans",' : ''} ${CJK_STACK[locale]} "OG Sans", sans-serif`;
  return `<!doctype html><html lang="${LANG[locale]}"><head><meta charset="utf-8"><style>
@font-face { font-family: "OG Sans"; src: url(${fontUrl}) format("woff2"); font-weight: 100 900; }
@font-face { font-family: "OG Latin"; src: url(${fontUrl}) format("woff2"); font-weight: 100 900; unicode-range: ${LATIN_RANGE}; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
body {
  position: relative; font-family: ${stack}; color: #f3f1ea; -webkit-font-smoothing: antialiased;
  background:
    radial-gradient(520px 420px at 300px 330px, rgba(94,106,210,0.34), rgba(94,106,210,0) 70%),
    radial-gradient(640px 360px at 1120px -40px, rgba(113,112,255,0.16), rgba(113,112,255,0) 70%),
    radial-gradient(700px 300px at 760px 700px, rgba(94,106,210,0.12), rgba(94,106,210,0) 70%),
    linear-gradient(160deg, #0d0f1a 0%, #090a12 48%, #07080b 100%);
}
.constellation { position: absolute; inset: 0; }
.floor { position: absolute; left: 156px; top: 384px; width: 300px; height: 44px; border-radius: 50%;
  background: radial-gradient(closest-side, rgba(139,151,255,0.30), rgba(139,151,255,0)); }
.moru { position: absolute; left: ${MORU.x}px; top: ${MORU.y}px; width: ${moru.width}px; height: ${moru.height}px; image-rendering: pixelated; }
.copy { position: absolute; left: 496px; right: 72px; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: center; }
.brand { display: flex; align-items: center; gap: 14px; font-weight: 650; font-size: 30px; letter-spacing: -0.01em; color: #e9e7e0; }
.brand img { width: 48px; height: 48px; }
h1 { margin-top: 40px; font-weight: 720; line-height: 1.16; letter-spacing: -0.025em; white-space: nowrap; }
h1 span { display: block; width: max-content; }
h1 .second { background: linear-gradient(90deg, #d4d8ff 0%, #9aa5ff 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
html:lang(ko) h1, html:lang(ja) h1, html:lang(zh-Hans) h1 { letter-spacing: -0.01em; line-height: 1.24; }
html:lang(ja) h1, html:lang(zh-Hans) h1 { font-feature-settings: "palt"; letter-spacing: 0; }
.fact { margin-top: 34px; display: flex; align-items: center; gap: 14px; font-size: 26px; font-weight: 560; color: rgba(233,231,224,0.72); }
.fact::before { content: ""; width: 10px; height: 10px; border-radius: 50%; background: #8b97ff; box-shadow: 0 0 12px 3px rgba(139,151,255,0.55); }
</style></head><body>
${constellationSvg()}
<div class="floor"></div>
<img class="moru" src="${moru.url}" alt="">
<div class="copy">
  <div class="brand"><img src="${compass}" alt="">Ontology Atlas</div>
  <h1 id="headline"><span>${escapeHtml(copy.line1)}</span><span class="second">${escapeHtml(copy.line2)}</span></h1>
  <div class="fact">${escapeHtml(copy.fact)}</div>
</div>
</body></html>`;
}

/**
 * Largest headline size, from 68px down, whose longer line fits the copy column. A full-width
 * comma or full stop ending a line may hang by half its em box, where it draws no ink.
 */
async function fitHeadline(page) {
  return page.evaluate(() => {
    const headline = document.getElementById('headline');
    const column = headline.parentElement.clientWidth;
    const inkWidth = (line) => {
      const text = line.firstChild;
      const width = line.getBoundingClientRect().width;
      if (!text || !/[、。，．]$/.test(text.data)) return width;
      const range = document.createRange();
      range.setStart(text, text.data.length - 1);
      range.setEnd(text, text.data.length);
      return width - range.getBoundingClientRect().width / 2;
    };
    let size = 68;
    for (; size > 40; size -= 1) {
      headline.style.fontSize = `${size}px`;
      if (Math.max(...[...headline.children].map(inkWidth)) <= column) break;
    }
    return size;
  });
}

async function main() {
  const outArg = process.argv.indexOf('--out');
  const outDir = outArg > -1 ? process.argv[outArg + 1] : join(ROOT, 'public', 'og');
  mkdirSync(outDir, { recursive: true });

  const fontUrl = dataUrl(
    readFileSync(join(ROOT, 'node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2')),
    'font/woff2',
  );
  const moru = await moruDataUrl();
  const compass = await compassDataUrl();

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    for (const locale of LOCALES) {
      const copy = messagesFor(locale);
      await page.setContent(cardHtml({ locale, copy, fontUrl, moru, compass }), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const size = await fitHeadline(page);
      const shot = await page.screenshot({ type: 'png' });
      // Full colour: a 256-colour palette moves Moru's rarest ink, which the raster test audits.
      const png = await sharp(shot).png({ compressionLevel: 9 }).toBuffer();
      const target = join(outDir, `${locale}.png`);
      writeFileSync(target, png);
      if (locale === 'en' && outArg === -1) writeFileSync(join(ROOT, 'public', 'og-image.png'), png);
      console.log(`[og] ${relative(ROOT, target)} ${Math.round(png.length / 1024)} KB, headline ${size}px`);
    }
  } finally {
    await browser.close();
  }
}

await main();
