#!/usr/bin/env node
/**
 * Bakes the 1200x630 link-preview card for each locale into `public/og/<locale>.png`, and the
 * English card into `public/og-image.png` for the root layout and `x-default`.
 *
 * The picture is this repository's own ontology: the map `/download` films, laid out by the same
 * `buildFilmScene` from the same bundled vault, drawn flat (indigo marks, thin lines, the amber
 * project hub, the domain names). Moru sits at the map's left edge facing it. The headline and
 * the fact line are read from `messages/<locale>/download.json` on every run, so a copy or vault
 * change regenerates the same layout.
 *
 * Moru is the presentation master enlarged four times with nearest-neighbour sampling at
 * `MORU`: the same whole pixels `build-brand-raster.test.mjs` audits in the Open Graph image.
 * Moru's face and the centred headline stay inside the middle 630x630 square, which some apps
 * crop a link card to; only Japanese's longer first line runs past it.
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
import { createServer } from 'vite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next/package.json'))('sharp');

const LOCALES = ['en', 'ko', 'ja', 'zh'];
const WIDTH = 1200;
const HEIGHT = 630;
const MORU = { path: 'assets/brand/mascot/mascot-presentation-128.png', scale: 4, x: 70, y: 232 };
const PLATFORMS = 'macOS · Windows';

/** Values of `app/styles/tokens.css` and `base-map-tokens.css` (dark), which a raster cannot read. */
const INK = {
  canvas: '#0b0b0a',
  primary: '#f3f2ee',
  secondary: '#d2d0c9',
  tertiary: '#a4a29b',
  indigoBright: '#8890e0',
  amberHub: '#d4b478',
};

/** The hub's place and the map's reach; wider than tall, as the film draws it. */
const MAP = { cx: 900, cy: 500, rx: 356, ry: 158 };
/** Mark radius by kind, the film's wide-stage sizes. */
const MARK = { project: 7, domain: 5.5, capability: 3.6, element: 2.6 };

const LANG = { en: 'en', ko: 'ko', ja: 'ja', zh: 'zh-Hans' };
const CJK_STACK = {
  en: '',
  ko: '',
  ja: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", "Noto Sans CJK JP",',
  zh: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Noto Sans CJK SC",',
};
const LATIN_RANGE = 'U+0000-024F, U+2000-206F, U+20A0-20CF, U+2100-214F, U+2190-21FF';
const SRC_ALIASES = ['app-providers:app', 'views', 'widgets', 'features', 'entities', 'shared', 'i18n'];

function messagesFor(locale) {
  const file = join(ROOT, 'messages', locale, 'download.json');
  const json = JSON.parse(readFileSync(file, 'utf8'));
  for (const key of ['heroTitleLine1', 'heroTitleLine2', 'eyebrow']) {
    if (typeof json[key] !== 'string' || !json[key].trim()) throw new Error(`${file} lacks ${key}`);
  }
  return { line1: json.heroTitleLine1, line2: json.heroTitleLine2, fact: `${json.eyebrow} · ${PLATFORMS}` };
}

/**
 * The film's scene of the bundled vault (`src/entities/docs-vault/data/manifest.json`, written by
 * `pnpm docs-vault:build`), loaded through Vite so the TypeScript the page runs is the code that
 * lays this map out. Names per locale follow the page: `display_<locale>`, else the display title.
 */
async function loadMapScene() {
  const alias = SRC_ALIASES.map((entry) => {
    const [name, dir = name] = entry.split(':');
    return { find: `@/${name}`, replacement: join(ROOT, 'src', dir) };
  });
  alias.push({ find: /^@\//, replacement: `${ROOT}/` });
  const server = await createServer({
    root: ROOT,
    configFile: false,
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false, watch: null },
    resolve: { alias },
  });
  try {
    const { deriveOntologyFromVault } = await server.ssrLoadModule('/src/entities/docs-vault/lib/derive-ontology-from-vault.ts');
    const { buildStageGraph } = await server.ssrLoadModule('/src/views/download/lib/stage-graph.ts');
    const { buildFilmScene, crossesClusters } = await server.ssrLoadModule('/src/views/download/lib/film/film-scene.ts');
    const manifest = JSON.parse(readFileSync(join(ROOT, 'src/entities/docs-vault/data/manifest.json'), 'utf8'));
    const derived = deriveOntologyFromVault(manifest);
    const evidence = (stub) => (stub.sourceSlug ? [stub.sourceSlug] : []);
    const nodes = derived.nodes.map((stub) => ({
      id: stub.id, title: stub.title, display: stub.display, kind: stub.kind, projectIds: [], evidenceIds: evidence(stub),
    }));
    const edges = derived.edges.map((stub) => ({
      id: stub.id, from: stub.from, to: stub.to, type: stub.type, projectIds: [], evidenceIds: evidence(stub),
    }));
    const scene = buildFilmScene(buildStageGraph(nodes, edges));
    if (scene.nodes.length === 0) throw new Error('the bundled vault has no map; run pnpm docs-vault:build');
    const byId = new Map(derived.nodes.map((stub) => [stub.id, stub]));
    const nameIn = (id, locale) => {
      const stub = byId.get(id);
      return stub?.displayLocales?.[locale] || stub?.display || id;
    };
    return { scene, bowed: scene.edges.map((edge) => crossesClusters(scene, edge)), nameIn };
  } finally {
    await server.close();
  }
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

const round = (value) => Math.round(value * 10) / 10;

/** The film's line: straight, or a quadratic curve bowed 18% away from the hub between clusters. */
function edgePath(a, b, bowed) {
  if (!bowed) return `M${round(a.x)} ${round(a.y)}L${round(b.x)} ${round(b.y)}`;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  let ox = mx - MAP.cx;
  let oy = my - MAP.cy;
  if (Math.hypot(ox, oy) < 1) [ox, oy] = [-(b.y - a.y), b.x - a.x];
  const n = Math.hypot(ox, oy) || 1;
  return `M${round(a.x)} ${round(a.y)}Q${round(mx + (ox / n) * len * 0.18)} ${round(my + (oy / n) * len * 0.18)} ${round(b.x)} ${round(b.y)}`;
}

/** Region names: the domains of the first ring, centred above their marks. */
function regionLabels(scene, at, locale, nameIn) {
  return scene.nodes
    .map((node, i) => ({ node, i }))
    .filter(({ node }) => node.kind === 'domain' && node.depth === 1)
    .map(({ node, i }) => {
      return `<text x="${round(at[i].x)}" y="${round(at[i].y - 13)}" text-anchor="middle">${escapeHtml(nameIn(node.id, locale))}</text>`;
    })
    .join('');
}

function mapSvg({ scene, bowed, nameIn }, locale) {
  const at = scene.nodes.map((node) => ({ x: MAP.cx + node.x * MAP.rx, y: MAP.cy + node.y * MAP.ry }));
  const lines = (contains) =>
    scene.edges
      .map((edge, k) => (edge.contains === contains ? edgePath(at[edge.from], at[edge.to], bowed[k]) : ''))
      .join('');
  const marks = scene.nodes
    .map((node, i) => ({ node, i }))
    .filter(({ node }) => node.depth !== 0)
    .map(({ node, i }) => `<circle cx="${round(at[i].x)}" cy="${round(at[i].y)}" r="${MARK[node.kind] ?? MARK.element}"/>`)
    .join('');
  const hub = scene.nodes.findIndex((node) => node.depth === 0);
  const hubMark = hub < 0 ? '' : `<circle cx="${round(at[hub].x)}" cy="${round(at[hub].y)}" r="${MARK.project + 1}" fill="${INK.amberHub}"/>`;
  return `<svg class="map" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true">
    <path d="${lines(false)}" fill="none" stroke="${INK.indigoBright}" stroke-opacity="0.2" stroke-width="1"/>
    <path d="${lines(true)}" fill="none" stroke="${INK.primary}" stroke-opacity="0.26" stroke-width="1"/>
    <g fill="${INK.indigoBright}">${marks}</g>${hubMark}
    <g class="regions">${regionLabels(scene, at, locale, nameIn)}</g></svg>`;
}

function cardHtml({ locale, copy, fontUrl, moru, compass, map }) {
  const stack = `"OG Latin", ${locale === 'ko' ? '"OG Sans",' : ''} ${CJK_STACK[locale]} "OG Sans", sans-serif`;
  return `<!doctype html><html lang="${LANG[locale]}"><head><meta charset="utf-8"><style>
@font-face { font-family: "OG Sans"; src: url(${fontUrl}) format("woff2"); font-weight: 100 900; }
@font-face { font-family: "OG Latin"; src: url(${fontUrl}) format("woff2"); font-weight: 100 900; unicode-range: ${LATIN_RANGE}; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
body { position: relative; font-family: ${stack}; color: ${INK.primary}; -webkit-font-smoothing: antialiased; background: ${INK.canvas}; }
.light { position: absolute; inset: 0; background: radial-gradient(520px 300px at ${MAP.cx}px ${MAP.cy}px, rgba(94,106,210,0.16), rgba(94,106,210,0) 72%); }
.map { position: absolute; inset: 0; }
.regions { font-size: 17px; font-weight: 600; fill: ${INK.secondary}; stroke: ${INK.canvas}; stroke-width: 6px; stroke-linejoin: round; paint-order: stroke; }
.moru { position: absolute; left: ${MORU.x}px; top: ${MORU.y}px; width: ${moru.width}px; height: ${moru.height}px; image-rendering: pixelated; }
.copy { position: absolute; left: 64px; right: 64px; top: 44px; display: flex; flex-direction: column; align-items: center; text-align: center; }
.brand { display: flex; align-items: center; gap: 12px; font-weight: 650; font-size: 28px; letter-spacing: -0.01em; color: ${INK.secondary}; }
.brand img { width: 44px; height: 44px; }
h1 { margin-top: 26px; font-weight: 720; line-height: 1.12; letter-spacing: -0.025em; white-space: nowrap; }
h1 span { display: block; width: max-content; margin: 0 auto; }
h1 .first { color: ${INK.secondary}; }
html:lang(ko) h1, html:lang(ja) h1, html:lang(zh-Hans) h1 { letter-spacing: -0.01em; line-height: 1.16; }
html:lang(ja) h1, html:lang(zh-Hans) h1 { font-feature-settings: "palt"; letter-spacing: 0; }
.fact { margin-top: 18px; font-size: 28px; font-weight: 560; color: ${INK.tertiary}; }
</style></head><body>
<div class="light"></div>
${map}
<img class="moru" src="${moru.url}" alt="">
<div class="copy">
  <div class="brand"><img src="${compass}" alt="">Ontology Atlas</div>
  <h1 id="headline"><span class="first">${escapeHtml(copy.line1)}</span><span>${escapeHtml(copy.line2)}</span></h1>
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
  const scene = await loadMapScene();

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    for (const locale of LOCALES) {
      const copy = messagesFor(locale);
      await page.setContent(cardHtml({ locale, copy, fontUrl, moru, compass, map: mapSvg(scene, locale) }), { waitUntil: 'load' });
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
