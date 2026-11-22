// 64px fidelity: pixels that differ between a clip's 64px poses and the catalogue's shipped 64px neutral.
import { readFile } from 'node:fs/promises';
import { loadStrip, previewPath, sharp, shippedNeutral } from './lib.mjs';
const widths = Object.fromEntries(JSON.parse(await readFile(previewPath('measurements.json'), 'utf8')).clips.map(c => [c.id, c.W / 2]));
const n64 = (await loadStrip(shippedNeutral(64), 64))[0];
const asked = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
for (const id of asked.length ? asked : Object.keys(widths)) {
  // The leftmost 64 columns of each pose: the cell of an untinted Moru standing at the left.
  const w = widths[id] ?? 64, { data, info } = await sharp(previewPath(`frames/${id}-64.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), frames = [];
  for (let f = 0; f < info.width / w; f++) { const cell = Buffer.alloc(64 * 64 * 4); for (let y = 0; y < 64; y++) data.copy(cell, y * 64 * 4, (y * info.width + f * w) * 4, (y * info.width + f * w + 64) * 4); frames.push(cell); }
  const d = f => { let n = 0; for (let p = 0; p < 64 * 64; p++) { const x = p % 64, y = (p - x) / 64; if (!x || !y || x === 63 || y === 63) continue; const B = n64[p * 4 + 3] ? [n64[p * 4], n64[p * 4 + 1], n64[p * 4 + 2]] : [0x17, 0x1a, 0x24]; if (B.some((v, i) => v !== f[p * 4 + i])) n++; } return n; };
  console.log(id, 'first pose', d(frames[0]), 'last pose', d(frames.at(-1)), 'pixels differ from the shipped 64px neutral');
}
