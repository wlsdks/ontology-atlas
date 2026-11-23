// The lobby's fixtures, drawn as the cast is: a letter is a 2px block of Moru's own palette, and every piece wears the
// cast's 2px ink outline. Each stands on the floor at its `foot`: the point of the sprite that goes on the back lane's
// feet line. The back wall behind them is the one piece in the building's own graphite, not Moru's palette. The bench and the crate show their top from a little above, and that top lies on the feet line, so a Moru
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

/**
 * A box seen from the front and a little from above and the left: its front face `w` by `h` letters, its top and its
 * right side going back `deep` letters, one letter right and one up for each. `front`, `top` and `side` give the letter
 * at a place on each face.
 */
const box = ({ w, h, deep, front, top, side }) => Array.from({ length: h + deep }, (_, r) => fill(w + deep, c => {
  if (r >= deep && c < w) return front(c, r - deep);
  for (let d = 1; d <= deep; d++) {
    if (r === deep - d && c >= d && c < w + d) return top(c - d, d);
    if (c === w - 1 + d && r >= deep - d && r < h + deep - d) return side(d, r - (deep - d));
  }
  return ' ';
}));
/** Lays `over` on `rows` with its corner at letter (`left`, `top`); its spaces leave what is under them. */
const lay = (rows, over, left, top) => rows.map((row, r) => { const o = over[r - top]; return o ? fill(row.length, c => (o[c - left] && o[c - left] !== ' ' ? o[c - left] : row[c])) : row; });

// A long low bench with volume: a seat slab whose pale top goes back three letters, a lit front edge, a shaded end, four
// legs (the far two in shadow), and a back rest of two posts and two rails standing on the seat's far edge. A small
// cushion lies at the end a napping Moru's head is, clear of its body.
const SEAT_W = 68, SEAT_DEEP = 3, REST_H = 12, LEG_H = 5, BENCH_W = SEAT_W + SEAT_DEEP;
const SEAT = box({ w: SEAT_W, h: 3, deep: SEAT_DEEP, top: () => '.', side: (d, r) => (r === 0 ? 'g' : 'h'), front: (c, r) => 'sgh'[r] });
const POSTS = [[3, 5, 's'], [6, 6, 'g'], [67, 69, 's'], [70, 70, 'g']];
const REST = [
  span(BENCH_W, [[4, 5, 's'], [68, 69, 's']]),
  span(BENCH_W, POSTS),
  span(BENCH_W, [...POSTS, [7, 66, 's']]),
  span(BENCH_W, [...POSTS, [7, 66, 'g']]),
  span(BENCH_W, POSTS),
  span(BENCH_W, POSTS),
  span(BENCH_W, [...POSTS, [7, 66, 's']]),
  span(BENCH_W, [...POSTS, [7, 66, 'g']]),
  span(BENCH_W, POSTS),
  span(BENCH_W, [...POSTS, [59, 63, 'l']]),
  span(BENCH_W, [...POSTS, [58, 64, 'i'], [58, 58, 'l'], [64, 64, 'm']]),
  span(BENCH_W, [...POSTS, [58, 64, 'i'], [58, 58, 'l'], [64, 64, 'm']]),
];
// Under the seat: the far legs first, three letters right and up and so cut short by the seat, then the near ones.
const LEGS = Array.from({ length: LEG_H }, (_, r) => span(BENCH_W, [...(r < LEG_H - SEAT_DEEP ? [[6, 8, 'h'], [66, 68, 'h']] : []), [2, 4, 'g'], [5, 5, 'h'], [62, 64, 'g'], [65, 65, 'h']]));
const BENCH = [...REST, ...SEAT, ...LEGS];
/** The seat's top rows: the feet line runs through their middle. */
const BENCH_SEAT = [REST_H, REST_H + SEAT_DEEP - 1];

// A shipping crate with volume: three lit planks on a top that goes back four letters, a framed front with a fish
// stencilled on it and a darker foot rail, and a right side in shadow.
const CRATE_W = 44, CRATE_H = 11, CRATE_DEEP = 4, FISH = ['  ....   .', ' ......  ..', '...........', ' ......  ..', '  ....   .'], FISH_AT = [16, 3];
const CRATE = box({ w: CRATE_W, h: CRATE_H, deep: CRATE_DEEP,
  top: (c, d) => (c === 14 || c === 29 ? 'i' : d === 1 ? '.' : 'l'),
  side: (d, r) => (r === 0 ? 'i' : 'm'),
  front: (c, r) => (FISH[r - FISH_AT[1]]?.[c - FISH_AT[0]] === '.' ? '.' : r === 0 ? 'l' : r >= CRATE_H - 2 || c < 2 || c > CRATE_W - 3 ? 'm' : 'i') });
const CRATE_TOP = [0, CRATE_DEEP - 1];

// A play mat lying on the floor: narrower at its far edge, a pale border, one lozenge in the middle, and its thickness
// showing dark along the near edge.
const MAT_W = 76, MAT_DEEP = 9, lozenge = half => [[38 - half, 37 + half, '.']];
const MAT = [
  ...Array.from({ length: MAT_DEEP }, (_, r) => { const cut = Math.ceil((MAT_DEEP - 1 - r) / 2), a = cut, z = MAT_W - 1 - cut, edge = r === 0 || r === MAT_DEEP - 1;
    return span(MAT_W, [[a, z, 'l'], ...(edge ? [] : [[a + 2, z - 2, 'i'], ...(r >= 2 && r <= 6 ? lozenge([1, 3, 5, 3, 1][r - 2]) : [])])]); }),
  span(MAT_W, [[0, MAT_W - 1, 'm']]),
];

// A window for the back wall: a stone arch with a sill, four panes of night, and a small moon in one.
const WIN_W = 20, WIN_H = 23, WIN_ARCH = [6, 4, 2, 1, 0];
const inWindow = (r, c, inset) => { const top = r - inset; if (top < 0 || c < inset || c > WIN_W - 1 - inset) return false; const cut = WIN_ARCH[top] ?? 0; return c >= cut + inset && c <= WIN_W - 1 - cut - inset; };
const WINDOW = [
  ...Array.from({ length: WIN_H }, (_, r) => ' ' + fill(WIN_W, c => {
    if (!inWindow(r, c, 0)) return ' ';
    if (!inWindow(r, c, 2) || r >= WIN_H - 2) return 's';
    if (c === 9 || c === 10 || r === 12) return 'g';
    if (r >= 5 && r <= 7 && c >= 13 && c <= 15 && !(r === 5 && c === 13) && !(r === 7 && c === 15)) return '.';
    return r > 12 ? 'm' : 'i';
  }) + ' '),
  span(WIN_W + 2, [[0, WIN_W + 1, 's']]),
  span(WIN_W + 2, [[0, WIN_W + 1, 'g']]),
];

// A notice board for the back wall: a stone frame, and three notes pinned to it with room between them.
const BOARD_W = 28, BOARD_H = 16;
const BOARD = lay(lay(lay(
  Array.from({ length: BOARD_H }, (_, r) => fill(BOARD_W, c => (r < 2 || c < 2 || c > BOARD_W - 3 ? 's' : r > BOARD_H - 3 ? 'g' : 'h'))),
  [' i   ', '.....', '.mmm.', '.....', '.mm..', '.....'], 4, 4),
  ['  m  ', 'lllll', 'lllll', 'lllll', 'llll '], 12, 6),
  [' i  ', '....', '.mm.', '....'], 20, 4);

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

// The back wall, one panel wide, in the graphite the rooms' walls are painted in (`app/styles/work-status-tokens.css`)
// and without an outline: set side by side it runs the lobby's width. From the top: a picture rail under the floor
// above, a panel with a seam at its left edge, a chair rail, and a skirting board that ends on the floor's edge line.
const WALL_W = 192, WALL_H = 98, CHAIR_RAIL = 64;
const GRAPHITE = { wall: '161514', lit: '1a1918', building: '131312', pit: '0c0c0b', floorEdge: '24231f', steel: '2b2a27', console: '232220' };
const wallAt = (x, y) => {
  if (y < 2) return 'pit';
  if (y < 4) return 'floorEdge';
  if (y < 6) return 'building';
  if (y < CHAIR_RAIL) return x < 2 ? 'building' : x < 4 ? 'lit' : 'wall';
  if (y < CHAIR_RAIL + 2) return 'lit';
  if (y < CHAIR_RAIL + 4) return 'building';
  if (y < WALL_H - 10) return 'wall';
  if (y < WALL_H - 8) return 'steel';
  if (y < WALL_H - 4) return 'console';
  return y < WALL_H - 2 ? 'pit' : 'floorEdge';
};
const wall = (() => {
  const rgba = Buffer.alloc(WALL_W * WALL_H * 4);
  for (let y = 0; y < WALL_H; y++) for (let x = 0; x < WALL_W; x++) rgba.writeUInt32BE(parseInt(GRAPHITE[wallAt(x, y)] + 'ff', 16), (y * WALL_W + x) * 4);
  return { rgba, w: WALL_W, h: WALL_H, pad: 0 };
})();

const door = art(DOOR), UNIT = 2;
/** Each fixture's sprite and its `foot`: the sprite point set on its place on the back lane's feet line. */
const LOBBY_PROPS = (() => {
  const bench = art(BENCH), crate = art(CRATE), mat = art(MAT), plant = art(PLANT), window = art(WINDOW), board = art(BOARD);
  const middle = s => Math.round(s.w / 2), rowsMiddle = ([a, z], s) => s.pad + (a + z + 1) * UNIT / 2;
  return {
    bench: { s: bench, foot: [middle(bench), rowsMiddle(BENCH_SEAT, bench)] },
    crate: { s: crate, foot: [middle(crate), rowsMiddle(CRATE_TOP, crate)] },
    mat: { s: mat, foot: [middle(mat), Math.round(mat.h / 2)] },
    plant: { s: plant, foot: [plant.pad + 23, plant.h - plant.pad] },
    door: { s: door, foot: [door.pad, door.h - door.pad] },
    doorRight: { s: flipSprite(door), foot: [door.w - door.pad, door.h - door.pad] },
    wall: { s: wall, foot: [0, wall.h] },
    window: { s: window, foot: [middle(window), window.h - window.pad] },
    board: { s: board, foot: [middle(board), board.h - board.pad] },
  };
})();

/** Writes the fixtures side by side on one sheet and returns where each is: its place on the sheet, its size and its foot. */
export async function writeLobbyProps(dir, name) {
  const list = Object.entries(LOBBY_PROPS), W = list.reduce((a, [, p]) => a + p.s.w + 2, 0), H = Math.max(...list.map(([, p]) => p.s.h)), sheet = Buffer.alloc(W * H * 4), meta = {};
  let sx = 0;
  for (const [id, { s, foot }] of list) {
    const rgba = s.rgba ?? toRGBA(s.data);
    for (let y = 0; y < s.h; y++) rgba.copy(sheet, (y * W + sx) * 4, y * s.w * 4, (y + 1) * s.w * 4);
    meta[id] = { sx, w: s.w, h: s.h, fx: foot[0], fy: foot[1] };
    sx += s.w + 2;
  }
  await sharp(sheet, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toFile(join(dir, name));
  return meta;
}
