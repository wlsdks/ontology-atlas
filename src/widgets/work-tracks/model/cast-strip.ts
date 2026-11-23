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
/**
 * The pixels behind each strip this page made, by its address: the app's content security policy lets
 * an image show a `blob:` address but not `fetch` read one, so a dressed strip is tinted from here.
 */
const made = new Map<string, Blob>();
const pixelsOf = async (url: string) => made.get(url) ?? (await fetch(url)).blob();

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
  const bitmap = await createImageBitmap(await pixelsOf(url));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bitmap, 0, 0);
  bitmap.close();
  const image = g.getImageData(0, 0, canvas.width, canvas.height);
  dress(image.data, canvas.width, info, all.cast[character], all.rest);
  g.putImageData(image, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  canvas.width = canvas.height = 0;
  const dressedUrl = URL.createObjectURL(blob);
  made.set(dressedUrl, blob);
  return dressedUrl;
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

/**
 * A strip with a session's ink laid on its saturated indigo (flippers, tail, laptop), by the same arithmetic
 * as the board's tint filter (`WorkBuilding.tsx`, `TintFilters`), done once per strip and ink instead of on
 * every step's repaint. Keyed by the strip's address and the ink as `r,g,b`.
 */
const tinted = new Map<string, string>();
const tinting = new Map<string, Promise<string | null>>();

/** The tinted strip's address, if it is ready. */
export const tintedStripUrl = (source: string, ink: string) => tinted.get(`${source}|${ink}`) ?? null;

/**
 * How much of the ink a pixel takes per unit of its own lightness. Moru's mid indigo takes about
 * three quarters of it and his lightest indigo nearly all, so his shading stays inside the ink.
 */
export const TINT_GAIN = 1.5;

/** Lays `ink` (`r,g,b`, 0 to 255) on one strip's pixels, as the filter does in sRGB. */
export function tintPixels(data: Uint8ClampedArray, ink: readonly number[]) {
  const [ir, ig, ib] = ink.map(value => value / 255);
  for (let p = 0; p < data.length; p += 4) {
    const A = data[p + 3] / 255;
    if (!A) continue;
    const R = data[p] / 255, G = data[p + 1] / 255, B = data[p + 2] / 255;
    // The indigo mask, the inked lightness (premultiplied), the mask applied, then laid over the source.
    const mask = Math.min(1, Math.max(0, -7 * R + 7 * B - 1.1));
    if (!mask) continue;
    const L = 0.3 * R + 0.5 * G + 0.2 * B, alpha = Math.min(1, TINT_GAIN * A);
    const inked = [ir, ig, ib].map(channel => Math.min(alpha, TINT_GAIN * L * A * channel));
    const accentA = alpha * mask;
    const outA = accentA + A * (1 - accentA);
    for (let k = 0; k < 3; k++) {
      const source = [R, G, B][k] * A;
      data[p + k] = Math.round(((inked[k] * mask + source * (1 - accentA)) / outA) * 255);
    }
    data[p + 3] = Math.round(outA * 255);
  }
}

async function tint(source: string, ink: string): Promise<string | null> {
  const bitmap = await createImageBitmap(await pixelsOf(source));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bitmap, 0, 0);
  bitmap.close();
  const image = g.getImageData(0, 0, canvas.width, canvas.height);
  tintPixels(image.data, ink.split(',').map(Number));
  g.putImageData(image, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  canvas.width = canvas.height = 0;
  return URL.createObjectURL(blob);
}

/** Tints the strips a room's Moru may show, one after another, before any is asked for. */
export async function prepareTint(sources: readonly string[], ink: string) {
  for (const source of sources) {
    const key = `${source}|${ink}`;
    if (tinted.has(key)) continue;
    let pending = tinting.get(key);
    if (!pending) { pending = tint(source, ink).catch(() => null); tinting.set(key, pending); }
    const url = await pending;
    tinting.delete(key);
    if (url) tinted.set(key, url);
  }
}
