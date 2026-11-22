/**
 * The lobby's fixtures: the back wall with a window and a notice board on it, a doorway at each edge where Moru
 * come and go, and a few things they use: a bench to nap on, a crate to sit on, a mat to play on, and a plant.
 * `pnpm brand:life` draws them as it draws the cast (`scripts/brand/moru-cast/life/lobby-props.mjs`) onto one
 * sheet; here each is set down once, behind the Moru. A Moru stops only where it is clear of every fixture, or
 * on the one place it uses a fixture from (`lobbySpots`), where it is drawn on it.
 */
import type { LifeAtlas, LobbyPropName } from './atlas';
import type { Spot } from './behaviour';

/** How wide a doorway is; a Moru comes and goes through it. */
export const DOOR_W = 56;
/** A Moru's body is drawn this far behind the place it stands at, the way it faces. */
const BODY_BEHIND = 11;
/** The wall stands this far behind the back lane's feet line. */
const WALL_BEHIND = 4;
/** Where the window and the notice board hang, as the line their feet stand on. */
const WINDOW_FOOT = 64;
const BOARD_FOOT = 58;

/** A drawn box on the floor, in floor pixels. */
export interface FloorBox { x0: number; y0: number; x1: number; y1: number }

/**
 * What a Moru on its feet covers about the place it stands at, whichever way it faces: every standing pose, and
 * the taller nap. `up` is how far it rises above its feet line.
 */
export const STANDING_REACH = { left: 62, right: 63, up: 66 } as const;
export const NAPPING_REACH = { left: 62, right: 63, up: 94 } as const;
export type Reach = { left: number; right: number; up: number };

/** The fixtures a Moru never stands in front of or behind, only on, at its spot. */
const IN_THE_WAY: LobbyPropName[] = ['bench', 'crate', 'mat', 'plant', 'window', 'board'];

/** Where the middle of each fixture stands on a floor `width` wide, between the two doorways. */
export function lobbyFixtures(width: number) {
  const inner = width - 2 * DOOR_W;
  const at = (share: number) => DOOR_W + Math.round((inner * share) / 2) * 2;
  const bench = at(0.24), mat = at(0.5), crate = at(0.74);
  // The window and the board hang on the wall halfway between the fixtures under them, one each.
  return { bench, mat, crate, plant: width - DOOR_W - 44, window: Math.round((bench + mat) / 2), board: Math.round((mat + crate) / 2) };
}

/**
 * The places a Moru walks to and what it does there. The bench's seat and the crate's top lie on the back lane's
 * feet line, so a Moru standing there is on them with no lift of its own.
 */
export function lobbySpots(width: number): Spot[] {
  const { bench, mat, crate } = lobbyFixtures(width);
  return [
    { x: bench + BODY_BEHIND, dir: 1, clip: 'nap', lane: 0 },
    { x: mat - BODY_BEHIND, dir: -1, clip: 'laugh', lane: 1 },
    { x: crate + BODY_BEHIND, dir: 1, clip: 'look-back', lane: 0 },
  ];
}

/** Each fixture and the point its foot stands on, for a floor `width` wide with its lanes' feet at `backFeet` and `frontFeet`. */
function placements(width: number, backFeet: number, frontFeet: number) {
  const { bench, mat, crate, plant, window, board } = lobbyFixtures(width);
  const wall = backFeet - WALL_BEHIND;
  return [
    { name: 'door', x: 0, y: wall },
    { name: 'doorRight', x: width, y: wall },
    { name: 'window', x: window, y: WINDOW_FOOT },
    { name: 'board', x: board, y: BOARD_FOOT },
    { name: 'plant', x: plant, y: wall + 2 },
    { name: 'bench', x: bench, y: backFeet },
    { name: 'crate', x: crate, y: backFeet },
    { name: 'mat', x: mat, y: Math.round((backFeet + frontFeet) / 2) },
  ] satisfies { name: LobbyPropName; x: number; y: number }[];
}

/** The boxes of the fixtures a standing Moru keeps clear of. */
export function fixtureBoxes(width: number, backFeet: number, frontFeet: number, props: LifeAtlas['props']): (FloorBox & { name: LobbyPropName })[] {
  return placements(width, backFeet, frontFeet).filter(p => IN_THE_WAY.includes(p.name)).map(({ name, x, y }) => {
    const p = props[name];
    return { name, x0: x - p.fx, y0: y - p.fy, x1: x - p.fx + p.w, y1: y - p.fy + p.h };
  });
}

export const overlaps = (a: FloorBox, b: FloorBox) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Whether a Moru standing with its centre at `at`, its feet `depth` lanes in front of the back lane, covers no
 * fixture. Its own use spots are left to the caller.
 */
export function lobbyClearance(width: number, backFeet: number, laneDy: number, frontFeet: number, props: LifeAtlas['props']) {
  const boxes = fixtureBoxes(width, backFeet, frontFeet, props);
  return (at: number, depth: number, reach: Reach = STANDING_REACH) => {
    const feet = backFeet + depth * laneDy;
    const moru = { x0: at - reach.left, y0: feet - reach.up, x1: at + reach.right, y1: feet };
    return boxes.every(box => !overlaps(moru, box));
  };
}

/**
 * Sets the fixtures down from their `sheet` for a floor `width` wide whose back lane's feet stand at `backFeet`
 * and front lane's at `frontFeet`: the wall first, panel by panel and the last one cut at the edge, then what
 * hangs on it and what stands against it, where the wall meets the floor.
 */
export function drawFixtures(g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, width: number, backFeet: number, frontFeet: number, sheet: CanvasImageSource, props: LifeAtlas['props']) {
  const set = (name: LobbyPropName, x: number, y: number, w = props[name].w) => {
    const p = props[name];
    g.drawImage(sheet, p.sx, 0, w, p.h, x - p.fx, y - p.fy, w, p.h);
  };
  g.imageSmoothingEnabled = false;
  const panel = props.wall.w;
  for (let x = 0; x < width; x += panel) set('wall', x, backFeet - WALL_BEHIND, Math.min(panel, width - x));
  for (const { name, x, y } of placements(width, backFeet, frontFeet)) set(name, x, y);
}
