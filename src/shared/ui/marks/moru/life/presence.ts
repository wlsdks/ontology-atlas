/**
 * Who is in the lobby: a crew larger than the floor shows, a few of them at a time. Moru come in from an edge
 * and go out through one, one walk at a time, so the floor holds two to four and never more than five. Pure:
 * the host passes the time and the random source.
 */
import { addMoru, centre, enter, leave, mayStop, type Moru, type Random, type World } from './behaviour';
import { pickLook, type Look } from './wardrobe';

/** The most Moru the lobby shows at once, whatever its width. */
export const MOST_ON_FLOOR = 5;
/** The fewest it shows while its crew has that many. */
export const FEWEST_ON_FLOOR = 2;
/** The largest crew: four, and one more per resting worktree. */
export const MOST_IN_CREW = 12;

export const crewSize = (resting: number) => Math.min(MOST_IN_CREW, 4 + Math.max(0, resting));

export interface Presence {
  crew: number;
  /** How many the floor is heading for now. */
  target: number;
  /** When the target is next drawn again, in the world's time. */
  nextTarget: number;
  /** No door walk starts before this time: comings and goings are spaced out. */
  quietUntil: number;
  serial: number;
}

/** How many a floor this wide can hold with every Moru clear of the next by `sep`. */
export const roomFor = (world: Pick<World, 'width' | 'sep'>) => Math.max(1, Math.floor((world.width - 280) / (world.sep + 40)) + 1);

function drawTarget(world: World, presence: Presence) {
  const most = Math.min(MOST_ON_FLOOR, presence.crew, roomFor(world));
  const fewest = Math.min(FEWEST_ON_FLOOR, most);
  // Usually two to four; five only now and then.
  const usual = Math.min(4, most);
  const pick = world.rand() < 0.12 ? most : fewest + Math.floor(world.rand() * (usual - fewest + 1));
  presence.target = pick;
  presence.nextTarget = world.now + 20000 + world.rand() * 25000;
}

/** The place nearest `at` where a Moru in `lane` stands clear of the fixtures and a body from everybody, or null. */
function clearNear(world: World, at: number, lane: number): number | null {
  for (let far = 0; far <= world.width; far += 8) for (const x of [at - far, at + far]) {
    if (x > 70 && x < world.width - 70 && mayStop(world, x, lane) && world.morus.every(o => Math.abs(centre(o) - x) >= world.sep)) return x;
  }
  return null;
}

/** Starts a lobby: the first Moru already stand on the floor, far apart, clear of the fixtures. */
export function openLobby(world: World, crew: number, rand: Random = world.rand): Presence {
  const presence: Presence = { crew, target: 0, nextTarget: 0, quietUntil: 0, serial: 0 };
  drawTarget(world, presence);
  const first = Math.min(presence.target, 3);
  for (let i = 0; i < first; i++) {
    const look = pickLook(rand, world.morus);
    const lane = i % world.lanes, at = clearNear(world, (world.width * (i + 0.5)) / first, lane);
    if (at === null) continue;
    const m = addMoru(world, { id: `m${presence.serial++}`, x: 0, lane, ...look });
    m.x = at - (m.facing > 0 ? 74 : 62);
  }
  return presence;
}

/** Changes the crew's size: a worktree came to rest or went back to work. Nobody leaves at once; the next drawing counts it. */
export function setCrew(presence: Presence, crew: number) {
  presence.crew = crew;
}

const onFloor = (world: World) => world.morus.filter(m => m.door !== 'out');
const atDoor = (world: World) => world.morus.some(m => m.door);

/**
 * One step of the comings and goings, after each tick. `due`: somebody comes or goes now if anybody can, even with
 * the floor at its count: one leaves a floor above the fewest, else one comes in.
 */
export function tend(world: World, presence: Presence, due = false): Moru | null {
  if (world.now >= presence.nextTarget) drawTarget(world, presence);
  const most = Math.min(MOST_ON_FLOOR, presence.crew, roomFor(world));
  const here = onFloor(world).length;
  const target = due && here === Math.min(presence.target, most) ? (here > Math.min(FEWEST_ON_FLOOR, most) ? here - 1 : here + 1) : Math.min(presence.target, most);
  if (atDoor(world) || (!due && world.now < presence.quietUntil)) return null;
  if (here > target || here > most) {
    if (leave(world)) presence.quietUntil = world.now + 4000 + world.rand() * 4000;
    return null;
  }
  if (here < target && world.morus.length < MOST_ON_FLOOR) {
    const look: Look = pickLook(world.rand, world.morus);
    const m = enter(world, { id: `m${presence.serial}`, ...look });
    if (m) {
      presence.serial++;
      presence.quietUntil = world.now + 5000 + world.rand() * 5000;
      return m;
    }
  }
  return null;
}

/** The nearest two middles on the floor, in px: the measure of how far apart the lobby keeps its Moru. */
export function nearestGap(world: World) {
  const xs = world.morus.filter(m => centre(m) > 0 && centre(m) < world.width).map(centre).sort((a, b) => a - b);
  let gap = Infinity;
  for (let i = 1; i < xs.length; i++) gap = Math.min(gap, xs[i] - xs[i - 1]);
  return gap;
}
