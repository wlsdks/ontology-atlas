/**
 * The lobby's fixtures: a doorway at each edge where Moru come and go, and a few things they use: a bench to
 * nap on, a crate to sit on, a mat to play on, and a plant. `pnpm brand:life` draws them as it draws the cast
 * (`scripts/brand/moru-cast/life/lobby-props.mjs`) onto one sheet; here each is set down once, behind the Moru.
 */
import type { LifeAtlas, LobbyPropName } from './atlas';
import type { Spot } from './behaviour';

/** How wide a doorway is; a Moru comes and goes through it. */
export const DOOR_W = 56;
/** A Moru's body is drawn this far behind the place it stands at, the way it faces. */
const BODY_BEHIND = 11;

/** Where the middle of each fixture stands on a floor `width` wide, between the two doorways. */
export function lobbyFixtures(width: number) {
  const inner = width - 2 * DOOR_W;
  const at = (share: number) => DOOR_W + Math.round((inner * share) / 2) * 2;
  return { bench: at(0.24), mat: at(0.5), crate: at(0.74), plant: width - DOOR_W - 44 };
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

/**
 * Sets the fixtures down from their `sheet` for a floor `width` wide whose back lane's feet stand at `backFeet`
 * and front lane's at `frontFeet`. What stands against the wall stands where the wall meets the floor.
 */
export function drawFixtures(g: CanvasRenderingContext2D, width: number, backFeet: number, frontFeet: number, sheet: CanvasImageSource, props: LifeAtlas['props']) {
  const { bench, mat, crate, plant } = lobbyFixtures(width);
  const wall = backFeet - 4;
  const set = (name: LobbyPropName, x: number, y: number) => {
    const p = props[name];
    g.drawImage(sheet, p.sx, 0, p.w, p.h, x - p.fx, y - p.fy, p.w, p.h);
  };
  g.imageSmoothingEnabled = false;
  set('door', 0, wall);
  set('doorRight', width, wall);
  set('plant', plant, wall + 2);
  set('bench', bench, backFeet);
  set('crate', crate, backFeet);
  set('mat', mat, Math.round((backFeet + frontFeet) / 2));
}
