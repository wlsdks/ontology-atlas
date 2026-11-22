// Shared paths and image helpers for the Moru cast preview. Only whole-pixel integer operations run here:
// sharp decodes and encodes, and never resamples (an enlargement is done by repeating pixels in JS).
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const sharp = createRequire(require.resolve('next/package.json'))('sharp');

/** The repository root, and the git-ignored folder every preview step writes into. */
export const REPO = fileURLToPath(new URL('../../../', import.meta.url));
export const OUT = resolve(REPO, process.env.MORU_CAST_OUT ?? 'output/moru-cast');
export const previewPath = (...parts) => join(OUT, ...parts);
/** The catalogue's shipped 128px or 64px neutral strip. */
export const shippedNeutral = size => join(REPO, `assets/brand/moru/sprites/${size}/authored/moru-blink.png`);

/** An RGBA picture enlarged `k` times by repeating each pixel. */
function enlarged(rgba, w, h, k) {
  if (k === 1) return rgba;
  const W = w * k, big = Buffer.alloc(W * h * k * 4);
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(W * 4);
    for (let x = 0; x < w; x++) for (let i = 0; i < k; i++) rgba.copy(row, (x * k + i) * 4, (y * w + x) * 4, (y * w + x + 1) * 4);
    for (let i = 0; i < k; i++) row.copy(big, (y * k + i) * W * 4);
  }
  return big;
}
/** An RGBA picture, enlarged `k` times by repeating pixels, as a sharp image. */
export const rawImage = (rgba, w, h, k = 1) => sharp(enlarged(rgba, w, h, k), { raw: { width: w * k, height: h * k, channels: 4 } });

export async function loadStrip(path, cell) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cols = info.width / cell, rows = info.height / cell, frames = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const f = Buffer.alloc(cell * cell * 4);
    for (let y = 0; y < cell; y++) data.copy(f, y * cell * 4, ((r * cell + y) * info.width + c * cell) * 4, ((r * cell + y) * info.width + c * cell + cell) * 4);
    frames.push(f);
  }
  return frames;
}
