import type { LibraryGraph, LibraryGraphNodeKind } from "./build-library-graph";
import { LibraryQuadtree } from "./library-graph-quadtree";
import { flowLayout, type FlowLayout, type FlowWorld } from "./library-flow-layout";
import { islandsLayout, type IslandsLayout } from "./library-islands-layout";
import { seedPositions, type LayoutPoint } from "./library-graph-layout";
import { packGroupsAroundCentre, type PackBox, type PackSlot } from "./library-graph-packing";

/**
 * The library graph as a live force simulation, so a dense graph can be pulled apart by
 * hand (`docs/DECISIONS.md`, "The Library graph is a live force simulation").
 *
 * | Force | What it encodes |
 * |---|---|
 * | link spring, rest length by relation | a citation is closer than a mention: {@link CITES_REST} vs {@link MENTIONS_REST} |
 * | many-body repulsion | unrelated things do not share a place |
 * | collision | a mark never sits on another mark |
 * | gravity, isotropic | each group is held to its own cell's centre |
 * | orphan ring | an unattached mark gets a slot on one ellipse, not a wall |
 *
 * Only the orphan ring reads the window (its aspect); the camera fits the rest. A tick is
 * per-group many-body, O(n log n) on the Barnes–Hut quadtree past
 * {@link MANY_BODY_EXACT_MAX_ORDER} and O(n²) below it, plus O(E) springs and near-O(n) grid
 * collisions (O(n²) up to {@link COLLISION_EXACT_MAX_ORDER}).
 *
 * Deterministic: no `Math.random` or clock, golden-angle seeds, fixed tie rules, so tests
 * assert positions. `stepLibrarySimulation` mutates its state and returns it, because an
 * 800-node graph at 60fps cannot allocate new node arrays every tick.
 */

/**
 * Rest length of a citation in world units: a shade over a page mark's diameter plus a
 * source's, so a page and its files read as one object. A rest length is a claim about
 * meaning, never a lever for fill.
 */
const CITES_REST = 28;
/** Over four times a citation, so a merely named concept stands clear of a page's satellites. */
const MENTIONS_REST = 120;

/**
 * Many-body charge; negative repels (`d3-force` convention). Swept at 376 marks: −45 is the
 * first value whose fitted scale clears the 3px source mark's zoom floor. The collision
 * pass, not this number, keeps marks apart.
 */
const MANY_BODY_STRENGTH = -45;

/**
 * Extra charge per relation a page carries, capped: a busy hub needs room for its own
 * satellites, or two hubs' satellites smear together; the cap stops one hub owning the picture.
 */
const PAGE_CHARGE_PER_DEGREE = 0.35;
const PAGE_CHARGE_MAX = 4;

/**
 * Repulsion cutoff in world units (`d3-force`'s `distanceMax`), about eight citation rest
 * lengths. Without it distant marks, whose count grows as d², push every mark and a
 * 376-mark folder spread past the canvas; repulsion here is only for neighbouring clusters.
 */
const MANY_BODY_MAX_DISTANCE = 240;
const MANY_BODY_MAX_DISTANCE_SQUARED = MANY_BODY_MAX_DISTANCE * MANY_BODY_MAX_DISTANCE;

/**
 * Order at which the exact O(n²) many-body pass hands over to the Barnes–Hut tree: below
 * it, building the tree costs more than the pairs it skips (measured per tick, M-series).
 * The perf test in `library-force-simulation.perf.test.ts` fails if the crossover inverts.
 */
export const MANY_BODY_EXACT_MAX_ORDER = 720;

/** How hard a node is pulled back toward the centre of the box, per tick. */
const GRAVITY = 0.028;
/** Velocity retained between ticks. `d3-force`'s 0.6 friction, which is a settled default. */
const VELOCITY_DECAY = 0.62;
/** Alpha below which the picture is at rest and the loop may stop stepping. */
const ALPHA_MIN = 0.0015;
/**
 * The most ticks an arrival may take before the loop idles. {@link ALPHA_DECAY} reaches
 * {@link ALPHA_MIN} in 234 ticks, so this is a ceiling with room: it keeps an unmeasured
 * folder from holding the loop awake on a canvas that must stand still.
 */
export const LIBRARY_SETTLE_MAX_TICKS = 400;
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
 * The camera's margin around the picture, in canvas px: an outermost mark's label stack
 * (9 × 1.6 zoom + 5 + 15 ≈ 34) with room around it, constant so one folder frames the
 * same at every window size.
 */
export const LIBRARY_FIT_PADDING = 64;

/**
 * The orphan ring's standoff and the gutter between packed groups. Unattached marks get evenly
 * spaced gravity slots by sorted id, or repulsion throws each at a wall: an ellipse of the
 * canvas's aspect around a single mass, else a circle in their own cell.
 */
const ORPHAN_RING_GAP = 56;
/*
 * Not scaled up for a small folder: at 1.55× the 1040×720 canvas drops below the zoom
 * ceiling and one folder wears two mark sizes (`library-graph-picture.spec.ts`), and smaller
 * steps only add air between groups (measured over four fixtures at three windows).
 */
/** Ring radius when there is no connected mass to stand off from — a folder of loose files. */
const ORPHAN_RING_MIN_RADIUS = 90;
/** Pull toward the ring slot per tick; several times {@link GRAVITY}, to answer the whole mass's repulsion. */
const ORPHAN_RING_GRAVITY = 0.085;
/**
 * The first slot sits on an axis, never half a slot off: on the diagonals four orphans each
 * hold two extremes and the fit pins them into the corners. Vertical rather than horizontal
 * is unmeasured under isotropic gravity.
 */
const ORPHAN_RING_PHASE = Math.PI / 2;

/*
 * No ambient drift: the arrived picture is still, and motion only answers what a person did
 * (arrival, drag, release, resize, a changed folder); why is in `docs/DECISIONS.md`, "The
 * Library graph stands still".
 */

interface SimulationNode {
  id: string;
  kind: LibraryGraphNodeKind;
  /** How hard this mark pushes, as a multiple of {@link MANY_BODY_STRENGTH}. */
  charge: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Collision half-extent: the drawn mark plus {@link COLLISION_PAD}. */
  radius: number;
  /** Set while a pointer holds this node. The integrator writes the position instead of the force. */
  fx: number | null;
  fy: number | null;
  /** Arrival progress, 0 → 1; the caller fades the node in over `--motion-base`. */
  entered: number;
  /** How many edges touch it — what the drawn radius is graded by. */
  degree: number;
  /** Angle of this mark's orphan-ring slot, assigned from the sorted id; `null` when springs answer for it. */
  orbit: number | null;
  /** Index of this mark's group in {@link LibrarySimulation.cells}; 0 for everyone in a single-group folder. */
  cell: number;
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
  /** The canvas's CSS size: gravity ignores it, and the orphan ring takes its aspect from it. */
  box: { width: number; height: number };
  /**
   * One place per group of the folder in simulation units (`library-graph-packing.ts`);
   * one cell covering the field for a single connected graph.
   */
  cells: PackSlot[];
  /**
   * Each group's nodes, rebuilt with the composition, never per tick. The many-body pass
   * walks these, or unrelated groups push each other at the walls.
   */
  groupNodes: SimulationNode[][];
  /**
   * Index into {@link groupNodes} of the unattached marks, or `null` when there are none.
   * It indexes `cells` only while {@link packed}; unpacked, `cells` has one entry and this
   * is out of range there.
   */
  looseGroup: number | null;
  /**
   * Radius of the loose marks' ring inside their cell, 0 for a single one. Read only while
   * {@link packed}; unpacked, `libraryOrphanRing` measures the ring around the mass. Always
   * written, so a composition change leaves no stale radius.
   */
  looseRadius: number;
  /** False when the folder has fewer than two connected components, loose marks or not. */
  packed: boolean;
  /**
   * Barnes–Hut crossover, state only so the perf test can time both passes on one graph;
   * product code keeps {@link MANY_BODY_EXACT_MAX_ORDER}.
   */
  exactMaxOrder: number;
  /** Ticks since creation. Only the tests read it. */
  ticks: number;
}

/**
 * The mark scale, fixed in world units; only the camera stands between it and the screen,
 * or one folder draws a different picture at every window size and size stops meaning
 * "busy page". A page is 5 → 9 by citations; a source a 3.5 square, never the subject; a
 * concept a 5 ring, the page floor, since it lives on the map.
 */
export const LIBRARY_PAGE_RADIUS_MIN = 5;
export const LIBRARY_PAGE_RADIUS_MAX = 9;
export const LIBRARY_SOURCE_RADIUS = 3.5;
export const LIBRARY_CONCEPT_RADIUS = 5;

/**
 * Every node's half-extent in world units; the renderer multiplies by the camera scale
 * only. A page grades by citations, not degree: a mention says nothing about how much of
 * the folder the page was written from.
 */
export function libraryMarkRadii(graph: LibraryGraph): Map<string, number> {
  const cites = new Map<string, number>();
  for (const node of graph.nodes) cites.set(node.id, 0);
  for (const edge of graph.edges) {
    if (edge.relation !== "cites") continue;
    cites.set(edge.source, (cites.get(edge.source) ?? 0) + 1);
    cites.set(edge.target, (cites.get(edge.target) ?? 0) + 1);
  }
  let max = 0;
  for (const node of graph.nodes) {
    if (node.kind !== "page") continue;
    max = Math.max(max, cites.get(node.id) ?? 0);
  }
  const out = new Map<string, number>();
  for (const node of graph.nodes) {
    if (node.kind === "source") {
      out.set(node.id, LIBRARY_SOURCE_RADIUS);
      continue;
    }
    if (node.kind === "concept") {
      out.set(node.id, LIBRARY_CONCEPT_RADIUS);
      continue;
    }
    // Square-rooted, so area grows with the count, which is how a dot's size is judged.
    const t = max <= 0 ? 0 : Math.sqrt(Math.min(cites.get(node.id) ?? 0, max) / max);
    out.set(node.id, LIBRARY_PAGE_RADIUS_MIN + (LIBRARY_PAGE_RADIUS_MAX - LIBRARY_PAGE_RADIUS_MIN) * t);
  }
  return out;
}

/**
 * A mark's charge as a multiple of {@link MANY_BODY_STRENGTH}. Only a page grades: graded
 * satellites push neighbouring hubs' satellites into one another.
 */
function chargeMultiplier(kind: LibraryGraphNodeKind, degree: number): number {
  if (kind !== "page") return 1;
  return Math.min(PAGE_CHARGE_MAX, 1 + degree * PAGE_CHARGE_PER_DEGREE);
}

/**
 * Builds the simulation. `box` is the canvas in CSS pixels; the simulation runs in the
 * same units, so a rest length is a distance a person can see.
 */
export function createLibrarySimulation({
  graph,
  box,
  exactMaxOrder = MANY_BODY_EXACT_MAX_ORDER,
  compose = true,
}: {
  graph: LibraryGraph;
  box: { width: number; height: number };
  /** Measurement-only override; see {@link LibrarySimulation.exactMaxOrder}. */
  exactMaxOrder?: number;
  /** False only for the per-group footprint pass, which keeps that recursion one level deep. */
  compose?: boolean;
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
      degree: degree.get(node.id) ?? 0,
      charge: chargeMultiplier(node.kind, degree.get(node.id) ?? 0),
      orbit: null,
      cell: 0,
    };
  });
  assignOrbits(nodes);
  const index = new Map(nodes.map((node, position) => [node.id, position]));
  const sim: LibrarySimulation = {
    nodes,
    index,
    links: buildLinks(graph, index, degree),
    alpha: 1,
    alphaTarget: 0,
    box: { width: Math.max(1, box.width), height: Math.max(1, box.height) },
    cells: [],
    groupNodes: [],
    looseGroup: null,
    looseRadius: 0,
    packed: false,
    exactMaxOrder,
    ticks: 0,
  };
  composeLibraryGroups(sim, compose ? graph : null);
  return sim;
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
      // The busier end moves less, or a shared source drags a lightly held page across the canvas.
      bias: sourceDegree / (sourceDegree + targetDegree),
      // A hub's springs weaken with their count (FA2's `outboundAttractionDistribution`), or
      // a source every page cites pulls the picture into one knot.
      strength: 1 / Math.sqrt(Math.min(sourceDegree, targetDegree)),
    });
  }
  return links;
}

/**
 * Order above which the footprint pass is skipped for an estimate. The pass costs
 * Σ n_i² ≤ n² once on mount and runs only for two or more components; at 1200 a hundred
 * groups of twelve stay under a tenth of a single-component settle.
 */
const PACK_PREPASS_MAX_ORDER = 1200;

/**
 * Footprint per mark above {@link PACK_PREPASS_MAX_ORDER}: measured bounding-box area per
 * settled mark runs 1.4k to 2.6k at the fixed mark scale, so 2200 is mid-band.
 */
const PACK_ESTIMATE_AREA_PER_MARK = 2200;

/**
 * Gives every group of the folder its own place: (1) connected components by union-find with
 * path halving and no rank, O((n + E) log n) at worst, biggest first, ties by the id of each
 * component's first mark, plus the unattached marks as one more group; (2) each component
 * settled alone so its cell has its real shape, or a wide cluster overflows a square cell,
 * with the offsets seeding the real run; (3) the boxes packed around the centre with
 * {@link ORPHAN_RING_GAP} between groups.
 *
 * A single connected graph keeps one cell covering the field. `graph` is null when there is
 * no folder to measure a footprint from, and then the estimate stands in.
 */
function composeLibraryGroups(sim: LibrarySimulation, graph: LibraryGraph | null): void {
  const { nodes, links } = sim;
  const wholeField: PackSlot = {
    cx: 0,
    cy: 0,
    halfWidth: sim.box.width / 2,
    halfHeight: sim.box.height / 2,
  };
  if (nodes.length === 0) {
    sim.cells = [wholeField];
    sim.groupNodes = [[]];
    sim.looseGroup = null;
    sim.looseRadius = 0;
    sim.packed = false;
    return;
  }

  const parent = nodes.map((_, index) => index);
  const find = (start: number): number => {
    let index = start;
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]!]!;
      index = parent[index]!;
    }
    return index;
  };
  for (const link of links) {
    const first = find(link.source);
    const second = find(link.target);
    // The lower index always wins, so roots do not depend on link order.
    if (first !== second) parent[Math.max(first, second)] = Math.min(first, second);
  }
  const byRoot = new Map<number, number[]>();
  const loose: number[] = [];
  nodes.forEach((node, index) => {
    if (node.orbit !== null) {
      loose.push(index);
      return;
    }
    const root = find(index);
    const members = byRoot.get(root);
    if (members) members.push(index);
    else byRoot.set(root, [index]);
  });
  const components = [...byRoot.values()].sort(
    (first, second) =>
      second.length - first.length ||
      (nodes[first[0]!]!.id < nodes[second[0]!]!.id ? -1 : 1),
  );
  const groups = loose.length > 0 ? [...components, loose] : components;

  const looseRadius = looseRingRadius(loose.map((index) => nodes[index]!));
  /*
   * One connected mass keeps one field with the loose marks ringed around it: composing a
   * lone loose mark as a peer group stretches the picture to make room for it (measured on a
   * 60-mark folder). Composition is for folders with no single mass.
   */
  if (components.length < 2) {
    sim.cells = [wholeField];
    // The unattached marks are listed after the mass so the many-body pass skips them.
    sim.groupNodes = loose.length > 0
      ? [components[0]?.map((index) => nodes[index]!) ?? [], loose.map((index) => nodes[index]!)]
      : [components[0]?.map((index) => nodes[index]!) ?? []];
    // A `groupNodes` index; `cells` has no entry for it here.
    sim.looseGroup = loose.length > 0 ? 1 : null;
    sim.looseRadius = looseRadius;
    sim.packed = false;
    for (const node of nodes) node.cell = 0;
    return;
  }

  /*
   * Each group settles alone first; the offsets seed the real run, or the arrival shows
   * clusters crossing the canvas.
   */
  const prepass = graph !== null && nodes.length <= PACK_PREPASS_MAX_ORDER;
  const looseIndex = loose.length > 0 ? groups.length - 1 : -1;
  const looseBox = (): PackBox => {
    let reach = 0;
    for (const index of loose) reach = Math.max(reach, nodes[index]!.radius);
    // The ring plus its marks' own reach: the cell holds the mark, not only its centre.
    const extent = (looseRadius + reach) * 2;
    return { width: extent, height: extent };
  };
  const measure = (): {
    boxes: PackBox[];
    seeds: Array<Map<string, LayoutPoint> | null>;
  } => {
    const boxes: PackBox[] = [];
    const seeds: Array<Map<string, LayoutPoint> | null> = [];
    groups.forEach((members, groupIndex) => {
      if (groupIndex === looseIndex) {
        boxes.push(looseBox());
        seeds.push(null);
        return;
      }
      const measured = prepass
        ? settledFootprint(graph!, members.map((index) => nodes[index]!.id), sim.box)
        : null;
      if (measured) {
        boxes.push(measured.box);
        seeds.push(measured.offsets);
        return;
      }
      const extent = Math.sqrt(members.length * PACK_ESTIMATE_AREA_PER_MARK);
      boxes.push({ width: extent, height: extent });
      seeds.push(null);
    });
    return { boxes, seeds };
  };

  const { boxes, seeds } = measure();
  const cells = packGroupsAroundCentre(boxes, ORPHAN_RING_GAP);

  sim.cells = cells;
  sim.groupNodes = groups.map((members) => members.map((index) => nodes[index]!));
  // Packed: one cell per group, so this indexes both.
  sim.looseGroup = loose.length > 0 ? groups.length - 1 : null;
  sim.looseRadius = looseRadius;
  sim.packed = true;
  groups.forEach((members, groupIndex) => {
    const cell = cells[groupIndex]!;
    const offsets = seeds[groupIndex];
    for (const index of members) {
      const node = nodes[index]!;
      node.cell = groupIndex;
      // A mark already on the canvas keeps its position; a new one is placed in its cell.
      if (node.entered >= 1 && sim.ticks > 0) continue;
      const offset = offsets?.get(node.id);
      if (offset) {
        node.x = cell.cx + offset.x;
        node.y = cell.cy + offset.y;
        node.vx = 0;
        node.vy = 0;
      } else if (node.orbit !== null) {
        node.x = cell.cx + Math.cos(node.orbit) * looseRadius;
        node.y = cell.cy + Math.sin(node.orbit) * looseRadius;
        node.vx = 0;
        node.vy = 0;
      }
    }
  });
}

/**
 * Radius of the loose marks' ring in their cell: 0 for one mark, else the larger of one
 * slot's spacing and the circumference they need not to collide (collision diameter × 1.35).
 */
function looseRingRadius(loose: readonly SimulationNode[]): number {
  if (loose.length <= 1) return 0;
  let reach = 0;
  for (const node of loose) reach = Math.max(reach, node.radius);
  const spacing = reach * 2 * 1.35;
  return Math.max(spacing, (loose.length * spacing) / (Math.PI * 2));
}

/**
 * Settles one group alone with this file's forces and returns its box and each mark's offset
 * from the box centre. Radii graded within the group move the box a few per cent, which the
 * packing gutter absorbs.
 */
function settledFootprint(
  graph: LibraryGraph,
  ids: readonly string[],
  box: { width: number; height: number },
): { box: PackBox; offsets: Map<string, LayoutPoint> } | null {
  const wanted = new Set(ids);
  const sub: LibraryGraph = {
    nodes: graph.nodes.filter((node) => wanted.has(node.id)),
    edges: graph.edges.filter((edge) => wanted.has(edge.source) && wanted.has(edge.target)),
    counts: graph.counts,
  };
  if (sub.nodes.length === 0) return null;
  const sim = settleLibrarySimulation(
    createLibrarySimulation({ graph: sub, box, compose: false }),
  );
  const bounds = librarySimulationBounds(sim);
  if (!bounds) return null;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const offsets = new Map<string, LayoutPoint>();
  for (const node of sim.nodes) offsets.set(node.id, { x: node.x - cx, y: node.y - cy });
  return {
    box: {
      width: Math.max(1, bounds.maxX - bounds.minX),
      height: Math.max(1, bounds.maxY - bounds.minY),
    },
    offsets,
  };
}

/**
 * Gives every unattached mark an evenly spaced ring slot in sorted-id order, the same on
 * every machine, from {@link ORPHAN_RING_PHASE}; a mark with a relation gets none.
 */
function assignOrbits(nodes: SimulationNode[]): void {
  const loose: SimulationNode[] = [];
  for (const node of nodes) {
    node.orbit = null;
    if (node.degree === 0) loose.push(node);
  }
  if (loose.length === 0) return;
  loose.sort((first, second) => (first.id < second.id ? -1 : first.id > second.id ? 1 : 0));
  loose.forEach((node, position) => {
    node.orbit = ORPHAN_RING_PHASE + (position / loose.length) * Math.PI * 2;
  });
}

/**
 * The ring the unattached marks stand on, or `null` when there are none; exported so a test
 * asks the claim rather than recomputing it. Packed, a circle in the loose group's cell;
 * otherwise an ellipse of the box's aspect whose centre and standoffs come from the connected
 * mass per axis plus {@link ORPHAN_RING_GAP}. Not clamped to the box: the fit's padding is the
 * margin, and a clamp would only pull loose marks into the cluster.
 */
export function libraryOrphanRing(
  sim: LibrarySimulation,
): { cx: number; cy: number; rx: number; ry: number } | null {
  /*
   * Composed groups put the ring inside the loose group's own cell: a ring around several
   * cells would be a rim the fit must make room for. The cell keeps loose marks out of every
   * cluster and off every relation.
   */
  if (sim.packed) {
    if (sim.looseGroup === null) return null;
    // Packed, so the group index is a cell index too.
    const cell = sim.cells[sim.looseGroup];
    if (!cell) return null;
    return { cx: cell.cx, cy: cell.cy, rx: sim.looseRadius, ry: sim.looseRadius };
  }
  let loose = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let held = 0;
  for (const node of sim.nodes) {
    if (node.orbit !== null) {
      loose += 1;
      continue;
    }
    minX = Math.min(minX, node.x - node.radius);
    minY = Math.min(minY, node.y - node.radius);
    maxX = Math.max(maxX, node.x + node.radius);
    maxY = Math.max(maxY, node.y + node.radius);
    held += 1;
  }
  if (loose === 0) return null;
  /*
   * The centre is the mass's bounding box, not its centroid: around an off-centre centroid
   * the short side stands off by the long side's distance, far past {@link ORPHAN_RING_GAP}.
   */
  const cx = held > 0 ? (minX + maxX) / 2 : 0;
  const cy = held > 0 ? (minY + maxY) / 2 : 0;
  const massX = held > 0 ? (maxX - minX) / 2 : 0;
  const massY = held > 0 ? (maxY - minY) / 2 : 0;
  const ratio = Math.min(4, Math.max(0.25, sim.box.width / sim.box.height));
  // Solve for ry, then derive rx from the aspect, so both standoffs hold on either long axis.
  const ry = Math.max(
    massY + ORPHAN_RING_GAP,
    (massX + ORPHAN_RING_GAP) / ratio,
    ORPHAN_RING_MIN_RADIUS / Math.sqrt(ratio),
  );
  return { cx, cy, rx: ry * ratio, ry };
}

/**
 * Pulls each unattached mark toward its slot as a force, not a freeze, so a dragged one
 * leaves it and a released one comes home.
 */
function applyOrphanRing(sim: LibrarySimulation, alpha: number): void {
  const ring = libraryOrphanRing(sim);
  if (!ring) return;
  const strength = ORPHAN_RING_GRAVITY * alpha;
  for (const node of sim.nodes) {
    if (node.orbit === null) continue;
    node.vx += (ring.cx + Math.cos(node.orbit) * ring.rx - node.x) * strength;
    node.vy += (ring.cy + Math.sin(node.orbit) * ring.ry - node.y) * strength;
  }
}

/**
 * One tick, velocity Verlet as `d3-force` does it. A pinned node's position is written and
 * its velocity zeroed, so dragging is not a fight between the pointer and a spring.
 */
export function stepLibrarySimulation(sim: LibrarySimulation): LibrarySimulation {
  sim.alpha += (sim.alphaTarget - sim.alpha) * ALPHA_DECAY;
  const { alpha, nodes } = sim;
  sim.ticks += 1;

  applyManyBody(sim, alpha);
  applyGravity(sim, alpha);
  applyOrphanRing(sim, alpha);
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
    // Repulsion can push a node to a non-finite coordinate; recentring it keeps the fit
    // from collapsing to one point.
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
      node.x = 0;
      node.y = 0;
      node.vx = 0;
      node.vy = 0;
    }
  }
  return sim;
}

/**
 * Unattached marks take no part: repulsion throws them at the walls, and a ring slot plus a
 * shove settles them wherever the two cancel. Collision and the ring gap still keep them
 * clear, and the connected layout never depends on how many files nobody cited.
 */
function applyManyBody(sim: LibrarySimulation, alpha: number): void {
  const charge = MANY_BODY_STRENGTH * alpha;
  /*
   * Repulsion runs inside a group, never between two, or unrelated clusters fly to the walls;
   * groups are placed by `composeLibraryGroups`. Prebuilt lists keep a branch out of the n²/2 pair
   * loop, which nearly doubled the exact pass (measured at 200 nodes).
   */
  for (let group = 0; group < sim.groupNodes.length; group += 1) {
    if (group === sim.looseGroup) continue;
    applyGroupManyBody(sim, sim.groupNodes[group]!, charge);
  }
}

/** One group's many-body pass — exact below the crossover, Barnes–Hut above it. */
function applyGroupManyBody(sim: LibrarySimulation, held: SimulationNode[], charge: number): void {
  if (held.length === 0) return;
  if (held.length > sim.exactMaxOrder) {
    const tree = new LibraryQuadtree(held);
    const out = { fx: 0, fy: 0 };
    for (const node of held) {
      out.fx = 0;
      out.fy = 0;
      /*
       * The tree holds one charge per cell, so a page's extra push applies at the receiving
       * end: an approximation of the kind the tree already makes, above the crossover only.
       */
      tree.accumulate(node.x, node.y, charge * node.charge, out, MANY_BODY_MAX_DISTANCE);
      node.vx += out.fx;
      node.vy += out.fy;
    }
    return;
  }
  for (let a = 0; a < held.length; a += 1) {
    const first = held[a]!;
    for (let b = a + 1; b < held.length; b += 1) {
      const second = held[b]!;
      let dx = second.x - first.x;
      let dy = second.y - first.y;
      let distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < 1e-6) {
        // Coincident marks separate along a fixed diagonal, so the result is deterministic.
        dx = 1e-3;
        dy = 1e-3;
        distanceSquared = 2e-6;
      }
      if (distanceSquared > MANY_BODY_MAX_DISTANCE_SQUARED) continue;
      // A pair pushes with the busier end's charge, so a busy page gets room from every neighbour.
      const weight = (charge * Math.max(first.charge, second.charge)) / distanceSquared;
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
 * Isotropic gravity toward the mark's own group cell (`library-graph-packing.ts`). Never
 * aspect-aware: a picture stretched to the window changes the distances a person reads.
 */
function applyGravity(sim: LibrarySimulation, alpha: number): void {
  const strength = GRAVITY * alpha;
  for (const node of sim.nodes) {
    // An unattached mark answers to its ring slot; two centres would fight.
    if (node.orbit !== null) continue;
    const cell = sim.cells[node.cell] ?? sim.cells[0];
    if (!cell) continue;
    node.vx -= (node.x - cell.cx) * strength;
    node.vy -= (node.y - cell.cy) * strength;
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
 * No mark ever sits on another. O(n²) pairs up to {@link COLLISION_EXACT_MAX_ORDER}; above
 * it a uniform grid hash with one-diameter cells tests each node's 3×3 neighbourhood, about
 * O(n). This pass, not many-body, sets the frame budget (a 1,500-node tick measured 13.7 ms
 * with over 11 in exact collision).
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
        // Each pair once: only the lower index resolves it.
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

/**
 * Lays the flow columns and stands still: zero velocity and alpha at rest, so the running
 * check (`isLibrarySimulationRunning`) reads false and no tick moves a mark.
 */
export function applyLibraryFlowLayout(
  sim: LibrarySimulation,
  graph: LibraryGraph,
  world: FlowWorld = sim.box,
): FlowLayout {
  const layout = flowLayout(graph, world);
  const { positions } = layout;
  for (const node of sim.nodes) {
    const point = positions.get(node.id);
    if (!point) continue;
    node.x = point.x;
    node.y = point.y;
    node.vx = 0;
    node.vy = 0;
    node.fx = null;
    node.fy = null;
    node.entered = 1;
  }
  sim.alpha = 0;
  sim.alphaTarget = 0;
  return layout;
}

/** Lays the islands overview into the simulation's nodes, the same way the flow is laid. */
export function applyLibraryIslandsLayout(
  sim: LibrarySimulation,
  graph: LibraryGraph,
  world: { width: number; height: number },
  labels: { unsorted: string; unread: string },
): IslandsLayout {
  const layout = islandsLayout(graph, world, labels);
  for (const node of sim.nodes) {
    const point = layout.positions.get(node.id);
    if (!point) continue;
    node.x = point.x;
    node.y = point.y;
    node.vx = 0;
    node.vy = 0;
    node.fx = null;
    node.fy = null;
    node.entered = 1;
  }
  sim.alpha = 0;
  sim.alphaTarget = 0;
  return layout;
}

/** Puts energy back in: a drag, or a folder that gained or lost a file. */
export function reheatLibrarySimulation(sim: LibrarySimulation, alpha = REHEAT_ALPHA): void {
  sim.alpha = Math.max(sim.alpha, alpha);
}

/** Whether the picture still has anywhere to go. The rAF loop stops when this is false. */
export function isLibrarySimulationRunning(sim: LibrarySimulation): boolean {
  if (sim.alpha > ALPHA_MIN) return true;
  return sim.nodes.some((node) => node.fx !== null);
}

/**
 * Runs the simulation to rest in one call: the reduced-motion path and the tests', so that
 * preference loses nothing but the motion.
 */
export function settleLibrarySimulation(
  sim: LibrarySimulation,
  maxTicks = LIBRARY_SETTLE_MAX_TICKS,
): LibrarySimulation {
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
 * Lets go with the drag velocity, so the picture feels like it has mass; capped, or a fast
 * flick throws the node off the canvas before the springs answer.
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
 * Records the canvas's new shape and moves nothing: the camera refits (`fitView`), and the
 * box feeds the orphan ring's aspect and the engine's re-laid flow or islands world.
 */
export function resizeLibrarySimulation(
  sim: LibrarySimulation,
  box: { width: number; height: number },
): void {
  const width = Math.max(1, box.width);
  const height = Math.max(1, box.height);
  if (sim.box.width === width && sim.box.height === height) return;
  sim.box = { width, height };
}

/**
 * A changed folder rearranges without jumping: kept nodes keep position and velocity, a new
 * node enters on an attached neighbour (a fresh page on its sources), and removed nodes are
 * returned so the caller fades them over `--motion-base`.
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
      existing.charge = chargeMultiplier(node.kind, existing.degree);
      return existing;
    }
    entered.push(node.id);
    // The first attached neighbour already on the canvas, in edge order, so arrival is deterministic.
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
      degree: degree.get(node.id) ?? 0,
      charge: chargeMultiplier(node.kind, degree.get(node.id) ?? 0),
      orbit: null,
      cell: existingCell(byId, neighbours, node.id),
    };
  });
  // Orphan slots are re-derived from the new degrees, never carried over.
  assignOrbits(nodes);

  sim.nodes = nodes;
  sim.index = new Map(nodes.map((node, position) => [node.id, position]));
  sim.links = buildLinks(graph, sim.index, degree);
  // A new page can join or split groups, so the composition is re-derived; marks already
  // on the canvas keep their positions.
  composeLibraryGroups(sim, graph);
  if (entered.length > 0 || removed.length > 0) reheatLibrarySimulation(sim);
  return { entered, removed };
}

/**
 * A new mark's starting cell: its first placed neighbour's, else 0. `composeLibraryGroups`
 * decides the real cell, but a bare 0 would flash the mark in the biggest group's cell.
 */
function existingCell(
  byId: ReadonlyMap<string, SimulationNode>,
  neighbours: ReadonlyMap<string, string[]>,
  id: string,
): number {
  for (const neighbour of neighbours.get(id) ?? []) {
    const found = byId.get(neighbour);
    if (found) return found.cell;
  }
  return 0;
}

/** Where each node is, in the simulation's own units. */
export function libraryPositions(
  sim: LibrarySimulation,
  out = new Map<string, LayoutPoint>(),
): Map<string, LayoutPoint> {
  for (const node of sim.nodes) {
    const point = out.get(node.id);
    if (point) {
      point.x = node.x;
      point.y = node.y;
    } else out.set(node.id, { x: node.x, y: node.y });
  }
  if (out.size > sim.index.size) {
    for (const id of out.keys()) if (!sim.index.has(id)) out.delete(id);
  }
  return out;
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
