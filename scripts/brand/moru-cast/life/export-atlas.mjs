// Exports what the life runtime plays: every solo clip as two layers (the body, and what goes over the wardrobe:
// flippers, props, marks, bubbles), with per-pose anchor tracks for the wardrobe, plus the wardrobe sprites.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { b, hop, timing, renderClip } from '../scene.mjs';
import { makeRig, drawMoru, blitMoru, N } from '../engine.mjs';
import { toRGBA, HEX, STONE, IVORY } from '../rig.mjs';
import { PALETTES } from '../palette.mjs';
import { FX, PROPS } from '../art.mjs';
import { CLIPS } from '../clips.mjs';
import { bodyCentre } from '../catalogue-pace.mjs';
import { previewPath, sharp } from '../lib.mjs';
import { WARDROBE } from './wardrobe.mjs';

const within = (f, a, z) => f >= a && f <= z, solo = beats => [{ name: 'm', ox: 0, beats }];
const C = (id, frames, beats, extra = {}) => ({ id, frames, actors: solo(beats), ...extra });
const say = (icon, style, from, to) => [{ who: 'm', from, to, style, icon }];
const cum = steps => steps.reduce((out, s) => [...out, (out.at(-1) ?? 0) + s], []);
const FUME = { brow: 'angry', eyes: 'half', mouth: 'frown' }, SHRUG = { lx: -8, ly: -14, rx: 8, ry: -14, fy: -1 };
const TURN = [{ pose: { sq: 1, wd: 1, tx: 4, tail: 1 }, shapes: { eyes: 'line' } }, { pose: { lift: 2, fx: -6, sq: -1, x: -2, tx: 10, tail: 3 }, shapes: {} }, { pose: { lift: 3, fx: -12, x: -6 }, shapes: { front: true, eyes: 'line' } }, { pose: { lift: 3, fx: -6, x: -6, tx: 10, tail: 3 }, shapes: { flip: true } }, { pose: { lift: 1, fx: -2, x: -8, tx: 4, tail: 1 }, shapes: { flip: true } }];
const old = id => { const c = CLIPS.find(c => c.id === id); return { ...c, group: undefined }; };
// How the head piece travels in a swap: off the head, out in front to the midpoint between the two, where it changes owner.
const SWAP_OFF = [[0, 0], [0, 0], [0, -2], [2, -6], [8, -12], [18, -16], [28, -18], [38, -16], [28, -18], [18, -16], [8, -12], [2, -6], [0, -2], [0, 0], [0, 0], [0, 0]];
export const LIFE = [
  C('rest', 2, []),
  C('blink', 6, [b(2, 'rest', 'blink'), b(3, 'rest', 'closed')]),
  C('look-ahead', 12, [b(3, 'lookR', 'rest'), b(7, 'lookR+perk', 'rest', { gx: 2 }), b(9, 'lookR', 'rest'), b(10, 'rest', 'blink')]),
  C('look-back', 12, [b(3, 'lookL', 'rest'), b(7, 'away', 'rest', { tail: 2 }), b(9, 'lookL', 'rest'), b(10, 'rest', 'blink')]),
  C('sway', 12, [b(3, 'rest', 'rest', { x: 1, tail: 2 }), b(6, 'rest', 'glad', { x: -1, tail: -1, sq: -1 }), b(9, 'rest', 'rest', { x: 1, tail: 1 })]),
  C('step', 8, [b(1, 'antic', 'rest', { fx: 2 }), b(2, 'rest', 'rest', { sq: 2, wd: 3, lift: 1, fx: 3, lx: -5, rx: 7 }), b(3, 'rest', 'rest', { lift: 3, fx: 3, tail: 2 }), b(4, 'rest', 'rest', { sq: -2, wd: -2, lift: 2, fx: 3, lx: 3, rx: -2, tail: 3 }), b(5, 'rest', 'rest', { lift: 1, fx: 2 }), b(6, 'antic', 'rest', { fx: 1 })],
    { bounding: true, ms: timing(8, 80), travel: cum([0, 0, 2, 4, 4, 3, 2, 1]) }),
  { id: 'turn', frames: 7, actors: [{ name: 'm', ox: 0, poses: [{ pose: {}, shapes: {} }, ...TURN, { pose: { x: -8 }, shapes: { flip: true } }] }], ms: [80, 70, 70, 70, 70, 70, 80], bounding: true },
  C('wave', 14, [b(1, 'antic'), b(3, 'perk+lookR', 'glad', { rx: 8, ry: -24 }), b(5, 'perk+lookR', 'happy', { rx: 12, ry: -28 }), b(7, 'perk+lookR', 'happy', { rx: 6, ry: -24 }), b(9, 'perk+lookR', 'happy', { rx: 12, ry: -28 }), b(11, 'rest', 'glad', { rx: 4, ry: -8 })], { ms: timing(14, 100) }),
  C('highfive', 14, [b(1, 'antic', 'glad'), b(3, 'perk+lookR', 'cheer', { rx: 6, ry: -18 }), b(5, 'tall+lookR', 'cheer', { rx: 13, ry: -26, fx: 4 }), b(6, 'tall+lookR', 'cheer', { rx: 13, ry: -26, fx: 4, x: 2 }), b(8, 'perk', 'happy', { rx: 6, ry: -10 }), b(11, 'rest', 'glad')],
    { ms: timing(14, 90, { 5: 140, 6: 200 }), over: (f, api) => { if (within(f, 5, 7)) api.put(f === 6 ? FX.sparkBig : FX.spark, 116, 44); } }),
  C('ask', 18, [b(1, 'antic', 'blink'), b(3, 'perk+lookR', 'talk'), b(5, 'perk+lookR+pawR', 'oh', { tail: 2 }), b(10, 'perk+lookR', 'rest'), b(14, 'lookR', 'rest')], { ms: timing(18, 110, { 6: 300 }), bubbles: say('question', 'speech', 3, 13) }),
  C('reply-fish', 18, [b(1, 'antic', 'blink'), b(3, 'perk+lookR', 'happy'), b(5, 'perk+lookR+pawR', 'cheer', { tail: 3 }), b(10, 'perk+lookR', 'happy'), b(14, 'lookR', 'glad')], { ms: timing(18, 110, { 6: 300 }), bubbles: say('fish', 'speech', 3, 13) }),
  C('reply-idea', 18, [b(1, 'antic', 'blink'), ...hop(3, [3, 5, 3, 0], 'perk+lookR', 'cheer', { tail: 3 }), b(8, 'tall+lookR', 'cheer', { rx: 8, ry: -24 }), b(12, 'perk+lookR', 'happy'), b(15, 'rest', 'glad')], { ms: timing(18, 100, { 9: 300 }), bubbles: say('bulb', 'shout', 4, 14) }),
  C('shrug', 16, [b(1, 'antic', 'blink'), b(3, 'perk', 'shrug', SHRUG), b(5, 'perk', 'shrug', { ...SHRUG, fy: -3 }), b(9, 'perk', 'shrug', SHRUG), b(12, 'rest', 'dot')], { ms: timing(16, 110, { 6: 280 }), bubbles: say('shrug', 'speech', 3, 11) }),
  C('boo', 12, [b(1, 'crouch', { eyes: 'line' }), b(2, 'crouch', { eyes: 'line' }, { sq: 6 }), b(3, 'tall', 'cheer', { lift: 4, lx: -8, ly: -16, rx: 8, ry: -16 }), b(4, 'tall', 'cheer', { lift: 6, lx: -8, ly: -18, rx: 8, ry: -18 }), b(5, 'tall', 'cheer', { lift: 3, lx: -6, ly: -12, rx: 6, ry: -12 }), b(6, 'perk', 'happy'), b(9, 'antic', 'glad')],
    { ms: timing(12, 80, { 1: 160, 2: 220, 4: 160, 6: 200 }), over: (f, api) => { if (within(f, 3, 6)) api.put(FX.bang, 114, 26); } }),
  C('startled', 16, [b(1, 'antic', 'wow'), ...hop(2, [3, 5, 3, 0], 'tall', 'wow', { lx: -5, ly: -4, rx: 5, ry: -4, tail: 4 }), b(7, 'perk', 'wide', { tail: 3 }), b(9, 'perk+lookL', 'wide', { tail: 2 }), b(11, 'tall+lookL', 'oh', { tail: 4 }), b(13, 'rest', 'blink')], { ms: timing(16, 80, { 7: 200, 9: 200, 11: 240 }), over: (f, api) => { if (within(f, 2, 7)) api.put(FX.bang, 112, 26); } }),
  C('laugh', 16, [b(1, 'antic', 'blink'), ...hop(2, [3, 6, 3, 0], 'rest', 'cheer', { lx: -3, ly: -3, rx: 3, ry: -3 }), ...hop(7, [3, 5, 3, 0], 'rest', 'happy', { lx: -3, ly: -3, rx: 3, ry: -3 }), b(12, 'perk', 'happy'), b(14, 'rest', 'glad')], { ms: timing(16, 85), over: (f, api) => { if (f === 4 || f === 9) api.put(FX.sparkBig, 112, 34); } }),
  C('huff', 16, [b(1, 'antic', FUME), b(3, 'antic', FUME, { fy: 2, x: -1 }), b(5, 'perk', FUME, { x: 1 }), b(7, 'antic', FUME, { fy: 2 }), b(9, 'slump', 'sulk', { fy: 3 }), b(12, 'slump', 'sulk', { fy: 4 }), b(14, 'antic', 'sleepy')],
    { ms: timing(16, 110, { 9: 260, 12: 300 }), over: (f, api) => { if (within(f, 2, 8)) api.put((f % 3) ? FX.huffSmall : FX.huff, 108 + (f % 3) * 2, 36 - (f % 3) * 4); } }),
  C('yawn', 16, [b(2, 'rest', 'sleepy', { fy: 1 }), b(4, 'perk', 'yawn', { rx: -9, ry: -11 }), b(8, 'tall', 'yawn', { rx: -9, ry: -11, tail: 3 }), b(10, 'rest', 'sleepy', { rx: -4, ry: -4, fy: 2 }), b(13, 'rest', 'sleepy', { fy: 2 })], { ms: timing(16, 130, { 8: 320 }) }),
  C('nap', 30, [b(2, 'rest', 'sleepy', { fy: 2 }), b(4, 'crouch', 'closed', { fy: 3 }), b(6, 'rest', 'asleep', { sq: 6, wd: 5, fy: 4, tail: -3 }), ...Array.from({ length: 9 }, (_, i) => b(8 + i * 2, 'rest', 'asleep', { sq: i % 2 ? 5 : 7, wd: i % 2 ? 4 : 5, fy: 4, tail: -3 })), b(25, 'crouch', 'sleepy'), b(27, 'perk', 'blink'), b(28, 'rest', 'rest')],
    { ms: timing(30, 260, { 0: 110, 1: 110, 26: 140, 27: 140, 28: 140, 29: 110 }), bubbles: say('zzz', 'thought', 8, 23) }),
  C('fish', 26, [b(1, 'antic'), b(3, 'lookR+lookDown', 'rest'), b(6, 'lookR+lookDown', 'effort', { rx: 12, ry: -4, fy: 2 }), b(8, 'perk+lookR', 'wow', { rx: 12, ry: -26, tail: 4 }), b(12, 'perk+lookR', 'happy', { rx: 12, ry: -24, tail: 2 }), b(14, 'rest', 'happy', { rx: -6, ry: -12 }), b(16, 'rest', 'glad', { rx: -6, ry: -10, fy: 1 }), b(18, 'rest', 'happy', { rx: -6, ry: -12 }), b(20, 'rest', 'glad', { rx: -2, ry: -4 }), b(23, 'antic', 'glad')],
    { ms: timing(26, 110, { 6: 260, 8: 200, 12: 260 }), over: (f, api) => { if (within(f, 8, 15)) { const [x, y] = api.a.m.pawR; api.put(PROPS.fish, x - 4, y - 16); api.paw('m', 'R'); } if (within(f, 7, 9)) api.put(FX.water, 116, 80 - (f - 7) * 6); } }),
  C('swap', 16, [b(1, 'antic', 'glad'), b(3, 'perk+lookR', 'glad', { rx: 2, ry: -30 }), b(5, 'tall+lookR', 'cheer', { rx: 10, ry: -30 }), b(7, 'tall+lookR', 'cheer', { rx: 13, ry: -28, fx: 4 }), b(9, 'tall+lookR', 'happy', { rx: 10, ry: -30 }), b(11, 'perk+lookR', 'happy', { rx: 2, ry: -30 }), b(13, 'rest', 'glad', { rx: 2, ry: -10 })],
    { ms: timing(16, 110, { 7: 220 }), wear: { slot: 'head', off: SWAP_OFF, swapAt: 7 }, over: (f, api) => { if (f === 7 || f === 8) api.put(FX.sparkBig, 118, 30); } }),
  old('bound'), old('belly-slide'), old('run'), old('roll'), old('tiptoe'),
  // The climb without its in-cell ladder and shelf: in a room those stand still and the Moru goes up.
  { ...old('climb'), under: undefined, scenery: undefined },
];
// A Moru facing left is the same drawing mirrored, so its bubble's symbol is drawn mirrored here and reads the right way round there.
for (const clip of LIFE.filter(c => c.bubbles)) LIFE.push({ ...clip, id: clip.id + '~left', bubbles: clip.bubbles.map(bub => ({ ...bub, mirrorIcon: true })) });

await mkdir(previewPath('life'), { recursive: true });
const LIMITS = JSON.parse(await readFile(previewPath('catalogue-pace.json'), 'utf8')), lim = { ground: LIMITS.grounded.p90 - 0.01, air: LIMITS.airborne.p90 - 0.01 };
const rig = await makeRig(), even = v => v - (v % 2), meta = { cell: N, floor: 99, limits: { ground: LIMITS.grounded.p90, air: LIMITS.airborne.p90 }, clips: {}, pieces: {}, palettes: {}, tones: { body: HEX[STONE], belly: HEX[IVORY] } };
const rows = [];
const neutralCentre = bodyCentre(toRGBA((() => { const c = new Uint8Array(N * N); blitMoru(c, N, drawMoru(rig), 0); return c; })()), N, N);
for (const clip of LIFE) {
  const r = await renderClip({ ...clip, limits: lim }), track = r.tracks.m, frames = [];
  // A sheet clip rests on its first and last pose before it loops; in a chain the next action follows at once.
  r.ms[0] = Math.min(r.ms[0], 70); r.ms[r.ms.length - 1] = Math.min(r.ms.at(-1), 70);
  let x0 = N, y0 = N, x1 = 0, y1 = 0;
  for (let f = 0; f < clip.frames; f++) {
    // A turned pose (the roll) is stored turned, with its angle and the point it turned about: the runtime turns the outfit the same way.
    const { pose, shapes } = track[f], base = new Uint8Array(N * N), full = r.frames[f]; let anchors, pivot = null, sink = 0;
    if (shapes.angle) { const up = new Uint8Array(N * N); blitMoru(up, N, drawMoru(rig, pose, { ...shapes, angle: 0 }), 0, { flip: !!shapes.flip }); let n = 0, ax = 0, ay = 0; for (let q = 0; q < N * N; q++) if (up[q] === STONE || up[q] === IVORY) { n++; ax += q % N; ay += Math.floor(q / N); } pivot = [ax / n, ay / n]; sink = blitMoru(new Uint8Array(N * N), N, drawMoru(rig, pose, shapes), 0, { flip: !!shapes.flip }).sink; }
    blitMoru(base, N, drawMoru(rig, pose, { ...shapes, noFlippers: true }, [{ layer: 'front', draw: ctx => { anchors = { crown: ctx.shift(80, 45), face: ctx.faceShift(), chest: ctx.shift(84, 84), back: ctx.shift(46, 58) }; } }]), 0, { flip: !!shapes.flip, pivot });
    if (pivot) for (let q = 0; q < N * N; q++) if (!full[q]) base[q] = 0;
    const over = new Uint8Array(N * N); for (let p = 0; p < N * N; p++) { if (full[p] && full[p] !== base[p]) over[p] = full[p]; if (full[p] || base[p]) { const x = p % N, y = (p - x) / N; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
    const c = bodyCentre(toRGBA(r.solo.m[f]), N, N), p = { ...{ lift: 0, x: 0 }, ...pose };
    frames.push({ angle: (shapes.angle ?? 0) * (shapes.flip ? -1 : 1), pivot, sink, sq: p.sq ?? 0, droop: shapes.brow === 'worry' || shapes.mouth === 'frown' || (shapes.eyes === 'closed' && (p.sq ?? 0) >= 4), base, over, a: Object.fromEntries(Object.entries(anchors).map(([k, [dx, dy]]) => [k, [Math.round(dx), Math.round(dy - p.lift)]])), px: p.x, flip: !!shapes.flip, cx: +c.x.toFixed(2), cy: +c.y.toFixed(2), air: p.lift > 0,
      exit: p.lift === 0 && !shapes.flip && Math.hypot(c.x - neutralCentre.x, c.y - neutralCentre.y) <= LIMITS.grounded.p90 && Math.max(...['lx', 'ly', 'rx', 'ry'].map(k => Math.abs(pose[k] ?? 0))) <= 12 });
  }
  // The turn's last pose is the neutral facing the other way: an event may cut in there too (the runtime flips the facing).
  if (clip.id === 'turn') frames.at(-1).exit = true;
  x0 = even(x0); y0 = even(y0); const w = x1 - x0 + 1 + ((x1 - x0 + 1) % 2), h = y1 - y0 + 1 + ((y1 - y0 + 1) % 2);
  // The longest wait for a pose a real event may cut in on (a pose within one catalogue step of the neutral).
  let wait = 0, since = 0; frames.forEach((fr, f) => { if (fr.exit) since = 0; else { since += r.ms[f]; wait = Math.max(wait, since); } });
  rows.push({ clip, frames, x0, y0, w, h });
  meta.clips[clip.id] = { still: clip.bubbles ? clip.bubbles[0].from + 3 : Math.floor(clip.frames / 2), n: clip.frames, ms: r.ms, box: [x0, y0, w, h], travel: clip.travel ?? null, travelY: clip.travelY ?? null, wear: clip.wear ?? null, maxWaitMs: wait, total: r.ms.reduce((a, v) => a + v, 0),
    f: frames.map(fr => ({ ...(fr.angle ? { angle: fr.angle, pv: fr.pivot.map(v => +v.toFixed(2)), sk: fr.sink } : {}), sq: fr.sq, droop: fr.droop ? 1 : 0, a: fr.a, px: fr.px, flip: fr.flip ? 1 : 0, cx: fr.cx, cy: fr.cy, air: fr.air ? 1 : 0, exit: fr.exit ? 1 : 0 })) };
}
const AW = Math.max(...rows.map(r => r.w * r.clip.frames)), AH = rows.reduce((a, r) => a + r.h, 0);
for (const layer of ['base', 'over']) {
  const buf = Buffer.alloc(AW * AH * 4); let top = 0;
  for (const r of rows) { meta.clips[r.clip.id].at = top; r.frames.forEach((fr, f) => { const rgba = toRGBA(fr[layer]); for (let y = 0; y < r.h; y++) rgba.copy(buf, ((top + y) * AW + f * r.w) * 4, ((r.y0 + y) * N + r.x0) * 4, ((r.y0 + y) * N + r.x0 + r.w) * 4); }); top += r.h; }
  await sharp(buf, { raw: { width: AW, height: AH, channels: 4 } }).png({ compressionLevel: 9 }).toFile(previewPath(`life/atlas-${layer}.png`));
}
// Wardrobe sprites on one sheet.
const every = WARDROBE.flatMap(p => p.parts.flatMap(q => [q, ...Object.values(q.alts ?? {})])), SW = every.reduce((a, p) => a + p.s.w + 2, 0), SH = Math.max(...every.map(p => p.s.h)), sheet = Buffer.alloc(SW * SH * 4); let sx = 0;
const placed = p => { const rgba = toRGBA(p.s.data); for (let y = 0; y < p.s.h; y++) rgba.copy(sheet, (y * SW + sx) * 4, y * p.s.w * 4, (y + 1) * p.s.w * 4); const out = { sx, w: p.s.w, h: p.s.h, x: p.x, y: p.y, anchor: p.anchor, layer: p.layer, tint: p.tint ? 1 : 0, soft: p.soft ?? 0 }; sx += p.s.w + 2; return out; };
for (const piece of WARDROBE) meta.pieces[piece.id] = { slot: piece.slot, title: piece.title, parts: piece.parts.map(p => ({ ...placed(p), alts: p.alts ? Object.fromEntries(Object.entries(p.alts).map(([k, q]) => [k, placed({ ...p, ...q })])) : null })) };
await sharp(sheet, { raw: { width: SW, height: SH, channels: 4 } }).png().toFile(previewPath('life/wardrobe.png'));
meta.palettes = { original: [HEX[STONE], HEX[IVORY]], ...Object.fromEntries(Object.entries(PALETTES).map(([k, v]) => [k, v.hex])) };
meta.atlas = { w: AW, h: AH, decodedMB: +(AW * AH * 4 * 2 / 1048576).toFixed(1) };
await writeFile(previewPath('life/atlas.json'), JSON.stringify(meta));
const frames = rows.reduce((a, r) => a + r.clip.frames, 0);
console.log(`${rows.length} clips, ${frames} poses, atlas ${AW}x${AH} (two layers, ${meta.atlas.decodedMB} MB decoded), wardrobe ${SW}x${SH}`);
console.log('longest wait for a cut-in pose, ms:', Object.entries(meta.clips).map(([k, c]) => `${k} ${c.maxWaitMs}`).join(', '));
