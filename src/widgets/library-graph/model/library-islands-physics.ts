import { MOTION } from "@/shared/motion";

import { easeMotion, type LayoutPoint } from "./library-graph-layout";

/**
 * The islands as bodies. The layout (`library-islands-layout.ts`) fixes their homes;
 * motion happens only on arrival (islands move out to their places) and under a hand
 * (a dragged island shoves others, which spring back). At rest nothing moves and the loop
 * stops. A spring home, collisions where the larger body moves less, and heavy damping at
 * a fixed step: deterministic, bounded settle.
 *
 * A step costs O(k + Σ awake bodies' grid cells × occupancy) over k islands: the field keeps
 * a uniform grid that moves only the bodies that moved, so a body meets only its neighbours,
 * and a body resting on its home sleeps until an awake body touches it. The gap two bodies
 * keep is the layout's own (`gap`): a large folder's map, scaled to fit the canvas, stands
 * tighter than {@link BODY_GAP}, and a fixed gap there pushed every neighbour forever. The
 * collision work of a step stops after {@link STEP_BUDGET_MS} and the next resumes where it
 * stopped. Above {@link TRAVEL_MAX_ISLANDS} islands a map does not travel: it stands asleep at
 * home, and a relaid one glides there over `--motion-settle`, O(k) a frame.
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
  /** Per body, 1 once a hand has set it down: its neighbours keep their full breath from it. */
  placed: Uint8Array;
  /** The body a collision pass cut short by its budget stopped at; the next pass starts there. */
  resumeAt: number;
  /** Bodies reached by quiet steps cut short since the last motion: rest waits until all were. */
  quietReached: number;
  /**
   * Whether the field skips the springs and glides home on the motion clock: a field of more
   * than {@link TRAVEL_MAX_ISLANDS} islands, until a hand first holds one.
   */
  instant: boolean;
  /** An instant field's glide home: where each body set out, and when. */
  glide: { from: Float64Array; since: number } | null;
  /** When the field was made; a relaid map's marks start their travel then. */
  since: number;
  grid: BodyGrid;
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
/**
 * Above this many islands a map neither arrives nor springs to a relaid home. Every
 * travelling frame repaints every mark; at 499 islands (10,500 marks) that held 60 fps, at
 * 1,999 (42,000 marks) it cost 50 ms a frame, so the line sits between them.
 */
const TRAVEL_MAX_ISLANDS = 1000;
/** A relaid instant field glides home over `--motion-settle`, the clock its marks travel on. */
const GLIDE_MS = MOTION.settle.duration * 1000;
/** A settle never runs longer than this many steps. */
const SETTLE_MAX_STEPS = 600;
/**
 * The most one animated step may spend on collisions, in ms. Past it a pass stops, and the
 * bodies it did not reach go first on the next frame's step, so no frame pays for every pair
 * at once. Small folders never reach it, so their journey is the same on every machine.
 */
const STEP_BUDGET_MS = 3;
/** Position passes a step may run while pairs still overlap: a push down a row moves the next. */
const POSITION_PASSES = 4;
/** Less overlap than this, in world units, is rounding, not a touch. */
const TOUCH_TOLERANCE = 1e-6;

const clock = (): number => (typeof performance === "undefined" ? Date.now() : performance.now());

/**
 * Bodies bucketed on a uniform grid by the disc they reach (radius plus half the gap); a
 * query visits each candidate once. The cell is twice the median reach, so a typical body
 * spans at most four cells and only the few largest span many. A body that moves is moved in
 * the grid alone, so a step pays for the bodies that moved, not for the map.
 */
class BodyGrid {
  private readonly cell: number;
  private readonly cells = new Map<number, number[]>();
  private readonly seen: Uint32Array;
  /** Each body's cell span as it stands in the grid: x0, x1, y0, y1. */
  private readonly spans: Int32Array;
  private stamp = 0;
  private readonly reach: Float64Array;

  constructor(bodies: readonly IslandBody[], at: (body: IslandBody) => LayoutPoint, gap: number) {
    this.reach = Float64Array.from(bodies, (body) => body.r + gap / 2);
    const sorted = Float64Array.from(this.reach).sort();
    this.cell = Math.max(1, 2 * (sorted[sorted.length >> 1] ?? 1));
    this.seen = new Uint32Array(bodies.length);
    this.spans = new Int32Array(bodies.length * 4);
    bodies.forEach((body, index) => {
      const point = at(body);
      this.place(index, point.x, point.y);
      this.cover(index, 1);
    });
  }

  /** Moves a body to where it stands now, if that changed its cells. */
  update(index: number, x: number, y: number): void {
    const s = index * 4;
    const reach = this.reach[index];
    const x0 = Math.floor((x - reach) / this.cell);
    const x1 = Math.floor((x + reach) / this.cell);
    const y0 = Math.floor((y - reach) / this.cell);
    const y1 = Math.floor((y + reach) / this.cell);
    const spans = this.spans;
    if (spans[s] === x0 && spans[s + 1] === x1 && spans[s + 2] === y0 && spans[s + 3] === y1) return;
    this.cover(index, -1);
    spans[s] = x0;
    spans[s + 1] = x1;
    spans[s + 2] = y0;
    spans[s + 3] = y1;
    this.cover(index, 1);
  }

  /** Visits every body whose cells meet the square of `reach` about `point`, each once. */
  near(point: LayoutPoint, reach: number, visit: (index: number) => void): void {
    this.stamp += 1;
    const stamp = this.stamp;
    const x0 = Math.floor((point.x - reach) / this.cell);
    const x1 = Math.floor((point.x + reach) / this.cell);
    const y0 = Math.floor((point.y - reach) / this.cell);
    const y1 = Math.floor((point.y + reach) / this.cell);
    for (let cx = x0; cx <= x1; cx += 1) {
      for (let cy = y0; cy <= y1; cy += 1) {
        const held = this.cells.get(key(cx, cy));
        if (!held) continue;
        for (const index of held) {
          if (this.seen[index] === stamp) continue;
          this.seen[index] = stamp;
          visit(index);
        }
      }
    }
  }

  private place(index: number, x: number, y: number): void {
    const s = index * 4;
    const reach = this.reach[index];
    this.spans[s] = Math.floor((x - reach) / this.cell);
    this.spans[s + 1] = Math.floor((x + reach) / this.cell);
    this.spans[s + 2] = Math.floor((y - reach) / this.cell);
    this.spans[s + 3] = Math.floor((y + reach) / this.cell);
  }

  /** Adds (1) or removes (-1) a body from every cell of its recorded span. */
  private cover(index: number, sign: 1 | -1): void {
    const s = index * 4;
    for (let cx = this.spans[s]; cx <= this.spans[s + 1]; cx += 1) {
      for (let cy = this.spans[s + 2]; cy <= this.spans[s + 3]; cy += 1) {
        const k = key(cx, cy);
        const held = this.cells.get(k);
        if (sign === 1) {
          if (held) held.push(index);
          else this.cells.set(k, [index]);
          continue;
        }
        if (!held) continue;
        const at = held.indexOf(index);
        if (at < 0) continue;
        held[at] = held[held.length - 1];
        held.pop();
        if (held.length === 0) this.cells.delete(k);
      }
    }
  }
}

function key(cx: number, cy: number): number {
  return (cx + 0x80000) * 0x100000 + (cy + 0x80000);
}

/** The tightest gap between two homes, at most {@link BODY_GAP} and never below zero. */
function homeGap(bodies: readonly IslandBody[], grid: BodyGrid): number {
  if (bodies.length < 2) return BODY_GAP;
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
  const instant = islands.length > TRAVEL_MAX_ISLANDS;
  const bodies: IslandBody[] = islands.map((island) => {
    const home = { x: island.x, y: island.y };
    const start = options.arriving && !instant
      ? { x: centre.x + (home.x - centre.x) * ARRIVAL_START, y: centre.y + (home.y - centre.y) * ARRIVAL_START }
      : home;
    return { id: island.id, x: start.x, y: start.y, vx: 0, vy: 0, r: island.r, home, pinned: null, journey: Math.hypot(home.x - start.x, home.y - start.y) };
  });
  // The tightest home gap is measured with the widest breath, then the grid is laid for the kept one.
  const gap = homeGap(bodies, new BodyGrid(bodies, (body) => body.home, BODY_GAP));
  const asleep = new Uint8Array(bodies.length);
  // A large map stands where it belongs, asleep: a hand wakes only what it touches.
  if (instant) asleep.fill(1);
  return {
    bodies,
    index: new Map(bodies.map((body, i) => [body.id, i])),
    moving: options.arriving && !instant && bodies.length > 0,
    gap,
    asleep,
    placed: new Uint8Array(bodies.length),
    resumeAt: 0,
    quietReached: 0,
    instant,
    glide: null,
    since: clock(),
    grid: new BodyGrid(bodies, (body) => body, gap),
  };
}

export function pinIsland(field: IslandField, id: string, at: LayoutPoint): void {
  const i = field.index.get(id) ?? -1;
  const body = field.bodies[i];
  if (!body) return;
  // A hand on a gliding map lands it first; from there the field moves for real, waking only what the hand touches.
  if (field.instant) settleGlide(field);
  field.instant = false;
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
  field.placed[i] = 1;
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
 * An `anchored` first body stands still like a held one. Returns whether they overlapped.
 */
function separate(a: IslandBody, b: IslandBody, gap: number, into: "velocity" | "position", anchored = false): boolean {
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
  const shareA = a.pinned || anchored ? 0 : b.pinned ? 1 : b.r / total;
  const shareB = b.pinned ? 0 : a.pinned || anchored ? 1 : a.r / total;
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

/** Ends an instant field's glide where it belongs: every body home, asleep, and in its cell. */
function settleGlide(field: IslandField): void {
  field.glide = null;
  field.bodies.forEach((body, i) => {
    if (body.pinned) return;
    body.x = body.home.x;
    body.y = body.home.y;
    body.vx = 0;
    body.vy = 0;
    body.journey = 0;
    field.asleep[i] = 1;
    field.grid.update(i, body.x, body.y);
  });
}

/**
 * An instant field's frame: bodies a relaid map left where they stood glide home on the
 * clock the marks travel on, eased the same way, then sleep. Returns whether it still moves.
 */
function glideHome(field: IslandField): boolean {
  const { bodies } = field;
  if (!field.glide) {
    let away = false;
    for (const body of bodies) if (body.x !== body.home.x || body.y !== body.home.y) away = true;
    if (!away) {
      settleGlide(field);
      field.moving = false;
      return false;
    }
    const from = new Float64Array(bodies.length * 2);
    bodies.forEach((body, i) => {
      from[i * 2] = body.x;
      from[i * 2 + 1] = body.y;
    });
    // From the moment the map was laid, which is when its marks set out too.
    field.glide = { from, since: field.since };
  }
  const t = (clock() - field.glide.since) / GLIDE_MS;
  if (t >= 1) {
    settleGlide(field);
    field.moving = false;
    return false;
  }
  const eased = easeMotion(Math.max(0, t));
  const { from } = field.glide;
  bodies.forEach((body, i) => {
    body.x = from[i * 2] + (body.home.x - from[i * 2]) * eased;
    body.y = from[i * 2 + 1] + (body.home.y - from[i * 2 + 1]) * eased;
  });
  field.moving = true;
  return true;
}

/**
 * One fixed step. Returns whether anything is still moving. `budgetMs` bounds the step's
 * collision work; the bodies it did not reach are taken first on the next step.
 */
export function stepIslandField(field: IslandField, budgetMs: number = STEP_BUDGET_MS): boolean {
  if (field.instant) return glideHome(field);
  const { bodies, asleep, gap, grid } = field;
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
   * keeps each island where it stood) wakes them by that alone, and the grid follows them.
   */
  const awake: number[] = [];
  let held = false;
  for (let i = 0; i < bodies.length; i += 1) {
    const body = bodies[i];
    if (body.pinned) held = true;
    if (body.pinned || body.vx !== 0 || body.vy !== 0 || body.x !== body.home.x || body.y !== body.home.y) asleep[i] = 0;
    if (asleep[i]) continue;
    awake.push(i);
    grid.update(i, body.x, body.y);
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
   * A sleeper that is pushed wakes and joins the spring from the next step; one moved in
   * place is moved in the grid too.
   */
  const woken: number[] = [];
  // Collisions start where the last cut-short pass stopped, so every body is reached in turn.
  const first = Math.max(0, awake.findIndex((i) => i >= field.resumeAt));
  const order = first === 0 ? awake : [...awake.slice(first), ...awake.slice(0, first)];
  field.resumeAt = 0;
  const started = clock();
  let spent = false;
  let reached = order.length;
  const collide = (into: "velocity" | "position"): boolean => {
    let touched = false;
    for (let n = 0; n < order.length; n += 1) {
      if ((n & 31) === 31 && clock() - started > budgetMs) {
        field.resumeAt = order[n];
        spent = true;
        if (into === "velocity") reached = n;
        return touched;
      }
      const i = order[n];
      const a = bodies[i];
      grid.near(a, a.r + gap / 2, (j) => {
        if (j === i || (!asleep[j] && j < i)) return;
        const b = bodies[j];
        /*
         * The breath between two free bodies is soft: kept by velocity, given up under
         * pressure, so a dropped island dents its neighbours instead of shoving a row to the
         * map's edge. Discs never overlap, and an island a hand holds or set down keeps its
         * full breath.
         */
        const kept = into === "velocity" || a.pinned || b.pinned || field.placed[i] || field.placed[j] ? gap : 0;
        if (!separate(a, b, kept, into)) return;
        touched = true;
        if (into === "position") {
          grid.update(i, a.x, a.y);
          grid.update(j, b.x, b.y);
        }
        if (asleep[j]) {
          asleep[j] = 0;
          woken.push(j);
        }
      });
    }
    return touched;
  };
  // A held body never moves in a collision, so the other takes the whole overlap.
  const pushed = collide("velocity");
  const before = awake.map((i) => ({ x: bodies[i].x, y: bodies[i].y }));
  for (const i of awake) {
    const body = bodies[i];
    if (body.pinned) continue;
    body.vx *= DAMPING;
    body.vy *= DAMPING;
    body.x += body.vx;
    body.y += body.vy;
    grid.update(i, body.x, body.y);
  }
  /*
   * Pairs still overlapping after the step are moved apart in place, or a spring holds a
   * body inside a neighbour. A push moves the next body into its own neighbour, so the pass
   * runs again while it still finds overlap, within the budget.
   */
  let overlapped = false;
  for (let pass = 0; pass < POSITION_PASSES && !spent; pass += 1) {
    if (!collide("position")) break;
    overlapped = true;
  }
  // Last, the walls: nothing ends a step inside the breath of an island a hand holds or set down.
  for (const i of awake) {
    if (!bodies[i].pinned && !field.placed[i]) continue;
    const wall = bodies[i];
    grid.near(wall, wall.r + gap / 2, (j) => {
      if (j === i) return;
      const other = bodies[j];
      if (!separate(wall, other, gap, "position", true)) return;
      overlapped = true;
      grid.update(i, wall.x, wall.y);
      grid.update(j, other.x, other.y);
      if (asleep[j]) {
        asleep[j] = 0;
        woken.push(j);
      }
    });
  }
  /*
   * Rest is displacement, not velocity: a body whose home lies inside a neighbour keeps a
   * velocity forever while standing still. A woken sleeper has not moved yet, so it counts.
   */
  let moving = held || woken.length > 0;
  for (let n = 0; n < before.length && !moving; n += 1) {
    const body = bodies[awake[n]];
    if (body.pinned) continue;
    if (Math.hypot(body.x - before[n].x, body.y - before[n].y) > REST_DISTANCE) moving = true;
  }
  /*
   * A quiet step cut short has not looked at every body: rest waits until quiet steps have
   * reached them all, so a slow machine still comes to rest, and never with an unseen overlap.
   */
  const quiet = !moving && !pushed && !overlapped;
  field.quietReached = quiet ? field.quietReached + reached : 0;
  if (!moving && spent && field.quietReached < awake.length) moving = true;
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
      grid.update(i, body.x, body.y);
      asleep[i] = 1;
    }
  }
  field.moving = moving;
  return moving;
}

/** Runs the field to rest at once, for reduced motion and for a test's stillness. */
export function settleIslandField(field: IslandField): void {
  if (field.instant) settleGlide(field);
  else {
    for (let step = 0; step < SETTLE_MAX_STEPS && stepIslandField(field, Infinity); step += 1) {
      /* stepping */
    }
  }
  field.moving = field.bodies.some((body) => body.pinned !== null);
}
