/**
 * Draws the Moru cast: the rows a Work status room plays, once per character, each a body palette
 * and at most one head piece over the shipped poses. Every pose is the catalogue's own work-grid pose;
 * a head piece is typed below, set on the head where that pose carries it, doubled onto the work grid
 * and reduced by the catalogue's own reducer, so the 128px and 64px poses are made the way every other
 * Moru pose is. Only whole-pixel integer operations run here; no image is resampled.
 *
 *   pnpm brand:cast    writes public/brand/mascot-<row>-row-128-<character>.png
 */
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { exportedPose, workGridPoses } from './build-moru-sprites.mjs';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

/** The rows a room plays, by row name, with the catalogue clip each one is (`build-moru-companion.mjs`). */
export const CAST_ROWS = {
  waiting: 'blink', 'desk-type': 'desk-type', 'monitor-read': 'monitor-read', 'nod-off': 'nod-off', sigh: 'sigh',
  'crate-send': 'crate-send', 'merge-cheer': 'merge-cheer', 'settle-in': 'settle-in', galumph: 'galumph', 'galumph-left': 'galumph-left',
  'heads-up': 'heads-up',
};

const STONE = 'd6d3c9', IVORY = 'fff1d7', INK = '17192d';
/** The one hue the cast adds: the unicorn's mane and the rabbit's inner ears. */
export const CAST_PINK = 'f2b3c6';

/** One character's typed pixel map: each character one pixel on the 64px grid, so two at 128px. */
const KEY = { '#': INK, '@': '171923', m: '50569c', i: '6d73d2', s: STONE, '.': IVORY, l: '9399e5', g: 'b8b4aa', p: CAST_PINK };
/** Pixels at 128px per typed character, and the outline's thickness round a piece, as Moru's own is drawn. */
const UNIT = 2, RING = 2, RING_CUT = 1.6;

function piece(rows) {
  const w0 = Math.max(...rows.map(row => row.length)) * UNIT, h0 = rows.length * UNIT, w = w0 + 2 * RING, h = h0 + 2 * RING;
  const data = new Array(w * h).fill(null), mask = new Uint8Array(w * h);
  rows.forEach((row, r) => [...row].forEach((char, c) => {
    if (char === ' ') return;
    const colour = KEY[char];
    if (!colour) throw new Error(`head piece uses an undeclared character "${char}"`);
    for (let y = 0; y < UNIT; y++) for (let x = 0; x < UNIT; x++) { const p = (r * UNIT + y + RING) * w + c * UNIT + x + RING; data[p] = colour; mask[p] = 1; }
  }));
  for (let p = 0; p < data.length; p++) {
    if (!mask[p]) continue;
    const x = p % w, y = (p - x) / w;
    for (let dy = -RING; dy <= RING; dy++) for (let dx = -RING; dx <= RING; dx++) {
      const xx = x + dx, yy = y + dy, n = yy * w + xx;
      if (Math.abs(dx) + Math.abs(dy) <= RING * RING_CUT && xx >= 0 && yy >= 0 && xx < w && yy < h && !mask[n]) data[n] = INK;
    }
  }
  return { data, w, h };
}
const flipped = sprite => ({ ...sprite, data: Array.from({ length: sprite.data.length }, (_, p) => sprite.data[p - p % sprite.w + sprite.w - 1 - p % sprite.w]) });

const HORN = piece(['..   ', '...  ', ' ... ', ' ....', '  ..g', '  .gg']);
const UNICORN_HORN = piece(['   .  ', '   .. ', '  ... ', '  i.. ', ' ..i. ', ' i..i ', '..i.. ', '...i. ']);
const MANE = piece(['      llp ', '    llplll', '   llplll ', '  llllll  ', ' llilll   ', ' lliil    ', 'llil      ', 'lli       ']);
const EAR_LEFT = piece([' sss ', 'sssss', 'sppps', 'sppps', 'sppps', 'sppps', 'sppps', 'sppps', 'sssss', 'sssss']);
const EAR_RIGHT = piece(['    sss ', '   sssss', '  ssppps', '  sppps ', ' sppps  ', ' sppps  ', 'sppps   ', 'sppps   ', 'sssss   ', 'sssss   ']);
const HARD_HAT = piece(['       lll        ', '     iilllii      ', '    iiilllliii    ', '   iiiillliiiii   ', '   iiiillliiiii   ', '   ............   ', 'mmiiiiiiiiiiiiiimm']);

/**
 * The cast. A palette swaps only the body fill and the belly tone (and a piece drawn in them); the
 * outline, the eyes, the indigo flippers and tail and the shading stay, so every row means what it
 * means on the grey Moru. Each tint has the original tone's luminance, so contrast holds by
 * construction. A head piece sits at 128px coordinates on the neutral pose and follows the crown.
 * The scholar's blue-grey (`#cad4e3`) waits for its glasses and scarf: alone, under a room's light,
 * it reads as the grey original.
 */
export const CAST = {
  horn: { body: 'e8d1a7', belly: 'fff1d6', pieces: [[HORN, 62, 36], [flipped(HORN), 86, 36]] },
  unicorn: { body: 'dacdf1', belly: 'f8f0ff', pieces: [[MANE, 54, 38], [UNICORN_HORN, 76, 30]] },
  dragon: { body: 'b1ddc5', belly: 'e4f8e4', pieces: [] },
  rabbit: { body: 'e8cec2', belly: 'fef0e6', pieces: [[EAR_RIGHT, 80, 26], [EAR_LEFT, 62, 26]] },
  builder: { body: 'd1ccc0', belly: 'f7edd9', pieces: [[HARD_HAT, 60, 36]] },
};

const SIZE = 128, WORK = 256;
const hexAt = (frame, p) => frame[p * 4 + 3] ? [0, 1, 2].map(i => frame[p * 4 + i].toString(16).padStart(2, '0')).join('') : null;
const rgb = hex => [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
/** Flippers, tail and props keep their place in front of a head piece. */
const IN_FRONT = new Set(['50569c', '6d73d2', '9399e5']);
/** Rows of outline over the first row of body fill on the neutral pose. */
const DOME_OUTLINE = 3;

/** Where a pose carries the head: the first row of body fill and the centre of the fill in its first four rows. */
export function crownOf(frame) {
  let top = -1;
  for (let p = 0; p < SIZE * SIZE && top < 0; p++) if (hexAt(frame, p) === STONE) top = Math.floor(p / SIZE);
  if (top < 0) throw new Error('pose has no body fill');
  let sum = 0, count = 0;
  for (let y = top; y < top + 4; y++) for (let x = 0; x < SIZE; x++) if (hexAt(frame, y * SIZE + x) === STONE) { sum += x; count++; }
  return { top, x: sum / count };
}

/** Whether a pose faces left: its tail, the indigo beside the body, stands right of the body fill. */
export function facesLeft(frame) {
  let tail = 0, tails = 0, body = 0, bodies = 0;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const hex = hexAt(frame, y * SIZE + x);
    if (hex === STONE || hex === IVORY) { body += x; bodies++; }
    else if (y >= TAIL_ROWS[0] && y < TAIL_ROWS[1] && (hex === '50569c' || hex === '6d73d2')) { tail += x; tails++; }
  }
  return tails > 0 && tail / tails > body / bodies;
}
/** Rows the tail stands in beside the body, above the flippers on the floor. */
const TAIL_ROWS = [55, 85];

/** A pose's head pieces at 128px, drawn behind every prop over the head and every flipper. */
function dressed128(frame, pieces, shift) {
  const out = new Array(SIZE * SIZE).fill(null), { top } = crownOf(frame);
  for (const [sprite, left, topAt] of pieces) for (let y = 0; y < sprite.h; y++) for (let x = 0; x < sprite.w; x++) {
    const colour = sprite.data[y * sprite.w + x], xx = left + shift.x + x, yy = topAt + shift.y + y;
    if (!colour || xx < 0 || yy < 0 || xx >= SIZE || yy >= SIZE) continue;
    const under = hexAt(frame, yy * SIZE + xx);
    if (under && (IN_FRONT.has(under) || yy < top - DOME_OUTLINE)) continue;
    out[yy * SIZE + xx] = colour;
  }
  return out;
}

/** The work-grid pose with the head pieces doubled onto it, every 128px pixel a 2 × 2 block. */
function dressedWork(work, layer) {
  const out = Buffer.from(work);
  for (let p = 0; p < layer.length; p++) {
    if (!layer[p]) continue;
    const x = p % SIZE, y = (p - x) / SIZE, colour = [...rgb(layer[p]), 255];
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) out.set(colour, ((2 * y + dy) * WORK + 2 * x + dx) * 4);
  }
  return out;
}

/** Body and belly to the character's pair; every other pixel as it was. */
export function recoloured(frame, { body, belly }) {
  const out = Buffer.from(frame), [b, i] = [rgb(body), rgb(belly)];
  for (let p = 0; p < out.length / 4; p++) {
    const hex = hexAt(out, p);
    if (hex === STONE) out.set(b, p * 4);
    else if (hex === IVORY) out.set(i, p * 4);
  }
  return out;
}

/**
 * One character's poses of one row at an exported size. `plain` is the row as shipped at 128px, which
 * says where each pose carries the head, and `rest` the crown of the neutral pose.
 */
export function castPoses(work, plain, rest, character, exported = SIZE) {
  const { pieces } = CAST[character];
  return work.map((frame, i) => {
    const label = `${character} frame ${i + 1}`;
    if (!pieces.length) return recoloured(exportedPose(frame, exported, label), CAST[character]);
    // A pose turned to the left wears its pieces mirrored about the mirrored neutral's crown.
    const left = facesLeft(plain[i]), worn = left ? pieces.map(([sprite, x, y]) => [flipped(sprite), SIZE - x - sprite.w, y]) : pieces;
    const crown = crownOf(plain[i]), shift = { x: Math.round(crown.x - (left ? SIZE - 1 - rest.x : rest.x)), y: crown.top - rest.top };
    return recoloured(exportedPose(dressedWork(frame, dressed128(plain[i], worn, shift)), exported, label), CAST[character]);
  });
}

/** Each room row's work-grid poses and its 128px poses as shipped, and the neutral pose's crown. */
export async function castSources() {
  const rows = {};
  for (const [row, clip] of Object.entries(CAST_ROWS)) {
    const work = await workGridPoses(clip);
    rows[row] = { work, plain: work.map((frame, i) => exportedPose(frame, SIZE, `${row} frame ${i + 1}`)) };
  }
  return { rows, rest: crownOf(rows.waiting.plain[0]) };
}

const stripOf = frames => {
  const width = SIZE * frames.length, data = Buffer.alloc(width * SIZE * 4);
  frames.forEach((frame, i) => { for (let y = 0; y < SIZE; y++) frame.copy(data, (y * width + i * SIZE) * 4, y * SIZE * 4, (y + 1) * SIZE * 4); });
  return { data, width };
};

export const castFile = (row, character) => `public/brand/mascot-${row}-row-128-${character}.png`;

/** Every cast row as raw pixels, drawn in memory: `{ row, character, data, width }`. */
export async function drawCast() {
  const { rows, rest } = await castSources();
  return Object.entries(rows).flatMap(([row, { work, plain }]) => Object.keys(CAST).map(character => ({ row, character, ...stripOf(castPoses(work, plain, rest, character)) })));
}

export async function buildCast() {
  let bytes = 0;
  for (const { row, character, data, width } of await drawCast()) {
    const png = await sharp(data, { raw: { width, height: SIZE, channels: 4 } }).png({ compressionLevel: 9, palette: false }).toBuffer();
    await writeFile(castFile(row, character), png);
    bytes += png.length;
  }
  console.log(`[moru] cast: ${Object.keys(CAST).length} characters × ${Object.keys(CAST_ROWS).length} rows, ${bytes} bytes`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await buildCast();
