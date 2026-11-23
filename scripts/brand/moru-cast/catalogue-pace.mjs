// The catalogue's own pace: how far the centre of the body fill moves between two poses, in 128px pixels.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadStrip, previewPath, REPO } from './lib.mjs';
export function bodyCentre(rgba, w, h) {
  const isBody = p => rgba[p * 4 + 3] && rgba[p * 4] > 160 && rgba[p * 4 + 2] <= rgba[p * 4] + 30;
  const seen = new Uint8Array(w * h); let best = null;
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || !isBody(s)) continue;
    const q = [s]; seen[s] = 1; let sx = 0, sy = 0;
    for (let i = 0; i < q.length; i++) { const p = q[i], x = p % w, y = (p - x) / w; sx += x; sy += y; for (const n of [x > 0 ? p - 1 : -1, x + 1 < w ? p + 1 : -1, p - w, p + w]) if (n >= 0 && n < w * h && !seen[n] && isBody(n)) { seen[n] = 1; q.push(n); } }
    if (!best || q.length > best.n) best = { n: q.length, x: sx / q.length, y: sy / q.length };
  }
  return best;
}
const p = (arr, q) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
/** Measures every authored catalogue clip and writes the p50, p90 and maximum step, on the floor and in the air. */
export async function writeCataloguePace() {
  const src = JSON.parse(await readFile(join(REPO, 'assets/brand/moru/moru-source.json'), 'utf8'));
  const grounded = [], air = [], perClip = {};
  for (const clip of src.authored) {
    if (clip.scene) continue;
    const frames = await loadStrip(join(REPO, `assets/brand/moru/sprites/128/authored/moru-${clip.id}.png`), 128);
    const c = frames.map(f => bodyCentre(f, 128, 128)), steps = [];
    for (let i = 1; i < c.length; i++) if (c[i] && c[i - 1]) steps.push(Math.hypot(c[i].x - c[i - 1].x, c[i].y - c[i - 1].y));
    (clip.airborne ? air : grounded).push(...steps); perClip[clip.id] = { airborne: !!clip.airborne, max: Math.max(...steps).toFixed(2) };
  }
  const pace = { grounded: { n: grounded.length, p50: p(grounded, .5), p90: p(grounded, .9), max: Math.max(...grounded) }, airborne: { n: air.length, p50: p(air, .5), p90: p(air, .9), max: Math.max(...air) } };
  console.log(JSON.stringify(pace, null, 1)); console.log(Object.entries(perClip).filter(([, v]) => v.airborne).map(([k, v]) => k + ':' + v.max).join(' '));
  await mkdir(previewPath(), { recursive: true });
  await writeFile(previewPath('catalogue-pace.json'), JSON.stringify(pace, null, 2));
}
