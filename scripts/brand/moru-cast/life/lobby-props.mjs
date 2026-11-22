// The lobby's fixtures, drawn as the cast is: a letter is a 2px block of Moru's own palette, and every piece wears the
// cast's 2px ink outline. Each stands on the floor at its `foot`: the point of the sprite that goes on the back lane's
// feet line. The bench and the crate show their top from a little above, and that top lies on the feet line, so a Moru
// standing in the back lane is on them and their front shows below it.
import { join } from 'node:path';
import { KEY, px, flipSprite } from '../engine.mjs';
import { toRGBA } from '../rig.mjs';
import { sharp } from '../lib.mjs';

const K = { ...KEY, h: 9 };
const art = rows => px(rows, { unit: 2, ring: 2, key: K });
const fill = (w, at) => Array.from({ length: w }, (_, c) => at(c)).join('');
/** A row from runs of `[first, last, letter]`; a later run lies over an earlier one. */
const span = (w, runs) => fill(w, c => runs.findLast(([a, z]) => c >= a && c <= z)?.[2] ?? ' ');

// A long low bench: two end posts with a back rail between them, a pale seat, an apron and two short legs. A small
// cushion lies at the end a napping Moru's head is, clear of its body.
const BENCH_W = 68, POSTS = [[0, 2, 's'], [3, 3, 'g'], [64, 66, 's'], [67, 67, 'g']];
const BENCH = [
  span(BENCH_W, [[1, 2, 's'], [65, 66, 's']]),
  span(BENCH_W, POSTS),
  span(BENCH_W, [...POSTS, [4, 63, 's']]),
  span(BENCH_W, [...POSTS, [4, 63, 'g']]),
  span(BENCH_W, POSTS),
  span(BENCH_W, POSTS),
  span(BENCH_W, [...POSTS, [4, 63, 's']]),
  span(BENCH_W, [...POSTS, [4, 63, 'g']]),
  span(BENCH_W, POSTS),
  span(BENCH_W, [...POSTS, [57, 61, 'l']]),
  span(BENCH_W, [...POSTS, [56, 62, 'i'], [56, 56, 'l'], [62, 62, 'm']]),
  span(BENCH_W, [...POSTS, [56, 62, 'i'], [56, 56, 'l'], [62, 62, 'm']]),
  span(BENCH_W, [[0, 67, '.']]),
  span(BENCH_W, [[0, 67, '.']]),
  span(BENCH_W, [[0, 67, 's']]),
  span(BENCH_W, [[0, 67, 'g']]),
  span(BENCH_W, [[0, 67, 'h']]),
  ...Array.from({ length: 5 }, () => span(BENCH_W, [[2, 4, 'g'], [5, 5, 'h'], [62, 64, 'g'], [65, 65, 'h']])),
];
/** The seat's rows: the feet line runs through their middle. */
const BENCH_SEAT = [12, 14];

// A shipping crate: three planks on top, a framed front, and a fish stencilled on it.
const CRATE_W = 48, FISH = ['  ....   .', ' ......  ..', '...........', ' ......  ..', '  ....   .'], FISH_AT = [18, 7];
const crateFront = r => fill(CRATE_W, c => {
  const fish = FISH[r - FISH_AT[1]]?.[c - FISH_AT[0]];
  return fish === '.' ? '.' : c < 2 || c > CRATE_W - 3 || r < 5 || r > 13 ? 'm' : 'i';
});
const CRATE = [
  ...Array.from({ length: 3 }, () => fill(CRATE_W, c => (c === 15 || c === 32 ? 'i' : 'l'))),
  fill(CRATE_W, () => 'i'),
  ...Array.from({ length: 11 }, (_, k) => crateFront(k + 4)),
];
const CRATE_TOP = [0, 3];

// A play mat on the floor: a border, a pale line inside it, and one lozenge in the middle.
const MAT_W = 76, lozenge = half => [[38 - half, 37 + half, '.']];
const MAT = [
  span(MAT_W, [[2, 73, 'i']]),
  span(MAT_W, [[1, 74, 'i']]),
  span(MAT_W, [[0, 75, 'i'], [2, 73, 'l']]),
  ...[1, 3, 5, 3, 1].map(half => span(MAT_W, [[0, 75, 'i'], [2, 73, 'l'], [3, 72, 'm'], ...lozenge(half)])),
  span(MAT_W, [[0, 75, 'i'], [2, 73, 'l']]),
  span(MAT_W, [[1, 74, 'i']]),
  span(MAT_W, [[2, 73, 'i']]),
];

// A plant in a stone pot: five broad leaves, each lit above and shaded below, on dark stems.
const PLANT = [
  '           lll            ',
  '          lllll           ',
  '          lllll           ',
  '          lllli           ',
  '   lll    lllii    lll    ',
  '  lllll   lliii   lllll   ',
  ' llllll    lii   llllli   ',
  ' lllllii    m    lllliii  ',
  ' llllii     m   llllii    ',
  '  lliiim    m  mlliii     ',
  '    iiimm   m mmiii       ',
  '       mmm  mmm           ',
  ' lll     mmmm      lll    ',
  'lllll     mm     lllll    ',
  'llllll    mm    llllli    ',
  'llllii    mm   llllii     ',
  ' lliiimm  mm mmlliii      ',
  '   iii mmmmmmmm iii       ',
  '          mm              ',
  '          mm              ',
  '      ...........         ',
  '      .sssssssssg         ',
  '       ssssssssg          ',
  '       ssssssssg          ',
  '       sssssssgg          ',
  '       ssssssggg          ',
  '        sssgggg           ',
  '        gggggg            ',
];

// A doorway in the back wall: a stone arch, dark inside, with the first three steps of a stair going up and away from
// the room. The one at the other edge is its mirror.
const DOOR_W = 28, DOOR_H = 46, ARCH = [8, 5, 3, 2, 1, 0];
const inArch = (r, c, inset) => { const top = r - inset; if (top < 0 || c < inset || c > DOOR_W - 1 - inset) return false; const cut = ARCH[top] ?? 0; return c >= cut + inset && c <= DOOR_W - 1 - cut - inset; };
const STEPS = [[41, 0], [38, 5], [35, 10]];
const DOOR = Array.from({ length: DOOR_H }, (_, r) => fill(DOOR_W, c => {
  if (!inArch(r, c, 0)) return ' ';
  if (r >= DOOR_H - 1) return 'g';
  if (!inArch(r, c, 2)) return 's';
  if (!inArch(r, c, 3)) return 'g';
  const step = STEPS.find(([top, cut]) => r >= top && r < top + 3 && c <= DOOR_W - 4 - cut);
  return step ? (r === step[0] ? 'i' : 'm') : '#';
}));

const door = art(DOOR), UNIT = 2;
/** Each fixture's sprite and its `foot`: the sprite point set on its place on the back lane's feet line. */
const LOBBY_PROPS = (() => {
  const bench = art(BENCH), crate = art(CRATE), mat = art(MAT), plant = art(PLANT);
  const middle = s => Math.round(s.w / 2), rowsMiddle = ([a, z], s) => s.pad + (a + z + 1) * UNIT / 2;
  return {
    bench: { s: bench, foot: [middle(bench), rowsMiddle(BENCH_SEAT, bench)] },
    crate: { s: crate, foot: [middle(crate), rowsMiddle(CRATE_TOP, crate)] },
    mat: { s: mat, foot: [middle(mat), Math.round(mat.h / 2)] },
    plant: { s: plant, foot: [plant.pad + 23, plant.h - plant.pad] },
    door: { s: door, foot: [door.pad, door.h - door.pad] },
    doorRight: { s: flipSprite(door), foot: [door.w - door.pad, door.h - door.pad] },
  };
})();

/** Writes the fixtures side by side on one sheet and returns where each is: its place on the sheet, its size and its foot. */
export async function writeLobbyProps(dir, name) {
  const list = Object.entries(LOBBY_PROPS), W = list.reduce((a, [, p]) => a + p.s.w + 2, 0), H = Math.max(...list.map(([, p]) => p.s.h)), sheet = Buffer.alloc(W * H * 4), meta = {};
  let sx = 0;
  for (const [id, { s, foot }] of list) {
    const rgba = toRGBA(s.data);
    for (let y = 0; y < s.h; y++) rgba.copy(sheet, (y * W + sx) * 4, y * s.w * 4, (y + 1) * s.w * 4);
    meta[id] = { sx, w: s.w, h: s.h, fx: foot[0], fy: foot[1] };
    sx += s.w + 2;
  }
  await sharp(sheet, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toFile(join(dir, name));
  return meta;
}
