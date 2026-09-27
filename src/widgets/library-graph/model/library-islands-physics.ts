import type { LayoutPoint } from "./library-graph-layout";

/**
 * The islands as bodies. The layout (`library-islands-layout.ts`) fixes their homes;
 * motion happens only on arrival (islands move out to their places) and under a hand
 * (a dragged island shoves others, which spring back). At rest nothing moves and the loop
 * stops. A spring home, collisions where the larger body moves less, and heavy damping at
 * a fixed step: deterministic, bounded settle; each step is O(k²) over k islands.
 */

export interface IslandBody {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** Where the body belongs; the spring pulls it here. */
  home: LayoutPoint;
  /** Where a hand holds it, or null. */
  pinned: LayoutPoint | null;
  /** How far the body had to travel when it set out, for the arrival's fade; 0 once home. */
  journey: number;
}

export interface IslandField {
  bodies: IslandBody[];
  index: Map<string, number>;
  /** Whether the last step still moved something past the rest threshold. */
  moving: boolean;
}

/**
 * The spring's share of the distance home per step, and the velocity kept per step: a body
 * lands in about thirty steps with one small overshoot (measured on the 3,424-mark stub).
 */
const HOME_PULL = 0.16;
const DAMPING = 0.66;
/** Breath kept between two bodies, in world units — the layout's own island gap. */
const BODY_GAP = 10;
/** A body that moved less than this in one step, in world units, is at rest. */
const REST_DISTANCE = 0.05;
/**
 * Where an arriving body starts, as a share of its distance from the centre: just inside
 * its place, or islands pile on the middle and the separation throws them apart.
 */
const ARRIVAL_START = 0.9;
/** While a hand holds one body, the others' spring is this much of itself: they yield rather than fight. */
const YIELD_WHILE_HELD = 0.25;
/** A settle never runs longer than this many steps. */
const SETTLE_MAX_STEPS = 600;

export function createIslandField(
  islands: ReadonlyArray<{ id: string; x: number; y: number; r: number }>,
  centre: LayoutPoint,
  options: { arriving: boolean },
): IslandField {
  const bodies: IslandBody[] = islands.map((island) => {
    const home = { x: island.x, y: island.y };
    const start = options.arriving
      ? { x: centre.x + (home.x - centre.x) * ARRIVAL_START, y: centre.y + (home.y - centre.y) * ARRIVAL_START }
      : home;
    return { id: island.id, x: start.x, y: start.y, vx: 0, vy: 0, r: island.r, home, pinned: null, journey: Math.hypot(home.x - start.x, home.y - start.y) };
  });
  return { bodies, index: new Map(bodies.map((body, i) => [body.id, i])), moving: options.arriving && bodies.length > 0 };
}

export function pinIsland(field: IslandField, id: string, at: LayoutPoint): void {
  const body = field.bodies[field.index.get(id) ?? -1];
  if (!body) return;
  body.pinned = { x: at.x, y: at.y };
  body.vx = 0;
  body.vy = 0;
  field.moving = true;
}

/** Lets a held body go where it is: that is its home now, until the map is laid again. */
export function releaseIsland(field: IslandField, id: string): void {
  const body = field.bodies[field.index.get(id) ?? -1];
  if (!body) return;
  body.pinned = null;
  body.home = { x: body.x, y: body.y };
  body.journey = 0;
  field.moving = true;
}

/** How far along its arrival a body is, 0 at the start and 1 once home; 1 for a body that never travelled. */
export function islandArrival(body: IslandBody): number {
  if (body.journey <= 0) return 1;
  const left = Math.hypot(body.home.x - body.x, body.home.y - body.y);
  return Math.max(0, Math.min(1, 1 - left / body.journey));
}

export function isIslandFieldMoving(field: IslandField): boolean {
  return field.moving;
}

/** One fixed step. Returns whether anything is still moving. */
export function stepIslandField(field: IslandField): boolean {
  const bodies = field.bodies;
  // A held body goes where the hand is, and is a wall to everyone else.
  for (const body of bodies) {
    if (!body.pinned) continue;
    body.x = body.pinned.x;
    body.y = body.pinned.y;
    body.vx = 0;
    body.vy = 0;
  }
  // The spring home; softer for everyone else while a hand holds one body.
  const held = bodies.some((body) => body.pinned !== null);
  const pull = held ? HOME_PULL * YIELD_WHILE_HELD : HOME_PULL;
  for (const body of bodies) {
    if (body.pinned) continue;
    body.vx += (body.home.x - body.x) * pull;
    body.vy += (body.home.y - body.y) * pull;
  }
  // A held body never moves in a collision, so the other takes the whole overlap.
  for (let i = 0; i < bodies.length; i += 1) {
    const a = bodies[i];
    for (let j = i + 1; j < bodies.length; j += 1) {
      const b = bodies[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);
      const wanted = a.r + b.r + BODY_GAP;
      if (distance >= wanted) continue;
      const overlap = wanted - distance;
      // Coincident bodies separate by a fixed rule (the later goes right), never at random.
      const nx = distance > 1e-3 ? dx / distance : 1;
      const ny = distance > 1e-3 ? dy / distance : 0;
      const total = a.r + b.r;
      let shareA = a.pinned ? 0 : b.pinned ? 1 : b.r / total;
      let shareB = b.pinned ? 0 : a.pinned ? 1 : a.r / total;
      if (a.pinned && b.pinned) {
        shareA = 0;
        shareB = 0;
      }
      a.vx -= nx * overlap * shareA * 0.5;
      a.vy -= ny * overlap * shareA * 0.5;
      b.vx += nx * overlap * shareB * 0.5;
      b.vy += ny * overlap * shareB * 0.5;
    }
  }
  let moving = false;
  const before = bodies.map((body) => ({ x: body.x, y: body.y }));
  for (const body of bodies) {
    if (body.pinned) {
      moving = true;
      continue;
    }
    body.vx *= DAMPING;
    body.vy *= DAMPING;
    body.x += body.vx;
    body.y += body.vy;
  }
  // Pairs still overlapping after the step are moved apart in place, or a spring holds a body inside a neighbour.
  for (let i = 0; i < bodies.length; i += 1) {
    const a = bodies[i];
    for (let j = i + 1; j < bodies.length; j += 1) {
      const b = bodies[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);
      const wanted = a.r + b.r + BODY_GAP;
      if (distance >= wanted) continue;
      const overlap = wanted - distance;
      const nx = distance > 1e-3 ? dx / distance : 1;
      const ny = distance > 1e-3 ? dy / distance : 0;
      const total = a.r + b.r;
      const shareA = a.pinned ? 0 : b.pinned ? 1 : b.r / total;
      const shareB = b.pinned ? 0 : a.pinned ? 1 : a.r / total;
      a.x -= nx * overlap * shareA;
      a.y -= ny * overlap * shareA;
      b.x += nx * overlap * shareB;
      b.y += ny * overlap * shareB;
    }
  }
  /*
   * Rest is displacement, not velocity: a body whose home lies inside a neighbour keeps a
   * velocity forever while standing still.
   */
  bodies.forEach((body, i) => {
    if (body.pinned) return;
    const moved = Math.hypot(body.x - before[i].x, body.y - before[i].y);
    if (moved > REST_DISTANCE) moving = true;
  });
  if (!moving) {
    // Snap the last fraction, so rest is exact and the same on every machine.
    for (const body of bodies) {
      if (body.pinned) continue;
      body.vx = 0;
      body.vy = 0;
    }
  }
  field.moving = moving;
  return moving;
}

/** Runs the field to rest at once, for reduced motion and for a test's stillness. */
export function settleIslandField(field: IslandField): void {
  for (let step = 0; step < SETTLE_MAX_STEPS && stepIslandField(field); step += 1) {
    /* stepping */
  }
  field.moving = field.bodies.some((body) => body.pinned !== null);
}
