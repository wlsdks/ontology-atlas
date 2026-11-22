// Every wardrobe piece over every pose of every catalogue clip (tools, emotions, talk, moves): does it float off the body,
// vanish, get cut by the cell, cover the face, or cover a flipper or the tail? Writes wardrobe-check.json and a piece x clip-group sheet.
import { writeFile } from 'node:fs/promises';
import { renderClip } from '../scene.mjs';
import { makeRig, drawMoru, blitMoru, N } from '../engine.mjs';
import { toRGBA, INK, MARK, MUTED, INDIGO, LIGHT, STONE, IVORY } from '../rig.mjs';
import { CLIPS } from '../clips.mjs';
import { previewPath, sharp } from '../lib.mjs';
import { WARDROBE } from './wardrobe.mjs';
const ANCHOR = { crown: c => c.shift(80, 45), face: c => c.faceShift(), chest: c => c.shift(84, 84), back: c => c.shift(46, 58) };
export const layersOf = piece => piece.parts.map(p0 => ({ layer: p0.layer, draw: ctx => {
  const sh = ctx.shapes, po = ctx.pose, droop = sh.brow === 'worry' || sh.mouth === 'frown' || (sh.eyes === 'closed' && (po.sq ?? 0) >= 4), a = p0.alts;
  const between = sh.between, p = !a ? p0 : a.droop ? (droop ? (between ? a.bent : a.droop) : p0) : (po.lift ?? 0) > 0 ? ((po.lift >> 1) % 2 ? (between ? a.halfUp : a.up) : (between ? a.halfDown : a.down)) : (po.sq ?? 0) >= 3 ? (between ? a.halfDown : a.down) : (po.sq ?? 0) <= -2 ? (between ? a.halfUp : a.up) : p0;
  const [dx, dy] = ANCHOR[p0.anchor](ctx); ctx.put(p.s, p.x + Math.round(dx), p.y + Math.round(dy), p0.layer === 'skin' ? (x, y) => { const c = ctx.canvas[ctx.L(x, y)]; return c === STONE || c === IVORY; } : undefined); } }));
const rig = await makeRig(), cell = (pose, shapes, layers) => { const c = new Uint8Array(N * N), d = drawMoru(rig, pose, shapes, layers); blitMoru(c, N, d, 0, { flip: !!shapes.flip }); return { c, d }; };
const blue = c => c === MUTED || c === INDIGO || c === LIGHT, ink = c => c === INK || c === MARK;
const groups = {}, seen = new Set();
for (const clip of CLIPS) {
  if (clip.id.includes('+') || clip.id.endsWith('-left')) continue;
  const r = await renderClip(clip), g = (groups[clip.group] ??= []);
  for (const track of Object.values(r.tracks)) track.forEach((k, f) => { const key = JSON.stringify(k); if (!seen.has(clip.group + key)) { seen.add(clip.group + key); g.push({ ...k, from: `${clip.id}@${f}` }); } });
}
const table = {}, worst = {};
for (const [group, poses] of Object.entries(groups)) for (const k of poses) {
  const bare = cell(k.pose, k.shapes), body = bare.c, near = new Uint8Array(N * N), face = [];
  for (let p = 0; p < N * N; p++) if (body[p]) { const x = p % N, y = (p - x) / N; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < N && yy < N) near[yy * N + xx] = 1; }
    if (ink(body[p])) { let inside = true; for (let dy = -3; dy <= 3 && inside; dy++) for (let dx = -3; dx <= 3 && inside; dx++) { const xx = x + dx, yy = y + dy; inside = xx >= 0 && yy >= 0 && xx < N && yy < N && body[yy * N + xx] !== 0; } if (inside) face.push(p); } }
  for (const piece of WARDROBE) {
    const dressed = cell(k.pose, k.shapes, layersOf(piece)), row = ((table[piece.id] ??= {})[group] ??= { poses: 0, floating: 0, gone: 0, cut: 0, face: 0, overBlue: 0 });
    let pixels = 0, touching = 0, onFace = 0, onBlue = 0, drawn = 0;
    for (let p = 0; p < N * N; p++) if (dressed.c[p] !== body[p]) { pixels++; if (near[p]) touching++; if (blue(body[p])) onBlue++; }
    for (const p of face) if (dressed.c[p] !== body[p]) onFace++;
    for (let p = 0; p < dressed.d.canvas.length; p++) if (dressed.d.canvas[p] !== bare.d.canvas[p]) drawn++;
    row.poses++; const flags = [];
    if (!pixels) { row.gone++; flags.push('gone'); } else if (!touching) { row.floating++; flags.push('floating'); }
    if (!k.shapes.angle && drawn - pixels > 2) { row.cut++; flags.push('cut'); }
    // A turned pose is turned about the body fill's centre, which a skin piece moves by a pixel: those are compared by eye, not by pixel.
    if (!k.shapes.angle && piece.id !== 'glasses' && onFace >= 3) { row.face++; flags.push('face'); }
    if (!k.shapes.angle && onBlue >= 4) { row.overBlue++; flags.push('overBlue'); }
    for (const fl of flags) if (((worst[piece.id] ??= {})[fl] ??= []).length < 3) worst[piece.id][fl].push(k.from);
  }
}
const totals = {}; for (const [id, g] of Object.entries(table)) { totals[id] = { poses: 0, floating: 0, gone: 0, cut: 0, face: 0, overBlue: 0 }; for (const row of Object.values(g)) for (const k of Object.keys(row)) totals[id][k] += row[k]; }
await writeFile(previewPath('life/wardrobe-check.json'), JSON.stringify({ posesPerGroup: Object.fromEntries(Object.entries(groups).map(([g, p]) => [g, p.length])), totals, byGroup: table, examples: worst }, null, 1));
console.log(Object.entries(groups).map(([g, p]) => g + ':' + p.length).join(' '));
for (const [id, t] of Object.entries(totals)) { const bad = Object.entries(t).filter(([k, v]) => k !== 'poses' && v).map(([k, v]) => `${k} ${v}`).join(', '); console.log(id.padEnd(14), bad || 'clean', bad ? JSON.stringify(worst[id]).slice(0, 150) : ''); }
// The sheet: for every group its highest and its most squashed pose, every piece on both.
const cols = Object.entries(groups).flatMap(([g, poses]) => { const hi = poses.reduce((a, b) => (b.pose.lift ?? 0) > (a.pose.lift ?? 0) ? b : a), lo = poses.filter(p => p !== hi).reduce((a, b) => (b.pose.sq ?? 0) > (a.pose.sq ?? 0) ? b : a); return [[g, hi], [g, lo]]; });
const GUT = 150, TOP = 34, SW = GUT + cols.length * N, SH = TOP + WARDROBE.length * N, img = Buffer.alloc(SW * SH * 4); for (let p = 0; p < SW * SH; p++) img.set([0x17, 0x1a, 0x24, 255], p * 4);
WARDROBE.forEach((piece, r) => cols.forEach(([, k], c) => { const rgba = toRGBA(cell(k.pose, k.shapes, layersOf(piece)).c); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const a = (y * N + x) * 4; if (rgba[a + 3]) rgba.copy(img, ((TOP + r * N + y) * SW + GUT + c * N + x) * 4, a, a + 4); } }));
const esc = t => t.replace(/&/g, '&amp;'), svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH}" font-family="Menlo, monospace" font-size="11" fill="#d6d3c9">${cols.map(([g, k], c) => `<text x="${GUT + c * N + 6}" y="14">${g}</text><text x="${GUT + c * N + 6}" y="27" fill="#99968f">${esc(k.from)}</text>`).join('')}${WARDROBE.map((p, r) => `<text x="8" y="${TOP + r * N + 60}">${esc(p.title)}</text><text x="8" y="${TOP + r * N + 74}" fill="#99968f">${p.slot}</text>`).join('')}</svg>`;
await sharp(img, { raw: { width: SW, height: SH, channels: 4 } }).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).png().toFile(previewPath('life/wardrobe-by-clip-group.png'));
console.log('sheet', SW, SH, cols.map(([, k]) => k.from).join(' '));
