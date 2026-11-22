// Exact palette: every opaque pixel of every sheet is a declared colour, and the first pose is the shipped neutral, pixel for pixel.
import { readdir, writeFile } from 'node:fs/promises';
import { previewPath, sharp, shippedNeutral } from './lib.mjs';
import { HEX } from './rig.mjs';
import { PALETTES } from './palette.mjs';
import { readFile } from 'node:fs/promises';
const widths = Object.fromEntries(JSON.parse(await readFile(previewPath('measurements.json'), 'utf8')).clips.map(c => [c.id, c.W ?? c.w ?? c.width ?? 128])), BG = '171a24';
const declared = new Set([...Object.values(HEX), 'f2b3c6', ...Object.values(PALETTES).flatMap(p => p.hex)].map(h => String(h).replace('#', '').toLowerCase()));
const raw = async p => { const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };
const shipped = await raw(shippedNeutral(128));
let files = 0, stray = 0, soft = 0; const strays = {}, neutral = {};
for (const name of (await readdir(previewPath('frames'))).filter(n => n.endsWith('-128.png'))) {
  const img = await raw(previewPath('frames', name)); files++;
  for (let p = 0; p < img.data.length; p += 4) { const a = img.data[p + 3]; if (!a) continue; if (a !== 255) soft++; const h = img.data.subarray(p, p + 3).toString('hex'); if (h === BG) continue; if (!declared.has(h)) { stray++; strays[h] = (strays[h] ?? 0) + 1; } }
  // Solo clips only (128px cell, undressed, original palette): first pose against the shipped neutral.
  if (!name.includes('+') && widths[name.replace('-128.png', '')] === 128) { let diff = 0, any = false; for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { const a = (y * img.w + x) * 4, b = (y * shipped.w + x) * 4; const bg = img.data.subarray(a, a + 3).toString('hex') === BG; if (!bg) any = true; if (bg !== !shipped.data[b + 3] || (!bg && img.data.compare(shipped.data, b, b + 3, a, a + 3))) diff++; } if (any) neutral[name] = diff; }
}
const off = Object.entries(neutral).filter(([, d]) => d > 0);
const out = { sheets: files, declaredColours: declared.size, pixelsOutsidePalette: stray, strayColours: strays, softEdgePixels: soft, soloSheetsCompared: Object.keys(neutral).length, firstPoseDiffersFromShippedNeutral: Object.fromEntries(off.slice(0, 12)), sheetsWithNeutralDiff: off.length };
await writeFile(previewPath('palette-check.json'), JSON.stringify(out, null, 1)); console.log(JSON.stringify(out));
