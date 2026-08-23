/**
 * Brand asset generator — **everything** derives from the coordinates in
 * `src/shared/ui/brand-mark.tsx`.
 *
 * The assets are spread across eight places (icns, ico, 4 pngs, Windows tile,
 * favicon, apple-touch, master SVG), and hand-making each one guarantees some of
 * them fall behind on the next change. So one component owns the coordinates and
 * this script stamps out the rest.
 *
 * Rasterising uses the browser's (Chrome) canvas so the repository gains no new
 * image dependency. That is why this script emits **SVG only**; assembling
 * PNG/icns/ico is `scripts/build-brand-raster.mjs`.
 *
 * Spec source: `docs/DECISIONS.md` 「brand mark overlapping hexagon enforcement spec」 (the
 * nested-hexagon brand mark enforcement spec).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const V = 512;
const OUTER = 'M 256 56 L 429.2 156 L 429.2 356 L 256 456 L 82.8 356 L 82.8 156 Z';
const DASHED = 'M 256 100 L 391.1 178 L 391.1 334 L 256 412 L 120.9 334 L 120.9 178 Z';
const MID = 'M 256 144 L 353 200 L 353 312 L 256 368 L 159 312 L 159 200 Z';
const CORE = 'M 256 208 L 297.6 232 L 297.6 280 L 256 304 L 214.4 280 L 214.4 232 Z';
const MICRO_CORE = 'M 256 152 L 346.1 204 L 346.1 308 L 256 360 L 165.9 308 L 165.9 204 Z';
const SPOKES = [
  [256, 56, 256, 144],
  [429.2, 356, 353, 312],
  [82.8, 356, 159, 312],
];
const NODES = [
  [256, 144],
  [353, 312],
  [159, 312],
];

/**
 * Stroke widths — **must equal** `BRAND_STROKES` in
 * `src/shared/ui/brand-mark.tsx`.
 *
 * A .mjs file cannot import a .tsx one, so the values are duplicated. Duplicates
 * always drift, so `tests/contract/brand-asset-parity.contract.test.ts` locks
 * them by comparing the SVG both sides actually draw — an **output** comparison
 * rather than a value comparison, which also catches keeping the values in sync
 * while changing something else.
 */
export const STROKES = {
  outer: 18,
  dashed: 6,
  mid: 13,
  core: 19,
  spoke: 13,
  node: 23,
  compactOuter: 34,
  compactMid: 24,
  compactNode: 34,
  microOuter: 64,
};

/**
 * Solid brand colour — equals the component's `BRAND_MARK_SOLID`.
 *
 * On the morning of 2026-08-18 this moved from indigo to ember (`#C14A24`) and
 * **the owner reverted it the same day**. Baked assets (icon, favicon, og) cannot
 * follow a runtime accent switch, so the colour in the Dock is always whichever
 * single value is chosen here — once the default accent returned to indigo this
 * had to return with it, otherwise the app is indigo inside while the Dock icon
 * alone is copper.
 */
const BRAND_SOLID = '#5E6AD2';

/**
 * Single-hue ramp for brand assets only — the exemption `forbidden.md` opens
 * for "outside app screens (OS icon, favicon, og), and only as a brightness ramp
 * of one colour".
 *
 * These values are a brightness ramp of one indigo, which is what keeps the
 * companion rule that `forbidden.md` pins: introducing a new colour, or a
 * gradient mixing several, is forbidden in brand assets too. (On 2026-08-18 it
 * went to the ember rotation `#E46238` → `#A83E1D` and came back when the accent
 * returned to indigo.)
 */
const GRADIENT_FROM = '#787EF6';
const GRADIENT_TO = '#3E4BDF';

/** The gradient is userSpaceOnUse — it runs along the mark's bounding-box diagonal. */
const gradientDef = (id) =>
  `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="82.8" y1="56" x2="429.2" y2="456">` +
  `<stop offset="0" stop-color="${GRADIENT_FROM}"/><stop offset="1" stop-color="${GRADIENT_TO}"/>` +
  `</linearGradient></defs>`;

/**
 * @param {'full'|'compact'|'micro'} detail
 * @param {{ paint?: string, withDash?: boolean }} opts  omitting paint uses the gradient
 */
export function markBody(detail, { paint, withDash = true } = {}) {
  const id = 'atlasMark';
  const stroke = paint ?? `url(#${id})`;
  const defs = paint ? '' : gradientDef(id);

  if (detail === 'micro') {
    return (
      defs +
      `<path d="${OUTER}" fill="none" stroke="${stroke}" stroke-width="${STROKES.microOuter}" stroke-linejoin="round"/>` +
      `<path d="${MICRO_CORE}" fill="${stroke}"/>`
    );
  }

  const isFull = detail === 'full';
  let out = defs;
  out += `<g fill="none" stroke="${stroke}" stroke-linejoin="round" stroke-linecap="round">`;
  out += `<path d="${OUTER}" stroke-width="${isFull ? STROKES.outer : STROKES.compactOuter}"/>`;
  if (isFull && withDash) {
    out += `<path d="${DASHED}" stroke-width="${STROKES.dashed}" stroke-dasharray="0.1 16" stroke-opacity="0.62"/>`;
  }
  out += `<path d="${MID}" stroke-width="${isFull ? STROKES.mid : STROKES.compactMid}"/>`;
  if (isFull) {
    out += `<path d="${CORE}" stroke-width="${STROKES.core}"/>`;
    for (const [x1, y1, x2, y2] of SPOKES) {
      out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${STROKES.spoke}"/>`;
    }
  }
  out += '</g>';
  out += `<g fill="${stroke}">`;
  for (const [cx, cy] of NODES) {
    out += `<circle cx="${cx}" cy="${cy}" r="${isFull ? STROKES.node : STROKES.compactNode}"/>`;
  }
  out += '</g>';
  return out;
}

export function markSvg(detail, opts = {}) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${V} ${V}" role="img" aria-label="Ontology Atlas">` +
    markBody(detail, opts) +
    '</svg>\n'
  );
}

/**
 * Vertical extent of the ink the mark actually paints (512 coordinate space) —
 * the outer hexagon plus half a stroke.
 *
 * **This, not the viewBox, is the mark's size.** Inside a 512 viewBox the ink is
 * only 418 tall (the hexagon is 400, the stroke ±9); the remaining 94 is empty
 * margin. Fitting the viewBox to 81% of the plate therefore renders a visible
 * mark of **65.8%** — exactly why the first implementation drew a "it's a bit
 * small" report.
 *
 * Ink height differs per detail level (compact and micro have thicker strokes).
 * Measuring by ink height keeps the **visible size constant** across the whole
 * ladder.
 */
const INK_HEIGHT = {
  full: 400 + STROKES.outer,
  compact: 400 + STROKES.compactOuter,
  micro: 400 + STROKES.microOuter,
};

/** Share of the plate the ink height occupies — the council's enforcement spec. */
const MARK_RATIO = 0.81;

/**
 * App icon — an 824 squircle (corner 186) on a 1024 canvas, with the mark at 81%
 * **measured by ink**.
 *
 * An icon's margin is a ratio against the OS grid, not a preference. The hexagon
 * is taller than wide, so height is the reference — measuring by width pushes the
 * height past the plate.
 */
export function appIconSvg({ detail = 'full', withDash = true } = {}) {
  const SIZE = 1024;
  const PLATE = 824;
  const PLATE_XY = (SIZE - PLATE) / 2;
  const scale = (PLATE * MARK_RATIO) / INK_HEIGHT[detail];
  // The ink centre coincides with the viewBox centre (256,256) — move it to the canvas centre.
  const t = SIZE / 2 - (V / 2) * scale;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="Ontology Atlas">` +
    `<defs><linearGradient id="plate" gradientUnits="userSpaceOnUse" x1="0" y1="${PLATE_XY}" x2="0" y2="${PLATE_XY + PLATE}">` +
    `<stop offset="0" stop-color="#15182C"/><stop offset="1" stop-color="#06081A"/></linearGradient></defs>` +
    `<rect x="${PLATE_XY}" y="${PLATE_XY}" width="${PLATE}" height="${PLATE}" rx="186" ry="186" fill="url(#plate)"/>` +
    `<g transform="translate(${t.toFixed(3)} ${t.toFixed(3)}) scale(${scale.toFixed(6)})">${markBody(detail, { withDash })}</g>` +
    '</svg>\n'
  );
}

/**
 * Monochrome icon — light and dark.
 *
 * For print, watermarks, and anywhere only one colour is available. Without the
 * gradient **the stroke is the only information channel**, so this always uses
 * the full detail level and inverts plate against mark. Brand indigo is not used
 * here: the point of monochrome is using no colour, and keeping indigo would make
 * it not monochrome but simply another colour variant.
 */
export function monoIconSvg(tone = 'light') {
  const plate = tone === 'light' ? '#FFFFFF' : '#0A0B14';
  const ink = tone === 'light' ? '#0A0B14' : '#FFFFFF';
  const SIZE = 1024;
  const PLATE = 824;
  const XY = (SIZE - PLATE) / 2;
  const scale = (PLATE * MARK_RATIO) / INK_HEIGHT.full;
  const t = SIZE / 2 - (V / 2) * scale;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="Ontology Atlas">` +
    `<rect x="${XY}" y="${XY}" width="${PLATE}" height="${PLATE}" rx="186" ry="186" fill="${plate}"/>` +
    `<g transform="translate(${t.toFixed(3)} ${t.toFixed(3)}) scale(${scale.toFixed(6)})">` +
    markBody('full', { paint: ink }) +
    '</g></svg>\n'
  );
}

/**
 * Horizontal lockup — mark + wordmark + tagline.
 *
 * **Proportions derive from the mark's ink.** The mark's ink height is 1, and the
 * wordmark, tagline, and gaps are sized against it. Fitting to the viewBox makes
 * the mark alone look small — the same trap as the icon above.
 *
 * **Why the text is not baked into paths.** Converting glyphs to outlines needs a
 * font-parser dependency (`forbidden.md` — a new dependency must state its
 * reason), and that is not worth it for one asset. Both forms ship instead: this
 * SVG keeps live text so it opens and edits anywhere, and where pixels must be
 * exact a browser-baked PNG with the real font is used. `docs/BRAND.md` decides
 * which one goes where.
 */
export function lockupSvg({ tone = 'brand', tagline = true } = {}) {
  const ink =
    tone === 'light' ? '#0A0B14' : tone === 'dark' ? '#FFFFFF' : 'url(#atlasMark)';
  const wordFill = tone === 'brand' ? '#F2F3F8' : ink;
  const taglineFill = tone === 'brand' ? BRAND_SOLID : ink;

  // One ink-height unit = 96px. The ratios are **measured off the sheet in
  // pixels**: mark:wordmark font ≈ 2.9:1, mark-to-text gap 0.25. The draft read it
  // as 2.4:1 and had the wordmark 29% and the gap 50% too large (cross-checked
  // 2026-07-30).
  const INK = 96;
  const scale = INK / INK_HEIGHT.full;
  const markW = (346.4 + STROKES.outer) * scale;
  const gap = INK * 0.25;
  const wordSize = INK * 0.33;
  const tagSize = INK * 0.185;
  const textX = markW + gap;
  const W = Math.round(textX + wordSize * 12);
  const H = Math.round(INK * (tagline ? 1.12 : 1));
  // Align the vertical centre of the mark's ink with the lockup's centre.
  const mt = H / 2 - (V / 2) * scale;
  const ml = -(82.8 - STROKES.outer / 2) * scale;
  const baseline = tagline ? H * 0.52 : H * 0.66;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ontology Atlas — Map your codebase knowledge.">` +
    `<g transform="translate(${ml.toFixed(2)} ${mt.toFixed(2)}) scale(${scale.toFixed(6)})">` +
    markBody('full', tone === 'brand' ? {} : { paint: ink }) +
    '</g>' +
    `<text x="${textX.toFixed(1)}" y="${baseline.toFixed(1)}" fill="${wordFill}" ` +
    `font-family="${FONT_STACK}" font-size="${wordSize.toFixed(1)}" font-weight="600" ` +
    `letter-spacing="-0.02em">Ontology Atlas</text>` +
    (tagline
      ? `<text x="${textX.toFixed(1)}" y="${(baseline + tagSize * 1.72).toFixed(1)}" fill="${taglineFill}" ` +
        `font-family="${FONT_STACK}" font-size="${tagSize.toFixed(1)}" font-weight="450">` +
        `Map your codebase knowledge.</text>`
      : '') +
    '</svg>\n'
  );
}

/**
 * OG card — the only image a link preview draws.
 *
 * The size is **exactly the 1200×630 declared in `app/layout.tsx`**. Previously
 * the declaration said 1200×630 while the file was 1536×1024, so the aspect
 * ratios disagreed (1.905 vs 1.5) and crawlers letterboxed or cropped it.
 *
 * Mark and text use the same proportional system as the lockup, but this card is
 * **read from further away** (a timeline thumbnail), so the tagline goes up one
 * step and the mark is set larger.
 */
export function ogImageSvg() {
  const W = 1200;
  const H = 630;
  const INK = 176;
  const scale = INK / INK_HEIGHT.full;
  const markW = (346.4 + STROKES.outer) * scale;
  const cx = W / 2;
  const wordSize = 82;
  const tagSize = 34;
  const markTop = H * 0.24;
  const mt = markTop - (56 - STROKES.outer / 2) * scale;
  const ml = cx - markW / 2 - (82.8 - STROKES.outer / 2) * scale;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ontology Atlas — Map your codebase knowledge.">` +
    `<rect width="${W}" height="${H}" fill="#08090A"/>` +
    `<g transform="translate(${ml.toFixed(2)} ${mt.toFixed(2)}) scale(${scale.toFixed(6)})">${markBody('full')}</g>` +
    `<text x="${cx}" y="${(markTop + INK + 108).toFixed(0)}" text-anchor="middle" fill="#F2F3F8" ` +
    `font-family="${FONT_STACK}" font-size="${wordSize}" font-weight="600" letter-spacing="-0.02em">Ontology Atlas</text>` +
    `<text x="${cx}" y="${(markTop + INK + 108 + tagSize * 1.85).toFixed(0)}" text-anchor="middle" fill="${BRAND_SOLID}" ` +
    `font-family="${FONT_STACK}" font-size="${tagSize}" font-weight="450">Map your codebase knowledge.</text>` +
    '</svg>\n'
  );
}

/** The same stack the app uses — environments without Pretendard fall back to the system sans. */
const FONT_STACK =
  "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const write = (path, body) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  return path;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const made = [
    write('public/brand-mark.svg', markSvg('full')),
    write('app/icon.svg', markSvg('micro', { paint: BRAND_SOLID })),
    write('.qa-scratch/brand/app-icon.svg', appIconSvg()),
    write('.qa-scratch/brand/app-icon-nodash.svg', appIconSvg({ withDash: false })),
    write('.qa-scratch/brand/compact.svg', appIconSvg({ detail: 'compact' })),
    write('.qa-scratch/brand/micro.svg', appIconSvg({ detail: 'micro' })),
    write('public/brand/mark.svg', markSvg('full')),
    write('public/brand/mark-mono.svg', markSvg('full', { paint: 'currentColor' })),
    write('public/brand/icon-mono-light.svg', monoIconSvg('light')),
    write('public/brand/icon-mono-dark.svg', monoIconSvg('dark')),
    write('public/brand/lockup.svg', lockupSvg()),
    write('public/brand/lockup-light.svg', lockupSvg({ tone: 'light' })),
    write('public/brand/lockup-dark.svg', lockupSvg({ tone: 'dark' })),
    write('public/brand/lockup-compact.svg', lockupSvg({ tagline: false })),
  ];
  for (const p of made) console.log('wrote', p);
}
