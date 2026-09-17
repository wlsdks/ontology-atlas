import type { LayoutPoint } from "./library-graph-layout";

/**
 * **The islands are bodies.** The map is laid, not simulated (`library-islands-layout.ts`),
 * so the same folder is the same picture on every visit — and the owner, 2026-09-18,
 * asked whether it moves like a force graph at all. It does, on the two occasions motion
 * means something and never otherwise:
 *
 * - **Arrival.** A folder's islands start near the middle of the map and are pushed out to
 *   their places, largest first, over about half a second: the picture assembling, the
 *   way a galaxy forms, rather than appearing. Their places are the layout's, so nothing
 *   about the picture is left to the physics.
 * - **A hand.** Dragging an island carries it, and the islands it runs into are shoved
 *   aside and settle back to their homes once it has passed; the dragged one keeps where
 *   it was dropped until the map is laid again.
 *
 * At rest nothing moves — the 2026-09-08 rule (*"why does it wriggle… get rid of that"*)
 * holds: the field reports itself still and the frame loop stops. The physics is a spring
 * to each body's home, a collision that separates overlapping discs with the larger body
 * moving less, and a heavy damping, stepped at a fixed size, so it is deterministic and
 * settles in a bounded number of steps; nothing here is random.
 */

interface IslandBody {
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
}

export interface IslandField {
  bodies: IslandBody[];
  index: Map<string, number>;
  /** Whether the last step still moved something past the rest threshold. */
  moving: boolean;
}

/**
 * The spring's share of the distance home taken per step, and the velocity kept per step.
 * Together they land a body in about thirty steps with one small overshoot — measured in
 * Chrome on the 3,424-mark stub: the largest island travelled 150 world units in 30
 * frames, 757 ms at the first setting (0.12 / 0.72); this one lands in about 500 ms.
 */
const HOME_PULL = 0.16;
const DAMPING = 0.66;
/** Breath kept between two bodies, in world units — the layout's own island gap. */
const BODY_GAP = 10;
/** A body that moved less than this in one step, in world units, is at rest. */
const REST_DISTANCE = 0.05;
/** How far in from home an arriving body starts, as a share of its distance to the map's centre. */
const ARRIVAL_START = 0.35;
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
    return { id: island.id, x: start.x, y: start.y, vx: 0, vy: 0, r: island.r, home, pinned: null };
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
  field.moving = true;
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
  // The spring home.
  for (const body of bodies) {
    if (body.pinned) continue;
    body.vx += (body.home.x - body.x) * HOME_PULL;
    body.vy += (body.home.y - body.y) * HOME_PULL;
  }
  // Collisions: overlapping discs are pushed apart, the larger moving less; a held body
  // does not move at all, so its whole overlap goes to the other.
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
      // Two bodies on one point have no direction between them; the later one goes right,
      // which is a rule and not a roll of the dice.
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
  // No two bodies rest overlapping: after the step, any pair still inside each other's
  // breath is moved apart in place, so the spring cannot hold a body inside a neighbour.
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
   * Rest is measured by how far a body actually moved this step, not by its velocity: a
   * body whose home lies inside a neighbour is pulled by its spring and pushed back by the
   * separation every step, and would carry a velocity forever while standing still. What
   * a person sees is displacement, so that is what "still" means here.
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
