import { TREE_POSE_REST } from "./tree-camera";
import type { TreeWork } from "./tree-model";
import type { TreeLayout, TreeModel } from "./tree-shapes";

/** Lengths are world units; the trunk base is the origin and y is up. */
/** The trunk's two inner control points as fractions of its height, a slight S-bend. */
const TRUNK_CONTROLS = [-0.04, 0.34, 0.02, 0.05, 0.69, -0.014] as const;
/** The trunk's share of the tree's nominal height: trunk, dome radius, crown height. */
const TRUNK_SHARE = 0.2;
/** A crown's nominal height above its hub; crowns keep their size at every domain count. */
const CROWN_TOP = 250;

/**
 * Hubs lie on a dome over the trunk top: domain k at azimuth slot k of D and squared cap radius
 * frac(k * golden), a Fibonacci lattice, so neighbours by index share a sector. Hub 0 takes the top
 * and its fair share 1/D of the cap; the others fill the rest.
 */
const DOME_HALF_ANGLE = (60 * Math.PI) / 180;
/** Distance kept between neighbouring hubs; the dome's radius grows with the square root of D. */
const HUB_SPACING = 640;
const DOME_RADIUS_MIN = 420;
const DOME_RADIUS_JITTER = 0.04;
const DOMAIN_AZIMUTH_START = (200 * Math.PI) / 180;

/**
 * The tree turns about its trunk so that, seen from the rest pose, nominal crowns of one size stand
 * apart. Only the domain count decides the turn, so adding a concept never turns the tree.
 */
const FACING_TURNS = 72;
const FACING_PITCH = TREE_POSE_REST.pitch;
/** A nominal crown's centre lies this far from its hub along the crown axis. */
const NOMINAL_CROWN_REACH = 100;
/** A trunk fork leans toward its sector at this squared cap radius. */
const FORK_DOME_SPREAD = 0.3;

/** The low shoot holding concepts under no domain: below the dome's rim, part way out. */
const LOOSE_POLAR = (70 * Math.PI) / 180;
const LOOSE_REACH_SHARE = 0.45;

/** A crown opens around `out * CROWN_AXIS_OUT + up`. */
const CROWN_AXIS_OUT = 0.7;
const CROWN_HALF_ANGLE = 1.05;
const CROWN_HALF_ANGLE_PER_CHILD = 0.03;
const CROWN_HALF_ANGLE_MAX = 1.35;
/** Least upward component of a branch direction, so no branch droops below its hub. */
const CROWN_FLOOR_Y = 0.12;
const BRANCH_LENGTH = 90;
const BRANCH_LENGTH_PER_TWIG = 8;
const BRANCH_LENGTH_PER_ROOT_SIBLING = 18;
const BRANCH_LENGTH_JITTER = 14;

/** A fork at nesting level k sits at 1 - FORK_STEP^k of its branches' base length, or of the dome's radius. */
const FORK_STEP = 0.7;
const FORK_AXIS_PULL = 0.5;
/** A stem carrying a domain's or the loose shoot's own elements, out from the hub. */
const STEM_LENGTH = 36;

const TWIG_LIMIT = 12;
const TWIG_LENGTH = 42;
const TWIG_LENGTH_JITTER = 7;
const TWIG_HALF_ANGLE = 1.25;
/** Leaves fan around their capability's direction tilted up by this much. */
const LEAF_AXIS_RISE = 0.25;
/** A domain's own leaves hang out and slightly down, below its branches. */
const DOMAIN_LEAF_DROP = 0.2;
/** Least distance between two leaves of one head. */
const LEAF_PITCH = 10;
/** Least neighbour distance of a unit golden-angle disc, measured 1.546 over its first 4,000 points. */
const GOLDEN_DISC_MIN_SPACING = 1.5;
const HEAD_SPACING = LEAF_PITCH / GOLDEN_DISC_MIN_SPACING;
const HEAD_STEM_PER_RADIUS = 0.6;
const HEAD_DOME = 0.35;

const CURVE_HANDLE = 0.33;
const CURVE_LEAVE_HEADING = 0.8;
const CURVE_ARRIVE_DIRECTION = 0.6;

/**
 * Wood keeps its cross-section through a fork: each child starts with the share of its parent's
 * end area that its subtree's concepts carry. Widths are shares of the tree's height.
 */
const TRUNK_WIDTH: readonly [number, number] = [0.03, 0.02];
const BRANCH_TAPER = 0.8;
const LEAF_TAPER = 0.4;
/** Least width, so a twig of a very large tree stays drawable; below it a fork gains area. */
const WIDTH_FLOOR = 0.0002;

/** Covers Float32 rounding of positions a few thousand units from the origin. */
const BOUND_EPSILON = 0.01;
/** Golden-section steps for the height of the tree sphere's centre; each narrows the range by 0.618. */
const TREE_SPHERE_SEARCH_STEPS = 40;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const GOLDEN_RATIO_INVERSE = (Math.sqrt(5) - 1) / 2;
const TAU = Math.PI * 2;

function hashUnit(id: string | null, salt: number): number {
  if (id === null) return 0;
  let h = 0x811c9dc5 ^ Math.imul(salt + 1, 0x9e3779b9);
  for (let k = 0; k < id.length; k += 1) h = Math.imul(h ^ id.charCodeAt(k), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) / 0x100000000) * 2 - 1;
}

/** The dome's radius for D hubs `HUB_SPACING` apart on a cap of `DOME_HALF_ANGLE`. */
function domeRadius(domains: number): number {
  const capArea = TAU * (1 - Math.cos(DOME_HALF_ANGLE));
  return Math.max(DOME_RADIUS_MIN, HUB_SPACING * Math.sqrt(domains / capArea));
}

/** Polar angle on the dome for a squared cap radius in 0..1, area-uniform. */
function domePolar(capRadiusSq: number): number {
  return Math.acos(1 - capRadiusSq * (1 - Math.cos(DOME_HALF_ANGLE)));
}

/** Hub 0 tops the dome; the others spread over the rest of the cap by a golden-ratio step. */
function domainCapRadiusSq(slot: number, domains: number): number {
  return slot === 0 ? 0 : 1 / domains + (1 - 1 / domains) * ((slot * GOLDEN_RATIO_INVERSE) % 1);
}

function slotAzimuth(slot: number, domains: number, turn: number): number {
  return DOMAIN_AZIMUTH_START + turn + ((slot + 0.5) * TAU) / domains;
}

/**
 * The sampled turn whose nominal crown centres, seen orthographically at the rest pitch, keep the
 * largest least distance; the lowest turn wins a tie. O(D² · FACING_TURNS), and it reads only D.
 */
function facingTurn(domains: number): number {
  if (domains < 2) return 0;
  const dome = domeRadius(domains);
  const cosPitch = Math.cos(FACING_PITCH), sinPitch = Math.sin(FACING_PITCH);
  const axisLength = Math.hypot(CROWN_AXIS_OUT, 1);
  const across = new Float64Array(domains);
  const up = new Float64Array(domains);
  let best = 0;
  let bestGap = Number.NEGATIVE_INFINITY;
  for (let t = 0; t < FACING_TURNS; t += 1) {
    const turn = (t * TAU) / FACING_TURNS;
    for (let k = 0; k < domains; k += 1) {
      const polar = domePolar(domainCapRadiusSq(k, domains));
      const azimuth = slotAzimuth(k, domains, turn);
      const outward = Math.sin(polar) * dome + (NOMINAL_CROWN_REACH * CROWN_AXIS_OUT) / axisLength;
      const height = Math.cos(polar) * dome + NOMINAL_CROWN_REACH / axisLength;
      across[k] = Math.cos(azimuth) * outward;
      up[k] = height * cosPitch - Math.sin(azimuth) * outward * sinPitch;
    }
    let least = Number.POSITIVE_INFINITY;
    for (let a = 0; a < domains; a += 1) {
      for (let b = a + 1; b < domains; b += 1) least = Math.min(least, Math.hypot(across[a]! - across[b]!, up[a]! - up[b]!));
    }
    if (least > bestGap + 1e-9) {
      bestGap = least;
      best = turn;
    }
  }
  return best;
}

function crownHalfAngle(siblings: number): number {
  return Math.min(CROWN_HALF_ANGLE_MAX, CROWN_HALF_ANGLE + siblings * CROWN_HALF_ANGLE_PER_CHILD);
}

function branchBaseLength(siblings: number): number {
  return BRANCH_LENGTH + BRANCH_LENGTH_PER_ROOT_SIBLING * Math.sqrt(siblings);
}

function headRadius(leaves: number): number {
  return HEAD_SPACING * Math.sqrt(leaves);
}

/**
 * Phase of ordinal k on a Fermat spiral: consecutive ordinals are neighbours, so a fork's run of
 * siblings stays together; small counts stretch to go round once.
 */
function spiralPhase(k: number, siblings: number): number {
  if (siblings < 2) return 0;
  const span = Math.sqrt(4 * Math.PI * (siblings - 0.5)) - Math.sqrt(2 * Math.PI);
  const stretch = Math.max(1, (TAU * (siblings - 1)) / siblings / span);
  return Math.sqrt(4 * Math.PI * (k + 0.5)) * stretch;
}

/**
 * Positions in the model's preorder; each node reads only its anchor's frame, its ordinal, its
 * sibling count, its own subtree size and a hash of its id. O(V) time and space, no recursion.
 */
export function layoutTree(model: TreeModel, work?: TreeWork): TreeLayout {
  const n = model.count;
  const position = new Float32Array(n * 3);
  const control = new Float32Array(n * 6);
  const widthStart = new Float32Array(n);
  const widthEnd = new Float32Array(n);
  const bound = new Float32Array(n * 4);
  const childPitch = new Float32Array(n);
  const reach = new Float32Array(n);
  if (n === 0) return { model, position, control, widthStart, widthEnd, bound, childPitch, reach, centre: [0, 0, 0], radius: 0 };

  const { parent, kinds, ids, looseRoot, subtreeEnd } = model;
  const isStem = (i: number) => kinds[i] === "fork" && i !== looseRoot && kinds[i + 1] === "element";
  const isGroupingFork = (i: number) => kinds[i] === "fork" && !isStem(i);
  const isAnchor = (i: number) => kinds[i] !== "fork" || i === looseRoot || isStem(i);
  const isBranch = (i: number) => kinds[i] !== "element" && kinds[i] !== "fork" && i !== 0;
  const tick = (steps: number) => {
    if (work) work.steps += steps;
  };

  const anchorOf = new Int32Array(n);
  const branchTotal = new Int32Array(n);
  const leafTotal = new Int32Array(n);
  for (let i = 1; i < n; i += 1) {
    const p = parent[i]!;
    const a = isAnchor(p) ? p : anchorOf[p]!;
    anchorOf[i] = a;
    if (kinds[i] === "element") leafTotal[a]! += 1;
    else if (isBranch(i)) branchTotal[a]! += 1;
  }
  const forkSpan = new Int32Array(n);
  for (let i = n - 1; i > 0; i -= 1) {
    const p = parent[i]!;
    if (isAnchor(p)) continue;
    forkSpan[p]! += kinds[i] === "fork" ? forkSpan[i]! : 1;
  }
  tick(2 * n);

  const pos = new Float64Array(n * 3);
  const ctl = new Float64Array(n * 6);
  const heading = new Float64Array(n * 3);
  const dir = new Float64Array(n * 3);
  const out = new Float64Array(n * 2);
  const axis = new Float64Array(n * 3);
  const leafAxis = new Float64Array(n * 3);
  const forkLevel = new Int32Array(n);
  const branchSeen = new Int32Array(n);
  const leafSeen = new Int32Array(n);
  const v = [0, 0, 0];
  const b1 = [0, 0, 0];
  const b2 = [0, 0, 0];

  const setVec = (vectors: Float64Array, i: number, x: number, y: number, z: number) => {
    const length = Math.hypot(x, y, z) || 1;
    vectors[i * 3] = x / length;
    vectors[i * 3 + 1] = y / length;
    vectors[i * 3 + 2] = z / length;
  };
  const copyVec = (vectors: Float64Array, i: number, from: number) => {
    for (let c = 0; c < 3; c += 1) vectors[i * 3 + c] = vectors[from * 3 + c]!;
  };
  /** b1, b2 span the plane across `vectors[i]` (unit); both turn with anchor `a`'s azimuth. */
  const frameAcross = (vectors: Float64Array, i: number, a: number) => {
    const ax = vectors[i * 3]!, ay = vectors[i * 3 + 1]!, az = vectors[i * 3 + 2]!;
    const sx = -out[a * 2 + 1]!, sz = out[a * 2]!;
    let x = ay * sz, y = az * sx - ax * sz, z = -ay * sx;
    const length = Math.hypot(x, y, z) || 1;
    x /= length; y /= length; z /= length;
    b1[0] = x; b1[1] = y; b1[2] = z;
    b2[0] = ay * z - az * y; b2[1] = az * x - ax * z; b2[2] = ax * y - ay * x;
  };
  /**
   * Direction from anchor `a` of its ordinal k among `siblings` branches, into `v`. Each azimuth
   * reaches only to the floor and spreads by area within that reach: one-to-one, so no two coincide.
   */
  const crownDirection = (a: number, k: number, siblings: number) => {
    frameAcross(axis, a, a);
    const half = crownHalfAngle(siblings);
    const r2 = siblings === 1 ? 0 : (k + 0.5) / siblings;
    const phi = spiralPhase(k, siblings);
    const cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);
    const rise = axis[a * 3 + 1]!;
    const sideRise = b1[1]! * cosPhi + b2[1]! * sinPhi;
    const amplitude = Math.hypot(rise, sideRise);
    const toFloor = Math.atan2(sideRise, rise) + Math.acos(Math.min(1, CROWN_FLOOR_Y / amplitude));
    const theta = Math.acos(1 - r2 * (1 - Math.cos(Math.min(half, toFloor))));
    const c = Math.sin(theta) * cosPhi, s = Math.sin(theta) * sinPhi, u = Math.cos(theta);
    v[0] = axis[a * 3]! * u + b1[0]! * c + b2[0]! * s;
    v[1] = rise * u + b1[1]! * c + b2[1]! * s;
    v[2] = axis[a * 3 + 2]! * u + b1[2]! * c + b2[2]! * s;
  };
  const setOut = (i: number, azimuth: number) => {
    out[i * 2] = Math.cos(azimuth);
    out[i * 2 + 1] = Math.sin(azimuth);
  };
  const copyOut = (i: number, from: number) => {
    out[i * 2] = out[from * 2]!;
    out[i * 2 + 1] = out[from * 2 + 1]!;
  };
  /** A domain-like anchor: crown axis tilted out, own leaves hanging out and down; a lone crown points both up. */
  const openCrown = (i: number, upright: boolean) => {
    const ox = out[i * 2]!, oz = out[i * 2 + 1]!;
    if (upright) {
      setVec(axis, i, 0, 1, 0);
      setVec(leafAxis, i, 0, 1, 0);
      return;
    }
    setVec(axis, i, ox * CROWN_AXIS_OUT, 1, oz * CROWN_AXIS_OUT);
    setVec(leafAxis, i, ox, -DOMAIN_LEAF_DROP, oz);
  };
  const place = (i: number, x: number, y: number, z: number) => {
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
  };
  const placeAlong = (i: number, from: number, vectors: Float64Array, at: number, length: number) => {
    place(i, pos[from * 3]! + vectors[at * 3]! * length, pos[from * 3 + 1]! + vectors[at * 3 + 1]! * length, pos[from * 3 + 2]! + vectors[at * 3 + 2]! * length);
  };
  const domains = branchTotal[0]!;
  const dome = domeRadius(domains);
  const trunkHeight = (TRUNK_SHARE / (1 - TRUNK_SHARE)) * (dome + CROWN_TOP);
  const turn = facingTurn(domains);
  const facing = DOMAIN_AZIMUTH_START + turn;
  /** Places node i at `distance` from the trunk top along the dome direction (polar, azimuth); that direction becomes its `dir`. */
  const placeOnDome = (i: number, polar: number, azimuth: number, distance: number) => {
    setOut(i, azimuth);
    setVec(dir, i, Math.sin(polar) * out[i * 2]!, Math.cos(polar), Math.sin(polar) * out[i * 2 + 1]!);
    place(i, dir[i * 3]! * distance, trunkHeight + dir[i * 3 + 1]! * distance, dir[i * 3 + 2]! * distance);
  };

  for (let i = 0; i < n; i += 1) {
    if (i === 0) {
      place(0, 0, trunkHeight, 0);
      for (let c = 0; c < 6; c += 1) ctl[c] = TRUNK_CONTROLS[c]! * trunkHeight;
      setVec(heading, 0, 0, 1, 0);
      setVec(dir, 0, 0, 1, 0);
      setOut(0, facing);
      continue;
    }
    const p = parent[i]!;
    const a = anchorOf[i]!;
    const kind = kinds[i]!;
    const id = ids[i] ?? null;
    let customStem = false;

    if (i === looseRoot) {
      if (domains === 0) placeOnDome(i, 0, facing, dome);
      else placeOnDome(i, LOOSE_POLAR, facing, dome * LOOSE_REACH_SHARE);
      openCrown(i, domains === 0);
    } else if (isStem(i)) {
      copyOut(i, a);
      copyVec(leafAxis, i, a);
      setVec(dir, i, leafAxis[a * 3]!, leafAxis[a * 3 + 1]!, leafAxis[a * 3 + 2]!);
      placeAlong(i, a, leafAxis, a, STEM_LENGTH);
    } else if (kind === "fork") {
      const lo = branchSeen[a]!;
      const mid = lo + (forkSpan[i]! - 1) / 2;
      const level = isAnchor(p) ? 1 : forkLevel[p]! + 1;
      forkLevel[i] = level;
      const share = 1 - Math.pow(FORK_STEP, level);
      const siblings = branchTotal[a]!;
      if (a === 0) {
        placeOnDome(i, domePolar(FORK_DOME_SPREAD), slotAzimuth(mid, siblings, turn), dome * share);
      } else {
        copyOut(i, a);
        crownDirection(a, Math.round(mid), siblings);
        setVec(dir, i, v[0]! + axis[a * 3]! * FORK_AXIS_PULL, v[1]! + axis[a * 3 + 1]! * FORK_AXIS_PULL, v[2]! + axis[a * 3 + 2]! * FORK_AXIS_PULL);
        placeAlong(i, a, dir, i, branchBaseLength(siblings) * share);
      }
    } else if (kind === "domain") {
      const slot = branchSeen[0]!++;
      placeOnDome(i, domePolar(domainCapRadiusSq(slot, domains)), slotAzimuth(slot, domains, turn), dome * (1 + hashUnit(id, 1) * DOME_RADIUS_JITTER));
      openCrown(i, false);
    } else if (kind !== "element") {
      const k = branchSeen[a]!++;
      const siblings = branchTotal[a]!;
      const leaves = leafTotal[i]!;
      copyOut(i, a);
      crownDirection(a, k, siblings);
      setVec(dir, i, v[0]!, v[1]!, v[2]!);
      const head = leaves > TWIG_LIMIT ? headRadius(leaves) : 0;
      const length = branchBaseLength(siblings) + BRANCH_LENGTH_PER_TWIG * Math.min(leaves, TWIG_LIMIT) + head + hashUnit(id, 3) * BRANCH_LENGTH_JITTER;
      placeAlong(i, a, dir, i, length);
      setVec(leafAxis, i, v[0]!, v[1]! + LEAF_AXIS_RISE, v[2]!);
    } else {
      const k = leafSeen[a]!++;
      const leaves = leafTotal[a]!;
      const ax = pos[a * 3]!, ay = pos[a * 3 + 1]!, az = pos[a * 3 + 2]!;
      copyOut(i, a);
      frameAcross(leafAxis, a, a);
      const lx = leafAxis[a * 3]!, ly = leafAxis[a * 3 + 1]!, lz = leafAxis[a * 3 + 2]!;
      if (leaves <= TWIG_LIMIT) {
        const t = leaves === 1 ? 0 : (k + 0.5) / leaves;
        const theta = TWIG_HALF_ANGLE * Math.sqrt(t);
        const phi = hashUnit(ids[a] ?? null, 4) * Math.PI + k * GOLDEN_ANGLE;
        const c = Math.sin(theta) * Math.cos(phi), s = Math.sin(theta) * Math.sin(phi), u = Math.cos(theta);
        setVec(dir, i, lx * u + b1[0]! * c + b2[0]! * s, ly * u + b1[1]! * c + b2[1]! * s, lz * u + b1[2]! * c + b2[2]! * s);
        placeAlong(i, a, dir, i, TWIG_LENGTH + hashUnit(id, 5) * TWIG_LENGTH_JITTER);
      } else {
        const radius = headRadius(leaves);
        const stem = TWIG_LENGTH + radius * HEAD_STEM_PER_RADIUS;
        const r = HEAD_SPACING * Math.sqrt(k + 0.5);
        const phi = k * GOLDEN_ANGLE;
        const c = r * Math.cos(phi), s = r * Math.sin(phi);
        const lift = stem + radius * HEAD_DOME * (1 - (r / radius) ** 2);
        place(i, ax + lx * lift + b1[0]! * c + b2[0]! * s, ay + ly * lift + b1[1]! * c + b2[1]! * s, az + lz * lift + b1[2]! * c + b2[2]! * s);
        const half = stem / 2;
        ctl[i * 6] = ax + lx * half;
        ctl[i * 6 + 1] = ay + ly * half;
        ctl[i * 6 + 2] = az + lz * half;
        ctl[i * 6 + 3] = ax + lx * stem;
        ctl[i * 6 + 4] = ay + ly * stem;
        ctl[i * 6 + 5] = az + lz * stem;
        setVec(dir, i, pos[i * 3]! - ctl[i * 6 + 3]!, pos[i * 3 + 1]! - ctl[i * 6 + 4]!, pos[i * 3 + 2]! - ctl[i * 6 + 5]!);
        setVec(heading, i, dir[i * 3]!, dir[i * 3 + 1]!, dir[i * 3 + 2]!);
        customStem = true;
      }
    }
    if (!customStem) curveFromParent(i, p, pos, ctl, heading, dir);
  }
  tick(n);

  const arc = new Float64Array(n);
  let farthest = 0;
  for (let i = 0; i < n; i += 1) {
    arc[i] = (i === 0 ? 0 : arc[parent[i]!]!) + curveLength(i, i === 0 ? -1 : parent[i]!, pos, ctl);
    if (arc[i]! > farthest) farthest = arc[i]!;
  }
  let treeHeight = 0;
  for (let k = 1; k < n * 3; k += 3) treeHeight = Math.max(treeHeight, pos[k]!);
  for (let k = 1; k < n * 6; k += 3) treeHeight = Math.max(treeHeight, ctl[k]!);
  const carried = new Float64Array(n);
  for (let i = n - 1; i >= 0; i -= 1) {
    if (kinds[i] !== "fork") carried[i]! += 1;
    if (i > 0) carried[parent[i]!]! += carried[i]!;
  }
  const floor = WIDTH_FLOOR * treeHeight;
  widthStart[0] = TRUNK_WIDTH[0] * treeHeight;
  widthEnd[0] = TRUNK_WIDTH[1] * treeHeight;
  for (let i = 0; i < n; i += 1) {
    reach[i] = farthest > 0 ? arc[i]! / farthest : 0;
    if (i === 0) continue;
    const p = parent[i]!;
    const passedOn = carried[p]! - (kinds[p] === "fork" ? 0 : 1);
    const start = Math.min(widthEnd[p]!, Math.max(floor, widthEnd[p]! * Math.sqrt(carried[i]! / passedOn)));
    const taper = subtreeEnd[i]! > i + 1 ? BRANCH_TAPER : LEAF_TAPER;
    widthStart[i] = start;
    widthEnd[i] = Math.min(start, Math.max(floor, start * taper));
  }
  tick(4 * n);

  const sphere = new Float64Array(n * 4);
  for (let i = 0; i < n; i += 1) {
    sphere[i * 4] = pos[i * 3]!;
    sphere[i * 4 + 1] = pos[i * 3 + 1]!;
    sphere[i * 4 + 2] = pos[i * 3 + 2]!;
    mergeSphere(sphere, i, ctl[i * 6]!, ctl[i * 6 + 1]!, ctl[i * 6 + 2]!, 0);
    mergeSphere(sphere, i, ctl[i * 6 + 3]!, ctl[i * 6 + 4]!, ctl[i * 6 + 5]!, 0);
  }
  mergeSphere(sphere, 0, 0, 0, 0, 0);
  for (let i = n - 1; i > 0; i -= 1) {
    mergeSphere(sphere, parent[i]!, sphere[i * 4]!, sphere[i * 4 + 1]!, sphere[i * 4 + 2]!, sphere[i * 4 + 3]!);
  }
  tick(2 * n);

  const directKids: number[] = [];
  const gap = (a: number, b: number) => Math.hypot(pos[a * 3]! - pos[b * 3]!, pos[a * 3 + 1]! - pos[b * 3 + 1]!, pos[a * 3 + 2]! - pos[b * 3 + 2]!);
  for (let i = n - 1; i >= 0; i -= 1) {
    directKids.length = 0;
    let least = Number.POSITIVE_INFINITY;
    let leaves = 0;
    for (let j = i + 1; j < subtreeEnd[i]!; j = subtreeEnd[j]!) {
      tick(1);
      if (kinds[j] === "element") leaves += 1;
      if (isGroupingFork(j)) least = Math.min(least, childPitch[j]! || Number.POSITIVE_INFINITY);
      else directKids.push(j);
    }
    if (leaves > TWIG_LIMIT) least = LEAF_PITCH;
    else {
      for (let x = 0; x < directKids.length; x += 1) {
        for (let y = x + 1; y < directKids.length; y += 1) {
          tick(1);
          least = Math.min(least, gap(directKids[x]!, directKids[y]!));
        }
      }
    }
    childPitch[i] = Number.isFinite(least) ? least : 0;
  }

  const sphereHeight = treeSphereHeight(n, pos, ctl);
  tick((TREE_SPHERE_SEARCH_STEPS + 3) * 3 * n);
  let farthestSq = sphereHeight * sphereHeight;
  for (let k = 0; k < n * 3; k += 3) farthestSq = Math.max(farthestSq, distanceFromAxisSq(pos[k]!, pos[k + 1]!, pos[k + 2]!, sphereHeight));
  for (let k = 0; k < n * 6; k += 3) farthestSq = Math.max(farthestSq, distanceFromAxisSq(ctl[k]!, ctl[k + 1]!, ctl[k + 2]!, sphereHeight));

  position.set(pos);
  control.set(ctl);
  for (let i = 0; i < n; i += 1) {
    bound[i * 4] = sphere[i * 4]!;
    bound[i * 4 + 1] = sphere[i * 4 + 1]!;
    bound[i * 4 + 2] = sphere[i * 4 + 2]!;
    bound[i * 4 + 3] = sphere[i * 4 + 3]! + BOUND_EPSILON;
  }
  return {
    model,
    position,
    control,
    widthStart,
    widthEnd,
    bound,
    childPitch,
    reach,
    centre: [0, sphereHeight, 0],
    radius: Math.sqrt(farthestSq) + BOUND_EPSILON,
  };
}

function distanceFromAxisSq(x: number, y: number, z: number, height: number): number {
  return x * x + z * z + (y - height) * (y - height);
}

/**
 * Height on the trunk axis whose farthest position, control point or trunk base is nearest: the
 * farthest distance is convex in the height, so a golden-section search finds it. O(V) per step.
 */
function treeSphereHeight(n: number, pos: Float64Array, ctl: Float64Array): number {
  let low = 0;
  let high = 0;
  for (let k = 1; k < n * 3; k += 3) high = Math.max(high, pos[k]!);
  for (let k = 1; k < n * 6; k += 3) high = Math.max(high, ctl[k]!);
  const farthestSq = (height: number) => {
    let most = height * height;
    for (let k = 0; k < n * 3; k += 3) most = Math.max(most, distanceFromAxisSq(pos[k]!, pos[k + 1]!, pos[k + 2]!, height));
    for (let k = 0; k < n * 6; k += 3) most = Math.max(most, distanceFromAxisSq(ctl[k]!, ctl[k + 1]!, ctl[k + 2]!, height));
    return most;
  };
  let left = high - (high - low) * GOLDEN_RATIO_INVERSE;
  let right = low + (high - low) * GOLDEN_RATIO_INVERSE;
  let leftValue = farthestSq(left);
  let rightValue = farthestSq(right);
  for (let step = 0; step < TREE_SPHERE_SEARCH_STEPS; step += 1) {
    if (leftValue <= rightValue) {
      high = right;
      right = left;
      rightValue = leftValue;
      left = high - (high - low) * GOLDEN_RATIO_INVERSE;
      leftValue = farthestSq(left);
    } else {
      low = left;
      left = right;
      leftValue = rightValue;
      right = low + (high - low) * GOLDEN_RATIO_INVERSE;
      rightValue = farthestSq(right);
    }
  }
  return (low + high) / 2;
}

/** Inner control points of the cubic from the parent: leave along the parent's heading, arrive along the node's direction. */
function curveFromParent(i: number, p: number, pos: Float64Array, ctl: Float64Array, heading: Float64Array, dir: Float64Array): void {
  const x0 = pos[p * 3]!, y0 = pos[p * 3 + 1]!, z0 = pos[p * 3 + 2]!;
  const x3 = pos[i * 3]!, y3 = pos[i * 3 + 1]!, z3 = pos[i * 3 + 2]!;
  const length = Math.hypot(x3 - x0, y3 - y0, z3 - z0);
  if (length === 0) {
    for (let c = 0; c < 2; c += 1) {
      ctl[i * 6 + c * 3] = x0;
      ctl[i * 6 + c * 3 + 1] = y0;
      ctl[i * 6 + c * 3 + 2] = z0;
    }
    for (let c = 0; c < 3; c += 1) heading[i * 3 + c] = heading[p * 3 + c]!;
    return;
  }
  const cx = (x3 - x0) / length, cy = (y3 - y0) / length, cz = (z3 - z0) / length;
  let lx = heading[p * 3]! * CURVE_LEAVE_HEADING + cx;
  let ly = heading[p * 3 + 1]! * CURVE_LEAVE_HEADING + cy;
  let lz = heading[p * 3 + 2]! * CURVE_LEAVE_HEADING + cz;
  const leave = (Math.hypot(lx, ly, lz) || 1) / (length * CURVE_HANDLE);
  lx /= leave; ly /= leave; lz /= leave;
  let rx = cx + dir[i * 3]! * CURVE_ARRIVE_DIRECTION;
  let ry = cy + dir[i * 3 + 1]! * CURVE_ARRIVE_DIRECTION;
  let rz = cz + dir[i * 3 + 2]! * CURVE_ARRIVE_DIRECTION;
  const arrive = Math.hypot(rx, ry, rz) || 1;
  rx /= arrive; ry /= arrive; rz /= arrive;
  const handle = length * CURVE_HANDLE;
  ctl[i * 6] = x0 + lx;
  ctl[i * 6 + 1] = y0 + ly;
  ctl[i * 6 + 2] = z0 + lz;
  ctl[i * 6 + 3] = x3 - rx * handle;
  ctl[i * 6 + 4] = y3 - ry * handle;
  ctl[i * 6 + 5] = z3 - rz * handle;
  heading[i * 3] = rx;
  heading[i * 3 + 1] = ry;
  heading[i * 3 + 2] = rz;
}

/** Arc length of a cubic estimated as the mean of its chord and its control polygon. */
function curveLength(i: number, p: number, pos: Float64Array, ctl: Float64Array): number {
  const x0 = p < 0 ? 0 : pos[p * 3]!, y0 = p < 0 ? 0 : pos[p * 3 + 1]!, z0 = p < 0 ? 0 : pos[p * 3 + 2]!;
  const x1 = ctl[i * 6]!, y1 = ctl[i * 6 + 1]!, z1 = ctl[i * 6 + 2]!;
  const x2 = ctl[i * 6 + 3]!, y2 = ctl[i * 6 + 4]!, z2 = ctl[i * 6 + 5]!;
  const x3 = pos[i * 3]!, y3 = pos[i * 3 + 1]!, z3 = pos[i * 3 + 2]!;
  const chord = Math.hypot(x3 - x0, y3 - y0, z3 - z0);
  const polygon = Math.hypot(x1 - x0, y1 - y0, z1 - z0) + Math.hypot(x2 - x1, y2 - y1, z2 - z1) + Math.hypot(x3 - x2, y3 - y2, z3 - z2);
  return (chord + polygon) / 2;
}

/** Grows sphere i (4 floats: centre, radius) to the least sphere holding it and the given one. */
function mergeSphere(sphere: Float64Array, i: number, x: number, y: number, z: number, r: number): void {
  const cx = sphere[i * 4]!, cy = sphere[i * 4 + 1]!, cz = sphere[i * 4 + 2]!, cr = sphere[i * 4 + 3]!;
  const d = Math.hypot(x - cx, y - cy, z - cz);
  if (d + r <= cr) return;
  if (d + cr <= r) {
    sphere[i * 4] = x;
    sphere[i * 4 + 1] = y;
    sphere[i * 4 + 2] = z;
    sphere[i * 4 + 3] = r;
    return;
  }
  const grown = (d + cr + r) / 2;
  const t = (grown - cr) / d;
  sphere[i * 4] = cx + (x - cx) * t;
  sphere[i * 4 + 1] = cy + (y - cy) * t;
  sphere[i * 4 + 2] = cz + (z - cz) * t;
  sphere[i * 4 + 3] = grown;
}
