import type { LayoutPoint } from "./library-graph-layout";

/**
 * The islands as bodies. The layout (`library-islands-layout.ts`) fixes their homes;
 * motion happens only on arrival (islands move out to their places) and under a hand
 * (a dragged island shoves others, which spring back). At rest nothing moves and the loop
 * stops. A spring home, collisions where the larger body moves less, and heavy damping at
 * a fixed step: deterministic, bounded settle.
 *
 * A step costs O(k + Σ awake bodies' grid cells × occupancy) over k islands: collisions are
 * found on a uniform grid, so a body meets only its neighbours, and a body resting on its
 * home sleeps until an awake body touches it. The gap two bodies keep is the layout's own
 * (`gap`): a large folder's map, scaled to fit the canvas, stands tighter than
 * {@link BODY_GAP}, and a fixed gap there pushed every neighbour forever and never rested.
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
  /** The breath two bodies keep: {@link BODY_GAP}, or the homes' own tightest gap when smaller. */
  gap: number;
  /** Per body, 1 while it rests on its home: skipped until something touches or moves it. */
  asleep: Uint8Array;
  /** The body a collision pass cut short by its budget stopped at; the next pass starts there. */
  resumeAt: number;
}

/**
 * The spring's share of the distance home per step, and the velocity kept per step: a body
 * lands in about thirty steps with one small overshoot (measured on the 3,424-mark stub).
 */
const HOME_PULL = 0.16;
const DAMPING = 0.66;
/** Breath kept between two bodies, in world units: the layout's island gap at a scale of one. */
const BODY_GAP = 10;
/** A body that moved less than this in one step, in world units, is at rest. */
const REST_DISTANCE = 0.05;
/**
 * Within this of its home a resting body is set exactly on it and sleeps: under a pixel at
 * the fitted scale, the tolerance rest always had, now closed instead of left standing.
 */
const SNAP_DISTANCE = 0.5;
/**
 * Where an arriving body starts, as a share of its distance from the centre: just inside
 * its place, or islands pile on the middle and the separation throws them apart.
 */
const ARRIVAL_START = 0.9;
/** While a hand holds one body, the others' spring is this much of itself: they yield rather than fight. */
const YIELD_WHILE_HELD = 0.25;
/** A settle never runs longer than this many steps. */
const SETTLE_MAX_STEPS = 600;
/**
 * The most one animated step may spend on collisions, in ms. Past it a pass stops, and the
 * bodies it did not reach go first on the next frame's step, so no frame pays for every pair
 * at once. Small folders never reach it, so their journey is the same on every machine.
 */
const STEP_BUDGET_MS = 3;
/** Less overlap than this, in world units, is rounding, not a touch. */
const TOUCH_TOLERANCE = 1e-6;

const clock = (): number => (typeof performance === "undefined" ? Date.now() : performance.now());

/**
 * Bodies bucketed on a uniform grid by the disc they reach (radius plus half the gap); a
 * query visits each candidate once. The cell is twice the median reach, so a typical body
 * spans at most four cells and only the few largest span many.
 */
class BodyGrid {
  private readonly cell: number;
  private readonly cells = new Map<number, number[]>();
  private readonly seen: Uint32Array;
  private stamp = 0;

  constructor(bodies: readonly IslandBody[], at: (body: IslandBody) => LayoutPoint, gap: number) {
    const reaches = bodies.map((body) => body.r + gap / 2).sort((a, b) => a - b);
    this.cell = Math.max(1, 2 * (reaches[reaches.length >> 1] ?? 1));
    this.seen = new Uint32Array(bodies.length);
    bodies.forEach((body, index) => {
      const point = at(body);
      this.span(point.x, point.y, body.r + gap / 2, (key) => {
        const held = this.cells.get(key);
        if (held) held.push(index);
        else this.cells.set(key, [index]);
      });
    });
  }

  /** Visits every body whose cells meet the square of `reach` about `point`, each once. */
  near(point: LayoutPoint, reach: number, visit: (index: number) => void): void {
    this.stamp += 1;
    const stamp = this.stamp;
    this.span(point.x, point.y, reach, (key) => {
      const held = this.cells.get(key);
      if (!held) return;
      for (const index of held) {
        if (this.seen[index] === stamp) continue;
        this.seen[index] = stamp;
        visit(index);
      }
    });
  }

  private span(x: number, y: number, reach: number, visit: (key: number) => void): void {
    const x0 = Math.floor((x - reach) / this.cell);
    const x1 = Math.floor((x + reach) / this.cell);
    const y0 = Math.floor((y - reach) / this.cell);
    const y1 = Math.floor((y + reach) / this.cell);
    for (let cx = x0; cx <= x1; cx += 1) for (let cy = y0; cy <= y1; cy += 1) visit((cx + 0x80000) * 0x100000 + (cy + 0x80000));
  }
}

/** The tightest gap between two homes, at most {@link BODY_GAP} and never below zero. */
function homeGap(bodies: readonly IslandBody[]): number {
  if (bodies.length < 2) return BODY_GAP;
  const grid = new BodyGrid(bodies, (body) => body.home, BODY_GAP);
  let least = BODY_GAP;
  bodies.forEach((a, i) => {
    grid.near(a.home, a.r + BODY_GAP / 2, (j) => {
      if (j <= i) return;
      const b = bodies[j];
      const gap = Math.hypot(b.home.x - a.home.x, b.home.y - a.home.y) - a.r - b.r;
      if (gap < least) least = gap;
    });
  });
  return Math.max(0, least);
}

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
  return {
    bodies,
    index: new Map(bodies.map((body, i) => [body.id, i])),
    moving: options.arriving && bodies.length > 0,
    gap: homeGap(bodies),
    asleep: new Uint8Array(bodies.length),
    resumeAt: 0,
  };
}

export function pinIsland(field: IslandField, id: string, at: LayoutPoint): void {
  const i = field.index.get(id) ?? -1;
  const body = field.bodies[i];
  if (!body) return;
  body.pinned = { x: at.x, y: at.y };
  body.vx = 0;
  body.vy = 0;
  field.asleep[i] = 0;
  field.moving = true;
}

/** Lets a held body go where it is: that is its home now, until the map is laid again. */
export function releaseIsland(field: IslandField, id: string): void {
  const i = field.index.get(id) ?? -1;
  const body = field.bodies[i];
  if (!body) return;
  body.pinned = null;
  body.home = { x: body.x, y: body.y };
  body.journey = 0;
  field.asleep[i] = 0;
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

/**
 * Pushes two overlapping bodies apart, the larger moving less and a held one not at all:
 * half the overlap as velocity before the step, or the whole overlap as position after it.
 * Returns whether they overlapped.
 */
function separate(a: IslandBody, b: IslandBody, gap: number, into: "velocity" | "position"): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  const wanted = a.r + b.r + gap;
  // Homes stand exactly `gap` apart at the tightest pair; rounding there is not an overlap.
  if (distance >= wanted - TOUCH_TOLERANCE) return false;
  if (a.pinned && b.pinned) return true;
  const overlap = wanted - distance;
  // Coincident bodies separate by a fixed rule (the later goes right), never at random.
  const nx = distance > 1e-3 ? dx / distance : 1;
  const ny = distance > 1e-3 ? dy / distance : 0;
  const total = a.r + b.r;
  const shareA = a.pinned ? 0 : b.pinned ? 1 : b.r / total;
  const shareB = b.pinned ? 0 : a.pinned ? 1 : a.r / total;
  const k = into === "velocity" ? 0.5 : 1;
  const ax = nx * overlap * shareA * k;
  const ay = ny * overlap * shareA * k;
  const bx = nx * overlap * shareB * k;
  const by = ny * overlap * shareB * k;
  if (into === "velocity") {
    a.vx -= ax;
    a.vy -= ay;
    b.vx += bx;
    b.vy += by;
  } else {
    a.x -= ax;
    a.y -= ay;
    b.x += bx;
    b.y += by;
  }
  return true;
}

/**
 * One fixed step. Returns whether anything is still moving. `budgetMs` bounds each collision
 * pass; the bodies a pass did not reach are taken first on the next step.
 */
export function stepIslandField(field: IslandField, budgetMs: number = STEP_BUDGET_MS): boolean {
  const { bodies, asleep, gap } = field;
  // A held body goes where the hand is, and is a wall to everyone else.
  for (const body of bodies) {
    if (!body.pinned) continue;
    body.x = body.pinned.x;
    body.y = body.pinned.y;
    body.vx = 0;
    body.vy = 0;
  }
  /*
   * Awake: held, moving, or away from home. A caller that moves bodies itself (a relaid map
   * keeps each island where it stood) wakes them by that alone.
   */
  const awake: number[] = [];
  let held = false;
  for (let i = 0; i < bodies.length; i += 1) {
    const body = bodies[i];
    if (body.pinned) held = true;
    if (body.pinned || body.vx !== 0 || body.vy !== 0 || body.x !== body.home.x || body.y !== body.home.y) asleep[i] = 0;
    if (!asleep[i]) awake.push(i);
  }
  if (awake.length === 0) {
    field.moving = false;
    return false;
  }
  // The spring home; softer for everyone else while a hand holds one body.
  const pull = held ? HOME_PULL * YIELD_WHILE_HELD : HOME_PULL;
  for (const i of awake) {
    const body = bodies[i];
    if (body.pinned) continue;
    body.vx += (body.home.x - body.x) * pull;
    body.vy += (body.home.y - body.y) * pull;
  }
  /*
   * Each awake body against its grid neighbours; an awake pair once, from its lower index.
   * A sleeper that is pushed wakes, and joins the spring from the next step.
   */
  let woke = 0;
  // Collisions start where the last cut-short pass stopped, so every body is reached in turn.
  const first = Math.max(0, awake.findIndex((i) => i >= field.resumeAt));
  const order = first === 0 ? awake : [...awake.slice(first), ...awake.slice(0, first)];
  field.resumeAt = 0;
  const collide = (into: "velocity" | "position"): void => {
    const started = clock();
    const grid = new BodyGrid(bodies, (body) => body, gap);
    for (let n = 0; n < order.length; n += 1) {
      if ((n & 31) === 31 && clock() - started > budgetMs) {
        field.resumeAt = order[n];
        return;
      }
      const i = order[n];
      const a = bodies[i];
      grid.near(a, a.r + gap / 2, (j) => {
        if (j === i || (!asleep[j] && j < i)) return;
        if (!separate(a, bodies[j], gap, into)) return;
        if (asleep[j]) {
          asleep[j] = 0;
          woke += 1;
        }
      });
    }
  };
  // A held body never moves in a collision, so the other takes the whole overlap.
  collide("velocity");
  const before = awake.map((i) => ({ x: bodies[i].x, y: bodies[i].y }));
  for (const i of awake) {
    const body = bodies[i];
    if (body.pinned) continue;
    body.vx *= DAMPING;
    body.vy *= DAMPING;
    body.x += body.vx;
    body.y += body.vy;
  }
  // Pairs still overlapping after the step are moved apart in place, or a spring holds a body inside a neighbour.
  collide("position");
  /*
   * Rest is displacement, not velocity: a body whose home lies inside a neighbour keeps a
   * velocity forever while standing still. A woken sleeper has not moved yet, so it counts.
   */
  let moving = held;
  for (let n = 0; n < before.length && !moving; n += 1) {
    const body = bodies[awake[n]];
    if (body.pinned) continue;
    if (Math.hypot(body.x - before[n].x, body.y - before[n].y) > REST_DISTANCE) moving = true;
  }
  if (woke > 0) moving = true;
  if (!moving) {
    // Snap the last fraction, so rest is exact and the same on every machine; a body on its home sleeps.
    for (const i of awake) {
      const body = bodies[i];
      if (body.pinned) continue;
      body.vx = 0;
      body.vy = 0;
      if (Math.hypot(body.x - body.home.x, body.y - body.home.y) > SNAP_DISTANCE) continue;
      body.x = body.home.x;
      body.y = body.home.y;
      asleep[i] = 1;
    }
  }
  field.moving = moving;
  return moving;
}

/** Runs the field to rest at once, for reduced motion and for a test's stillness. */
export function settleIslandField(field: IslandField): void {
  for (let step = 0; step < SETTLE_MAX_STEPS && stepIslandField(field, Infinity); step += 1) {
    /* stepping */
  }
  field.moving = field.bodies.some((body) => body.pinned !== null);
}
