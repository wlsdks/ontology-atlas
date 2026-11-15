import type { TreeLayout, TreeModel, TreeNodeKind } from "./types";

/** Lengths are world units; the trunk base is the origin and y is up. */
const TRUNK_HEIGHT = 290;
/** The trunk's two inner control points, a slight S-bend. */
const TRUNK_CONTROLS = [-12, 100, 6, 14, 200, -4] as const;

const DOMAIN_HUB_HEIGHT = 700;
const DOMAIN_HUB_HEIGHT_JITTER = 110;
const DOMAIN_REACH = 415;
const DOMAIN_REACH_JITTER = 20;
/** Past this many domains the ring of hubs widens with the square root of the count. */
const DOMAIN_RING_CAPACITY = 4;
/** Domain 0 faces left and slightly toward a camera on +z. */
const DOMAIN_AZIMUTH_START = (155 * Math.PI) / 180;

/** The low shoot holding concepts under no domain, beside the domains. */
const LOOSE_HEIGHT = 400;
const LOOSE_REACH = 260;
/** With no domain the loose shoot is the crown, straight above the trunk. */
const CROWN_HEIGHT = 720;

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

/** A fork at nesting level k sits at 1 - FORK_STEP^k of its branches' base length. */
const FORK_STEP = 0.7;
const FORK_AXIS_PULL = 0.5;
/** Forks between the trunk and the domains stay in the lower part of each bough. */
const TRUNK_FORK_SHARE = 0.5;

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
const HEAD_STEM_PER_RADIUS = 0.6;
const HEAD_DOME = 0.35;

const CURVE_HANDLE = 0.33;
const CURVE_LEAVE_HEADING = 0.8;
const CURVE_ARRIVE_DIRECTION = 0.6;

/** Wood width is `WOOD_WIDTH * sqrt(concepts)` up to the knee, then grows with the fourth root. */
const WOOD_WIDTH = 3;
const WOOD_KNEE = 100;
const TRUNK_WIDTH: readonly [number, number] = [1.55, 0.92];
const KIND_WIDTH: Readonly<Record<TreeNodeKind, readonly [number, number]>> = {
  project: [0.95, 0.55],
  domain: [1, 0.72],
  fork: [0.92, 0.7],
  capability: [0.95, 0.55],
  element: [0.5, 0.2],
};

/** Covers Float32 rounding of positions a few thousand units from the origin. */
const BOUND_EPSILON = 0.01;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
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

function woodWidth(concepts: number): number {
  const n = Math.max(1, concepts);
  return n <= WOOD_KNEE ? WOOD_WIDTH * Math.sqrt(n) : WOOD_WIDTH * Math.sqrt(WOOD_KNEE) * Math.sqrt(Math.sqrt(n / WOOD_KNEE));
}

function crownHalfAngle(siblings: number): number {
  return Math.min(CROWN_HALF_ANGLE_MAX, CROWN_HALF_ANGLE + siblings * CROWN_HALF_ANGLE_PER_CHILD);
}

function branchBaseLength(siblings: number): number {
  return BRANCH_LENGTH + BRANCH_LENGTH_PER_ROOT_SIBLING * Math.sqrt(siblings);
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
export function layoutTree(model: TreeModel): TreeLayout {
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
  const isAnchor = (i: number) => kinds[i] !== "fork" || i === looseRoot;
  const isBranch = (i: number) => kinds[i] !== "element" && kinds[i] !== "fork" && i !== 0;

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
    if (isAnchor(p) || i === looseRoot) continue;
    forkSpan[p]! += kinds[i] === "fork" ? forkSpan[i]! : 1;
  }

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

  const setVec = (arr: Float64Array, i: number, x: number, y: number, z: number) => {
    const length = Math.hypot(x, y, z) || 1;
    arr[i * 3] = x / length;
    arr[i * 3 + 1] = y / length;
    arr[i * 3 + 2] = z / length;
  };
  /** b1, b2 span the plane across `a` (unit); both turn with the anchor's azimuth. */
  const frameAcross = (arr: Float64Array, i: number, a: number) => {
    const ax = arr[i * 3]!, ay = arr[i * 3 + 1]!, az = arr[i * 3 + 2]!;
    const sx = -out[a * 2 + 1]!, sz = out[a * 2]!;
    let x = ay * sz, y = az * sx - ax * sz, z = -ay * sx;
    const length = Math.hypot(x, y, z) || 1;
    x /= length; y /= length; z /= length;
    b1[0] = x; b1[1] = y; b1[2] = z;
    b2[0] = ay * z - az * y; b2[1] = az * x - ax * z; b2[2] = ax * y - ay * x;
  };
  /** Direction from anchor `a` of its ordinal k among `siblings` branches, into `v`. */
  const crownDirection = (a: number, k: number, siblings: number) => {
    frameAcross(axis, a, a);
    const cosHalf = Math.cos(crownHalfAngle(siblings));
    const r2 = siblings === 1 ? 0 : (k + 0.5) / siblings;
    const cosT = 1 - r2 * (1 - cosHalf);
    const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
    const phi = spiralPhase(k, siblings);
    const c = sinT * Math.cos(phi), s = sinT * Math.sin(phi);
    let x = axis[a * 3]! * cosT + b1[0]! * c + b2[0]! * s;
    let y = axis[a * 3 + 1]! * cosT + b1[1]! * c + b2[1]! * s;
    let z = axis[a * 3 + 2]! * cosT + b1[2]! * c + b2[2]! * s;
    if (y < CROWN_FLOOR_Y) y = CROWN_FLOOR_Y + (CROWN_FLOOR_Y - y) * 0.5;
    const length = Math.hypot(x, y, z);
    x /= length; y /= length; z /= length;
    v[0] = x; v[1] = y; v[2] = z;
  };
  const setOut = (i: number, azimuth: number) => {
    out[i * 2] = Math.cos(azimuth);
    out[i * 2 + 1] = Math.sin(azimuth);
  };
  const copyOut = (i: number, from: number) => {
    out[i * 2] = out[from * 2]!;
    out[i * 2 + 1] = out[from * 2 + 1]!;
  };
  /** A domain-like anchor: crown axis tilted out, own leaves hanging out and down. */
  const openCrown = (i: number, upright: boolean) => {
    const ox = out[i * 2]!, oz = out[i * 2 + 1]!;
    if (upright) setVec(axis, i, 0, 1, 0);
    else setVec(axis, i, ox * CROWN_AXIS_OUT, 1, oz * CROWN_AXIS_OUT);
    setVec(leafAxis, i, ox, -DOMAIN_LEAF_DROP, oz);
  };
  const place = (i: number, x: number, y: number, z: number) => {
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
  };
  const domainRingReach = (domains: number) => DOMAIN_REACH * Math.max(1, Math.sqrt(domains / DOMAIN_RING_CAPACITY));
  const slotAzimuth = (slot: number, domains: number) => DOMAIN_AZIMUTH_START + (slot * TAU) / domains;

  for (let i = 0; i < n; i += 1) {
    if (i === 0) {
      place(0, 0, TRUNK_HEIGHT, 0);
      for (let c = 0; c < 6; c += 1) ctl[c] = TRUNK_CONTROLS[c]!;
      setVec(heading, 0, 0, 1, 0);
      setVec(dir, 0, 0, 1, 0);
      setOut(0, DOMAIN_AZIMUTH_START);
      continue;
    }
    const p = parent[i]!;
    const a = anchorOf[i]!;
    const kind = kinds[i]!;
    const id = ids[i] ?? null;
    const ax = pos[a * 3]!, ay = pos[a * 3 + 1]!, az = pos[a * 3 + 2]!;
    let customStem = false;

    if (i === looseRoot) {
      const domains = branchTotal[0]!;
      if (domains === 0) {
        setOut(i, DOMAIN_AZIMUTH_START);
        place(i, 0, CROWN_HEIGHT, 0);
        openCrown(i, true);
      } else {
        setOut(i, DOMAIN_AZIMUTH_START - Math.PI / domains);
        place(i, out[i * 2]! * LOOSE_REACH, LOOSE_HEIGHT, out[i * 2 + 1]! * LOOSE_REACH);
        openCrown(i, false);
      }
      setVec(dir, i, out[i * 2]!, 0, out[i * 2 + 1]!);
    } else if (kind === "fork") {
      const lo = branchSeen[a]!;
      const mid = lo + (forkSpan[i]! - 1) / 2;
      const level = isAnchor(p) ? 1 : forkLevel[p]! + 1;
      forkLevel[i] = level;
      const share = 1 - Math.pow(FORK_STEP, level);
      const siblings = branchTotal[a]!;
      if (a === 0) {
        setOut(i, slotAzimuth(mid, siblings));
        const reachBase = domainRingReach(siblings) * share * TRUNK_FORK_SHARE;
        const rise = (DOMAIN_HUB_HEIGHT - TRUNK_HEIGHT) * share * TRUNK_FORK_SHARE;
        place(i, out[i * 2]! * reachBase, TRUNK_HEIGHT + rise, out[i * 2 + 1]! * reachBase);
        setVec(dir, i, out[i * 2]!, 0, out[i * 2 + 1]!);
      } else {
        copyOut(i, a);
        crownDirection(a, Math.round(mid), siblings);
        setVec(dir, i, v[0]! + axis[a * 3]! * FORK_AXIS_PULL, v[1]! + axis[a * 3 + 1]! * FORK_AXIS_PULL, v[2]! + axis[a * 3 + 2]! * FORK_AXIS_PULL);
        const length = branchBaseLength(siblings) * share;
        place(i, ax + dir[i * 3]! * length, ay + dir[i * 3 + 1]! * length, az + dir[i * 3 + 2]! * length);
      }
    } else if (kind === "domain") {
      const slot = branchSeen[0]!++;
      const domains = branchTotal[0]!;
      setOut(i, slotAzimuth(slot, domains));
      const ringReach = domainRingReach(domains) + hashUnit(id, 1) * DOMAIN_REACH_JITTER;
      const height = DOMAIN_HUB_HEIGHT + hashUnit(id, 2) * DOMAIN_HUB_HEIGHT_JITTER;
      place(i, out[i * 2]! * ringReach, height, out[i * 2 + 1]! * ringReach);
      setVec(dir, i, out[i * 2]!, 0, out[i * 2 + 1]!);
      openCrown(i, false);
    } else if (kind !== "element") {
      const k = branchSeen[a]!++;
      const siblings = branchTotal[a]!;
      copyOut(i, a);
      crownDirection(a, k, siblings);
      setVec(dir, i, v[0]!, v[1]!, v[2]!);
      const length = branchBaseLength(siblings) + BRANCH_LENGTH_PER_TWIG * Math.min(leafTotal[i]!, TWIG_LIMIT) + hashUnit(id, 3) * BRANCH_LENGTH_JITTER;
      place(i, ax + v[0]! * length, ay + v[1]! * length, az + v[2]! * length);
      setVec(leafAxis, i, v[0]!, v[1]! + LEAF_AXIS_RISE, v[2]!);
    } else {
      const k = leafSeen[a]!++;
      const leaves = leafTotal[a]!;
      copyOut(i, a);
      frameAcross(leafAxis, a, a);
      const lx = leafAxis[a * 3]!, ly = leafAxis[a * 3 + 1]!, lz = leafAxis[a * 3 + 2]!;
      if (leaves <= TWIG_LIMIT) {
        const t = leaves === 1 ? 0 : (k + 0.5) / leaves;
        const theta = TWIG_HALF_ANGLE * Math.sqrt(t);
        const phi = hashUnit(ids[a] ?? null, 4) * Math.PI + k * GOLDEN_ANGLE;
        const c = Math.sin(theta) * Math.cos(phi), s = Math.sin(theta) * Math.sin(phi), u = Math.cos(theta);
        setVec(dir, i, lx * u + b1[0]! * c + b2[0]! * s, ly * u + b1[1]! * c + b2[1]! * s, lz * u + b1[2]! * c + b2[2]! * s);
        const length = TWIG_LENGTH + hashUnit(id, 5) * TWIG_LENGTH_JITTER;
        place(i, ax + dir[i * 3]! * length, ay + dir[i * 3 + 1]! * length, az + dir[i * 3 + 2]! * length);
      } else {
        const spacing = LEAF_PITCH / GOLDEN_DISC_MIN_SPACING;
        const headRadius = spacing * Math.sqrt(leaves);
        const stem = TWIG_LENGTH + headRadius * HEAD_STEM_PER_RADIUS;
        const r = spacing * Math.sqrt(k + 0.5);
        const phi = k * GOLDEN_ANGLE;
        const c = r * Math.cos(phi), s = r * Math.sin(phi);
        const lift = stem + headRadius * HEAD_DOME * (1 - (r / headRadius) ** 2);
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

  const arc = new Float64Array(n);
  let farthest = 0;
  for (let i = 0; i < n; i += 1) {
    arc[i] = (i === 0 ? 0 : arc[parent[i]!]!) + curveLength(i, i === 0 ? -1 : parent[i]!, pos, ctl);
    if (arc[i]! > farthest) farthest = arc[i]!;
  }
  const trunkWidth = woodWidth(model.concepts[0]!);
  for (let i = 0; i < n; i += 1) {
    reach[i] = farthest > 0 ? arc[i]! / farthest : 0;
    const [startShare, endShare] = i === 0 ? TRUNK_WIDTH : KIND_WIDTH[kinds[i]!];
    const wood = i === 0 ? trunkWidth : woodWidth(model.concepts[i]!);
    widthEnd[i] = wood * endShare;
    widthStart[i] = i === 0 ? wood * startShare : Math.min(wood * startShare, widthEnd[parent[i]!]!);
  }

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

  const branchKids: number[] = [];
  const leafKids: number[] = [];
  const gap = (a: number, b: number) => Math.hypot(pos[a * 3]! - pos[b * 3]!, pos[a * 3 + 1]! - pos[b * 3 + 1]!, pos[a * 3 + 2]! - pos[b * 3 + 2]!);
  for (let i = 0; i < n; i += 1) {
    branchKids.length = 0;
    leafKids.length = 0;
    for (let j = i + 1; j < subtreeEnd[i]!; j = subtreeEnd[j]!) (kinds[j] === "element" ? leafKids : branchKids).push(j);
    if (branchKids.length + leafKids.length < 2) continue;
    let least = Number.POSITIVE_INFINITY;
    if (leafKids.length > TWIG_LIMIT) least = LEAF_PITCH;
    else for (let x = 0; x < leafKids.length; x += 1) for (let y = x + 1; y < leafKids.length; y += 1) least = Math.min(least, gap(leafKids[x]!, leafKids[y]!));
    for (let x = 0; x < branchKids.length; x += 1) {
      for (let y = x + 1; y < branchKids.length; y += 1) least = Math.min(least, gap(branchKids[x]!, branchKids[y]!));
      for (const leaf of leafKids) least = Math.min(least, gap(branchKids[x]!, leaf));
    }
    childPitch[i] = least;
  }

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
    centre: [bound[0]!, bound[1]!, bound[2]!],
    radius: bound[3]!,
  };
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
