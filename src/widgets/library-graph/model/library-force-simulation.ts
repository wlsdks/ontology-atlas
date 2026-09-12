import type { LibraryGraph, LibraryGraphNodeKind } from "./build-library-graph";
import { LibraryQuadtree } from "./library-graph-quadtree";
import { seedPositions, type LayoutPoint } from "./library-graph-layout";
import { packGroupsAroundCentre, type PackBox, type PackSlot } from "./library-graph-packing";

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
 * | orphan ring | a mark no relation answers for has a place of its own — one ellipse around the connected mass, evenly spread — rather than the residue of the other two forces, which threw it at a wall |
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

/**
 * Rest length of a citation, in world units — **a satellite's orbit around its page**.
 *
 * It was 52, half again the 34 the fit reserved for a label, and at that distance a page
 * and the six files it was written from occupied as much of the picture as three unrelated
 * pages did: the hub and its satellites read as a constellation of equals rather than as
 * one thing. 28 is a shade over the widest page mark's diameter plus a source's, so the
 * files a page stands on sit **against** it, close enough that the group is one object at a
 * glance and far enough that no two of them collide ({@link COLLISION_PAD} is 7).
 */
const CITES_REST = 28;
/**
 * Rest length of a mention. **More than four times a citation**, so a concept a page merely
 * names is pushed clear of the page's own satellites instead of standing among them. The
 * two relations were 52 and 96 — a ratio of 1.8, which the eye reads as "a bit further" —
 * and the hub-and-satellite reading needs them to be different kinds of distance, not
 * different lengths of the same one.
 */
const MENTIONS_REST = 120;

/**
 * Many-body charge. Negative is repulsion, the sign convention `d3-force` uses.
 *
 * ⚠️ **It was −260, and −260 was tuned on eighteen marks.** At that strength a three
 * hundred-file folder settled 1993×1639 world units across with a mean citation length of
 * 65 against a rest of 28 — repulsion, not the springs, was deciding every distance in the
 * picture, and the fit then had to clamp and push a fifth of the folder off the canvas. The
 * sweep at 376 marks: −70 → 1993 across, −55 → 1879, **−45 → 1634**, which is the first
 * value whose fitted scale (0.447) clears the zoom floor a 3px source mark sets (0.429).
 *
 * The floor under it is the collision pass, not this number: two marks are never nearer than
 * their own radii plus {@link COLLISION_PAD} whatever the charge, so weakening repulsion
 * cannot bring back the 2026-09-07 hairball — measured on the owner's 18-mark folder, a mean
 * citation of 56.8 against a collision minimum of 25.
 */
const MANY_BODY_STRENGTH = -45;

/**
 * **How much more a page pushes than a file does, per relation it carries.**
 *
 * Repulsion with one charge for every mark makes a page with nine sources exactly as
 * crowd-shy as a source with one, so a busy hub's own satellites are pressed into the
 * satellites of the hub beside it and the two groups read as a single smear — the shape at
 * three hundred documents that no rest length can undo. Charge proportional to degree gives
 * the busy page the room its own satellites need before anything else is placed near it.
 *
 * Linear in the count of relations and capped, because the cap is what stops one hub in a
 * three-hundred-file folder from becoming the only thing the picture is about.
 */
const PAGE_CHARGE_PER_DEGREE = 0.35;
const PAGE_CHARGE_MAX = 4;

/**
 * **Repulsion stops at this distance**, in world units — `d3-force`'s `distanceMax`, and at
 * three hundred documents it is the difference between a picture and a cloud.
 *
 * Repulsion falls off as 1/d², which sounds local and is not: the *count* of distant marks
 * grows as d², so every mark in a three-hundred-file folder feels a roughly constant push
 * from everything in the folder, and the only thing that balances it is gravity at the
 * centre. Measured on a 376-mark folder before the cutoff: the settled picture spanned
 * 3216×2859 world units with a mean citation length of 129.6 against a rest length of 28,
 * so the fit had to clamp and a third of the folder stood outside the canvas.
 *
 * What repulsion is actually *for* here is local: keeping the satellites of one page off the
 * satellites of the next. 240 is about eight citation rest lengths — far enough that a page
 * and everything it cites are inside one another's field, and near enough that two clusters
 * a screen apart have no opinion about each other. After: 700×663 and a mean citation of
 * 33.9.
 */
const MANY_BODY_MAX_DISTANCE = 240;
const MANY_BODY_MAX_DISTANCE_SQUARED = MANY_BODY_MAX_DISTANCE * MANY_BODY_MAX_DISTANCE;

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
/**
 * **The settle budget**: the most ticks an arrival is ever allowed, after which the picture
 * is what it is and the loop idles.
 *
 * {@link ALPHA_DECAY} reaches {@link ALPHA_MIN} in 234 ticks from a cold start, so this is a
 * ceiling with room rather than a cut — it exists so that a folder nobody has measured
 * cannot hold the loop awake, which on a canvas whose whole contract is *it stands still*
 * would be the defect rather than a slow arrival.
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
 * **The margin the camera keeps around the whole picture**, in canvas pixels.
 *
 * It was 34 — "an 11px label on a 15px line, 5px under a mark up to 10px", exactly the
 * stack an outermost mark needed and not a pixel more, and it was a *derived* number once
 * the mark band followed the canvas. Both of those are gone: the marks are a fixed world
 * scale, so the stack is knowable in advance, and a margin sized to the tallest label alone
 * puts the picture's edge against the pane's edge, which is what made the owner's 1920
 * capture read as a clump pressed into a field. 64 is the stack (9 × 1.6 zoom + 5 + 15 ≈
 * 34) with room around it, and it is a constant so that the same folder is framed the same
 * way at every window size.
 */
export const LIBRARY_FIT_PADDING = 64;

/**
 * **The orphan ring** — where a mark that is attached to nothing settles.
 *
 * A degree-0 mark is the one node in this model that no spring answers for. It has
 * repulsion pushing it away from everything and gravity pulling it at the centre, and the
 * balance of those two alone is *far out and wherever*: measured on the owner's seeded
 * folder at 1512×917 on 2026-09-07, `interview-notes.txt` sat on the top edge,
 * `design-system.docx` on the bottom one, `Handover notes` on the right, and
 * `kickoff-notes.html` in the bottom-right corner 40px from the fit control, while the two
 * real components sat small in the middle. Nothing was wrong with any single position; the
 * picture read as scattered because four marks had been thrown to four different walls.
 *
 * So the unattached marks are given a place of their own rather than left to the residue
 * of two forces: **one calm ellipse around the connected mass**, its aspect the canvas's,
 * its radius the mass's own bounding radius plus {@link ORPHAN_RING_GAP}, and its angles
 * spread evenly and deterministically by sorted id. It is a gravity target, not a
 * position — orphans still repel, still collide, still drag, and still drift — so the
 * picture stays alive, which `docs/DECISIONS.md` (2026-09-07) requires of it.
 *
 * The ellipse is what keeps the fill the same record measured: a *circular* ring around a
 * 3.56-aspect canvas would make the whole picture as tall as it is wide and give back the
 * width that record's falsifier is stated against.
 */
const ORPHAN_RING_GAP = 56;
/** Ring radius when there is no connected mass to stand off from — a folder of loose files. */
const ORPHAN_RING_MIN_RADIUS = 90;
/**
 * Pull toward the ring slot, per tick. Several times {@link GRAVITY}: the ring is a place
 * the mark belongs, not a preference it drifts toward, and it has to answer the repulsion
 * of every mark in the mass at once.
 */
const ORPHAN_RING_GRAVITY = 0.085;
/**
 * The first slot's angle: **on the ring's short axis, and no half-slot offset.**
 *
 * ⚠️ Two measurements decide this, and the second one narrows the first.
 *
 * **No half-slot offset** (2026-09-07). Half a slot off the top looked tidier written down
 * and put four orphans at ±45°, which is a *rectangle*: each of the four marks is then
 * simultaneously the leftmost-or-rightmost and the topmost-or-bottommost thing in the
 * picture, so the fit — which pins the bounding box to the canvas — lands all four in the
 * four corners, 34px from two walls each and one of them under the fit control. On the axes
 * the extremes are held by different marks instead: the bounding box has empty corners, and
 * each loose mark is near one wall and far from the other three. That still stands, and
 * with four slots the rule below produces exactly the same four angles.
 *
 * **Which axis it starts on** (2026-09-08). It used to be three o'clock, and with *one*
 * loose mark three o'clock is the single worst angle available: the ring is an ellipse with
 * the box's aspect, so the 0° slot sits at its **long** radius and one unattached note
 * decides the whole picture's scale. Measured on the owner's own folder at 1400×860 — 19
 * marks, one of them loose: the connected mass spanned 708×538, and
 * `Meeting notes September` alone stretched the picture to 908×525, aspect **1.79** against
 * a canvas of 1.25. The fit is uniform, so it was width-bound and **35% of the canvas height
 * went unused** (fillY 0.65; 0.49 at 1040×720, which is the empty band the owner's screenshot
 * shows).
 *
 * So the first slot is on the **vertical**, where the fit has room. That is a constant and
 * not a function of the box, and the measurement is why: the connected mass settles
 * consistently *wider* than the canvas it is drawn in, because the aspect-aware gravity is a
 * weak shaping term that under-corrects — 1.32 against a box of 1.25 at 1400×860, and 1.41
 * against a box of 1.00 at 1040×720. The slack is therefore vertical at every size measured,
 * and a rule that reads the box instead answered 1040×720 wrong by two pixels of box height.
 */
const ORPHAN_RING_PHASE = Math.PI / 2;

/**
 * **The picture is still once it has arrived.**
 *
 * ⚠️ This is where a ≤0.4px, 7.2s ambient drift used to be applied to every mark's screen
 * position, every fourth frame, forever. It was a bounded owner directive (2026-09-07,
 * *"it does not even move"*) and the owner reversed it on 2026-09-08 looking at the
 * installed app: *"why does it wriggle whenever I put the mouse on the graph? it is hard
 * to look at … get rid of that strange effect."* A drift small enough to be defensible in
 * a number was still large enough to be seen, and a picture that never stops moving is a
 * picture a person cannot rest their eye on while reading the document beside it.
 *
 * Nothing has replaced it. Motion here is now only ever the answer to something a person
 * did: the arrival, a drag, a release, a resize, a folder that changed. `docs/DECISIONS.md`,
 * 2026-09-08, carries the reversal.
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
  /**
   * Arrival progress, 0 → 1. A node that has just appeared is faded in over
   * `--motion-base` by the caller; the simulation only counts, it does not draw.
   */
  entered: number;
  /** How many edges touch it — what the drawn radius is graded by. */
  degree: number;
  /**
   * Angle of this mark's slot on the orphan ring, or `null` when it has a relation and the
   * springs answer for it. Assigned from the sorted id, so it is the same on every machine
   * and the same on every visit.
   */
  orbit: number | null;
  /**
   * Which of {@link LibrarySimulation.cells} this mark is held in — the index of its own
   * group of the folder. A folder that is one connected graph has one cell covering the
   * whole field, and then this is 0 for everybody and nothing about the physics differs
   * from what it was before the packing existed.
   */
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
  /** Half-width and half-height of the field, which is where the aspect-aware gravity comes from. */
  box: { width: number; height: number };
  /**
   * **One place per group of the folder**, in the simulation's own units — see
   * `library-graph-packing.ts` for why a composition rather than a force decides this.
   * Exactly one cell, covering the whole field, when the folder is a single connected
   * graph.
   */
  cells: PackSlot[];
  /**
   * The nodes of each group, by cell index, as references — rebuilt when the composition
   * is, never per tick. The many-body pass walks these rather than the whole array, which
   * is what stops two groups with no relation between them from pushing each other at the
   * walls.
   */
  groupNodes: SimulationNode[][];
  /**
   * **Index into {@link groupNodes} of the unattached marks** — and, while {@link packed},
   * of their cell as well, because a packed composition has one cell per group. `null` when
   * the folder has no unattached mark.
   *
   * ⚠️ **It was named for a cell, and its two setters disagreed about what it addressed.**
   * The packed branch writes `groups.length - 1`, which is both a `groupNodes` index and a
   * `cells` index. The single-mass branch writes `1` — the loose marks are listed after the
   * one connected mass in `groupNodes` — while `cells` holds exactly one entry, the whole
   * field. Indexing `cells` with it was therefore out of range on every single-mass folder,
   * and nothing crashed only because `libraryOrphanRing` tests `sim.packed` before it
   * indexes `cells`. The other reader (`applyManyBody`) always wanted the group index, and
   * gets it in both branches. So the field is named for what both setters actually produce,
   * and the one cell-shaped use states its own precondition.
   */
  looseGroup: number | null;
  /**
   * Radius of the ring they stand on inside their cell. 0 when there is only one of them.
   *
   * ⚠️ **Read only while {@link packed}.** Unpacked — one connected mass — the ring is
   * measured from the mass's own settled box by `libraryOrphanRing`, because there the ring
   * goes *around* the picture rather than inside a cell of it. The single-mass branch still
   * writes this value so that a folder which stops being packed cannot leave a stale radius
   * behind for the next composition to read.
   */
  looseRadius: number;
  /**
   * Whether the groups were composed at all. False for a single-group folder — where the
   * one cell is the whole field — and for a folder of nothing but unattached files, whose
   * ring is still the field's own ellipse.
   */
  packed: boolean;
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

/**
 * **The mark scale, and it is fixed.**
 *
 * ⚠️ **This band used to be a function of the canvas.** On 2026-09-12 the band was graded
 * from "the side of the square each mark would get if the canvas were divided evenly between
 * them", floored at a 10px top and capped at 17 — so twelve marks on a 1512 window wore 34px
 * of diameter, and the same twelve on a 1920 window wore more. The owner's verdict on that
 * build is the reason it is gone: *"the graph is too big and ugly … what happens when a few
 * hundred documents pile up?"* A mark that grows with the window is a folder with as many
 * pictures as the person has window sizes, and it hides the only question the size was ever
 * asked to answer — which page is busy — behind how much room the window happened to have.
 *
 * So the scale is a constant, in **world** units, and the camera is the only thing between
 * it and the screen (`fitLibraryView` clamps the zoom to [z_min, 1.6], so a mark's drawn
 * size has a floor and a ceiling and nothing else). Six documents on a 1920 window look
 * small, exactly as six nodes on the map do.
 *
 * - **A page is 5 → 9** by how many sources it cites: the one thing on this canvas worth
 *   grading, and the grading a person can actually decode because the two ends are a
 *   3.24× area ratio at a fixed size rather than a ratio against a mark that moved.
 * - **A source is a 3.5 square** — the file a page stands on, never the subject. Half the
 *   page band's own top, and a square reads heavier than a circle of the same extent, so a
 *   file's 7px box sits under a quiet page's 10px disc.
 * - **A concept is a 5 ring**, the page band's floor: it lives on the map, not in this
 *   folder, so it is present at the smallest size a named thing is drawn at here.
 */
export const LIBRARY_PAGE_RADIUS_MIN = 5;
export const LIBRARY_PAGE_RADIUS_MAX = 9;
export const LIBRARY_SOURCE_RADIUS = 3.5;
export const LIBRARY_CONCEPT_RADIUS = 5;

/**
 * Every node's half-extent in world units, in one pass. Pure; the renderer multiplies by
 * the camera's scale and never by anything else.
 *
 * A page is graded by the **citations** it carries, not by its degree: a mention is a page
 * naming a concept, which says nothing about how much of the folder that page was written
 * from, and counting both made a page with one source and six concepts the biggest mark on
 * the picture.
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
    // Square-rooted, so the band reads as "more sources" rather than as a bar chart: area
    // grows with the count, which is how a person judges a dot's size.
    const t = max <= 0 ? 0 : Math.sqrt(Math.min(cites.get(node.id) ?? 0, max) / max);
    out.set(node.id, LIBRARY_PAGE_RADIUS_MIN + (LIBRARY_PAGE_RADIUS_MAX - LIBRARY_PAGE_RADIUS_MIN) * t);
  }
  return out;
}

/**
 * A mark's own charge, as a multiple of {@link MANY_BODY_STRENGTH}.
 *
 * Only a **page** grades. A source and a concept are satellites — what holds them is the
 * spring to the page that cites or names them, and giving them a charge of their own only
 * made the two hubs beside each other push their satellites into one another's.
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
  /**
   * False only for the footprint pass `composeLibraryGroups` runs on one group at a time:
   * a single group has nothing to compose, and saying so explicitly is what keeps the
   * recursion one level deep by construction rather than by argument.
   */
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
      // The busier end moves less. Without it a page cited by nothing else is dragged
      // across the canvas by a source that six other pages are also holding.
      bias: sourceDegree / (sourceDegree + targetDegree),
      /*
       * A hub's springs are weakened in proportion to how many it has, so a source every
       * page cites does not out-pull the whole picture into one knot. This is what
       * ForceAtlas2's `outboundAttractionDistribution` did for the settled layout, kept
       * because it was the reason a hub stayed reachable from all of its pages.
       */
      strength: 1 / Math.sqrt(Math.min(sourceDegree, targetDegree)),
    });
  }
  return links;
}

/**
 * Order above which the footprint pass is skipped and an estimate stands in.
 *
 * ⚠️ **It was 240, and 240 was the wrong bound for the wrong reason.** The pass settles each
 * group once, synchronously, on mount — Σ n<sub>i</sub>² ≤ n², so it is at worst the cost of
 * the arrival a person is already waiting for — and it only runs at all when the folder has
 * **two or more** components, because one connected mass takes the whole field and has
 * nothing to compose. So the expensive case the old bound was protecting against, a single
 * six-hundred-mark component, never reached this line in the first place; what the bound
 * actually excluded was exactly the folder G2 exists for. Measured on 376 marks in seven
 * groups: the estimate below reserved 916 units a side per group and the packed picture came
 * out 3037 units across, against 700 once each group was measured.
 *
 * 1200 is where Σ n<sub>i</sub>² on a plausible worst case — a hundred groups of twelve —
 * is still under a tenth of the single-component settle nobody complains about.
 */
const PACK_PREPASS_MAX_ORDER = 1200;

/**
 * Footprint per mark used **only** above {@link PACK_PREPASS_MAX_ORDER}. Re-measured on
 * 2026-09-12 against the fixed mark scale: a settled component's bounding-box area per mark
 * is about 1.4k at three marks and saturates near 2.6k above forty, so 2200 is the middle of
 * the band this estimate is ever used in. It was 14000, which was measured when a mark was
 * up to 34px across and the canvas decided that.
 */
const PACK_ESTIMATE_AREA_PER_MARK = 2200;

/**
 * **The composition**: every group of the folder is given its own place, and every mark is
 * told which place it belongs to.
 *
 * Three steps, and the middle one is the whole reason this is not a force.
 *
 * 1. **The groups.** The connected components of the relation graph, biggest first with the
 *    smallest member id breaking ties, and then — as one more group — the unattached marks,
 *    which have no relation to answer for and stand on a ring of their own inside their own
 *    cell.
 * 2. **The footprints.** Each component is settled *on its own*, by this very file's
 *    forces, and its bounding box measured. So the rectangle a group is given already has
 *    the shape of what goes in it, which is what a weight-proportional treemap cell cannot
 *    promise: a wide cluster in a square cell overflows onto its neighbour. The settled
 *    offsets are kept and used to seed the real simulation, so the picture *starts*
 *    composed and the arrival a person sees is the last of the settling rather than four
 *    clusters travelling across the canvas.
 * 3. **The packing.** `packGroupBoxes` lays the footprints in rows across an arrangement of
 *    the canvas's aspect, with {@link ORPHAN_RING_GAP} of clear space around every group —
 *    the same number that has always said how far a mark with no relation stands off
 *    everything else.
 *
 * A folder that is **one** connected graph, with no unattached files, has one group; it
 * takes one cell covering the whole field and every line below behaves exactly as it did
 * before this function existed. That is the case the perf gate and most of the unit suite
 * measure, and it is deliberately byte-for-byte the old path.
 *
 * `graph` is null when there is nothing to measure a footprint from — the footprint pass
 * needs the folder, not the simulation — and then the estimate above stands in.
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

  // ── 1. The groups. ──
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
    // The lower index always wins, so the roots do not depend on the order the links
    // happened to arrive in.
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
   * ⚠️ **A folder with one connected mass keeps the picture it had** — one field, one centre,
   * and the ring of unattached marks around that mass, exactly as 2026-09-07 decided.
   *
   * This is a measurement, not deference. On a 60-mark folder that is one component plus one
   * uncited file, composing the two as peers gave the single loose mark a place the size of a
   * group and stretched the picture to make room for it: the band went 26 → 82px and the
   * height filled fell 0.94 → 0.76. The composition is the answer when there is **no** single
   * mass to be the picture — three clusters and a loose file have no shared centre — and the
   * ring is the answer when there is one. Both cases are measured, and each keeps what it
   * measured better.
   */
  if (components.length < 2) {
    sim.cells = [wholeField];
    // The one group is the connected mass; the unattached marks are listed after it so the
    // many-body pass skips them, which is what it did before this function existed.
    sim.groupNodes = loose.length > 0
      ? [components[0]?.map((index) => nodes[index]!) ?? [], loose.map((index) => nodes[index]!)]
      : [components[0]?.map((index) => nodes[index]!) ?? []];
    // One cell, two groups: the mass is 0 and the loose marks are 1. This is a
    // `groupNodes` index and `cells` has no entry for it — see the field's own note.
    sim.looseGroup = loose.length > 0 ? 1 : null;
    sim.looseRadius = looseRadius;
    sim.packed = false;
    for (const node of nodes) node.cell = 0;
    return;
  }

  // ── 2. The footprints. ──
  /*
   * Each group is settled **on its own**, by this file's own forces and against the canvas's
   * own aspect — which is the aspect its gravity will keep once it is in its cell — so the
   * box the packing stacks is exactly the box the group will occupy. The settled offsets are
   * kept and used to seed the real simulation, so the picture *starts* composed and the
   * arrival a person sees is the last of the settling rather than four clusters travelling
   * across the canvas.
   */
  const prepass = graph !== null && nodes.length <= PACK_PREPASS_MAX_ORDER;
  const looseIndex = loose.length > 0 ? groups.length - 1 : -1;
  const looseBox = (): PackBox => {
    let reach = 0;
    for (const index of loose) reach = Math.max(reach, nodes[index]!.radius);
    // The ring, plus the room its own marks take: the place has to hold the mark, not only
    // the circle its centre sits on.
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

  // ── 3. The places. ──
  sim.cells = cells;
  sim.groupNodes = groups.map((members) => members.map((index) => nodes[index]!));
  // Packed: one cell per group, so this addresses both.
  sim.looseGroup = loose.length > 0 ? groups.length - 1 : null;
  sim.looseRadius = looseRadius;
  sim.packed = true;
  groups.forEach((members, groupIndex) => {
    const cell = cells[groupIndex]!;
    const offsets = seeds[groupIndex];
    for (const index of members) {
      const node = nodes[index]!;
      node.cell = groupIndex;
      // A mark that has been on the canvas keeps its position — a composition is not a
      // reason to throw a picture away — and one that has not is put where it belongs.
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
 * **The radius of the ring the unattached marks stand on**, inside their own cell.
 *
 * One loose file has no ring: a circle of one is a point, and the point is the middle of
 * its cell. Above that the radius is whichever is larger of one slot's worth of arc and the
 * circumference the marks need not to collide — so a folder with twenty unwritten files
 * gets a wide ring and one with two gets a narrow one, and neither is a number written down
 * here. The spacing is the collision diameter with a third more room, which is the same
 * clearance the collision pass would have insisted on anyway.
 */
function looseRingRadius(loose: readonly SimulationNode[]): number {
  if (loose.length <= 1) return 0;
  let reach = 0;
  for (const node of loose) reach = Math.max(reach, node.radius);
  const spacing = reach * 2 * 1.35;
  return Math.max(spacing, (loose.length * spacing) / (Math.PI * 2));
}

/**
 * Settles one group on its own and returns the box it took and where each of its marks
 * stood inside it, relative to the box's centre.
 *
 * It runs **this file's own forces**, through `createLibrarySimulation` with the
 * composition switched off, so the footprint measured is the footprint the group will have.
 * Two things are deliberately approximate: the mark radii are graded against this group's
 * own busiest mark rather than the folder's, and the gravity's aspect is the canvas's rather
 * than the cell's it has not been given yet. Both move the box by a few per cent, and the
 * packing's gutter is what absorbs that.
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
 * Hands every unattached mark its slot on the ring, and takes the slot back from every
 * mark that has a relation.
 *
 * **Evenly spread, in sorted-id order.** Even spacing is the whole of what makes four
 * loose files read as a composition rather than as four accidents; sorting by id is what
 * makes it the *same* composition on every machine and every visit, which is the property
 * the rest of this file pays for so carefully. The order is also the one a person can
 * predict — a folder's sources arrive together on the ring rather than interleaved with
 * its pages.
 *
 * Where the first slot sits is {@link ORPHAN_RING_PHASE}.
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
 * **The ellipse the unattached marks stand on**, in the simulation's own units, or `null`
 * when the folder has none.
 *
 * Exported because it is the claim, not an implementation detail: a test asserting that an
 * orphan settled *in the band* has to be able to ask where the band is, and computing it a
 * second time in the test would only prove the test agrees with itself.
 *
 * Two things decide it. The **centre and the two standoffs** come from the connected mass,
 * measured per axis, so the ring stands off whatever the springs happened to build rather
 * than off the origin — and by {@link ORPHAN_RING_GAP} on both axes, never through it. The
 * **aspect** is the box's, for the reason the gravity is aspect-aware: a circle around a
 * wide canvas throws away its width, and because the ring is the outermost thing in the
 * picture its aspect is the picture's, so a fit that reserves the same padding on all four
 * sides fills both axes to that padding rather than one of them.
 *
 * ⚠️ **It is not clamped to the box, and that is deliberate.** The margin a person sees is
 * the fit's: it maps the whole picture into the canvas less {@link LIBRARY_FIT_PADDING}
 * on every side, so the outermost mark is that far in whatever the world coordinates say. A
 * clamp could only bind on a canvas too small to hold the connected mass either, and there
 * the only thing it could buy would be pulling the loose marks *into* the cluster — the
 * defect, restated inward.
 */
export function libraryOrphanRing(
  sim: LibrarySimulation,
): { cx: number; cy: number; rx: number; ry: number } | null {
  /*
   * ⚠️ **Once the folder's groups are composed, the ring is inside the loose group's own
   * cell** (2026-09-12) — the centre and the radius come from the cell, not from the
   * connected mass.
   *
   * The 2026-09-07 record put it around the mass because the mass was the only other thing
   * in the field and a loose mark's alternative was a wall. With the groups composed there
   * is no single mass to be around — there are three or four cells — and a ring drawn
   * around all of them would be a rim the fit has to make room for, which is the 167px band
   * this change exists to delete, restated as a circle. The unattached marks are a group of
   * the folder like any other, so they get a place like any other, and inside it they still
   * stand on a ring rather than against anything.
   *
   * Both of that record's live falsifiers are still answered: the ring is not between two
   * marks that have a relation, and no loose mark is inside a cluster — its cell is its own,
   * with {@link ORPHAN_RING_GAP} of clear space around it.
   */
  if (sim.packed) {
    if (sim.looseGroup === null) return null;
    // Packed, so the group index is a cell index too — which is the precondition this
    // branch is inside of, and the reason the field's name no longer promises it outright.
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
   * ⚠️ **The centre is the mass's bounding box, not its centre of gravity** (2026-09-08).
   *
   * It used to be the centroid, with the radius taken as the *largest* distance from it to
   * any mark — and a cloud whose weight sits off-centre has one half-span much longer than
   * the other, so a symmetric radius around the centroid stands off the short side by the
   * long side's distance. Measured on the owner's folder at 1400×860: one loose mark whose
   * declared standoff is {@link ORPHAN_RING_GAP} (56) sat **185–225px** clear of the
   * connected mass — a quarter of the picture — which is both why it read as a stray and
   * why the fit had to shrink everything else to make room for it. Off the bounding box the
   * standoff is the number this file says it is.
   */
  const cx = held > 0 ? (minX + maxX) / 2 : 0;
  const cy = held > 0 ? (minY + maxY) / 2 : 0;
  const massX = held > 0 ? (maxX - minX) / 2 : 0;
  const massY = held > 0 ? (maxY - minY) / 2 : 0;
  const ratio = Math.min(4, Math.max(0.25, sim.box.width / sim.box.height));
  // The smaller radius decides, then the aspect gives the other one: solving it this way
  // round is what guarantees both standoffs at once, whichever axis the mass is long in.
  const ry = Math.max(
    massY + ORPHAN_RING_GAP,
    (massX + ORPHAN_RING_GAP) / ratio,
    ORPHAN_RING_MIN_RADIUS / Math.sqrt(ratio),
  );
  return { cx, cy, rx: ry * ratio, ry };
}

/**
 * Pulls each unattached mark toward its own slot instead of toward the centre.
 *
 * It is a force like every other one here, scaled by alpha and answered by repulsion and
 * collision, so a settled orphan sits *near* its slot rather than *at* it, a dragged one
 * leaves it, and a released one comes home. Freezing them on the ellipse would have been
 * fewer lines and would have made four of the marks on a live canvas dead.
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

/**
 * ⚠️ **An unattached mark takes no part in this force**, in either pass.
 *
 * Repulsion is what threw the loose marks at the walls: it falls off as 1/d, so seven
 * marks 300 units away still push about 6 units per tick, and the only thing that was
 * answering was a gravity aimed at a centre the mark was already 300 units from. Nothing
 * in the folder said where it should be, so the picture said "far away, in whichever
 * direction it started". The ring says it instead, and saying it twice — a slot and a
 * shove — leaves the mark at whichever offset the two happen to cancel at, which is not a
 * place either.
 *
 * What repulsion exists for is still paid: collision keeps every mark off every other one,
 * and the ring stands the whole set clear of the mass by {@link ORPHAN_RING_GAP}. What is
 * given up is orphans nudging the connected picture around, which is a good trade —
 * a folder's real layout should not depend on how many files nobody cited.
 */
function applyManyBody(sim: LibrarySimulation, alpha: number): void {
  const charge = MANY_BODY_STRENGTH * alpha;
  /*
   * ⚠️ **Repulsion runs inside a group and never between two of them** (2026-09-12).
   *
   * Between two clusters with no relation it was the only force with an opinion, and its
   * opinion is always the same: as far apart as the field allows. That is what put three
   * clusters at three walls of the owner's own folder with 54% of the canvas holding
   * nothing. Where two groups stand is composed instead — `composeLibraryGroups` — and
   * what repulsion is *for*, keeping marks that have nothing between them out of one
   * place, is still paid inside every group, plus collision everywhere.
   *
   * The lists are references built when the composition was, so the pass allocates nothing
   * per tick: a branch inside the pair loop runs n²/2 times and measured the 200-node exact
   * pass at 0.62ms against 0.35 (2026-09-07).
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
       * The tree carries one charge for the whole cell, so a page's own extra push is
       * applied at the **receiving** end here rather than at the source. That is the same
       * quantity on the pair a page is one half of and a weaker claim on the pair it is
       * not — an approximation the tree is already making about every distance it sums, on
       * a pass that only runs above 720 marks in one group.
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
        // Two marks exactly on top of each other, separated along a fixed diagonal so
        // the same folder resolves the same way every time.
        dx = 1e-3;
        dy = 1e-3;
        distanceSquared = 2e-6;
      }
      // Out of range: the two are already further apart than this force has an opinion about.
      if (distanceSquared > MANY_BODY_MAX_DISTANCE_SQUARED) continue;
      // A pair pushes with the charge of the busier of its two ends: a page with nine
      // sources needs the room whichever of its neighbours is being asked.
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
 * **Gravity toward the centre of the mark's own group, and it is isotropic.**
 *
 * ⚠️ It used to be *aspect-aware* — the box's aspect split around 1, so a wide canvas got a
 * weaker horizontal pull and the cloud grew sideways into it. That term existed to satisfy a
 * fill gate ("a folder under 60% of its canvas width", 2026-09-07), and the gate is what the
 * owner rejected: a picture stretched to cover a 1920px window is a *different picture* from
 * the same folder on a 1040px one, and the distances a person is asked to read changed with
 * the furniture. The camera fills the canvas now, by fitting and clamping; the physics is
 * told nothing about the window.
 *
 * A folder that is one connected graph has one cell centred on the origin, so the two lines
 * below are a plain centre gravity. A folder of several groups gets several centres — which
 * is the whole of what stops repulsion from being the only force with an opinion about where
 * two unrelated clusters go — and `library-graph-packing.ts` decides those.
 */
function applyGravity(sim: LibrarySimulation, alpha: number): void {
  const strength = GRAVITY * alpha;
  for (const node of sim.nodes) {
    // An unattached mark answers to its ring slot instead; two centres would fight.
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
 * Records the canvas's new shape. **Nothing moves.**
 *
 * ⚠️ A resize used to re-pack the composition and re-heat the simulation, because both the
 * gravity and the packing were functions of the canvas's aspect. Neither is any more: the
 * scale is fixed, the gravity is isotropic and the groups are packed around their own
 * centre, so one folder is one picture and a window is only ever a window onto it. What a
 * resize changes is the **camera**, and the camera is the engine's (`fitLibraryView`).
 *
 * The box is still kept because the orphan ring takes its aspect from it — the outermost
 * thing in the picture, whose shape the fit then has to hold — and because a footprint
 * prepass settles each group against it.
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
      existing.charge = chargeMultiplier(node.kind, existing.degree);
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
      degree: degree.get(node.id) ?? 0,
      charge: chargeMultiplier(node.kind, degree.get(node.id) ?? 0),
      orbit: null,
      cell: existingCell(byId, neighbours, node.id),
    };
  });
  // A page that just gained its first citation stops being an orphan, and one whose last
  // source was deleted becomes one: the ring is re-derived from the new degrees, never
  // carried over.
  assignOrbits(nodes);

  sim.nodes = nodes;
  sim.index = new Map(nodes.map((node, position) => [node.id, position]));
  sim.links = buildLinks(graph, sim.index, degree);
  // A page that Compile has just written can join two groups into one, or leave one behind
  // as loose, so the composition is re-derived from the new relations rather than carried
  // over. Marks already on the canvas keep their positions; `composeLibraryGroups` only
  // seeds the ones that have not arrived.
  composeLibraryGroups(sim, graph);
  if (entered.length > 0 || removed.length > 0) reheatLibrarySimulation(sim);
  return { entered, removed };
}

/**
 * The cell a brand-new mark starts in: whichever attached neighbour is already on the
 * canvas is in, or the first. It is only a starting value — `composeLibraryGroups` runs a
 * few lines later and decides every cell from the new relations — but a node is created
 * before that runs and a cell of 0 would put an arriving page in the biggest group's cell
 * for one frame.
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
export function libraryPositions(sim: LibrarySimulation): Map<string, LayoutPoint> {
  const out = new Map<string, LayoutPoint>();
  for (const node of sim.nodes) out.set(node.id, { x: node.x, y: node.y });
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
