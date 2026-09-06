import type { LibraryGraph, LibraryGraphNodeKind } from "./build-library-graph";
import { LibraryQuadtree } from "./library-graph-quadtree";
import { seedPositions, type LayoutPoint } from "./library-graph-layout";

/**
 * **The library graph is a live force simulation** — the picture is being held in place
 * by forces rather than having been placed once.
 *
 * ## Why this replaced a one-shot layout
 *
 * The first build ran ForceAtlas2 to a stop before the first frame and never ticked
 * again, on the argument that a simulation beside a document a person is reading is
 * movement with nothing to say. The owner looked at the shipped picture on 2026-09-07 —
 * seven sources, six pages, every page citing most of the sources — and rejected it:
 * *"this graph does not move, it is fixed, and that is a shame"* A settled FA2 pass over a graph that
 * dense is a hairball, and a hairball that cannot be pulled apart is a picture a person
 * can only accept or leave. Being able to take one node in hand and see which lines
 * follow **is** the reading operation on a graph this connected, and it needs live
 * physics, not a cached result.
 *
 * `docs/DECISIONS.md`, 2026-09-07, records that reversal and its bounds.
 *
 * ## What the forces say
 *
 * | Force | What it encodes |
 * |---|---|
 * | link spring, rest length by relation | a citation is a closer relationship than a mention: `cites` rests at {@link CITES_REST}, `mentions` at {@link MENTIONS_REST} |
 * | many-body repulsion | two things with nothing between them do not belong in the same place |
 * | collision | a mark never sits on another mark, whatever the springs want |
 * | gravity, **aspect-aware** | the cloud is held in the box it is drawn in, and stretched along the box's long axis rather than fitted into a corner of it |
 *
 * The aspect-aware gravity is the one force here that is not standard, and it is what
 * pays the old layout's measured debt: a uniform fit of a 1.39-aspect cloud into a
 * 3.56-aspect canvas could never fill more than 39% of the width, and the shipped
 * picture measured 33.5% (design-infoviz, 2026-09-06). Stretching the *fit* would have
 * lied about every distance. Stretching the **field the layout is computed in** does
 * not: the distances that come out are true to the forces that produced them, and a
 * uniform scale still draws them.
 *
 * ## Determinism
 *
 * No `Math.random`, no clock, no `performance.now`. Seeds are the golden-angle spiral
 * `seedPositions` already produced, every tie is broken by a fixed rule, and one tick is
 * a function of the state alone — so the same folder settles into the same picture on
 * every machine, and a test can assert positions rather than statistics.
 *
 * ⚠️ **`stepLibrarySimulation` mutates its state and returns it.** Determinism, not
 * immutability, is the property that matters: an 800-node graph at 60fps cannot allocate
 * two arrays of node objects sixty times a second, and every test below asserts the
 * function of the input rather than the identity of the output.
 */

/** Rest length of a citation, in world units. A page holds the file it was written from close. */
const CITES_REST = 52;
/**
 * Rest length of a mention. Longer, so a concept the page merely names sits on the
 * outside of the cluster rather than inside it — the ring of hollow marks around a
 * page's own square of sources is the shape this number exists to produce.
 */
const MENTIONS_REST = 96;

/**
 * Many-body charge. Negative is repulsion, the sign convention `d3-force` uses.
 *
 * Tuned against the owner's own folder shape (7 sources, 6 pages, every page citing 4–7
 * of them): at −140 the clusters overlapped into the hairball this replaced, and at −420
 * the unattached sources were thrown to the edges of the canvas where the fit then shrank
 * everything else to nothing.
 */
const MANY_BODY_STRENGTH = -260;

/**
 * Order at which the exact O(n²) many-body pass hands over to the Barnes–Hut tree.
 *
 * **Measured, and higher than the obvious guess.** One whole tick, mean of 30, on an
 * M-series laptop (2026-09-07):
 *
 * | Nodes | Exact | Barnes–Hut |
 * |---|---|---|
 * | 500 | 0.95 ms | 1.15 ms |
 * | 600 | 1.20 ms | 1.28 ms |
 * | 700 | 1.54 ms | 1.56 ms |
 * | 800 | 1.97 ms | 1.73 ms |
 * | 900 | 2.36 ms | 2.01 ms |
 * | 3000 | 20.8 ms | 8.5 ms |
 *
 * The tree has to be **built** before it can be walked, and a build touches every node;
 * below ~720 that build costs more than the pairs it skips. `library-force-simulation.perf.test.ts`
 * re-measures both passes on the same graph and fails if this ordering inverts.
 */
export const MANY_BODY_EXACT_MAX_ORDER = 720;

/** How hard a node is pulled back toward the centre of the box, per tick. */
const GRAVITY = 0.028;
/** Velocity retained between ticks. `d3-force`'s 0.6 friction, which is a settled default. */
const VELOCITY_DECAY = 0.62;
/** Alpha below which the picture is at rest and the loop may stop stepping. */
const ALPHA_MIN = 0.0015;
/** Per-tick approach of alpha toward its target — about 240 ticks from 1 to `ALPHA_MIN`. */
const ALPHA_DECAY = 0.0275;
/** Alpha a re-heat restores. Not 1: the picture is being disturbed, not rebuilt. */
const REHEAT_ALPHA = 0.42;
/** Iterations of the link/collision relaxation per tick. Two is enough to hold a chain. */
const RELAX_PASSES = 2;
/** Extra room around a mark that no other mark may enter. */
const COLLISION_PAD = 7;
/**
 * Order above which the collision pass bins into a uniform grid instead of testing every
 * pair. Below it the grid's own bookkeeping costs more than the pairs it skips.
 */
const COLLISION_EXACT_MAX_ORDER = 150;

/**
 * **Ambient life** — the ≤0.4px, ≥6s drift the picture keeps after it has settled.
 *
 * The motion charter prefers information motion and is suspicious of decorative
 * movement, and this is decorative: it says nothing. It is here as a bounded owner
 * directive (2026-09-07, *"it does not even move"*), so it is bounded by numbers a gate can
 * measure rather than by taste.
 *
 * **0.28px per axis, 7.2s period.** The per-axis figure is what the code carries; what a
 * person could see is the radial travel, `0.28 × √2 = 0.396px` from rest and 0.79px peak
 * to peak, which is the number the bound of 0.4px is stated against. It was 0.34 until the
 * motion recording measured the radial figure at 0.481 — inside the intent, outside the
 * stated bound, so the stated bound won. That is a peak speed of about a quarter of a pixel
 * per second, well under the 1px halo each mark already carries and under any threshold at
 * which motion competes with content.
 *
 * Under `prefers-reduced-motion` it is not reduced, it is **off**: an endless drift is
 * exactly the family that preference exists to stop.
 *
 * It is applied at display time and in **screen** pixels, never to the simulation's own
 * state, so it cannot accumulate, cannot disturb a settled layout, cannot be multiplied by
 * the zoom, and cannot make hit testing disagree with what is drawn.
 */
export const AMBIENT_AMPLITUDE = 0.28;
export const AMBIENT_PERIOD_MS = 7200;

interface SimulationNode {
  id: string;
  kind: LibraryGraphNodeKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Collision half-extent: the drawn mark plus {@link COLLISION_PAD}. */
  radius: number;
  /** Set while a pointer holds this node. The integrator writes the position instead of the force. */
  fx: number | null;
  fy: number | null;
  /**
   * Arrival progress, 0 → 1. A node that has just appeared is faded in over
   * `--motion-base` by the caller; the simulation only counts, it does not draw.
   */
  entered: number;
  /** Deterministic phase for the ambient drift, from the id. Never a random number. */
  phase: number;
  /** How many edges touch it — what the drawn radius is graded by. */
  degree: number;
}

interface SimulationLink {
  source: number;
  target: number;
  rest: number;
  /** Split of each correction between the two ends, by relative degree. `d3-force`'s bias. */
  bias: number;
  strength: number;
}

export interface LibrarySimulation {
  nodes: SimulationNode[];
  index: Map<string, number>;
  links: SimulationLink[];
  alpha: number;
  alphaTarget: number;
  /** Half-width and half-height of the field, which is where the aspect-aware gravity comes from. */
  box: { width: number; height: number };
  /**
   * Order above which the many-body force switches to the Barnes–Hut tree.
   *
   * It is state rather than a constant **only so the perf test can measure both passes on
   * the same graph** — a crossover asserted against two different graphs is not a
   * crossover. Product code never sets it; `createLibrarySimulation` defaults it to
   * {@link MANY_BODY_EXACT_MAX_ORDER}.
   */
  exactMaxOrder: number;
  /** Ticks since creation. Only the tests read it. */
  ticks: number;
}

/** The drawn half-extent of a mark, graded by degree inside the 5–10px band. */
function markRadius(degree: number, maxDegree: number): number {
  if (maxDegree <= 0) return 5;
  // Square-rooted, so the band reads as "more links" rather than as a bar chart: area
  // grows with degree, which is how a person judges a dot's size.
  const t = Math.sqrt(Math.min(degree, maxDegree) / maxDegree);
  return 5 + 5 * t;
}

/** Every node's drawn half-extent, in one pass. Pure; the renderer takes the result. */
export function libraryMarkRadii(graph: LibraryGraph): Map<string, number> {
  const degree = new Map<string, number>();
  for (const node of graph.nodes) degree.set(node.id, 0);
  for (const edge of graph.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  let max = 0;
  for (const value of degree.values()) max = Math.max(max, value);
  const out = new Map<string, number>();
  for (const node of graph.nodes) {
    const radius = markRadius(degree.get(node.id) ?? 0, max);
    // A square reads heavier than a circle of the same extent, so a source keeps the
    // 5/6 step the renderer already used between them rather than matching by box.
    out.set(node.id, node.kind === "source" ? radius * (5 / 6) : radius);
  }
  return out;
}

/**
 * Builds the simulation. `box` is the canvas in CSS pixels; the simulation runs in the
 * same units, so a rest length is a distance a person can see.
 */
export function createLibrarySimulation({
  graph,
  box,
  exactMaxOrder = MANY_BODY_EXACT_MAX_ORDER,
}: {
  graph: LibraryGraph;
  box: { width: number; height: number };
  /** Measurement-only override; see {@link LibrarySimulation.exactMaxOrder}. */
  exactMaxOrder?: number;
}): LibrarySimulation {
  const ids = graph.nodes.map((node) => node.id);
  const seeds = seedPositions(ids);
  const radii = libraryMarkRadii(graph);
  const degree = new Map<string, number>();
  for (const edge of graph.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  const nodes: SimulationNode[] = graph.nodes.map((node) => {
    const seed = seeds.get(node.id) ?? { x: 0, y: 0 };
    return {
      id: node.id,
      kind: node.kind,
      x: seed.x,
      y: seed.y,
      vx: 0,
      vy: 0,
      radius: (radii.get(node.id) ?? 5) + COLLISION_PAD,
      fx: null,
      fy: null,
      entered: 1,
      phase: phaseOf(node.id),
      degree: degree.get(node.id) ?? 0,
    };
  });
  const index = new Map(nodes.map((node, position) => [node.id, position]));
  return {
    nodes,
    index,
    links: buildLinks(graph, index, degree),
    alpha: 1,
    alphaTarget: 0,
    box: { width: Math.max(1, box.width), height: Math.max(1, box.height) },
    exactMaxOrder,
    ticks: 0,
  };
}

function buildLinks(
  graph: LibraryGraph,
  index: ReadonlyMap<string, number>,
  degree: ReadonlyMap<string, number>,
): SimulationLink[] {
  const links: SimulationLink[] = [];
  for (const edge of graph.edges) {
    const source = index.get(edge.source);
    const target = index.get(edge.target);
    if (source === undefined || target === undefined) continue;
    const sourceDegree = (degree.get(edge.source) ?? 0) + 1;
    const targetDegree = (degree.get(edge.target) ?? 0) + 1;
    links.push({
      source,
      target,
      rest: edge.relation === "cites" ? CITES_REST : MENTIONS_REST,
      // The busier end moves less. Without it a page cited by nothing else is dragged
      // across the canvas by a source that six other pages are also holding.
      bias: sourceDegree / (sourceDegree + targetDegree),
      /*
       * A hub's springs are weakened in proportion to how many it has, so a source every
       * page cites does not out-pull the whole picture into one knot. This is what
       * ForceAtlas2's `outboundAttractionDistribution` did for the settled layout, kept
       * because it was the reason a hub stayed reachable from all of its pages.
       */
      strength: 1 / Math.min(sourceDegree, targetDegree),
    });
  }
  return links;
}

/** A fixed phase per id: the same node drifts the same way on every machine. */
function phaseOf(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 4294967296) * Math.PI * 2;
}

/**
 * One tick.
 *
 * Velocity Verlet in the form `d3-force` uses: forces accumulate into velocity, velocity
 * is damped, position integrates velocity. A pinned node has its position written
 * directly and its velocity zeroed, so the picture it drags is the picture the forces
 * make around a fixed point rather than a fight between the pointer and a spring.
 */
export function stepLibrarySimulation(sim: LibrarySimulation): LibrarySimulation {
  sim.alpha += (sim.alphaTarget - sim.alpha) * ALPHA_DECAY;
  const { alpha, nodes } = sim;
  sim.ticks += 1;

  applyManyBody(sim, alpha);
  applyGravity(sim, alpha);
  for (let pass = 0; pass < RELAX_PASSES; pass += 1) {
    applyLinks(sim, alpha / RELAX_PASSES);
    applyCollisions(sim);
  }

  for (const node of nodes) {
    if (node.entered < 1) node.entered = Math.min(1, node.entered + 0.08);
    if (node.fx !== null && node.fy !== null) {
      node.x = node.fx;
      node.y = node.fy;
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.vx *= VELOCITY_DECAY;
    node.vy *= VELOCITY_DECAY;
    node.x += node.vx;
    node.y += node.vy;
    // Repulsion alone can push a node in its own component to a non-finite coordinate.
    // Putting it back at the centre keeps the fit from collapsing to one point, which is
    // what the old layout's own finite-check was there to prevent.
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
      node.x = 0;
      node.y = 0;
      node.vx = 0;
      node.vy = 0;
    }
  }
  return sim;
}

function applyManyBody(sim: LibrarySimulation, alpha: number): void {
  const { nodes } = sim;
  const charge = MANY_BODY_STRENGTH * alpha;
  if (nodes.length > sim.exactMaxOrder) {
    const tree = new LibraryQuadtree(nodes);
    const out = { fx: 0, fy: 0 };
    for (const node of nodes) {
      out.fx = 0;
      out.fy = 0;
      tree.accumulate(node.x, node.y, charge, out);
      node.vx += out.fx;
      node.vy += out.fy;
    }
    return;
  }
  for (let a = 0; a < nodes.length; a += 1) {
    const first = nodes[a]!;
    for (let b = a + 1; b < nodes.length; b += 1) {
      const second = nodes[b]!;
      let dx = second.x - first.x;
      let dy = second.y - first.y;
      let distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < 1e-6) {
        // Two marks exactly on top of each other, separated along a fixed diagonal so
        // the same folder resolves the same way every time.
        dx = 1e-3;
        dy = 1e-3;
        distanceSquared = 2e-6;
      }
      const weight = charge / distanceSquared;
      const fx = dx * weight;
      const fy = dy * weight;
      first.vx += fx;
      first.vy += fy;
      second.vx -= fx;
      second.vy -= fy;
    }
  }
}

/**
 * Gravity toward the centre, **stronger across the short axis of the box than along its
 * long one** — the force that lets a wide canvas be filled without a non-uniform fit.
 *
 * The two strengths are the box's aspect split around 1, so their product is the plain
 * `GRAVITY`: a square box is the isotropic case and nothing about the picture changes
 * from what a standard force layout would produce.
 */
function applyGravity(sim: LibrarySimulation, alpha: number): void {
  const aspect = sim.box.width / sim.box.height;
  const skew = Math.sqrt(Math.min(4, Math.max(0.25, aspect)));
  const strengthX = (GRAVITY / skew) * alpha;
  const strengthY = GRAVITY * skew * alpha;
  for (const node of sim.nodes) {
    node.vx -= node.x * strengthX;
    node.vy -= node.y * strengthY;
  }
}

function applyLinks(sim: LibrarySimulation, alpha: number): void {
  const { nodes, links } = sim;
  for (const link of links) {
    const source = nodes[link.source]!;
    const target = nodes[link.target]!;
    let dx = target.x + target.vx - (source.x + source.vx);
    let dy = target.y + target.vy - (source.y + source.vy);
    let distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 1e-6) {
      dx = 1e-3;
      dy = 0;
      distance = 1e-3;
    }
    const correction = ((distance - link.rest) / distance) * alpha * link.strength;
    const x = dx * correction;
    const y = dy * correction;
    target.vx -= x * link.bias;
    target.vy -= y * link.bias;
    source.vx += x * (1 - link.bias);
    source.vy += y * (1 - link.bias);
  }
}

/**
 * No mark ever sits on another mark.
 *
 * Two passes, and which one runs is decided by order. Below
 * {@link COLLISION_EXACT_MAX_ORDER} every pair is tested, which is two multiplies per
 * pair and cheaper than building anything. Above it the nodes are binned into a uniform
 * grid whose cell is one collision diameter, so each node tests only its own cell and the
 * eight around it — the pairs that could possibly be touching.
 *
 * ⚠️ **This is the pass that decided the frame budget, not the many-body force.** Measured
 * before the grid existed: one tick of a 1,500-node folder took 13.7 ms, of which the
 * exact collision pass was over 11 — the quadtree was saving tenths of a millisecond on a
 * force that was not the problem. A grid here is the change that put 1,500 nodes back
 * inside a frame.
 */
function applyCollisions(sim: LibrarySimulation): void {
  const { nodes } = sim;
  if (nodes.length <= COLLISION_EXACT_MAX_ORDER) {
    for (let a = 0; a < nodes.length; a += 1) {
      const first = nodes[a]!;
      for (let b = a + 1; b < nodes.length; b += 1) resolveCollision(first, nodes[b]!);
    }
    return;
  }
  let cell = 0;
  for (const node of nodes) cell = Math.max(cell, node.radius);
  cell *= 2;
  const bins = new Map<number, number[]>();
  const columns = 1 << 16;
  const keyOf = (node: SimulationNode): number =>
    (Math.floor((node.y + node.vy) / cell) + 32768) * columns + (Math.floor((node.x + node.vx) / cell) + 32768);
  for (let index = 0; index < nodes.length; index += 1) {
    const key = keyOf(nodes[index]!);
    const bin = bins.get(key);
    if (bin) bin.push(index);
    else bins.set(key, [index]);
  }
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;
    const column = Math.floor((node.x + node.vx) / cell) + 32768;
    const row = Math.floor((node.y + node.vy) / cell) + 32768;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const bin = bins.get((row + dy) * columns + (column + dx));
        if (!bin) continue;
        // Each pair once: the higher index always defers to the lower one.
        for (const other of bin) if (other > index) resolveCollision(node, nodes[other]!);
      }
    }
  }
}

function resolveCollision(first: SimulationNode, second: SimulationNode): void {
  const reach = first.radius + second.radius;
  let dx = second.x + second.vx - (first.x + first.vx);
  let dy = second.y + second.vy - (first.y + first.vy);
  const distanceSquared = dx * dx + dy * dy;
  if (distanceSquared >= reach * reach) return;
  let distance = Math.sqrt(distanceSquared);
  if (distance < 1e-6) {
    dx = 1e-3;
    dy = 1e-3;
    distance = Math.SQRT2 * 1e-3;
  }
  const push = ((reach - distance) / distance) * 0.5;
  const x = dx * push;
  const y = dy * push;
  second.vx += x;
  second.vy += y;
  first.vx -= x;
  first.vy -= y;
}

/** Puts energy back in — a drag, a resize, or a folder that gained a file. */
export function reheatLibrarySimulation(sim: LibrarySimulation, alpha = REHEAT_ALPHA): void {
  sim.alpha = Math.max(sim.alpha, alpha);
}

/** Whether the picture still has anywhere to go. The rAF loop stops when this is false. */
export function isLibrarySimulationRunning(sim: LibrarySimulation): boolean {
  if (sim.alpha > ALPHA_MIN) return true;
  return sim.nodes.some((node) => node.fx !== null);
}

/**
 * Runs the simulation to rest in one call.
 *
 * This is the **reduced-motion path**, and the tests'. Under
 * `prefers-reduced-motion: reduce` nothing is animated: the settled picture is computed
 * here and drawn once, which is the same answer the one-shot layout gave and the reason
 * that preference loses nothing but the motion.
 */
export function settleLibrarySimulation(sim: LibrarySimulation, maxTicks = 400): LibrarySimulation {
  for (let tick = 0; tick < maxTicks; tick += 1) {
    stepLibrarySimulation(sim);
    if (!isLibrarySimulationRunning(sim)) break;
  }
  for (const node of sim.nodes) node.entered = 1;
  return sim;
}

/** Holds a node under the pointer. The forces keep running around it. */
export function pinLibraryNode(sim: LibrarySimulation, id: string, point: LayoutPoint): void {
  const node = sim.nodes[sim.index.get(id) ?? -1];
  if (!node) return;
  node.fx = point.x;
  node.fy = point.y;
}

/**
 * Lets go, handing the node the velocity it was being moved at.
 *
 * A node released dead-still stops as if it had hit a wall; the short inertia is what
 * makes the picture feel like it has mass. It is capped, because a fast flick would
 * otherwise throw a node clear of the canvas before the springs could answer.
 */
export function releaseLibraryNode(
  sim: LibrarySimulation,
  id: string,
  velocity?: LayoutPoint,
): void {
  const node = sim.nodes[sim.index.get(id) ?? -1];
  if (!node) return;
  node.fx = null;
  node.fy = null;
  if (velocity) {
    const speed = Math.hypot(velocity.x, velocity.y);
    const cap = speed > 14 ? 14 / speed : 1;
    node.vx = velocity.x * cap;
    node.vy = velocity.y * cap;
  }
}

/** Whether any node is currently held. */
export function hasPinnedNode(sim: LibrarySimulation): boolean {
  return sim.nodes.some((node) => node.fx !== null);
}

/**
 * Re-fits the field when the canvas changes shape. The positions are kept — a resize is
 * not a new picture — but the gravity's aspect is, so the cloud stretches into the new
 * box instead of staying in the shape of the old one.
 */
export function resizeLibrarySimulation(
  sim: LibrarySimulation,
  box: { width: number; height: number },
): void {
  const width = Math.max(1, box.width);
  const height = Math.max(1, box.height);
  if (sim.box.width === width && sim.box.height === height) return;
  sim.box = { width, height };
  reheatLibrarySimulation(sim, 0.2);
}

/**
 * **A folder that changed rearranges, it does not jump.**
 *
 * Nodes that are still there keep their positions and their velocities. A new node
 * enters at the position of a neighbour it is already attached to — a page Compile has
 * just written appears **on its sources**, and is then pushed out to its own place by
 * the same forces that hold everybody else — rather than at a seed on a ring nowhere
 * near where it belongs. Removed nodes are handed back so the caller can fade them over
 * `--motion-base` instead of deleting them mid-frame.
 */
export function syncLibrarySimulation(
  sim: LibrarySimulation,
  graph: LibraryGraph,
): { entered: string[]; removed: Array<{ id: string; x: number; y: number }> } {
  const wanted = new Set(graph.nodes.map((node) => node.id));
  const removed: Array<{ id: string; x: number; y: number }> = [];
  const kept: SimulationNode[] = [];
  for (const node of sim.nodes) {
    if (wanted.has(node.id)) kept.push(node);
    else removed.push({ id: node.id, x: node.x, y: node.y });
  }

  const byId = new Map(kept.map((node) => [node.id, node]));
  const neighbours = new Map<string, string[]>();
  const link = (from: string, to: string): void => {
    const list = neighbours.get(from);
    if (list) list.push(to);
    else neighbours.set(from, [to]);
  };
  for (const edge of graph.edges) {
    link(edge.source, edge.target);
    link(edge.target, edge.source);
  }

  const radii = libraryMarkRadii(graph);
  const degree = new Map<string, number>();
  for (const edge of graph.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  const seeds = seedPositions(graph.nodes.map((node) => node.id));
  const entered: string[] = [];
  const nodes: SimulationNode[] = graph.nodes.map((node) => {
    const existing = byId.get(node.id);
    if (existing) {
      existing.radius = (radii.get(node.id) ?? 5) + COLLISION_PAD;
      existing.degree = degree.get(node.id) ?? 0;
      return existing;
    }
    entered.push(node.id);
    // Whichever attached neighbour is already on the canvas; the graph's own edge order
    // decides, so an arrival is as reproducible as everything else here.
    const anchor = (neighbours.get(node.id) ?? []).map((id) => byId.get(id)).find(Boolean);
    const seed = seeds.get(node.id) ?? { x: 0, y: 0 };
    return {
      id: node.id,
      kind: node.kind,
      x: anchor ? anchor.x : seed.x,
      y: anchor ? anchor.y : seed.y,
      vx: 0,
      vy: 0,
      radius: (radii.get(node.id) ?? 5) + COLLISION_PAD,
      fx: null,
      fy: null,
      entered: 0,
      phase: phaseOf(node.id),
      degree: degree.get(node.id) ?? 0,
    };
  });

  sim.nodes = nodes;
  sim.index = new Map(nodes.map((node, position) => [node.id, position]));
  sim.links = buildLinks(graph, sim.index, degree);
  if (entered.length > 0 || removed.length > 0) reheatLibrarySimulation(sim);
  return { entered, removed };
}

/** Where each node is, in the simulation's own units. */
export function libraryPositions(sim: LibrarySimulation): Map<string, LayoutPoint> {
  const out = new Map<string, LayoutPoint>();
  for (const node of sim.nodes) out.set(node.id, { x: node.x, y: node.y });
  return out;
}

/**
 * The ambient drift for one mark, **in screen pixels**.
 *
 * ⚠️ **Screen, not world, and that is the whole point of the bound.** The first build
 * added it to the simulated position, so at 8× zoom a 0.34-unit amplitude drew as 2.7px
 * of travel — measured 2026-09-07 during the motion recording — and a bound stated in
 * pixels that a zoom can multiply is not a bound. Applied after the view transform it is
 * a third of a pixel at every scale a person can reach.
 *
 * Two axes a quarter-turn apart, so a mark travels a small circle rather than sliding back
 * and forth along a line: a shimmer nobody can point at, not a wobble. `phase` is the
 * node's own, hashed from its id, so the picture breathes rather than pulsing in unison —
 * and so it breathes identically on every machine.
 */
export function ambientDriftOffset(phase: number, timeMs: number): LayoutPoint {
  const turn = (timeMs / AMBIENT_PERIOD_MS) * Math.PI * 2;
  return {
    x: Math.cos(turn + phase) * AMBIENT_AMPLITUDE,
    y: Math.sin(turn + phase * 1.37) * AMBIENT_AMPLITUDE,
  };
}

/**
 * The drift applied to a map of **screen** positions.
 *
 * Hit testing reads the map this returns, so a person can never point at a mark and miss
 * it by the third of a pixel the drift has moved it. A held mark never drifts: it is
 * exactly where the hand put it.
 */
export function applyAmbientDrift(
  sim: LibrarySimulation,
  screen: Map<string, LayoutPoint>,
  timeMs: number,
): Map<string, LayoutPoint> {
  for (const node of sim.nodes) {
    if (node.fx !== null) continue;
    const point = screen.get(node.id);
    if (!point) continue;
    const offset = ambientDriftOffset(node.phase, timeMs);
    point.x += offset.x;
    point.y += offset.y;
  }
  return screen;
}

/** The picture's own extent, for the fit. */
export function librarySimulationBounds(
  sim: LibrarySimulation,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (sim.nodes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of sim.nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x);
    maxY = Math.max(maxY, node.y);
  }
  return { minX, minY, maxX, maxY };
}
