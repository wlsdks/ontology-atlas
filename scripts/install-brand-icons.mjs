/**
 * Installs the raster-first mascot family into every committed identity consumer.
 *
 * `build-brand-assets.mjs` validates the authored 64/32/16 PNG masters and
 * `build-brand-raster.mjs` bakes every physical size. This file is the final,
 * explicit fan-out so an old logo cannot survive in one platform tree.
 *
 * Usage: run the source validator, open the raster baker once, then run this file.
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
import { MASCOT_MOTION_ROWS, MASCOT_TRAY_TEMPLATES } from './build-brand-assets.mjs';

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
  // Google Search recommends a square favicon larger than 48px. Keep the browser
  // icon on the canonical full-size brand output; browsers downsample it as needed.
  ['app/icon.png', 'icon-512'],
  ['public/og-image.png', 'og-image'],
  ['public/brand-icon-512.png', 'icon-512'],
  ['public/logo.png', 'icon-1024'],
  ['public/brand/icon-light.png', 'icon-light'],
  ['public/brand/icon-dark.png', 'icon-dark'],
  ['public/brand/mascot-full.png', 'mark-full'],
  ['public/brand/mascot-compact.png', 'mark-compact'],
  ['public/brand/mascot-micro.png', 'mark-micro'],
  ['public/brand/lockup.png', 'lockup'],
  ['public/brand/lockup@2x.png', 'lockup@2x'],
  ['public/brand/lockup-light@2x.png', 'lockup-light@2x'],
  ['public/brand/lockup-dark@2x.png', 'lockup-dark@2x'],
  ['public/brand/lockup-compact.png', 'lockup-compact'],
  ['src-tauri/icons/ios/AppIcon-20x20@1x.png', 'mobile-20'],
  ['src-tauri/icons/ios/AppIcon-20x20@2x-1.png', 'mobile-40'],
  ['src-tauri/icons/ios/AppIcon-20x20@2x.png', 'mobile-40'],
  ['src-tauri/icons/ios/AppIcon-20x20@3x.png', 'mobile-60'],
  ['src-tauri/icons/ios/AppIcon-29x29@1x.png', 'mobile-29'],
  ['src-tauri/icons/ios/AppIcon-29x29@2x-1.png', 'mobile-58'],
  ['src-tauri/icons/ios/AppIcon-29x29@2x.png', 'mobile-58'],
  ['src-tauri/icons/ios/AppIcon-29x29@3x.png', 'mobile-87'],
  ['src-tauri/icons/ios/AppIcon-40x40@1x.png', 'mobile-40'],
  ['src-tauri/icons/ios/AppIcon-40x40@2x-1.png', 'mobile-80'],
  ['src-tauri/icons/ios/AppIcon-40x40@2x.png', 'mobile-80'],
  ['src-tauri/icons/ios/AppIcon-40x40@3x.png', 'mobile-120'],
  ['src-tauri/icons/ios/AppIcon-60x60@2x.png', 'mobile-120'],
  ['src-tauri/icons/ios/AppIcon-60x60@3x.png', 'mobile-180'],
  ['src-tauri/icons/ios/AppIcon-76x76@1x.png', 'mobile-76'],
  ['src-tauri/icons/ios/AppIcon-76x76@2x.png', 'mobile-152'],
  ['src-tauri/icons/ios/AppIcon-83.5x83.5@2x.png', 'mobile-167'],
  ['src-tauri/icons/ios/AppIcon-512@2x.png', 'icon-1024'],
  ['src-tauri/icons/android/mipmap-mdpi/ic_launcher.png', 'icon-48'],
  ['src-tauri/icons/android/mipmap-mdpi/ic_launcher_round.png', 'icon-48'],
  ['src-tauri/icons/android/mipmap-mdpi/ic_launcher_foreground.png', 'foreground-108'],
  ['src-tauri/icons/android/mipmap-hdpi/ic_launcher.png', 'mobile-72'],
  ['src-tauri/icons/android/mipmap-hdpi/ic_launcher_round.png', 'mobile-72'],
  ['src-tauri/icons/android/mipmap-hdpi/ic_launcher_foreground.png', 'foreground-162'],
  ['src-tauri/icons/android/mipmap-xhdpi/ic_launcher.png', 'mobile-96'],
  ['src-tauri/icons/android/mipmap-xhdpi/ic_launcher_round.png', 'mobile-96'],
  ['src-tauri/icons/android/mipmap-xhdpi/ic_launcher_foreground.png', 'foreground-216'],
  ['src-tauri/icons/android/mipmap-xxhdpi/ic_launcher.png', 'mobile-144'],
  ['src-tauri/icons/android/mipmap-xxhdpi/ic_launcher_round.png', 'mobile-144'],
  ['src-tauri/icons/android/mipmap-xxhdpi/ic_launcher_foreground.png', 'foreground-324'],
  ['src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher.png', 'mobile-192'],
  ['src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher_round.png', 'mobile-192'],
  ['src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher_foreground.png', 'foreground-432'],
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
for (const [state, spec] of Object.entries(MASCOT_MOTION_ROWS)) {
  written.push(put(`public/brand/mascot-${state}-row.png`, readFileSync(spec.path)));
}
written.push(
  put('src-tauri/icons/tray-template.png', readFileSync(MASCOT_TRAY_TEMPLATES.twoX.path)),
);

console.log(`[brand-install] installed ${written.length} assets\n${written.map((p) => `  ${p}`).join('\n')}`);
