/**
 * Installs the rasterised PNGs into their **eight consumers** — the last cell of
 * the pipeline.
 *
 * The two preceding scripts build the SVGs (`build-brand-assets.mjs`) and
 * rasterise them (`build-brand-raster.mjs`), but placing the results into
 * `src-tauri/icons/` and the rest was done **by hand** the first time. So the
 * pipeline claimed "everything derives from one set of coordinates" while its
 * last cell was not reproducible — and that is exactly where assets fall behind
 * the next time somebody edits the icon.
 *
 * Usage: `node scripts/build-brand-assets.mjs && node scripts/build-brand-raster.mjs`
 *        (open the result in a browser), then `node scripts/install-brand-icons.mjs`
 *
 * **icns goes through iconutil; ico is written by hand.** On macOS `iconutil` is
 * the standard tool, so filling the `.iconset` directory correctly is enough.
 * Windows ICO is different — PIL's `append_images` is **ignored for ICO and only
 * one frame lands** (measured). The container is simple, so it is written here.
 *
 * **@2x is not a different drawing.** `icon_16x16@2x` is 16pt drawn for retina,
 * so it must be **the same artwork as 16pt**. Putting a simplified variant there
 * makes the drawing change with the display at one logical size. That is why the
 * pairs below share their art.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';

const PNG = '.qa-scratch/brand/png';
const ICONSET = '.qa-scratch/brand/AtlasIcon.iconset';

const read = (name) => readFileSync(`${PNG}/${name}.png`);
const put = (path, buf) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
  return path;
};

/** iconset — [filename, rasterised PNG]. @2x shares its partner's art. */
const ICONSET_PLAN = [
  ['icon_16x16', 'icon-16'],
  ['icon_16x16@2x', 'micro-32'],
  ['icon_32x32', 'icon-32'],
  ['icon_32x32@2x', 'compact-64'],
  ['icon_128x128', 'icon-128'],
  ['icon_128x128@2x', 'icon-256'],
  ['icon_256x256', 'icon-256'],
  ['icon_256x256@2x', 'icon-512'],
  ['icon_512x512', 'icon-512'],
  ['icon_512x512@2x', 'icon-1024'],
];

/** ICO frames — the point is that each size carries a different drawing. */
const ICO_PLAN = [
  [16, 'icon-16'],
  [32, 'icon-32'],
  [48, 'icon-48'],
  [64, 'icon-64'],
  [128, 'icon-128'],
  [256, 'icon-256'],
];

/** The remaining consumers — [install path, rasterised PNG]. */
const COPY_PLAN = [
  ['src-tauri/icons/icon.png', 'icon-1024'],
  ['src-tauri/icons/128x128@2x.png', 'icon-256'],
  ['src-tauri/icons/128x128.png', 'icon-128'],
  ['src-tauri/icons/64x64.png', 'icon-64'],
  ['src-tauri/icons/32x32.png', 'icon-32'],
  ['src-tauri/icons/Square310x310Logo.png', 'tile-310'],
  ['src-tauri/icons/Square284x284Logo.png', 'tile-284'],
  ['src-tauri/icons/Square150x150Logo.png', 'tile-150'],
  ['src-tauri/icons/Square142x142Logo.png', 'tile-142'],
  ['src-tauri/icons/Square107x107Logo.png', 'tile-107'],
  ['src-tauri/icons/Square89x89Logo.png', 'tile-89'],
  ['src-tauri/icons/Square71x71Logo.png', 'tile-71'],
  ['src-tauri/icons/Square44x44Logo.png', 'tile-44'],
  ['src-tauri/icons/Square30x30Logo.png', 'tile-30'],
  ['src-tauri/icons/StoreLogo.png', 'tile-50'],
  ['app/apple-icon.png', 'apple-180'],
  // These three are where **the old logo (the "A" node drawing) was still alive**.
  // The og card is the only image a link preview draws, so every share shipped the
  // retired brand.
  ['public/og-image.png', 'og-image'],
  ['public/brand-icon-512.png', 'icon-512'],
  ['public/logo.png', 'icon-1024'],
  ['public/brand/icon-mono-light.png', 'icon-mono-light'],
  ['public/brand/icon-mono-dark.png', 'icon-mono-dark'],
  ['public/brand/lockup.png', 'lockup'],
  ['public/brand/lockup@2x.png', 'lockup@2x'],
  ['public/brand/lockup-light@2x.png', 'lockup-light@2x'],
  ['public/brand/lockup-dark@2x.png', 'lockup-dark@2x'],
];

/**
 * ICO container — a 6-byte header + a 16-byte directory per frame + PNG bodies.
 * Width/height 256 is written as 0 (the field is one byte, so 256 does not fit).
 */
function buildIco(frames) {
  const dir = Buffer.alloc(6 + frames.length * 16);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2); // type 1 = icon
  dir.writeUInt16LE(frames.length, 4);
  let offset = dir.length;
  frames.forEach(([size, buf], i) => {
    const e = 6 + i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, e);
    dir.writeUInt8(size >= 256 ? 0 : size, e + 1);
    dir.writeUInt8(0, e + 2); // No palette
    dir.writeUInt8(0, e + 3);
    dir.writeUInt16LE(1, e + 4); // color planes
    dir.writeUInt16LE(32, e + 6); // bpp
    dir.writeUInt32LE(buf.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += buf.length;
  });
  return Buffer.concat([dir, ...frames.map(([, b]) => b)]);
}

const written = [];

rmSync(ICONSET, { recursive: true, force: true });
mkdirSync(ICONSET, { recursive: true });
for (const [name, src] of ICONSET_PLAN) writeFileSync(`${ICONSET}/${name}.png`, read(src));
execFileSync('iconutil', ['-c', 'icns', ICONSET, '-o', 'src-tauri/icons/icon.icns']);
written.push('src-tauri/icons/icon.icns');

written.push(put('src-tauri/icons/icon.ico', buildIco(ICO_PLAN.map(([s, n]) => [s, read(n)]))));
for (const [path, src] of COPY_PLAN) written.push(put(path, read(src)));

// `build-brand-assets.mjs` already writes the favicon and master SVG to
// `app/icon.svg` and `public/brand-mark.svg`. The plated SVG is **not** copied
// into public again here — an asset with no consumer is misinformation, not a
// spec.

console.log(`[brand-install] ${written.length}개 설치\n${written.map((p) => `  ${p}`).join('\n')}`);
