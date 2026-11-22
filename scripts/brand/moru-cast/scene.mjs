// Clips as data: actors with timed beats over shared body poses, layered props, costumes and bubbles.
import { makeRig, drawMoru, blitMoru, stamp, flipSprite, REST, N, CENTRE, MX, MY } from './engine.mjs';
import { toRGBA, indexed, RGB } from './rig.mjs';
import { costumeLayers, bubbleSprite, BUBBLES, earTarget, wingTarget } from './art.mjs';
import { SOOT } from './palette.mjs';
import { tinted, PALETTES, ORIGINAL } from './palette.mjs';
import { STONE, IVORY } from './engine.mjs';
import { rawImage, sharp } from './lib.mjs';
import { bodyCentre } from './catalogue-pace.mjs';
import { reduceMoru, workGridPoses } from '../build-moru-sprites.mjs';

export const H = N;
/** Shared body key poses. An interaction is mostly these names in a new order. */
const POSES = {
  rest: {},
  antic: { sq: 2, wd: 2, fy: 1, tail: -1 },
  crouch: { sq: 4, wd: 2, fy: 2, tail: -2 },
  perk: { sq: -2, fy: -2, tail: 2 },
  tall: { sq: -4, wd: -2, fy: -3, tail: 3 },
  bow: { sq: 3, wd: 2, fy: 5, tail: 1 },
  slump: { sq: 4, wd: 4, fy: 4, tail: -3 },
  flat: { sq: 7, wd: 6, fy: 3, tail: -2 },
  lookR: { fx: 4, gx: 1 }, lookL: { fx: -7, gx: -1 }, lookUp: { fy: -4, gy: -1 }, lookDown: { fy: 3, gy: 1 }, away: { fx: -10, gx: -2 },
  pawR: { rx: 4, ry: -12 }, pawL: { lx: -2, ly: -12 }, paws: { lx: 2, ly: -10, rx: -2, ry: -10 }, pawsUp: { lx: -4, ly: -20, rx: 6, ry: -20 },
  reach: { rx: 12, ry: -10, fx: 3 }, reachHi: { rx: 12, ry: -22, fx: 3, fy: -2 }, chest: { rx: -14, ry: -8 }, chin: { rx: -10, ry: -16 }, mouth: { rx: -9, ry: -11 },
  tailUp: { tail: 3 }, tailDown: { tail: -3 },
};
const FACES = {
  rest: {}, blink: { eyes: 'line' }, glad: { eyes: 'happy' }, happy: { eyes: 'happy', mouth: 'smile' }, cheer: { eyes: 'happy', mouth: 'open' },
  closed: { eyes: 'closed' }, proud: { eyes: 'closed', mouth: 'smile' }, sleepy: { eyes: 'half' }, yawn: { eyes: 'line', mouth: 'yawn' }, asleep: { eyes: 'closed' },
  wow: { eyes: 'wide', mouth: 'o' }, wide: { eyes: 'wide' }, talk: { mouth: 'open' }, oh: { mouth: 'o' },
  worry: { brow: 'worry', mouth: 'wavy' }, worryTalk: { brow: 'worry', mouth: 'o' }, grr: { eyes: 'tight', mouth: 'flat' }, grrOpen: { eyes: 'tight', mouth: 'open' }, stern: { brow: 'stern', mouth: 'flat' },
  sulk: { eyes: 'half', mouth: 'frown' }, sad: { brow: 'worry', mouth: 'frown' }, shrug: { eyes: 'closed', mouth: 'flat' }, wink: { eyes: 'wink', mouth: 'smile' }, effort: { eyes: 'line', mouth: 'open' }, dot: { eyes: 'dot' }, smile: { mouth: 'smile' }, front: { front: true },
};
const poseOf = v => typeof v === 'string' ? Object.assign({}, ...v.split('+').map(n => { if (!POSES[n]) throw new Error('no pose ' + n); return POSES[n]; })) : (v ?? {});
const faceOf = v => typeof v === 'string' ? Object.assign({}, ...v.split('+').map(n => { if (!FACES[n]) throw new Error('no face ' + n); return FACES[n]; })) : (v ?? {});
/** A beat: the pose index it lands on, a pose (names joined by + or numbers), a face, extra numbers and an ease. */
export const b = (at, pose = 'rest', face = 'rest', extra = {}, ease = 'out') => ({ at, pose: { ...poseOf(pose), ...extra }, shapes: faceOf(face), ease });
const EASE = { linear: t => t, in: t => t * t, out: t => 1 - (1 - t) * (1 - t), inOut: t => t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t) };
/** One beat per pose of a hop from `at`: lifts in px, the body long on the way up and squashed on landing. */
export const hop = (at, lifts, pose = 'rest', face = 'rest', extra = {}) => lifts.map((lift, i) => {
  const rising = i === 0 || lifts[i - 1] < lift, top = lift === Math.max(...lifts);
  return b(at + i, pose, face, { ...extra, lift, sq: lift === 0 ? 1 : top ? -1 : rising ? -2 : -1, wd: lift === 0 ? 1 : 0, tail: lift === 0 ? -2 : rising ? 3 : 1, ...(lift === 0 ? { lx: 0, ly: 0, rx: 0, ry: 0 } : {}) }, 'linear');
});
/** Pose and shapes of every frame from the beats; the first and last frame are the neutral pose. */
export function timeline(beats, frames) {
  const keys = [{ at: 0, pose: {}, shapes: {}, ease: 'out' }, ...[...beats].sort((x, y) => x.at - y.at), { at: frames - 1, pose: {}, shapes: {}, ease: 'out' }];
  const out = [];
  for (let f = 0; f < frames; f++) {
    let k = 0; while (k + 1 < keys.length && keys[k + 1].at <= f) k++;
    const from = keys[k], to = keys[Math.min(k + 1, keys.length - 1)], span = to.at - from.at, t = span > 0 ? EASE[to.ease ?? 'out']((f - from.at) / span) : 0;
    const pose = {}; for (const name of Object.keys(REST)) { const a = from.pose[name] ?? 0, z = to.pose[name] ?? 0; pose[name] = Math.round(a + (z - a) * t); }
    out.push({ pose, shapes: { ...from.shapes } });
  }
  out[0] = { pose: {}, shapes: {} }; out[frames - 1] = { pose: {}, shapes: {} };
  return out;
}
export const timing = (frames, base = 100, holds = {}) => Array.from({ length: frames }, (_, i) => holds[i] ?? (i === 0 ? 420 : i === frames - 1 ? 600 : base));

let rigPromise; const rig = () => (rigPromise ??= makeRig());
const even = v => 2 * Math.round(v / 2);

/**
 * Renders a clip. clip = { id, W, frames, ms, actors: [{ name, ox, flip, costume, beats | poses, z }],
 * under(f, api), over(f, api), bubbles: [{ who, from, to, style, icon, dx, dy }] }.
 */
export async function renderClip(clip) {
  const r = await rig(), W = clip.W ?? N, frames = [], solo = {}, tracks = {};
  for (const actor of clip.actors) { tracks[actor.name] = actor.poses ?? timeline(actor.beats, clip.frames); solo[actor.name] = []; }
  // No pose repeats the one before it: a hold breathes (one row taller, a tail-tip flick), as the shipped clips' holds do.
  for (const actor of clip.actors) { const track = tracks[actor.name], held = track.map((k, f) => f > 0 && f < track.length - 1 && JSON.stringify(k) === JSON.stringify(track[f - 1])); let run = 0; held.forEach((h, f) => { run = h ? run + 1 : 0; if (h) track[f] = { shapes: track[f].shapes, pose: { ...track[f].pose, sq: (track[f].pose.sq ?? 0) - (run % 2), tail: (track[f].pose.tail ?? 0) + (run % 4 === 1 ? 1 : 0), fy: (track[f].pose.fy ?? 0) - (run % 4 === 2 ? 1 : 0) } }; }); }
  // Pace: where the body fill's centre would step further than the catalogue's p90, the pose is eased
  // toward its neighbour, so the move spreads over more poses instead of jumping.
  if (clip.limits) for (const actor of clip.actors) {
    if (actor.poses) continue;
    const track = tracks[actor.name], n = track.length, seen = new Map(), centre = i => { const key = JSON.stringify(track[i]); if (seen.has(key)) return seen.get(key); const sc = new Uint8Array(W * H); blitMoru(sc, W, drawMoru(r, track[i].pose, track[i].shapes), actor.ox, { flip: !!actor.flip !== !!track[i].shapes.flip }); const c = bodyCentre(toRGBA(sc), W, H); seen.set(key, c); return c; };
    const toward = (i, j) => { let changed = false; const a = { ...REST, ...track[i].pose }, z = { ...REST, ...track[j].pose }; for (const k of Object.keys(REST)) { if (a[k] === z[k]) continue; const mid = (a[k] + z[k]) / 2, v = a[k] > z[k] ? Math.floor(mid) : Math.ceil(mid); if (v !== a[k]) { a[k] = v; changed = true; } } track[i] = { pose: a, shapes: track[i].shapes }; return changed; };
    for (let pass = 0; pass < 1500; pass++) {
      const c = track.map((_, i) => centre(i)); let bad = -1;
      for (let f = 1; f < n; f++) { const air = (track[f].pose.lift ?? 0) > 0 || (track[f - 1].pose.lift ?? 0) > 0 || clip.bounding; if (Math.hypot(c[f].x - c[f - 1].x, c[f].y - c[f - 1].y) > (air ? clip.limits.air : clip.limits.ground)) { bad = f; break; } }
      if (bad < 0) break;
      // Near the end the earlier pose gives way, since the last pose is the neutral pose.
      const ok = bad >= n - 4 ? toward(bad - 1, bad) : toward(bad, bad - 1);
      if (!ok) { if (bad >= n - 4) track[bad - 1] = { pose: { ...track[bad].pose }, shapes: track[bad - 1].shapes }; else track[bad] = { pose: { ...track[bad - 1].pose }, shapes: track[bad].shapes }; }
    }
  }
  // Soft costume parts change shape over poses, not in one: the ears fall and the wing lifts a step a pose, and both are back at rest by the last pose.
  for (const actor of clip.actors) {
    const want = actor.costume === 'rabbit' ? ['earLevel', earTarget] : actor.costume === 'dragon' ? ['wingLevel', wingTarget] : null; if (!want) continue;
    const track = tracks[actor.name], level = track.map(k => k.shapes.wings && want[0] === 'wingLevel' ? null : want[1]({ ...REST, ...k.pose }, k.shapes)); level[0] = 0; level[level.length - 1] = 0;
    for (let f = 1; f < level.length; f++) if (level[f] !== null && level[f - 1] !== null) level[f] = Math.max(level[f - 1] - 1, Math.min(level[f - 1] + 1, level[f]));
    for (let f = level.length - 2; f >= 0; f--) if (level[f] !== null && level[f + 1] !== null) level[f] = Math.max(level[f + 1] - 1, Math.min(level[f + 1] + 1, level[f]));
    level.forEach((v, f) => { if (v !== null) track[f] = { pose: track[f].pose, shapes: { ...track[f].shapes, [want[0]]: v } }; });
  }
  const restAnchor = {};
  for (const actor of clip.actors) { const s = new Uint8Array(W * H); restAnchor[actor.name] = blitMoru(s, W, drawMoru(r), actor.ox, { flip: !!actor.flip }); }
  for (let f = 0; f < clip.frames; f++) {
    const scene = new Uint8Array(W * H), drawn = {}, anchors = {};
    for (const actor of clip.actors) {
      const { pose, shapes } = tracks[actor.name][f];
      drawn[actor.name] = { actor, pose, shapes, flip: !!actor.flip !== !!shapes.flip, full: tinted(drawMoru(r, pose, shapes, costumeLayers(actor.costume)), actor.palette ?? actor.costume), bare: drawMoru(r, pose, shapes) };
      const probe = new Uint8Array(W * H); anchors[actor.name] = blitMoru(probe, W, drawn[actor.name].bare, actor.ox, { flip: drawn[actor.name].flip });
      solo[actor.name].push(probe);
    }
    const api = { f, a: anchors, rest: restAnchor, W, scene, pose: n => drawn[n].pose,
      put: (s, x, y, opt = {}) => stamp(scene, W, opt.flip ? flipSprite(s) : s, opt.free ? Math.round(x) : even(x), opt.free ? Math.round(y) : even(y), opt.clipY ? (xx, yy) => yy < opt.clipY : undefined),
      paw: (name, side) => { const d = drawn[name], l = d.bare.limbs[side === 'L' ? 0 : 1]; if (!l) return; const lift = d.pose.lift ?? 0, x = d.pose.x ?? 0;
        for (let yy = 0; yy < l.h; yy++) for (let xx = 0; xx < l.w; xx++) { const c = l.data[yy * l.w + xx]; if (!c) continue; const X = (d.flip ? d.actor.ox + 2 * CENTRE - (l.x + xx - MX) : d.actor.ox + l.x + xx - MX) + x, Y = l.y + yy - MY - lift; if (X >= 0 && Y >= 0 && X < W && Y < H) scene[Y * W + X] = c; } } };
    clip.under?.(f, api);
    for (const actor of [...clip.actors].sort((x, y) => (x.z ?? 0) - (y.z ?? 0))) blitMoru(scene, W, drawn[actor.name].full, actor.ox, { flip: drawn[actor.name].flip });
    clip.over?.(f, api);
    for (const bub of clip.bubbles ?? []) {
      if (f < bub.from || f > bub.to) continue;
      const a = restAnchor[bub.who], dir = a.dir, age = f - bub.from, left = bub.to - f;
      const cx = a.crown[0] + dir * 4 + (bub.dx ?? 0), base = a.crown[1] - 4 + (bub.dy ?? 0);
      if (age === 0 || left === 0) { const pip = BUBBLES.pip; stamp(scene, W, pip, even(cx - pip.w / 2), even(base - 12)); continue; }
      const s = bubbleSprite(bub.style ?? 'speech', bub.icon, dir, bub.mirrorIcon), rise = age === 1 ? 2 : 0;
      stamp(scene, W, s, Math.max(2, Math.min(W - s.w - 2, even(cx - s.w / 2))), Math.max(2, even(base - s.h - rise)));
    }
    frames.push(scene);
  }
  return { clip, W, frames, solo, tracks, ms: clip.ms ?? timing(clip.frames) };
}

// ---------- export ----------
export const BG = [0x17, 0x1a, 0x24];
export function rgbaOn(canvas, bg = BG) { const out = toRGBA(canvas); if (bg) for (let p = 0; p < canvas.length; p++) if (!canvas[p]) out.set([...bg, 255], p * 4); return out; }
let work;
/** The two outline inks differ by ten parts of blue; a moved piece is recognised whichever it was drawn in. */
// One digit per tone for the neighbourhood key: both inks and the tail-root tone read as ink, every later index (pink, cast tones) as one more.
const ONE_INK = Object.assign(Array(64).fill(9), [0, 1, 1, 3, 4, 5, 6, 7, 8, 9, 9]); ONE_INK[SOOT] = 1;
/** The catalogue's 256px work drawing of the neutral, indexed by every 3x3 neighbourhood of its 128px export, plain and mirrored. */
async function workGrid() {
  if (work) return work;
  const [n256] = await workGridPoses('blink'), n128 = indexed(reduceMoru(n256, 256, 128), 128, 128);
  const keys = [0, 1].map(mirror => { const out = new Int32Array(128 * 128); for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { let k = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = mirror ? 127 - (x + dx) : x + dx, yy = y + dy; k = k * 10 + (xx < 0 || xx > 127 || yy < 0 || yy > 127 ? 0 : ONE_INK[n128[yy * 128 + xx]]); } out[y * 128 + x] = k; } return out; });
  const index = new Map();
  keys.forEach((list, mirror) => list.forEach((k, p) => { if (k) (index.get(k) ?? index.set(k, []).get(k)).push([p % 128, (p / 128) | 0, mirror]); }));
  return work = { reduceMoru, n256, keys, index };
}
/**
 * The 64px drawing of a frame, made the way the catalogue makes one: the pose is rebuilt on the 256px work grid and
 * reduced by the catalogue's exporter. Every pixel that is a moved piece of the neutral takes its 2x2 block from the
 * catalogue's work drawing; a pixel drawn new (prop, costume, face, bubble) is doubled.
 */
export async function reduced(tintedCanvas, W) {
  const { reduceMoru, n256, keys, index } = await workGrid(), canvas = tintedCanvas.map(c => ORIGINAL[c]);
  const side = Math.max(W, H) <= 128 ? 128 : Math.max(W, H) <= 256 ? 256 : 512, big = 2 * side, sq = Buffer.alloc(big * big * 4);
  const at = (x, y) => x < 0 || x >= W || y < 0 || y >= H ? 0 : ONE_INK[canvas[y * W + x]];
  let last = [0, 0, 0]; const used = [], hits = new Array(W * H), support = new Map();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let k = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) k = k * 10 + at(x + dx, y + dy);
    if (!k) continue;
    const fits = ([ox, oy, m]) => { const nx = x - ox, ny = y - oy; return nx >= 0 && nx < 128 && ny >= 0 && ny < 128 && keys[m][ny * 128 + nx] === k; };
    let hit = fits(last) ? last : used.find(fits);
    if (!hit) { const found = index.get(k)?.[0]; if (found) { hit = [x - found[0], y - found[1], found[2]]; used.unshift(hit); if (used.length > 24) used.pop(); } }
    if (hit) { last = hit; hits[y * W + x] = hit; support.set(hit, (support.get(hit) ?? 0) + 1); }
  }
  // A lone match (a seam row of a squashed pose, a chance fit) would bring in sub-pixels of some other place: those are doubled instead.
  const MOVED_TOGETHER = 40;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const hit = hits[y * W + x];
    if (hit && support.get(hit) >= MOVED_TOGETHER) {
      const nx = x - hit[0], ny = y - hit[1];
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const sx = hit[2] ? 256 - (2 * nx + dx) : 2 * nx + dx, sy = 2 * ny + dy; if (sx > 255 || !n256[(sy * 256 + sx) * 4 + 3]) continue; n256.copy(sq, ((2 * y + dy) * big + 2 * x + dx) * 4, (sy * 256 + sx) * 4, (sy * 256 + sx) * 4 + 4); }
    } else if (canvas[y * W + x]) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) sq.set([...RGB[canvas[y * W + x]], 255], ((2 * y + dy) * big + 2 * x + dx) * 4);
  }
  const quarter = reduceMoru(sq, big, side / 2), out = Buffer.alloc((W / 2) * (H / 2) * 4);
  for (let y = 0; y < H / 2; y++) quarter.copy(out, y * (W / 2) * 4, y * (side / 2) * 4, y * (side / 2) * 4 + (W / 2) * 4);
  // A recoloured actor: its body and belly pixels take the palette of the 128px pixels they were reduced from.
  const pairs = Object.values(PALETTES), is = (p, c) => out[p] === RGB[c][0] && out[p + 1] === RGB[c][1] && out[p + 2] === RGB[c][2];
  for (let y = 0; y < H / 2; y++) for (let x = 0; x < W / 2; x++) {
    const p = (y * (W / 2) + x) * 4; if (!out[p + 3] || !(is(p, STONE) || is(p, IVORY))) continue;
    let pair; for (let yy = 2 * y - 1; yy <= 2 * y + 2 && !pair; yy++) for (let xx = 2 * x - 1; xx <= 2 * x + 2 && !pair; xx++) if (xx >= 0 && xx < W && yy >= 0 && yy < H) pair = pairs.find(q => q.body === tintedCanvas[yy * W + xx] || q.belly === tintedCanvas[yy * W + xx]);
    if (pair) out.set(RGB[is(p, STONE) ? pair.body : pair.belly], p);
  }
  return out;
}
export function onBg(rgba, bg = BG) { const out = Buffer.from(rgba); for (let p = 0; p < out.length / 4; p++) if (!out[p * 4 + 3]) out.set([...bg, 255], p * 4); return out; }
export async function gif(framesRGBA, w, h, ms, path, scale = 2) {
  const pngs = await Promise.all(framesRGBA.map(f => rawImage(f, w, h, scale).png().toBuffer()));
  await sharp(pngs, { join: { animated: true } }).gif({ delay: ms, loop: 0, colours: 16, dither: 0, effort: 7 }).toFile(path);
}

// ---------- measurement ----------
/** Per-actor step of the body fill's centre between poses, against the catalogue's p90 on and off the floor. */
export function measure(rendered, limits) {
  const { clip, W, solo, tracks } = rendered, report = { id: clip.id, maxGround: 0, maxAir: 0, over: [] };
  for (const actor of clip.actors) {
    const centres = solo[actor.name].map(c => bodyCentre(toRGBA(c), W, H));
    for (let f = 1; f < centres.length; f++) {
      const step = Math.hypot(centres[f].x - centres[f - 1].x, centres[f].y - centres[f - 1].y);
      const air = (tracks[actor.name][f].pose.lift ?? 0) > 0 || (tracks[actor.name][f - 1].pose.lift ?? 0) > 0 || clip.bounding;
      if (air) report.maxAir = Math.max(report.maxAir, step); else report.maxGround = Math.max(report.maxGround, step);
      if (step > (air ? limits.air : limits.ground) + 1e-6) report.over.push(`${actor.name}@${f}:${step.toFixed(2)}${air ? 'a' : 'g'}`);
    }
  }
  // Seam: each actor's first and last pose are the same neutral pose (room scenery is not part of the pose); floor: nothing grounded sinks below the floor line.
  let seam = 0; for (const actor of clip.actors) { const first = solo[actor.name][0], last = solo[actor.name].at(-1); for (let p = 0; p < first.length; p++) if (first[p] !== last[p]) seam++; }
  report.seam = seam; let lowest = 0, edge = 0;
  for (const fr of rendered.frames) for (let p = 0; p < fr.length; p++) if (fr[p]) { const y = Math.floor(p / W), x = p % W; lowest = Math.max(lowest, y); if (x < 2 || x >= W - 2 || y < 2) edge++; }
  report.lowest = lowest; report.edge = edge;
  // Duplicates: a pose identical to the one before it; palette: any colour outside the declared set.
  report.duplicates = 0; for (let f = 1; f < rendered.frames.length - 1; f++) { const a = rendered.frames[f], z = rendered.frames[f - 1]; let same = true; for (let p = 0; p < a.length && same; p++) same = a[p] === z[p]; if (same) report.duplicates++; }
  return report;
}
