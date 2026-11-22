import { withBasePath } from '@/shared/lib/public-pages/base-path';

/**
 * The cast clips a room plays beyond its own rows (`pnpm brand:room-clips`): one grey strip each, dressed here
 * once per room character with its body palette and head piece, the way `pnpm brand:cast` dresses the rows,
 * so no strip ships per character. A dressed strip is a PNG blob the room's sprite shows as its background.
 */

interface ClipInfo {
  kind: 'tool' | 'feeling' | 'talk';
  file: string;
  /** Cell width; the strip has `n` cells. */
  w: number;
  n: number;
  /** Per actor: its cell's left edge and, per pose, where it carries its head (`[x, top, faces left]`). */
  actors: { ox: number; poses: ([number, number, number] | null)[] }[];
}
interface CastLook { body: string; belly: string; pieces: { x: number; y: number; w: number; h: number; data: string }[] }
interface RoomClips { cell: number; rest: { top: number; x: number }; clips: Record<string, ClipInfo>; cast: Record<string, CastLook> }

const SOURCE = '/brand/moru-room-clips.json';
const STONE = 0xd6d3c9, IVORY = 0xfff1d7;
/** Flippers, tail and props stay in front of a head piece. */
const IN_FRONT = new Set([0x50569c, 0x6d73d2, 0x9399e5]);
/** Rows of outline over the first row of body fill on the neutral pose. */
const DOME_OUTLINE = 3;

let source: Promise<RoomClips | null> | null = null;
let known: RoomClips | null = null;
const dressed = new Map<string, string>();
const making = new Map<string, Promise<string | null>>();

const loadSource = () => (source ??= fetch(withBasePath(SOURCE))
  .then(response => (response.ok ? (response.json() as Promise<RoomClips>) : null))
  .then(data => { known = data; return data; })
  .catch(() => null));

/** A clip's cells and cell width once the strips' description has loaded, or null for a room row. */
export const castClip = (clip: string): ClipInfo | null => known?.clips[clip] ?? null;

/** The dressed strip's address, if it is ready. */
export const castStripUrl = (clip: string, character: string) => dressed.get(`${clip}|${character}`) ?? null;

const hex = (n: number) => [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];

function dress(data: Uint8ClampedArray, width: number, info: ClipInfo, look: CastLook, rest: RoomClips['rest']) {
  const body = hex(parseInt(look.body, 16)), belly = hex(parseInt(look.belly, 16));
  const at = (p: number) => (data[p * 4 + 3] ? (data[p * 4] << 16) | (data[p * 4 + 1] << 8) | data[p * 4 + 2] : -1);
  // Head pieces first, against the grey pixels, as `build-moru-cast.mjs` sets them.
  const pieces = look.pieces.map(piece => ({ ...piece, cells: piece.data.split(',').map(cell => (cell ? parseInt(cell, 16) : -1)) }));
  for (let f = 0; f < info.n; f++) for (const actor of info.actors) {
    const pose = actor.poses[f];
    if (!pose) continue;
    const [crownX, top, left] = pose;
    const shift = { x: Math.round(crownX - actor.ox - (left ? 127 - rest.x : rest.x)), y: top - rest.top };
    for (const piece of pieces) {
      const px0 = left ? 128 - piece.x - piece.w : piece.x;
      for (let y = 0; y < piece.h; y++) for (let x = 0; x < piece.w; x++) {
        const colour = piece.cells[y * piece.w + (left ? piece.w - 1 - x : x)];
        if (colour < 0) continue;
        const xx = actor.ox + px0 + shift.x + x, yy = piece.y + shift.y + y;
        if (xx < 0 || yy < 0 || xx >= info.w || yy >= 128) continue;
        const p = yy * width + f * info.w + xx, under = at(p);
        if (under >= 0 && (IN_FRONT.has(under) || yy < top - DOME_OUTLINE)) continue;
        const [r, g, b] = hex(colour);
        data[p * 4] = r; data[p * 4 + 1] = g; data[p * 4 + 2] = b; data[p * 4 + 3] = 255;
      }
    }
  }
  // Then the body and belly to the character's pair; every other pixel as it was.
  for (let p = 0; p < data.length / 4; p++) {
    const colour = at(p);
    const to = colour === STONE ? body : colour === IVORY ? belly : null;
    if (to) { data[p * 4] = to[0]; data[p * 4 + 1] = to[1]; data[p * 4 + 2] = to[2]; }
  }
}

async function make(clip: string, character: string): Promise<string | null> {
  const all = await loadSource();
  const info = all?.clips[clip];
  if (!all || !info) return null;
  const url = withBasePath(`/brand/${info.file}`);
  if (character === 'grey' || !all.cast[character]) return url;
  const bitmap = await createImageBitmap(await (await fetch(url)).blob());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bitmap, 0, 0);
  bitmap.close();
  const image = g.getImageData(0, 0, canvas.width, canvas.height);
  dress(image.data, canvas.width, info, all.cast[character], all.rest);
  g.putImageData(image, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  canvas.width = canvas.height = 0;
  return URL.createObjectURL(blob);
}

/** Dresses the strips a room may play for its Moru, one after another, so each is ready before it is asked for. */
export async function prepareCast(character: string, clips: readonly string[]) {
  const all = await loadSource();
  if (!all) return;
  for (const clip of clips) {
    if (!all.clips[clip]) continue;
    const key = `${clip}|${character}`;
    if (dressed.has(key)) continue;
    let pending = making.get(key);
    if (!pending) { pending = make(clip, character).catch(() => null); making.set(key, pending); }
    const url = await pending;
    making.delete(key);
    if (url) dressed.set(key, url);
  }
}
