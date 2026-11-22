// Cast line-up with each personality line, and the bubble, icon and prop set, both labelled.
import { makeRig, drawMoru, blitMoru, N, stamp } from './engine.mjs';
import { toRGBA } from './rig.mjs';
import { mkdir } from 'node:fs/promises';
import { previewPath, rawImage, sharp } from './lib.mjs';
import { tinted, PALETTES } from './palette.mjs';
import { COSTUMES, costumeLayers, ICONS, bubbleSprite, PROPS, FX, timer, sapling } from './art.mjs';
let BG = [0x17, 0x1a, 0x24, 255], INKED = '#fff1d7', SOFT = '#b4b8ca'; const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const png = (idx, w, h, scale) => { const rgba = toRGBA(idx); for (let p = 0; p < idx.length; p++) if (!idx[p]) rgba.set(BG, p * 4); return rawImage(rgba, w, h, scale).png().toBuffer(); };
await mkdir(previewPath('sheets'), { recursive: true });
const text = (x, y, t, size = 12, fill = SOFT, weight = 400) => `<text x="${x}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(t)}</text>`;
const rig = await makeRig();
const POSES = [[{}, {}], [{ sq: -3, lift: 8, tail: 2, ly: -2, ry: -2 }, { eyes: 'happy', mouth: 'smile', wings: 1 }], [{ sq: 4, wd: 4, fy: 2, fx: -4 }, { eyes: 'line', wings: 2, earFlop: true }]];
for (const [tag, bg, inked, soft] of [['', [0x17, 0x1a, 0x24, 255], '#fff1d7', '#b4b8ca'], ['-light', [0xf4, 0xf1, 0xea, 255], '#17192d', '#4a4d63']]) { BG = bg; INKED = inked; SOFT = soft;
{
  const names = Object.keys(COSTUMES), rowH = 2 * N + 8, W = 1500, H = names.length * rowH + 40, comp = []; let svg = text(12, 24, 'The cast: one body, costume layers on top (neutral, a hop, a low settle)', 16, INKED, 700);
  for (const [i, n] of names.entries()) {
    const strip = new Uint8Array(3 * N * N);
    POSES.forEach(([p, s], r) => { const cell = new Uint8Array(N * N); blitMoru(cell, N, tinted(drawMoru(rig, p, s, costumeLayers(n)), n), 0); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (cell[y * N + x]) strip[y * 3 * N + r * N + x] = cell[y * N + x]; });
    comp.push({ input: await png(strip, 3 * N, N, 2), left: 8, top: 36 + i * rowH });
    svg += text(800, 36 + i * rowH + 120, COSTUMES[n].title, 20, INKED, 700) + text(800, 36 + i * rowH + 148, COSTUMES[n].line, 14) + text(800, 36 + i * rowH + 172, PALETTES[n] ? `body #${PALETTES[n].hex[0]} · belly #${PALETTES[n].hex[1]}` : 'body #d6d3c9 · belly #fff1d7 (unchanged)', 12);
  }
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: BG[0], g: BG[1], b: BG[2], alpha: 1 } } }).composite([...comp, { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${svg}</svg>`), left: 0, top: 0 }]).png().toFile(previewPath(`sheets/cast-lineup${tag}.png`));
}
}
BG = [0x17, 0x1a, 0x24, 255]; INKED = '#fff1d7'; SOFT = '#b4b8ca';
{
  const SC = 4, icons = Object.keys(ICONS), cols = 8, cw = 44, ch = 50, W = cols * cw + 8, rowsI = Math.ceil(icons.length / cols), props = [...Object.entries(PROPS), ...[1, 3, 5, 7].map((h, i) => [`timer ${i + 1}`, timer(h, i === 1)]), ...[0, 1, 2, 3, 4].map(i => [`sapling ${i}`, sapling(i)]), ...Object.entries(FX)];
  const pc = 8, pcw = 44, pch = 52, rowsP = Math.ceil(props.length / pc), H = 8 + rowsI * ch + 12 + rowsP * pch + 8, idx = new Uint8Array(W * H); let svg = '';
  icons.forEach((ic, i) => { const x = 4 + (i % cols) * cw, y = 6 + Math.floor(i / cols) * ch; stamp(idx, W, bubbleSprite(['speech', 'thought', 'shout'][i % 3], ic, 1), x, y); svg += text((x + 2) * SC, (y + 44) * SC, ic, 15); });
  const y0 = 8 + rowsI * ch + 12;
  props.forEach(([k, s], i) => { const x = 4 + (i % pc) * pcw, y = y0 + Math.floor(i / pc) * pch; stamp(idx, W, s, x + 2, y + Math.max(0, 36 - s.h)); svg += text((x + 2) * SC, (y + 46) * SC, k, 15); });
  await sharp(await png(idx, W, H, SC)).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W * SC}" height="${H * SC}">${svg}</svg>`), left: 0, top: 0 }]).png().toFile(previewPath('sheets/bubbles-icons-props.png'));
  console.log(icons.length, 'icons', props.length, 'props and marks', W * SC, H * SC);
}
