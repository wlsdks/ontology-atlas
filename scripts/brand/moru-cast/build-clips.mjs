import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { renderClip, measure, rgbaOn, reduced, onBg, gif, H, BG } from './scene.mjs';
import { CLIPS, leftOf } from './clips.mjs';
import { previewPath, sharp } from './lib.mjs';
import { RGB } from './rig.mjs';
// Renders every clip into a 128px strip, a 64px strip and two GIFs, and measures each against the catalogue's pace.
const only = process.argv[2]?.startsWith('--') ? undefined : process.argv[2];
const limits = JSON.parse(await readFile(previewPath('catalogue-pace.json'), 'utf8')), lim = { ground: limits.grounded.p90, air: limits.airborne.p90 };
await mkdir(previewPath('gif'), { recursive: true }); await mkdir(previewPath('frames'), { recursive: true });
const all = CLIPS.flatMap(c => c.group === 'moves' ? [c, { leftFrom: c }] : [c]).filter(c => !only || (c.id ?? c.leftFrom.id).includes(only));
const solved = {};
const reports = [];
for (let clip of all) {
  if (clip.leftFrom) clip = leftOf(clip.leftFrom, solved[clip.leftFrom.id]);
  const r = await renderClip({ ...clip, limits: { ground: lim.ground - 0.01, air: lim.air - 0.01 } }), rep = measure(r, lim);
  solved[clip.id] = r.tracks.m;
  rep.group = clip.group; rep.title = clip.title; rep.screen = clip.screen; rep.costume = clip.costume;
  rep.frames = clip.frames; rep.W = r.W; rep.durationMs = r.ms.reduce((a, c) => a + c, 0);
  if (clip.travel) { const steps = clip.travel.map((v, i) => i ? Math.abs(v - clip.travel[i - 1]) : 0); rep.travel = Math.abs(clip.travel.at(-1)); if (clip.travelY) rep.rise = clip.travelY.at(-1); rep.maxRoomStep = Math.max(...steps); }
  reports.push(rep);
  const f128 = r.frames.map(f => rgbaOn(f)), f64 = []; for (const f of r.frames) f64.push(onBg(await reduced(f, r.W)));
  // strips for the sheets
  const strip = async (frames, w, h, path) => { const W = w * frames.length, buf = Buffer.alloc(W * h * 4); frames.forEach((fr, i) => { for (let y = 0; y < h; y++) fr.copy(buf, (y * W + i * w) * 4, y * w * 4, (y + 1) * w * 4); }); await sharp(buf, { raw: { width: W, height: h, channels: 4 } }).png().toFile(path); };
  await strip(f128, r.W, H, previewPath(`frames/${clip.id}-128.png`)); await strip(f64, r.W / 2, H / 2, previewPath(`frames/${clip.id}-64.png`));
  if (clip.travel) {
    // Shown in the room: the room carries the cell along and, on a climb, upward; room scenery stands still.
    const LW = 320, TOP = clip.travelY ? 40 : 0, LH = H + TOP, put = (out, x, y, rgb) => { if (x >= 0 && x < LW && y >= 0 && y < LH) out.set([...rgb, 255], (y * LW + x) * 4); };
    const start = clip.travelY ? 96 : clip.travel.at(-1) >= 0 ? 16 : LW - 128 - 16;
    const laned = r.frames.map((fr, i) => {
      const out = Buffer.alloc(LW * LH * 4); for (let p = 0; p < LW * LH; p++) out.set([...BG, 255], p * 4);
      for (let x = 0; x < LW; x++) put(out, x, TOP + 100, [0x2a, 0x2e, 0x40]);
      for (const { s, x, y } of clip.scenery ?? []) { const sx = clip.mirrored ? 136 - x - s.w : x; for (let yy = 0; yy < s.h; yy++) for (let xx = 0; xx < s.w; xx++) { const c = s.data[yy * s.w + (clip.mirrored ? s.w - 1 - xx : xx)]; if (c && y + yy < 100) put(out, start + sx + xx, TOP + y + yy, RGB[c]); } }
      const ox = start + clip.travel[i], oy = TOP - (clip.travelY?.[i] ?? 0);
      for (let y = 0; y < H; y++) for (let x = 0; x < 128; x++) { const c = fr[y * 128 + x]; if (c) put(out, ox + x, oy + y, RGB[c]); }
      return out;
    });
    await gif(laned, LW, LH, r.ms, previewPath(`gif/${clip.id}.gif`), 2);
  } else await gif(f128, r.W, H, r.ms, previewPath(`gif/${clip.id}.gif`), 2);
  await gif(f64, r.W / 2, H / 2, r.ms, previewPath(`gif/${clip.id}-64.gif`), 2);
  console.log(clip.id.padEnd(22), `ground ${rep.maxGround.toFixed(2)} air ${rep.maxAir.toFixed(2)} seam ${rep.seam} low ${rep.lowest} edge ${rep.edge}`, rep.over.length ? 'OVER ' + rep.over.join(' ') : 'ok');
}
if (!only) await writeFile(previewPath('measurements.json'), JSON.stringify({ limits: lim, clips: reports }, null, 1));
