/**
 * Draws the cast clips a Work status room plays beyond its own rows: the tool clips while it works, the
 * emotions it shows for what it observed, and the conversations two tools in one room have. Each is one grey
 * strip; the room dresses it at run time with its Moru's palette and head piece
 * (`src/widgets/work-tracks/model/cast-strip.ts`), so no strip is shipped per character.
 *
 * A conversation is redrawn for the room: the two stand where a room's pair stands (120px apart, both facing
 * the screen), the one in front turns to the other first and back at the end, so the clip opens and closes on
 * the pair's own neutral poses.
 *
 *   pnpm brand:room-clips    writes public/brand/moru-room-<clip>.png and public/brand/moru-room-clips.json
 */
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderClip, timeline } from './moru-cast/scene.mjs';
import { makeRig, drawMoru, blitMoru, N } from './moru-cast/engine.mjs';
import { toRGBA, STONE } from './moru-cast/rig.mjs';
import { CLIPS } from './moru-cast/clips.mjs';
import { TURN } from './moru-cast/life/export-atlas.mjs';
import { writeCataloguePace } from './moru-cast/catalogue-pace.mjs';
import { previewPath, REPO, sharp } from './moru-cast/lib.mjs';
import { CAST } from './build-moru-cast.mjs';

/** What each observed state plays; the mapping is in `docs/specs/2026-11-22-moru-cast.md`, "In the app". */
export const ROOM_TOOLS = ['hook-wrench', 'gear-start', 'magnifier-read', 'switch-flip', 'book-stack', 'timer-set', 'lock-check', 'sapling-tend'];
export const ROOM_FEELINGS = ['feel-worried', 'feel-proud', 'feel-happy'];
export const ROOM_TALKS = ['ask-idea', 'ask-fish', 'teach', 'idea-shrug-sulk'];
/** Where a room's second Moru stands from the first, in drawn pixels (`rooms.module.css`, `.scene[data-cast='two']`). */
export const PAIR_APART = 120;

const H = N;
const turnIn = [{ pose: {}, shapes: {} }, ...TURN, { pose: { x: -8 }, shapes: { flip: true } }];
const byId = id => { const clip = CLIPS.find(c => c.id === id); if (!clip) throw new Error(`no clip ${id}`); return clip; };

/** A conversation where the pair stands: the one in front turns to the other, talks, and turns back. */
function forThePair(clip, settle) {
  const [a, b] = clip.actors, T = turnIn.length, frames = clip.frames + 2 * T;
  const aTrack = timeline(a.beats, clip.frames), bTrack = timeline(b.beats, clip.frames);
  const hold = track => Array.from({ length: T }, () => track[0]);
  // The second actor is drawn flipped; its turn poses carry the opposite flip, so it starts and ends facing the screen.
  const flipped = pose => ({ pose: pose.pose, shapes: { ...pose.shapes, flip: !pose.shapes.flip } });
  const turn = turnIn.map(flipped);
  const talk = bTrack.map(k => ({ pose: { ...k.pose, x: (k.pose.x ?? 0) + settle }, shapes: k.shapes }));
  return {
    ...clip, id: `${clip.id}-pair`, W: PAIR_APART + N, frames, limits: undefined,
    actors: [
      { ...a, costume: undefined, ox: 0, poses: [...hold(aTrack), ...aTrack, ...hold(aTrack.slice(-1))] },
      { ...b, costume: undefined, ox: PAIR_APART, flip: true, poses: [...turn, ...talk, ...[...turn].reverse()] },
    ],
    bubbles: (clip.bubbles ?? []).map(bub => ({ ...bub, from: bub.from + T, to: bub.to + T })),
    over: clip.over ? (f, api) => { if (f >= T && f < T + clip.frames) clip.over(f - T, api); } : undefined,
    under: clip.under ? (f, api) => { if (f >= T && f < T + clip.frames) clip.under(f - T, api); } : undefined,
  };
}

/** The first row of body fill, and the middle of the fill in its first four rows. */
function crownOf(frame, W) {
  let top = -1;
  for (let p = 0; p < frame.length && top < 0; p++) if (frame[p] === STONE) top = Math.floor(p / W);
  if (top < 0) return null;
  let sum = 0, count = 0;
  for (let y = top; y < top + 4; y++) for (let x = 0; x < W; x++) if (frame[y * W + x] === STONE) { sum += x; count++; }
  return { top, x: sum / count };
}
const centreOf = (frame, W) => {
  let sx = 0, sy = 0, n = 0;
  for (let p = 0; p < frame.length; p++) if (frame[p] === STONE) { sx += p % W; sy += Math.floor(p / W); n++; }
  return { x: sx / n, y: sy / n };
};

export async function buildRoomClips() {
  await writeCataloguePace();
  const LIMITS = JSON.parse(await readFile(previewPath('catalogue-pace.json'), 'utf8'));
  const lim = { ground: LIMITS.grounded.p90 - 0.01, air: LIMITS.airborne.p90 - 0.01 };
  const rig = await makeRig(), neutral = new Uint8Array(N * N);
  blitMoru(neutral, N, drawMoru(rig), 0);
  const rest = crownOf(neutral, N);
  const out = { cell: N, rest, clips: {}, cast: {} };
  let bytes = 0;
  const write = async (id, r, kind) => {
    const W = r.W, n = r.frames.length, strip = Buffer.alloc(W * n * H * 4);
    r.frames.forEach((frame, f) => {
      const rgba = toRGBA(frame);
      for (let y = 0; y < H; y++) rgba.copy(strip, (y * W * n + f * W) * 4, y * W * 4, (y + 1) * W * 4);
    });
    const png = await sharp(strip, { raw: { width: W * n, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
    const name = `moru-room-${id}.png`;
    await writeFile(join(REPO, 'public/brand', name), png);
    bytes += png.length;
    // Where each actor carries its head on each pose, and which way it faces, so the room can set its head piece there.
    const actors = r.clip.actors.map(actor => ({
      ox: actor.ox,
      poses: r.solo[actor.name].map((solo, f) => {
        const crown = crownOf(solo, W), k = r.tracks[actor.name][f];
        return crown ? [Math.round(crown.x * 2) / 2, crown.top, Number(!!actor.flip !== !!k.shapes.flip)] : null;
      }),
    }));
    out.clips[id] = { kind, file: name, w: W, n, actors };
    // A room switches clips on the neutral pose, so every strip opens and closes on it: no body moves at the seam.
    const home = centreOf(neutral, N);
    for (const actor of r.clip.actors) for (const f of [0, n - 1]) {
      const c = centreOf(r.solo[actor.name][f], W), off = Math.hypot(c.x - actor.ox - home.x, c.y - home.y);
      if (off > 2) throw new Error(`${id}: ${actor.name} is ${off.toFixed(2)}px off the neutral pose on cell ${f}`);
    }
  };
  for (const id of [...ROOM_TOOLS, ...ROOM_FEELINGS]) {
    const clip = byId(id);
    await write(id, await renderClip({ ...clip, limits: lim, actors: clip.actors.map(a => ({ ...a, costume: undefined })) }), ROOM_TOOLS.includes(id) ? 'tool' : 'feeling');
  }
  for (const id of ROOM_TALKS) {
    // The talk's own neutral after the turn sits where the turn ends: the shift that makes that seam smallest.
    let best = null;
    for (let settle = -16; settle <= 16; settle += 2) {
      const r = await renderClip(forThePair(byId(id), settle)), T = turnIn.length, solo = r.solo.b;
      const seam = (i, j) => { const p = centreOf(solo[i], r.W), q = centreOf(solo[j], r.W); return Math.hypot(p.x - q.x, p.y - q.y); };
      const worst = Math.max(seam(T - 1, T), seam(r.frames.length - T - 1, r.frames.length - T));
      if (!best || worst < best.worst) best = { worst, r, settle };
    }
    console.log(`[moru] ${id} for the pair: seam ${best.worst.toFixed(2)}px at settle ${best.settle}`);
    await write(id, best.r, 'talk');
  }
  for (const [character, { body, belly, pieces }] of Object.entries(CAST)) {
    out.cast[character] = { body, belly, pieces: pieces.map(([sprite, x, y]) => ({ x, y, w: sprite.w, h: sprite.h, data: sprite.data.map(c => c ?? '').join(',') })) };
  }
  await writeFile(join(REPO, 'public/brand/moru-room-clips.json'), JSON.stringify(out));
  console.log(`[moru] room clips: ${Object.keys(out.clips).length} strips, ${bytes} bytes`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await buildRoomClips();
