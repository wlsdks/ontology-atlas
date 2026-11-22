// Contact sheets: a master sheet of key poses and one sheet per group with every pose, each at 128px and at 64px shown at 2x.
import { mkdir, readFile } from 'node:fs/promises';
import { previewPath, rawImage, sharp } from './lib.mjs';
const { clips } = JSON.parse(await readFile(previewPath('measurements.json'), 'utf8'));
await mkdir(previewPath('sheets'), { recursive: true });
const BG = '#171a24', GROUPS = [['cast', 'Cast: six costumes over existing clips (neutral pose, then a pose from the clip)'], ['tools', 'Tools, one per screen'], ['emotions', 'Emotions'], ['moves', 'Locomotion, right and left'], ['talk', 'Conversations and interactions']];
const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
let LIGHT = false;
const PAPER = [0xf4, 0xf1, 0xea];
async function tiles(clip, res, pick) {
  const w = clip.W * res / 128, h = res, scale = 128 / res;
  const img = sharp(previewPath(`frames/${clip.id}-${res}.png`)), out = [];
  for (const f of pick) {
    const { data } = await img.clone().extract({ left: f * w, top: 0, width: w, height: h }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (LIGHT) for (let p = 0; p < data.length; p += 4) if (data[p] === 0x17 && data[p + 1] === 0x1a && data[p + 2] === 0x24) data.set(PAPER, p);
    out.push({ w: w * scale, h: h * scale, input: await rawImage(data, w, h, scale).png().toBuffer() });
  }
  return out;
}
const keyFrames = (n, k) => Array.from({ length: k }, (_, i) => Math.round(1 + i * (n - 3) / (k - 1)));
async function sheet(path, sections, res, maxW) {
  const comp = [], LABEL = 18; let y = 8, width = 0, svg = '';
  for (const sec of sections) {
    svg += `<text x="8" y="${y + 16}" font-family="Helvetica, Arial, sans-serif" font-size="15" font-weight="700" fill="${LIGHT ? '#17192d' : '#fff1d7'}">${esc(sec.title)}</text>`; y += 26;
    for (const row of sec.rows) {
      svg += `<text x="8" y="${y + 12}" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="${LIGHT ? '#4a4d63' : '#b4b8ca'}">${esc(row.label)}</text>`; y += LABEL;
      let x = 8, rowH = 0;
      for (const t of await tiles(row.clip, res, row.pick)) { if (x + t.w > maxW) { x = 8; y += rowH; rowH = 0; } comp.push({ input: t.input, left: x, top: y }); x += t.w; rowH = Math.max(rowH, t.h); width = Math.max(width, x); }
      y += rowH + 4;
    }
    y += 10;
  }
  const W = Math.max(width + 8, 640), Hh = y + 8;
  await sharp({ create: { width: W, height: Hh, channels: 4, background: LIGHT ? '#f4f1ea' : BG } }).composite([...comp, { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}">${svg}</svg>`), left: 0, top: 0 }]).png().toFile(previewPath(path));
  console.log(path, W, Hh);
}
const label = c => `${c.id} · ${c.frames} poses · ${(c.durationMs / 1000).toFixed(1)} s · body step ${Math.max(c.maxGround, 0).toFixed(2)} on the floor${c.maxAir ? `, ${c.maxAir.toFixed(2)} off it` : ''}${c.screen ? ' · ' + c.screen : ''}`;
for (const res of [128, 64]) {
  const tag = res === 128 ? '128' : '64x2';
  const master = GROUPS.map(([g, title]) => ({ title, rows: clips.filter(c => c.group === g).map(c => ({ clip: c, label: label(c), pick: g === 'cast' ? [0, ...keyFrames(c.frames, 5)] : keyFrames(c.frames, c.W > 128 ? (c.W > 256 ? 6 : 8) : 12) })) }));
  await sheet(`contact-sheet-${tag}.png`, master, res, 2000);
  if (res === 128) { LIGHT = true; await sheet('contact-sheet-128-light.png', master, res, 2000); LIGHT = false; }
  for (const [g, title] of GROUPS) await sheet(`sheets/${g}-every-pose-${tag}.png`, [{ title: `${title} — every pose${res === 64 ? ' (64px shown at 2x)' : ''}`, rows: clips.filter(c => c.group === g).map(c => ({ clip: c, label: label(c), pick: Array.from({ length: c.frames }, (_, i) => i) })) }], res, 2100);
}
