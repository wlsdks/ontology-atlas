/**
 * The lobby's fixtures: a doorway at each edge where Moru come and go, and a few things they use: a bench to
 * nap on, a crate to peek round, a mat to play on, and a plant. Drawn once, in 2px blocks of Moru's own raster
 * palette (`docs/design/brand.md`: the mascot's raster palette is not a CSS token), behind the Moru.
 */
import type { Spot } from './behaviour';

/** Moru's raster palette: outline ink, stone, shade, ivory and the three indigos. */
const INK = '#17192d', STONE = '#d6d3c9', SHADE = '#b8b4aa', IVORY = '#fff1d7', MUTED = '#50569c', INDIGO = '#6d73d2', LIGHT = '#9399e5';
/** How wide a doorway is; a Moru comes and goes through it. */
export const DOOR_W = 56;

/** Where the fixtures stand on a floor `width` wide: the bench, crate and mat as places Moru go to, the plant to the side. */
export function lobbyFixtures(width: number) {
  const at = (share: number) => Math.round((width * share) / 2) * 2;
  return { bench: at(0.3), mat: at(0.52), crate: at(0.74), plant: width - DOOR_W - 40 };
}

/** The places a Moru walks to and what it does there. */
export function lobbySpots(width: number): Spot[] {
  const { bench, mat, crate } = lobbyFixtures(width);
  return [
    { x: bench + 40, dir: 1, clip: 'nap', lane: 0 },
    { x: mat + 36, dir: -1, clip: 'laugh', lane: 1 },
    { x: crate - 30, dir: 1, clip: 'look-back', lane: 0 },
  ];
}

/** Draws the fixtures for a floor `width` wide whose back lane's feet stand at `backFeet` and front lane's at `frontFeet`. */
export function drawFixtures(g: CanvasRenderingContext2D, width: number, backFeet: number, frontFeet: number) {
  const P = (x: number, y: number, w: number, h: number, colour: string) => { g.fillStyle = colour; g.fillRect(x, y, w, h); };
  const { bench, mat, crate, plant } = lobbyFixtures(width);
  // Doorways: a dark opening in the wall at each edge, framed, with its threshold on the floor.
  for (const left of [0, width - DOOR_W]) {
    const top = backFeet - 104, inner = left === 0 ? 0 : 6;
    P(left, top, DOOR_W, backFeet - top + 4, INK);
    P(left + inner, top + 6, DOOR_W - 6, backFeet - top - 2, '#0c0d16');
    P(left + (left === 0 ? DOOR_W - 6 : 0), top, 6, backFeet - top + 4, SHADE);
    P(left, top, DOOR_W, 6, SHADE);
    P(left, top + 6, DOOR_W, 2, INK);
    P(left, backFeet + 2, DOOR_W, 4, MUTED);
  }
  // A bench against the back wall: seat, apron and two legs.
  P(bench - 2, backFeet - 34, 108, 8, INK);
  P(bench, backFeet - 32, 104, 4, STONE);
  P(bench, backFeet - 28, 104, 2, SHADE);
  for (const leg of [6, 90]) { P(bench + leg - 2, backFeet - 26, 10, 26, INK); P(bench + leg, backFeet - 26, 6, 24, SHADE); }
  // A crate with its slats.
  P(crate - 2, backFeet - 38, 44, 40, INK);
  P(crate, backFeet - 36, 40, 36, MUTED);
  for (const y of [8, 20]) P(crate, backFeet - 36 + y, 40, 2, INK);
  P(crate + 2, backFeet - 34, 36, 2, INDIGO);
  // A plant in a pot.
  P(plant - 2, backFeet - 22, 28, 24, INK);
  P(plant, backFeet - 20, 24, 20, SHADE);
  P(plant, backFeet - 20, 24, 4, STONE);
  for (const [dx, dy, w, h] of [[10, -52, 4, 32], [2, -44, 8, 6], [14, -40, 8, 6], [0, -32, 10, 6], [14, -30, 10, 6]] as const) {
    P(plant + dx - 2, backFeet + dy - 2, w + 4, h + 4, INK);
  }
  for (const [dx, dy, w, h] of [[10, -52, 4, 32], [2, -44, 8, 6], [14, -40, 8, 6], [0, -32, 10, 6], [14, -30, 10, 6]] as const) {
    P(plant + dx, backFeet + dy, w, h, LIGHT);
  }
  // A play mat on the floor between the lanes.
  const matY = Math.round((backFeet + frontFeet) / 2 / 2) * 2 - 4;
  P(mat - 2, matY - 2, 140, 12, INK);
  P(mat, matY, 136, 8, INDIGO);
  for (let x = 8; x < 136; x += 16) P(mat + x, matY + 2, 8, 4, IVORY);
}
