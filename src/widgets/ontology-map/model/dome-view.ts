import { findCouplingGroups } from './coupling-groups';
import { easeOutCubic, TIER_ASSEMBLE_TOTAL_MS, tierProgress } from '../morph/tier-assembly';

/**
 * The opt-in 3D view: arrangements where height and bearing carry typed facts (height is
 * the kind's containment tier, bearing is ownership) or where relations place nodes
 * (`createCouplingCloudRelaxer`). Opt-in because 3D multiplies edge crossings, which dominate
 * readability (`docs/DECISIONS.md`, 2026-08-18). Coordinates project into world 2D through
 * weak perspective `s = f/(f+z)` and ride the existing camera; draw, hit test and
 * instrumentation share one frame map (`DomeRuntime.frame`), so a click during rotation
 * lands where the node was drawn. Idle spin stops under the pointer and under reduced
 * motion; orbit release coasts on the camera's momentum decay, and reduced motion keeps 1:1
 * tracking without momentum. A node drags only within its kind plane, or it would take an
 * arbitrary z. Constants are feel values, not theme tokens.
 */
export type DomeViewKind = "project" | "domain" | "capability" | "element";

const TAU = Math.PI * 2;

/** The spine order of `docs/ONTOLOGY-ATLAS-SPEC.md` §2: the fact height carries. */
export const KIND_DEPTH: Readonly<Record<DomeViewKind, number>> = {
  project: 0,
  domain: 1,
  capability: 2,
  element: 3,
};

/** Idle spin: one turn per 48 s. */
export const DOME_PERIOD_MS = 48000;
/** Steep enough that the small base circles under each parent read as circles, not lines. */
export const DOME_PITCH_DEFAULT = 0.5;
/**
 * Pitch stays between 0.15 and 0.95 rad, always looking down: from below a tier disc reverses
 * the level order, edge-on the discs collapse into one line, and near the top the height
 * that carries the tier is lost. `resistDomePitch` gives the walls a rubber band. Dissent is
 * in the decision fragment "The 3D map drops the Cone".
 */
export const DOME_PITCH_MAX = 0.95;
export const DOME_PITCH_MIN = 0.15;
/**
 * The quarter resistance is linear, so this caps the squash; 0.15 − 0.09 still looks from
 * above, so a pressed wall never shows the planes from underneath.
 */
const DOME_PITCH_OVERSHOOT_CAP = 0.09;
/**
 * Smaller is a wider lens. 760 gives a near/far scale ratio of 1.42/0.77 = 1.84 on the
 * bottom ring, enough to read front from back and to grow a node rotating forward; below
 * 500 the ring's near arc leaves the screen.
 */
export const DOME_FOCAL = 760;
/**
 * Longest programmatic pose move (Home, selection reframe) for up to half a turn; the
 * 420 ms 2D camera cap reads as a whip over that angle.
 */
export const DOME_POSE_MS = 750;
/**
 * Matches three.js OrbitControls' `2π × dx / clientHeight` at a ~900 px canvas (838 px per
 * turn); a constant, so a window resize never changes sensitivity or test results.
 */
export const ORBIT_YAW_PER_PX = 0.0075;
/** Lower than yaw so horizontal stays the primary axis. */
export const ORBIT_PITCH_PER_PX = 0.005;
/**
 * During a drag yaw and pitch chase the pointer's target by `1−exp(−dt/τ)`, so the empty
 * 8.3 ms frame a 60 Hz pointer leaves on a 120 Hz display spreads over two with about a
 * frame of lag; a wider τ trails the hand, and below the frame interval the staircase
 * returns. Reduced motion snaps to the target.
 */
export const ORBIT_SMOOTH_TAU_MS = 14;

/** The `--map-camera-momentum-decay` value, so an orbit coasts like a camera flick. */
const ORBIT_VEL_DECAY_PER_MS = 0.998;
/**
 * Release projection (Designing Fluid Interfaces, WWDC18 803): compute the natural landing
 * from the release velocity, and only if it is already near a domain meridian re-aim the
 * deceleration there. The window stays narrow, or the app moves the place the person set.
 */
export const ORBIT_SNAP_WINDOW_RAD = 0.14;

/** `Σ v·d^t dt = v / (−ln d)`: release velocity × this is the angle still to turn. */
export const ORBIT_DECAY_TRAVEL_MS = 1 / -Math.log(ORBIT_VEL_DECAY_PER_MS);

export function projectOrbitLanding(yaw: number, yawVel: number): number {
  return yaw + yawVel * ORBIT_DECAY_TRAVEL_MS;
}

/**
 * Past half a turn the person loses which face was in front, so the release velocity is
 * capped to keep the coast within π. The decay stays shared; a drag is never capped.
 */
export const ORBIT_COAST_MAX_RAD = Math.PI;

export function clampOrbitReleaseVelocity(velRadPerMs: number): number {
  const max = ORBIT_COAST_MAX_RAD / ORBIT_DECAY_TRAVEL_MS;
  return Math.max(-max, Math.min(max, velRadPerMs));
}

/** Depth after rotation is `r·sin(θ + yaw)`, minimal at θ + yaw = −π/2, so yaw = −π/2 − θ. */
export function domeFacingYaws(model: DomeModel, kind: DomeViewKind = "domain"): number[] {
  const out: number[] = [];
  const planeR = DOME_PLANE[kind].r;
  for (const coord of model.coords.values()) {
    if (Math.abs(coord.py - DOME_PLANE[kind].y) > 1e-6) continue;
    if (planeR <= 0) continue;
    const theta = Math.atan2(coord.pz, coord.px);
    out.push(-Math.PI / 2 - theta);
  }
  return out.sort((a, b) => a - b);
}

/** Candidates are 2π-periodic, so each folds to the equivalent angle nearest the landing. */
export function snapOrbitLanding(
  landing: number,
  candidates: readonly number[],
  windowRad = ORBIT_SNAP_WINDOW_RAD,
): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const turns = Math.round((landing - c) / TAU);
    const near = c + turns * TAU;
    const dist = Math.abs(near - landing);
    if (dist < bestDist) {
      bestDist = dist;
      best = near;
    }
  }
  return best !== null && bestDist <= windowRad ? best : null;
}

/**
 * Derived as `τ = (target − yaw)/yawVel`, so the approach starts at the release velocity; a fixed τ
 * makes speed jump when the hand lifts. Clamped: too short teleports, too long never stops.
 */
export const ORBIT_SNAP_TAU_MIN_MS = 90;
/** Short enough that the worst case falls inside `ORBIT_SNAP_ARRIVE_RAD` within 2 s. */
export const ORBIT_SNAP_TAU_MAX_MS = 320;

/**
 * On the outer ring 1 px ≈ 0.008 rad; this is half. Exponential approach never arrives, so
 * without it the loop stays awake forever.
 */
export const ORBIT_SNAP_ARRIVE_RAD = 0.004;

export function orbitSnapTauMs(delta: number, yawVel: number): number {
  if (Math.abs(yawVel) < 1e-9) return ORBIT_SNAP_TAU_MAX_MS;
  const tau = delta / yawVel;
  if (!Number.isFinite(tau) || tau <= 0) return ORBIT_SNAP_TAU_MAX_MS;
  return Math.min(ORBIT_SNAP_TAU_MAX_MS, Math.max(ORBIT_SNAP_TAU_MIN_MS, tau));
}

/** Below this |yawVel| (rad/ms) the coast snaps to 0, or its tail never ends. */
const ORBIT_VEL_EPS = 0.000005;

/**
 * Scales the tier heights so the outline fits a landscape canvas (about 1.2 : 1) with air
 * above and below; the four planes keep their order and separation.
 */
export const CONE_HEIGHT_SCALE = 0.8;

/** Heights scaled by `CONE_HEIGHT_SCALE` in a 620-unit world; `DomeModel.unit` maps to world. */
export const DOME_PLANE: Readonly<Record<DomeViewKind, { y: number; r: number }>> = {
  project: { y: 148 * CONE_HEIGHT_SCALE, r: 0 },
  domain: { y: 56 * CONE_HEIGHT_SCALE, r: 148 },
  capability: { y: -48 * CONE_HEIGHT_SCALE, r: 192 },
  element: { y: -150 * CONE_HEIGHT_SCALE, r: 224 },
};

/** The denominator of the world scale. */
export const DOME_FIT_RADIUS = DOME_PLANE.element.r;

/** Beyond it direction is kept and length clamped. */
const DOME_DRAG_MAX_RADIUS = DOME_FIT_RADIUS * 1.5;

/**
 * Keeps the solution from flipping behind the camera as the pointer crosses the plane's
 * horizon (`solveDomePlanePoint`); far below `F·sin(pitch)`, so normal solutions are untouched.
 */
const DOME_PLANE_SOLVE_DENOM_MIN = 30;

/**
 * Near 1.0, far 0.09, falling as (1 − u)^1.8. Deeper than the 2D 3:1 ink floor by a 3D-only dispensation
 * (`docs/DECISIONS.md`, 3D exemption list); anything that must be read (hover, focus, ego,
 * trail) is exempted. `u` is depth normalised in this frame, 0 near.
 */
export function domeFogAlpha(u: number): number {
  const c = u <= 0 ? 0 : u >= 1 ? 1 : u;
  return 0.09 + 0.91 * Math.pow(1 - c, 1.8);
}

/**
 * A depth-dependent halo (Everts et al., IEEE TVCG 15(6), 2009): each line is first stroked
 * slightly wider in the background colour, cutting what lies behind so near reads over far.
 * It removes ink rather than adding it, so it is not a glow. Widest near and 0 far, since a
 * far halo would claim occlusion it cannot have; in screen px so the cut is zoom-independent.
 */
export const DOME_HALO_MAX_PX = 3.4;

export function domeHaloPx(u: number): number {
  const c = u <= 0 ? 0 : u >= 1 ? 1 : u;
  return DOME_HALO_MAX_PX * Math.pow(1 - c, 1.35);
}

/**
 * Fog has already thinned far lines, so the halo needs a gain to be denser than what it
 * cuts; capped so a barely visible far line leaves no solid mark.
 */
export const DOME_HALO_ALPHA_GAIN = 2.4;
export const DOME_HALO_ALPHA_CAP = 0.96;

/** The hero's width attenuation (0.45→1.60) as a multiplier. */
export function domeLineWidthFactor(u: number): number {
  const c = u <= 0 ? 0 : u >= 1 ? 1 : u;
  return 0.35 + 0.55 * (1 - c);
}

/**
 * Floor under a resting relation line's `fog alpha × width factor` product (a lit near line
 * has 0.90); stacked, fog and width would draw the far end at 3.5% of the near ink. Past the
 * crossover (u ≈ 0.17) alpha rises as width falls. The near side is unchanged; width, halo,
 * node fog, perspective and draw order still carry depth. The browser gate is
 * the spec `tests/e2e/map-3d-relation-ink.spec.ts`.
 */
const DOME_EDGE_INK_FLOOR = 0.62;

/**
 * Without it the far end meets the ink floor as a bright hairline at alpha 1, reading as
 * nearer than the line in front.
 */
const DOME_EDGE_WIDTH_FLOOR = 0.72;

/** A sub-pixel hairline loses coverage to antialiasing before alpha, so width is part of the floor. */
export function domeEdgeWidthFactor(u: number): number {
  return Math.max(domeLineWidthFactor(u), DOME_EDGE_WIDTH_FLOOR);
}

/**
 * Raw fog lifted only as far as the ink floor needs against the floored width, never past 1.
 * Nodes, plane rings and exempt lines keep `domeFogAlpha`.
 */
export function domeEdgeFogAlpha(u: number): number {
  return Math.min(1, Math.max(domeFogAlpha(u), DOME_EDGE_INK_FLOOR / domeEdgeWidthFactor(u)));
}

/**
 * The ink floor reaches the eye only while the stroke covers a device pixel; thinner, the
 * rasteriser splits it across two rows and the peak contrast falls, which on a DPR 1 screen
 * gave back the whole gain. The caller converts this at its rasterising ratio
 * (`domeEdgeMinWidthPx`). Browser gate: `tests/e2e/map-3d-relation-ink.spec.ts`.
 */
export const DOME_EDGE_DEVICE_WIDTH_FLOOR = 1.0;

/** A missing or nonsense ratio falls back to 1, the widest floor rather than none. */
export function domeEdgeMinWidthPx(devicePixelRatio: number): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return DOME_EDGE_DEVICE_WIDTH_FLOOR / dpr;
}


/*
 * Far-side detail ramp: secondary strokes (halo, shading, seam, outline, pin tick) fold away
 * on the back hemisphere, where fog has already flattened them; the marks themselves never
 * change. Exactly 1 up to START (> 0.5), so no front pixel differs; smoothstep, so nothing
 * pops as the dome turns; and converging far halos to 0 is what Everts et al. prescribe.
 */
export const DOME_DETAIL_FADE_START = 0.55;
export const DOME_DETAIL_FADE_END = 0.75;

/** u ≤ 0.55 → 1, u ≥ 0.75 → 0, C¹ continuous. */
export function domeDetailFactor(u: number): number {
  if (u <= DOME_DETAIL_FADE_START) return 1;
  if (u >= DOME_DETAIL_FADE_END) return 0;
  const t = (u - DOME_DETAIL_FADE_START) / (DOME_DETAIL_FADE_END - DOME_DETAIL_FADE_START);
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Dome-unit radii, now only the collision radius the coupling cloud relaxes
 * against; `DOME_NODE_PX` decides screen size.
 */
const DOME_NODE_R: Readonly<Record<DomeViewKind, number>> = {
  project: 10.5,
  domain: 4.6,
  capability: 3.1,
  element: 2.05,
};

/**
 * Screen-pixel radii, so fitting the cone larger buys spacing, not ink: with a dome-unit
 * radius the camera zoom grew dots and gaps alike and every size kept the same overlaps.
 * Perspective (`p.s`) still scales a dot, since that is depth, not zoom.
 */
export const DOME_NODE_PX: Readonly<Record<DomeViewKind, number>> = {
  project: 13,
  domain: 8.5,
  capability: 5.8,
  element: 4,
};

/**
 * The fit solves from node centres (`domeWorldBounds`) before a drawn frame exists, so it
 * reserves one symmetric allowance sized to the silhouette's edge discs, not its apex.
 */
export const DOME_NODE_FIT_ALLOWANCE_PX = 12;

/**
 * The floor fog may darken a node's rim to, so the dimmest rim token
 * (`--map-node-stroke-element`) keeps 3 : 1 over the canvas ground, the flat map's ink
 * floor. `dome-rim-contrast.contract.test.ts` derives it from the tokens.
 */
export const DOME_RIM_FOG_FLOOR = 0.75;

/** FNV-1a jitter, unchanged so angles stay stable. */
function domeHash01(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export interface DomeInputNode {
  id: string;
  kind: DomeViewKind;
  x: number;
  y: number;
  parentId: string | null;
}

/** px/pz on the ring plane, py the kind height. */
export interface DomeCoord {
  px: number;
  py: number;
  pz: number;
}

/**
 * The circle a parent's children rest on, centred under it on their kind plane; the
 * project's is the domain ring. The draw shows these as rings.
 */
interface DomeCircle {
  /** Its assembly ramp and yaw torsion follow this tier. */
  kind: DomeViewKind;
  cx: number;
  cz: number;
  y: number;
  r: number;
  /**
   * Strata's four plane rings carry the tier name; the cone's per-parent bases do not, since
   * they mark ownership rather than a level.
   */
  named?: boolean;
}

export interface DomeModel {
  /** A coupling cloud has no kind planes, so drawing latitude rings would be a lie. */
  arrangement: DomeArrangement;
  /** The dome sits on it, for camera continuity. */
  centerX: number;
  centerY: number;
  /** Sized so the element ring overlaps the 2D layout radius. */
  unit: number;
  coords: Map<string, DomeCoord>;
  /** Ownership only; empty for the cloud. */
  circles: DomeCircle[];
  /** Strata only, else empty. */
  sectors: DomeSector[];
}

/**
 * The bearing arc `[from, to)` a node's whole subtree is dealt into. `buildStrataTargets`
 * keeps descendants inside and siblings disjoint, so drawing it shows a proven fact.
 */
export interface DomeSector {
  id: string;
  kind: DomeViewKind;
  from: number;
  to: number;
}

const CONE_SPACING: Readonly<Record<DomeViewKind, number>> = {
  project: 0,
  domain: 0,
  // Capability disc ≈ 13 dome units across; 24 leaves one more disc of gap between neighbours.
  capability: 24,
  // Element disc ≈ 8.6 across.
  element: 15,
};
/** Below this a base reads as a smear, not a circle. */
const CONE_MIN_R: Readonly<Record<DomeViewKind, number>> = { project: 0, domain: 0, capability: 10, element: 6 };
/**
 * Keeps a giant domain from swallowing its neighbours' room; the room cap in `baseRadius`,
 * not this, keeps siblings apart, so a high ceiling spends interior space, not the silhouette.
 */
const CONE_MAX_R: Readonly<Record<DomeViewKind, number>> = { project: 0, domain: 0, capability: 96, element: 40 };
/** A base takes this share of its room; the rest is the gap between sibling cones. */
const CONE_ROOM_FILL = 0.82;
const CONE_STAGGER_FROM = 8;
const CONE_STAGGER_OUT = 1.12;
const CONE_STAGGER_IN = 0.9;

/**
 * Ownership as a cone tree (Robertson, Mackinlay & Card, CHI 1991): height is the tier and
 * a parent's children rest on a base circle directly under it, so a subtree is a bump you
 * can rotate to the front. Deterministic (sorted by id). Domains take sectors of the
 * project's ring in proportion to subtree size; each base radius comes from the child count
 * capped by the room to its siblings (the cap in `baseRadius`), so sibling cones never
 * intersect. One child hangs straight down with no base; crowded bases alternate two radii;
 * a node whose parent is missing gets a hash bearing on its plane. The footprint stays
 * inside `DOME_FIT_RADIUS` and y stays one value per kind for `solveDomePlanePoint`.
 * O(N log N): id sorts plus memoised subtree weights in Maps.
 */
function layoutConeTree(nodes: readonly DomeInputNode[]): { coords: Map<string, DomeCoord>; circles: DomeCircle[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const coords = new Map<string, DomeCoord>();
  const circles: DomeCircle[] = [];
  const byIdAsc = (a: DomeInputNode, b: DomeInputNode) => (a.id < b.id ? -1 : 1);

  const kids = new Map<string, DomeInputNode[]>();
  for (const n of nodes) {
    if (n.parentId === null || !byId.has(n.parentId) || n.parentId === n.id) continue;
    const list = kids.get(n.parentId);
    if (list) list.push(n);
    else kids.set(n.parentId, [n]);
  }
  for (const list of kids.values()) list.sort(byIdAsc);

  /** Cycles in a bad vault are cut at the first repeat. */
  const weightMemo = new Map<string, number>();
  const weightOf = (id: string, trail: Set<string>): number => {
    const memo = weightMemo.get(id);
    if (memo !== undefined) return memo;
    if (trail.has(id)) return 1;
    trail.add(id);
    let w = 1;
    for (const k of kids.get(id) ?? []) w += weightOf(k.id, trail);
    trail.delete(id);
    weightMemo.set(id, w);
    return w;
  };

  const projects = nodes.filter((n) => n.kind === "project").sort(byIdAsc);
  projects.forEach((p, i) => {
    if (projects.length === 1) {
      coords.set(p.id, { px: 0, py: DOME_PLANE.project.y, pz: 0 });
    } else {
      const a = (i / projects.length) * TAU - Math.PI / 2;
      coords.set(p.id, { px: Math.cos(a) * 26, py: DOME_PLANE.project.y, pz: Math.sin(a) * 26 });
    }
  });

  const domains = nodes.filter((n) => n.kind === "domain").sort(byIdAsc);
  const ringR = DOME_PLANE.domain.r;
  const weights = domains.map((d) => weightOf(d.id, new Set()));
  const weightSum = weights.reduce((acc, w) => acc + w, 0) || 1;
  const sectorOf = new Map<string, number>();
  const bearingOf = new Map<string, number>();
  let cursor = -Math.PI / 2;
  domains.forEach((d, i) => {
    const sector = (weights[i] / weightSum) * TAU;
    const a = cursor + sector / 2;
    cursor += sector;
    sectorOf.set(d.id, sector);
    bearingOf.set(d.id, a);
    coords.set(d.id, { px: Math.cos(a) * ringR, py: DOME_PLANE.domain.y, pz: Math.sin(a) * ringR });
  });
  if (domains.length > 0) circles.push({ kind: "domain", cx: 0, cz: 0, y: DOME_PLANE.domain.y, r: ringR });

  /**
   * The heaviest child faces outward and the rest alternate to either side, so the lightest
   * sit toward the axis, the only place sibling domains' cones can meet.
   */
  const rest = (parent: DomeCoord, outward: number, children: readonly DomeInputNode[], r: number): void => {
    const n = children.length;
    const ordered = [...children].sort((a, b) => {
      const dw = weightOf(b.id, new Set()) - weightOf(a.id, new Set());
      return dw !== 0 ? dw : byIdAsc(a, b);
    });
    ordered.forEach((k, i) => {
      // 0, +1, −1, +2, −2, … slots of TAU/n round the outward bearing.
      const slot = i === 0 ? 0 : i % 2 ? (i + 1) / 2 : -(i / 2);
      const a = outward + (slot / n) * TAU;
      const ri = n > CONE_STAGGER_FROM ? r * (i % 2 ? CONE_STAGGER_OUT : CONE_STAGGER_IN) : r;
      coords.set(k.id, { px: parent.px + Math.cos(a) * ri, py: DOME_PLANE[k.kind].y, pz: parent.pz + Math.sin(a) * ri });
    });
  };
  /** 0 for a single child, a stalk. */
  const baseRadius = (count: number, tier: DomeViewKind, room: number): number => {
    if (count <= 1) return 0;
    const cap = Math.min(CONE_MAX_R[tier], room * CONE_ROOM_FILL);
    const wanted = Math.max(CONE_MIN_R[tier], (count * CONE_SPACING[tier]) / TAU);
    return Math.max(0, Math.min(cap, wanted));
  };

  const capRoom = new Map<string, number>();
  for (const d of domains) {
    const children = kids.get(d.id) ?? [];
    const room = ringR * Math.sin((sectorOf.get(d.id) ?? 0) / 2);
    const r = baseRadius(children.length, "capability", room);
    const at = coords.get(d.id)!;
    const outward = bearingOf.get(d.id) ?? 0;
    rest(at, outward, children, r);
    if (r > 0) circles.push({ kind: "capability", cx: at.px, cz: at.pz, y: DOME_PLANE.capability.y, r });
    // The gap to its sibling on this base, or the whole room when it hangs alone.
    const childRoom = children.length <= 1 ? room * CONE_ROOM_FILL : r * Math.sin(Math.PI / children.length);
    for (const c of children) capRoom.set(c.id, childRoom);
  }

  const capabilities = nodes.filter((n) => n.kind === "capability").sort(byIdAsc);
  for (const c of capabilities) {
    const at = coords.get(c.id);
    if (!at) continue;
    const children = kids.get(c.id) ?? [];
    if (children.length === 0) continue;
    const parentAt = c.parentId !== null ? coords.get(c.parentId) : undefined;
    const outward = parentAt ? Math.atan2(at.pz - parentAt.pz, at.px - parentAt.px) : Math.atan2(at.pz, at.px);
    const r = baseRadius(children.length, "element", capRoom.get(c.id) ?? CONE_MAX_R.element);
    rest(at, outward, children, r);
    if (r > 0) circles.push({ kind: "element", cx: at.px, cz: at.pz, y: DOME_PLANE.element.y, r });
  }

  // Anything still unplaced takes a hash bearing on its own kind plane.
  for (const n of nodes) {
    if (coords.has(n.id)) continue;
    const a = domeHash01(n.id) * TAU;
    const r = DOME_PLANE[n.kind].r;
    coords.set(n.id, { px: Math.cos(a) * r, py: DOME_PLANE[n.kind].y, pz: Math.sin(a) * r });
  }
  return { coords, circles };
}

/**
 * Strata: the tiers as four stacked planes at the cone's `DOME_PLANE` heights, answering
 * "what level is this on" (`docs/benchmark/STRATA-2026-09-06.md`). Height is the tier and
 * nothing else; children split their parent's sector by subtree size and sit at their own
 * sector's midpoint. Every bearing stays inside its parent's sector and sibling sectors are
 * disjoint, so containment drops from different parents cannot cross; `dome-view.test.ts`
 * asserts it on the shape. `STRATA_BARYCENTER_SWEEPS` orders siblings within a sector
 * and `applyLanes` alternates two radii. The cost is a wider silhouette than the cone.
 */

/**
 * The outer fifth is the rim, where an unparented node lands, so "nothing above holds this"
 * is a visible position.
 */
const STRATA_PLACED_FILL = 0.82;

/**
 * The cone's apex needs no radius, but Strata rings every plane; 34 clears the project disc
 * by more than two of its radii, so the ring reads as a disc it stands in.
 */
const STRATA_PROJECT_RING_R = 34;

/**
 * A cutoff, not a target: the loop also stops on a sweep that changes nothing. Barycenter
 * oscillates, so the best ordering seen is kept, as `dot` does (Gansner et al., 1993). The
 * sweeps chiefly cut crossings between containment drops, the fan Strata exists to show.
 */
const STRATA_BARYCENTER_SWEEPS = 6;

/**
 * Scoring counts crossings, O(E²) per sweep: cheap at the few hundred relations a real
 * vault has, too slow in a build that must not hitch beyond this. Past it the sweeps run
 * unscored.
 */
const STRATA_SCORED_EDGE_BUDGET = 800;

/**
 * Containment and dependency chords seen from above, independent of the camera pose the
 * reader may leave. Relations sharing a node are not counted. O(E²).
 */
function strataCrossings(
  coords: ReadonlyMap<string, DomeCoord>,
  edges: readonly { sourceId: string; targetId: string }[],
): number {
  const segs: { ax: number; az: number; bx: number; bz: number; a: string; b: string }[] = [];
  for (const e of edges) {
    const a = coords.get(e.sourceId);
    const b = coords.get(e.targetId);
    if (!a || !b) continue;
    segs.push({ ax: a.px, az: a.pz, bx: b.px, bz: b.pz, a: e.sourceId, b: e.targetId });
  }
  const side = (px: number, pz: number, qx: number, qz: number, rx: number, rz: number) =>
    Math.sign((qx - px) * (rz - pz) - (qz - pz) * (rx - px));
  let count = 0;
  for (let i = 0; i < segs.length; i += 1) {
    for (let j = i + 1; j < segs.length; j += 1) {
      const s = segs[i];
      const t = segs[j];
      if (s.a === t.a || s.a === t.b || s.b === t.a || s.b === t.b) continue;
      const d1 = side(s.ax, s.az, s.bx, s.bz, t.ax, t.az);
      const d2 = side(s.ax, s.az, s.bx, s.bz, t.bx, t.bz);
      const d3 = side(t.ax, t.az, t.bx, t.bz, s.ax, s.az);
      const d4 = side(t.ax, t.az, t.bx, t.bz, s.bx, s.bz);
      if (d1 !== d2 && d3 !== d4) count += 1;
    }
  }
  return count;
}

/**
 * Pure and deterministic (siblings sorted by id first, no randomness or clock). `edges` only
 * order siblings inside a sector; they never move a node between planes or sectors.
 * At most `STRATA_BARYCENTER_SWEEPS` sweeps, each O(N log N + E) plus O(E²) crossing
 * scoring while E stays within `STRATA_SCORED_EDGE_BUDGET`.
 */
export function buildStrataTargets(
  nodes: readonly DomeInputNode[],
  edges: readonly { sourceId: string; targetId: string }[] = [],
): {
  coords: Map<string, DomeCoord>;
  circles: DomeCircle[];
  sectors: DomeSector[];
} {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const coords = new Map<string, DomeCoord>();
  const byIdAsc = (a: DomeInputNode, b: DomeInputNode) => (a.id < b.id ? -1 : 1);

  const kids = new Map<string, DomeInputNode[]>();
  for (const n of nodes) {
    if (n.parentId === null || !byId.has(n.parentId) || n.parentId === n.id) continue;
    const list = kids.get(n.parentId);
    if (list) list.push(n);
    else kids.set(n.parentId, [n]);
  }
  for (const list of kids.values()) list.sort(byIdAsc);

  /** The angular weight it claims; cycles are cut at the first repeat. */
  const weightMemo = new Map<string, number>();
  const weightOf = (id: string, trail: Set<string>): number => {
    const memo = weightMemo.get(id);
    if (memo !== undefined) return memo;
    if (trail.has(id)) return 1;
    trail.add(id);
    let w = 1;
    for (const k of kids.get(id) ?? []) w += weightOf(k.id, trail);
    trail.delete(id);
    weightMemo.set(id, w);
    return w;
  };

  const projects = nodes.filter((n) => n.kind === "project").sort(byIdAsc);
  /** Id order first, then reordered by the sweeps. */
  const orderOf = new Map<string, DomeInputNode[]>();
  for (const [parentId, list] of kids) orderOf.set(parentId, [...list]);
  const bearingOf = new Map<string, number>();

  /** So one subtree can be re-dealt without redoing the walk. */
  const sectorOf = new Map<string, readonly [number, number, number, number]>();
  /**
   * Seat a node mid-sector and deal the sector to its children; `index`/`siblings` choose only
   * the lane radius, and the bearing never leaves the sector, or a drop could cross.
   */
  const place = (node: DomeInputNode, from: number, to: number, index: number, siblings: number): void => {
    sectorOf.set(node.id, [from, to, index, siblings]);
    const mid = (from + to) / 2;
    const planeR = node.kind === "project" ? STRATA_PROJECT_RING_R : DOME_PLANE[node.kind].r;
    // A lone project is the axis; two or more share the top plane's ring.
    const onAxis = node.kind === "project" && projects.length <= 1;
    const r = onAxis ? 0 : planeR * STRATA_PLACED_FILL;
    bearingOf.set(node.id, mid);
    coords.set(node.id, { px: Math.cos(mid) * r, py: DOME_PLANE[node.kind].y, pz: Math.sin(mid) * r });

    const children = orderOf.get(node.id) ?? [];
    if (children.length === 0) return;
    let total = 0;
    for (const c of children) total += weightOf(c.id, new Set());
    let cursor = from;
    children.forEach((child, i) => {
      const share = ((weightOf(child.id, new Set()) || 1) / (total || 1)) * (to - from);
      place(child, cursor, cursor + share, i, children.length);
      cursor += share;
    });
  };

  /*
   * Two lanes per plane: bearing comes from the sector, so neighbours from different parents
   * can fuse on one circle, and the sweep pulls related nodes together. The cone's stagger
   * applied to the whole plane, radius only, so sector containment survives. It runs
   * inside `layout`, so the crossing score reads the drawn geometry.
   */
  const applyLanes = (): void => {
    for (const kind of STRATA_PLANE_ORDER) {
      if (kind === "project") continue;
      const lane = [...coords.entries()]
        .filter(([id]) => byId.get(id)?.kind === kind)
        .map(([id, c]) => ({ id, c, bearing: Math.atan2(c.pz, c.px) }))
        .sort((a, b) => (a.bearing !== b.bearing ? a.bearing - b.bearing : a.id < b.id ? -1 : 1));
      if (lane.length <= CONE_STAGGER_FROM) continue;
      lane.forEach((entry, i) => {
        const r = DOME_PLANE[kind].r * STRATA_PLACED_FILL * (i % 2 ? CONE_STAGGER_OUT : CONE_STAGGER_IN);
        entry.c.px = Math.cos(entry.bearing) * r;
        entry.c.pz = Math.sin(entry.bearing) * r;
      });
    }
  };

  const layout = (): void => {
    coords.clear();
    bearingOf.clear();
    sectorOf.clear();
    // Projects share the full turn; −π/2 starts at the top of the disc, the cone's zero.
    let projectTotal = 0;
    for (const p of projects) projectTotal += weightOf(p.id, new Set());
    let cursor = -Math.PI / 2;
    projects.forEach((p, i) => {
      const share = ((weightOf(p.id, new Set()) || 1) / (projectTotal || 1)) * TAU;
      place(p, cursor, cursor + share, i, projects.length);
      cursor += share;
    });
    applyLanes();
  };
  layout();

  /*
   * Barycenter crossing reduction (Sugiyama, Tagawa & Toda, 1981) for the dependency arcs,
   * which sector inheritance leaves to chance. Radial adaptations after Bachmaier (IEEE TVCG
   * 13(3), 2007): the key is a circular mean, since averaging 10° and 350° gives 180°, and
   * is read as an offset from the parent's bearing. A node permutes only among its siblings,
   * or "this capability sits under that domain" breaks. Containment edges stay out of the
   * key, since the sector already encodes them.
   */
  const neighbours = new Map<string, string[]>();
  for (const edge of edges) {
    const a = byId.get(edge.sourceId);
    const b = byId.get(edge.targetId);
    if (!a || !b || a === b) continue;
    if (a.parentId === b.id || b.parentId === a.id) continue;
    (neighbours.get(a.id) ?? neighbours.set(a.id, []).get(a.id)!).push(b.id);
    (neighbours.get(b.id) ?? neighbours.set(b.id, []).get(b.id)!).push(a.id);
  }
  if (neighbours.size > 0) {
    const offsetFrom = (angle: number, origin: number): number => {
      let d = angle - origin;
      while (d > Math.PI) d -= TAU;
      while (d <= -Math.PI) d += TAU;
      return d;
    };
    const scored = edges.length <= STRATA_SCORED_EDGE_BUDGET;
    let bestOrder = scored ? new Map([...orderOf].map(([k, v]) => [k, [...v]])) : null;
    let bestCount = scored ? strataCrossings(coords, edges) : 0;
    /*
     * Each subtree is re-dealt the moment its order changes (Gauss-Seidel), so the next parent
     * sees current positions; with stale positions both ends of a same-layer edge swap past
     * each other and the crossing survives.
     */
    const parentIds = [...orderOf.keys()].sort();
    for (let sweep = 0; sweep < STRATA_BARYCENTER_SWEEPS; sweep += 1) {
      let changed = false;
      for (const parentId of parentIds) {
        const children = orderOf.get(parentId) ?? [];
        if (children.length < 2) continue;
        const parentBearing = bearingOf.get(parentId) ?? 0;
        const keyed = children.map((child, index) => {
          let sx = 0;
          let sz = 0;
          let seen = 0;
          for (const other of neighbours.get(child.id) ?? []) {
            const a = bearingOf.get(other);
            if (a === undefined) continue;
            sx += Math.cos(a);
            sz += Math.sin(a);
            seen += 1;
          }
          // No relation, or neighbours that cancel exactly: stay put rather than shuffle for nothing.
          const key =
            seen === 0 || Math.hypot(sx, sz) < 1e-9
              ? offsetFrom(bearingOf.get(child.id) ?? parentBearing, parentBearing)
              : offsetFrom(Math.atan2(sz, sx), parentBearing);
          return { child, key, index };
        });
        keyed.sort((a, b) =>
          a.key !== b.key ? a.key - b.key : a.child.id < b.child.id ? -1 : a.child.id > b.child.id ? 1 : 0,
        );
        let moved = false;
        for (let i = 0; i < keyed.length; i += 1) {
          if (keyed[i].index !== i) {
            moved = true;
            break;
          }
        }
        if (!moved) continue;
        changed = true;
        orderOf.set(
          parentId,
          keyed.map((k) => k.child),
        );
        const sector = sectorOf.get(parentId);
        const parent = byId.get(parentId);
        if (sector && parent) place(parent, sector[0], sector[1], sector[2], sector[3]);
      }
      if (!changed) break;
      // Re-deals wrote base radii; restore the lanes so the score reads the drawn geometry.
      applyLanes();
      if (!scored) continue;
      const count = strataCrossings(coords, edges);
      if (count < bestCount) {
        bestCount = count;
        bestOrder = new Map([...orderOf].map(([k, v]) => [k, [...v]]));
      }
    }
    // Keep the best ordering seen, not the last: the barycenter oscillates.
    if (bestOrder !== null) {
      for (const [k, v] of bestOrder) orderOf.set(k, v);
      layout();
    }
  }

  /*
   * Anything the walk never reached sits on its own plane's rim at a hash bearing: on the
   * right level, and visibly not held by the tier above.
   */
  for (const n of nodes) {
    if (coords.has(n.id)) continue;
    const a = domeHash01(n.id) * TAU;
    const rimR = n.kind === "project" ? STRATA_PROJECT_RING_R : DOME_PLANE[n.kind].r;
    coords.set(n.id, { px: Math.cos(a) * rimR, py: DOME_PLANE[n.kind].y, pz: Math.sin(a) * rimR });
  }

  /* Only planes with something on them, or the ring asserts a level this vault lacks. */
  const circles: DomeCircle[] = [];
  for (const kind of STRATA_PLANE_ORDER) {
    if (!nodes.some((n) => n.kind === kind)) continue;
    const r = kind === "project" ? STRATA_PROJECT_RING_R : DOME_PLANE[kind].r;
    circles.push({ kind, cx: 0, cz: 0, y: DOME_PLANE[kind].y, r, named: true });
  }

  /*
   * Domains and capabilities only: a project's sector is the whole turn, and an element has
   * no plane under it.
   */
  const sectors: DomeSector[] = [];
  for (const [id, [from, to]] of sectorOf) {
    const kind = byId.get(id)?.kind;
    if (kind !== "domain" && kind !== "capability") continue;
    sectors.push({ id, kind, from, to });
  }
  sectors.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { coords, circles, sectors };
}

/** The containment spine of `docs/ONTOLOGY-ATLAS-SPEC.md` §2. */
const STRATA_PLANE_ORDER: readonly DomeViewKind[] = ["project", "domain", "capability", "element"];

/**
 * Higher than the cone's 0.34 because a plane ring spends most of its circumference at
 * depth, where fog and width falloff multiply it and the ring ink is near the ground: 0.55
 * is where the ring is a visible hairline without reading as the subject.
 */
export const DOME_STRATA_RING_ALPHA = 0.55;

export function domeRingAlphaFor(arrangement: DomeArrangement): number {
  return arrangement === "strata" ? DOME_STRATA_RING_ALPHA : DOME_RING_ALPHA;
}

/**
 * Arrangement `ownership` (default) is the cone: height is the tier and bearing comes from
 * containment. `coupling` is the cloud: a deterministic force layout lets relations decide all three
 * coordinates, a genuinely different question.
 */
/**
 * Arrangement `strata` answers the same containment question as `ownership`, drawn as stacked labelled
 * planes (`buildStrataTargets`; `docs/DECISIONS.md` for the declined three.js probe).
 */
export type DomeArrangement = "ownership" | "coupling" | "strata";

/**
 * The coupling cloud writes no rules into geometry: height is decided by relations too, or
 * it is only a twisted dome. No randomness: it seeds from the ownership coordinates with a
 * fixed iteration count, so a vault always draws the same cloud and switching arrangement
 * keeps spatial memory.
 */
/**
 * A ceiling, not a target: relaxation stops earlier on convergence (`settleEpsilon`). Low
 * enough to keep the transition near the 100 ms "instant" limit (Nielsen 1993).
 */
export const CLOUD_ITERATIONS = 260;
/** Inverse-square in distance. */
const CLOUD_REPULSION = 16000;
/** A Hooke spring along each relation. */
const CLOUD_SPRING = 0.02;
const CLOUD_COHESION = 0.07;
const CLOUD_LOCAL_REPULSION = 0.25;
const CLOUD_REST_LENGTH = 92;
/**
 * Domain anchors sit about two rest lengths out, so neighbouring clusters keep a gap a
 * relation must visibly cross; the pulls are weak beside springs and repulsion.
 */
const CLOUD_DOMAIN_ANCHOR_RADIUS = 190;
const CLOUD_DOMAIN_ANCHOR_PULL = 0.08;
const CLOUD_DOMAIN_MEMBER_PULL = 0.03;

/**
 * Finite-step repulsion guarantees nothing, so each iteration ends with a position
 * correction that pushes discs until they do not overlap (as d3-force `forceCollide`). The
 * base is the per-kind `DOME_NODE_R`; 2.4 leaves room for another disc between two.
 */
const CLOUD_COLLIDE_RADIUS_SCALE = 2.4;
/** 1.0 oscillates, so resolve half at a time. */
const CLOUD_COLLIDE_RELAX = 0.5;

/** Depth fog and perspective carry front and back; the kind radii stay readable. */
const CLOUD_DEPTH_GAMMA = 0.62;
/** Keeps the cloud from inflating without bound. */
const CLOUD_CENTERING = 0.0016;
/** Runaway guard. */
const CLOUD_MAX_STEP = 9;
/**
 * Up to this node count the O(n²) repulsion runs in full; above it iterations drop so time
 * stays nearer linear. Barnes-Hut waits for a genuinely large vault to validate against.
 */
const CLOUD_FULL_ITERATION_NODE_CAP = 400;

/**
 * Relaxation is O(n²) × iterations, so it is sliced across frames: `step(budgetMs)` returns
 * true on the frame it completes. Iterations are sequential, so cutting and resuming keeps
 * the operation order and the result bit-identical. The loop creates the dome runtime only
 * after completion.
 */
interface CouplingCloudRelaxer {
  /** True once finished, convergence included. */
  step(budgetMs: number): boolean;
}

function createCouplingCloudRelaxer(
  coords: Map<string, DomeCoord>,
  nodes: readonly DomeInputNode[],
  edges: readonly { sourceId: string; targetId: string }[],
): CouplingCloudRelaxer {
  const ids = nodes.map((n) => n.id).filter((id) => coords.has(id));
  const n = ids.length;
  if (n < 2) return { step: () => true };
  const index = new Map(ids.map((id, i) => [id, i]));

  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const pz = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const c = coords.get(ids[i])!;
    px[i] = c.px;
    py[i] = c.py;
    pz[i] = c.pz;
  }

  const links: Array<[number, number]> = [];
  for (const e of edges) {
    const a = index.get(e.sourceId);
    const b = index.get(e.targetId);
    if (a === undefined || b === undefined || a === b) continue;
    links.push([a, b]);
  }

  /* `DOME_NODE_R × 2.1` is the dome-unit radius the draw uses. */
  const kindOf = new Map(nodes.map((node) => [node.id, node.kind]));
  const collideR = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const kind = kindOf.get(ids[i]) ?? "element";
    collideR[i] = DOME_NODE_R[kind] * 2.1 * CLOUD_COLLIDE_RADIUS_SCALE;
  }

  /*
   * Each domain is drawn toward a fixed anchor (a deterministic Fibonacci lattice in id order)
   * and its members toward the domain, so "whose is this" has a place. A layout aid over the
   * declared `contains` chain; no edge is invented and springs decide inside a cluster.
   */
  const parentOf = new Map(nodes.map((node) => [node.id, node.parentId]));
  const domainIndexOf = new Int32Array(n).fill(-1);
  const domainIds = ids.filter((id) => kindOf.get(id) === "domain").sort();
  const domainSlot = new Map(domainIds.map((id, k) => [id, k]));
  for (let i = 0; i < n; i += 1) {
    let cursor: string | null = ids[i];
    for (let hop = 0; cursor !== null && hop < 8; hop += 1) {
      const slot = domainSlot.get(cursor);
      if (slot !== undefined) {
        domainIndexOf[i] = slot;
        break;
      }
      cursor = parentOf.get(cursor) ?? null;
    }
  }
  const domainNodeIndex = domainIds.map((id) => index.get(id)!);
  const anchorX = new Float64Array(domainIds.length);
  const anchorY = new Float64Array(domainIds.length);
  const anchorZ = new Float64Array(domainIds.length);
  for (let k = 0; k < domainIds.length; k += 1) {
    // Evenly spread directions for any count, no randomness.
    const y = domainIds.length === 1 ? 0 : 1 - (2 * (k + 0.5)) / domainIds.length;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = k * Math.PI * (3 - Math.sqrt(5));
    anchorX[k] = Math.cos(theta) * ring * CLOUD_DOMAIN_ANCHOR_RADIUS;
    anchorY[k] = y * CLOUD_DOMAIN_ANCHOR_RADIUS * 0.7;
    anchorZ[k] = Math.sin(theta) * ring * CLOUD_DOMAIN_ANCHOR_RADIUS;
  }

  const groups = findCouplingGroups(ids, edges);
  const groupCount = groups.reduce((largest, group) => Math.max(largest, group), -1) + 1;
  const groupSize = new Uint32Array(groupCount);
  const groupX = new Float64Array(groupCount);
  const groupY = new Float64Array(groupCount);
  const groupZ = new Float64Array(groupCount);
  for (const group of groups) groupSize[group] += 1;

  const fx = new Float64Array(n);
  const fy = new Float64Array(n);
  const fz = new Float64Array(n);
  const iterations =
    n <= CLOUD_FULL_ITERATION_NODE_CAP
      ? CLOUD_ITERATIONS
      : Math.max(60, Math.round((CLOUD_ITERATIONS * CLOUD_FULL_ITERATION_NODE_CAP) / n));

  /**
   * Stop once the largest move in an iteration falls below this; a constant, so identical
   * input stops at the identical iteration.
   */
  const settleEpsilon = 0.05;

  let iter = 0;
  let settled = false;
  let done = false;

  /*
   * Resumable inside the pair loop: one iteration can exceed a frame slice on a large vault.
   * Row `i` is the cursor, and pausing between rows keeps the operation order, so the result
   * stays bit-identical. Springs, centering and cooling finish in the call that ends the rows.
   */
  let pairRow = 0;
  let inPairLoop = false;
  const beginIteration = (): void => {
    fx.fill(0);
    fy.fill(0);
    fz.fill(0);
    pairRow = 0;
    inPairLoop = true;
  };
  const runPairRows = (deadlineMs: number): boolean => {

    /* Repulsion and collision share one pair loop, since both need the same deltas. */
    while (pairRow < n) {
      const i = pairRow;
      for (let j = i + 1; j < n; j += 1) {
        let dx = px[i] - px[j];
        let dy = py[i] - py[j];
        let dz = pz[i] - pz[j];
        let d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 1e-6) {
          // Coincident pairs separate by index, not a random number, to stay deterministic.
          dx = (i - j) * 1e-3;
          dy = 1e-3;
          dz = (j - i) * 1e-3;
          d2 = dx * dx + dy * dy + dz * dz;
        }
        const d = Math.sqrt(d2);

        const affinity = groups[i] === groups[j] ? CLOUD_LOCAL_REPULSION : 1;
        const inv = CLOUD_REPULSION * affinity / d2 / d;
        const ux = dx * inv;
        const uy = dy * inv;
        const uz = dz * inv;
        fx[i] += ux;
        fy[i] += uy;
        fz[i] += uz;
        fx[j] -= ux;
        fy[j] -= uy;
        fz[j] -= uz;

        // Collision pushes positions directly until the discs do not overlap.
        const want = collideR[i] + collideR[j];
        if (d < want) {
          const push = ((want - d) / d) * CLOUD_COLLIDE_RELAX * 0.5;
          px[i] += dx * push;
          py[i] += dy * push;
          pz[i] += dz * push;
          px[j] -= dx * push;
          py[j] -= dy * push;
          pz[j] -= dz * push;
        }
      }
      pairRow += 1;
      // Checking the clock every 16 rows keeps the overshoot under a millisecond at any size.
      if ((pairRow & 15) === 0 && performance.now() >= deadlineMs) return false;
    }
    inPairLoop = false;
    return true;
  };
  const finishIteration = (): void => {
    for (const [a, b] of links) {
      const dx = px[b] - px[a];
      const dy = py[b] - py[a];
      const dz = pz[b] - pz[a];
      const d = Math.hypot(dx, dy, dz) || 1e-6;
      const pull = (d - CLOUD_REST_LENGTH) * CLOUD_SPRING;
      const ux = (dx / d) * pull;
      const uy = (dy / d) * pull;
      const uz = (dz / d) * pull;
      fx[a] += ux;
      fy[a] += uy;
      fz[a] += uz;
      fx[b] -= ux;
      fy[b] -= uy;
      fz[b] -= uz;
    }

    // Cohesion is a layout aid, not an edge; singleton groups exert no pull.
    groupX.fill(0); groupY.fill(0); groupZ.fill(0);
    for (let i = 0; i < n; i += 1) {
      const group = groups[i];
      groupX[group] += px[i]; groupY[group] += py[i]; groupZ[group] += pz[i];
    }
    for (let i = 0; i < n; i += 1) {
      const group = groups[i];
      const size = groupSize[group];
      fx[i] += (groupX[group] / size - px[i]) * CLOUD_COHESION;
      fy[i] += (groupY[group] / size - py[i]) * CLOUD_COHESION;
      fz[i] += (groupZ[group] / size - pz[i]) * CLOUD_COHESION;
    }

    // Domains to their anchors, members to their domain (see `domainIndexOf`).
    for (let k = 0; k < domainNodeIndex.length; k += 1) {
      const d = domainNodeIndex[k];
      fx[d] += (anchorX[k] - px[d]) * CLOUD_DOMAIN_ANCHOR_PULL;
      fy[d] += (anchorY[k] - py[d]) * CLOUD_DOMAIN_ANCHOR_PULL;
      fz[d] += (anchorZ[k] - pz[d]) * CLOUD_DOMAIN_ANCHOR_PULL;
    }
    for (let i = 0; i < n; i += 1) {
      const slot = domainIndexOf[i];
      if (slot < 0) continue;
      const d = domainNodeIndex[slot];
      if (d === i) continue;
      fx[i] += (px[d] - px[i]) * CLOUD_DOMAIN_MEMBER_PULL;
      fy[i] += (py[d] - py[i]) * CLOUD_DOMAIN_MEMBER_PULL;
      fz[i] += (pz[d] - pz[i]) * CLOUD_DOMAIN_MEMBER_PULL;
    }

    const cool = 1 - iter / iterations;
    let maxStep = 0;
    for (let i = 0; i < n; i += 1) {
      fx[i] -= px[i] * CLOUD_CENTERING;
      fy[i] -= py[i] * CLOUD_CENTERING;
      fz[i] -= pz[i] * CLOUD_CENTERING;
      const step = Math.hypot(fx[i], fy[i], fz[i]);
      const scale = (step > CLOUD_MAX_STEP ? CLOUD_MAX_STEP / step : 1) * cool;
      const mx2 = fx[i] * scale;
      const my2 = fy[i] * scale;
      const mz2 = fz[i] * scale;
      px[i] += mx2;
      py[i] += my2;
      pz[i] += mz2;
      const moved = Math.hypot(mx2, my2, mz2);
      if (moved > maxStep) maxStep = moved;
    }
    if (maxStep < settleEpsilon) settled = true;
    iter += 1;
  };

  /*
   * Centre the mass on the origin: rotation turns about the origin, so an off-centre cloud
   * swings off screen under a small drag.
   */
  const finalize = (): void => {
    let mx = 0;
    let my = 0;
    let mz = 0;
    for (let i = 0; i < n; i += 1) {
      mx += px[i];
      my += py[i];
      mz += pz[i];
    }
    mx /= n;
    my /= n;
    mz /= n;

    // Normalised so camera fit and fog see the dome's scale.
    let maxR = 0;
    for (let i = 0; i < n; i += 1) {
      const r = Math.hypot(px[i] - mx, py[i] - my, pz[i] - mz);
      if (r > maxR) maxR = r;
    }
    const norm = maxR > 1e-6 ? DOME_FIT_RADIUS / maxR : 1;
    for (let i = 0; i < n; i += 1) {
      const c = coords.get(ids[i])!;
      c.px = (px[i] - mx) * norm;
      c.py = (py[i] - my) * norm;
      c.pz = (pz[i] - mz) * norm;
    }
  };

  return {
    step(budgetMs: number): boolean {
      if (done) return true;
      // The next call resumes the same iteration where it paused.
      const deadline = performance.now() + budgetMs;
      while (iter < iterations && !settled) {
        if (!inPairLoop) beginIteration();
        if (!runPairRows(deadline)) return false;
        finishIteration();
        if (performance.now() >= deadline) break;
      }
      if (iter >= iterations || settled) {
        finalize();
        done = true;
      }
      return done;
    },
  };
}

/**
 * Headroom under the 50 ms long-task threshold while keeping total time near a single
 * synchronous build; lower delays the start of assembly visibly, higher hitches again.
 */
export const DOME_BUILD_SLICE_MS = 28;

export interface DomeModelBuild {
  /** Valid only after `step` has returned true. */
  model: DomeModel;
  /** null means already complete. */
  step: ((budgetMs: number) => boolean) | null;
}

/**
 * Builds the ownership seed at once and hands only the coupling cloud's O(n²) relaxation
 * to `step` (see `CouplingCloudRelaxer`).
 */
export function beginDomeModelBuild(
  nodes: readonly DomeInputNode[],
  options?: {
    /** Defaults to `ownership`. */
    arrangement?: DomeArrangement;
    /** Omitted, the coupling arrangement matches ownership. */
    edges?: readonly { sourceId: string; targetId: string }[];
  },
): DomeModelBuild {
  let cx = 0;
  let cy = 0;
  for (const n of nodes) {
    cx += n.x;
    cy += n.y;
  }
  const count = Math.max(1, nodes.length);
  cx /= count;
  cy /= count;
  let radius = 0;
  for (const n of nodes) {
    const d = Math.hypot(n.x - cx, n.y - cy);
    if (d > radius) radius = d;
  }
  // Floor so a tiny vault does not collapse to a point.
  const unit = Math.max(radius, 220) / DOME_FIT_RADIUS;

  const arrangement = options?.arrangement ?? "ownership";
  /* The cone tree seeds both the cone and the coupling cloud's warm start. */
  const { coords, circles, sectors } =
    arrangement === "strata"
      ? buildStrataTargets(nodes, options?.edges ?? [])
      : { ...layoutConeTree(nodes), sectors: [] as DomeSector[] };

  const model: DomeModel = {
    centerX: cx,
    centerY: cy,
    unit,
    coords,
    arrangement,
    // The cloud has no cone bases, which would assert a coordinate system relations did not
    // produce; Strata's circles are its four planes.
    circles: arrangement === "coupling" ? [] : circles,
    sectors,
  };
  if (arrangement === "coupling" && options?.edges && options.edges.length > 0) {
    const relaxer = createCouplingCloudRelaxer(coords, nodes, options.edges);
    return { model, step: (budgetMs: number) => relaxer.step(budgetMs) };
  }
  return { model, step: null };
}

export function buildDomeModel(
  nodes: readonly DomeInputNode[],
  options?: {
    /** Defaults to `ownership`. */
    arrangement?: DomeArrangement;
    /** Omitted, the coupling arrangement matches ownership. */
    edges?: readonly { sourceId: string; targetId: string }[];
  },
): DomeModel {
  const build = beginDomeModelBuild(nodes, options);
  if (build.step !== null) {
    while (!build.step(Number.POSITIVE_INFINITY)) {
      // step(∞) finishes in one call.
    }
  }
  return build.model;
}

/**
 * On the object a drag rotates, off it the map pans, as in 2D; no mode or modifier. The
 * test is the ellipse inscribed in the drawn bbox, since the bbox corners are empty screen
 * that would rotate. 1.08 is the least margin covering the outermost disc and its
 * selection ring.
 */
export const DOME_GRIP_MARGIN = 1.08;

/**
 * The `bounds` argument is `DomeRuntime.drawnBounds`. With none (2D, or before assembly) it is false,
 * so the default pan wins.
 */
export function isInsideDomeGrip(
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null,
  worldX: number,
  worldY: number,
  margin = DOME_GRIP_MARGIN,
): boolean {
  if (bounds === null) return false;
  const halfW = ((bounds.maxX - bounds.minX) / 2) * margin;
  const halfH = ((bounds.maxY - bounds.minY) / 2) * margin;
  if (halfW <= 0 || halfH <= 0) return false;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const nx = (worldX - cx) / halfW;
  const ny = (worldY - cy) / halfH;
  return nx * nx + ny * ny <= 1;
}

export interface DomeProjection {
  /** The existing camera looks at these. */
  wx: number;
  wy: number;
  /** Weak perspective factor f/(f+z); radii and hit discs multiply by it too. */
  s: number;
  /** Camera-space depth, input to per-frame fog normalisation (`updateDomeFrame`). */
  z: number;
}

export function projectDomeCoord(model: DomeModel, coord: DomeCoord, yaw: number, pitch: number): DomeProjection {
  return projectWithTrig(model, coord, Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch));
}

function projectWithTrig(
  model: DomeModel,
  coord: DomeCoord,
  cy: number,
  sy: number,
  cp: number,
  sp: number,
): DomeProjection {
  const x = coord.px * cy - coord.pz * sy;
  const zr = coord.px * sy + coord.pz * cy;
  const y2 = coord.py * cp + zr * sp;
  const z2 = -coord.py * sp + zr * cp;
  const s = DOME_FOCAL / (DOME_FOCAL + z2);
  return {
    wx: model.centerX + x * s * model.unit,
    wy: model.centerY - y2 * s * model.unit,
    s,
    z: z2,
  };
}

/*
 * 3D-only feel constants stay inside this module by dispensation (`docs/DECISIONS.md`, 3D
 * Dispensation List), so standardising them later means reading one file.
 */

/**
 * Deeper tiers lag an orbit slightly, then spring back (follow-through). Only during a
 * drag and briefly after, decaying to 0.
 */
export const DOME_TIER_LAG: Readonly<Record<DomeViewKind, number>> = {
  project: 0,
  domain: -0.1,
  capability: -0.2,
  element: -0.3,
};
/** The hero's 0.90 per frame at 60 fps, made dt-invariant. */
export const DOME_TIER_LAG_DECAY_PER_MS = 0.9937;

/**
 * Programmatic pose moves charge torsion too, or a camera-driven turn rotates the rings as
 * one rigid lump. Scaled down because such moves are far faster than a hand; the existing
 * decay supplies the settle.
 */
export const DOME_POSE_LAG_SCALE = 0.55;

/**
 * Hand drag and programmatic moves call this one function, so they cannot diverge. `scale`
 * is 1 for the hand and `DOME_POSE_LAG_SCALE` for programmatic moves.
 */
export function chargeTierLag(lag: Record<DomeViewKind, number>, deltaYaw: number, scale = 1): void {
  const d = deltaYaw * scale;
  lag.project += d * DOME_TIER_LAG.project;
  lag.domain += d * DOME_TIER_LAG.domain;
  lag.capability += d * DOME_TIER_LAG.capability;
  lag.element += d * DOME_TIER_LAG.element;
}


/**
 * The entry sweep: pitch starts from nearly above, so structure reads first, and yaw
 * enters slightly turned, since rotation's motion parallax says "3D" (Ware & Franck 1996).
 * Both scale by the ramp remainder and reach exactly 0 on arrival. 0.45 on the 0.5 default
 * starts on the pitch wall, the steepest angle a drag can return to.
 */
const DOME_ENTRY_PITCH_LIFT = 0.45;
const DOME_ENTRY_YAW_SWEEP = 0.45;

/**
 * Its own clock, not assembly's: offsets scale by the tier ramp, so turning the pose while
 * the ramp is low barely moves any node. It outlives assembly and holds at 1 while only the
 * spine is up.
 */
export const DOME_ENTRY_SWEEP_MS = 1500;
const DOME_ENTRY_SWEEP_HOLD_MS = 220;

/**
 * Call when a hand touches the map: the sweep offset moves into the real yaw and pitch, so
 * the drawn pose stays identical instead of jumping as the gesture starts. Pitch is clamped
 * back into range.
 */
export function commitDomeEntrySweep(runtime: DomeRuntime): void {
  if (!runtime.entryArmed) return;
  const sweep = domeEntrySweep(runtime.entryClock);
  runtime.entryArmed = false;
  if (sweep <= 0) return;
  runtime.pitch = clampDomePitch(runtime.pitch + DOME_ENTRY_PITCH_LIFT * sweep);
  runtime.yaw = runtime.yaw - DOME_ENTRY_YAW_SWEEP * sweep;
  runtime.pitchTarget = runtime.pitch;
  runtime.yawTarget = runtime.yaw;
}

function domeEntrySweep(entryClockMs: number): number {
  const t = (entryClockMs - DOME_ENTRY_SWEEP_HOLD_MS) / (DOME_ENTRY_SWEEP_MS - DOME_ENTRY_SWEEP_HOLD_MS);
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return 1 - domeEaseOutCubic(c);
}
export const DOME_ASSEMBLE_TOTAL_MS = TIER_ASSEMBLE_TOTAL_MS;

const domeEaseOutCubic = easeOutCubic;

export interface DomeTierRampAnchor {
  from: number;
  fromT: number;
}

const DOME_TIER_RAMP_START: DomeTierRampAnchor = { from: 0, fromT: 0 };

export const domeTierProgress: (clockMs: number, kind: DomeViewKind) => number = tierProgress;

export function setDomeFolding(runtime: DomeRuntime, folding: boolean): void {
  if (runtime.folding === folding) return;
  for (const kind of DOME_KINDS) {
    runtime.rampAnchor[kind] = { from: runtime.kindRamp[kind], fromT: domeTierProgress(runtime.rampClock, kind) };
  }
  runtime.folding = folding;
}

export function domeTierRamp(
  clockMs: number,
  kind: DomeViewKind,
  folding = false,
  anchor: DomeTierRampAnchor = DOME_TIER_RAMP_START,
): number {
  const t = domeTierProgress(clockMs, kind);
  if (folding) {
    if (anchor.fromT <= 0) return 0;
    const left = Math.min(1, t / anchor.fromT);
    return anchor.from * left * left * left;
  }
  if (anchor.fromT >= 1) return 1;
  const rise = Math.max(0, (t - anchor.fromT) / (1 - anchor.fromT));
  return anchor.from + (1 - anchor.from) * domeEaseOutCubic(rise);
}

/**
 * Draw, hit test, popover anchor and `__atlasMap` instrumentation read this one map, so
 * clicks follow where a node was drawn. Updated in place; no per-frame allocation once the
 * node set is stable.
 */
export interface DomeNodeFrame {
  dx: number;
  dy: number;
  /**
   * Inverted so base radius (radiusForKind × magnitudeScale) × s gives `DOME_NODE_PX` ×
   * perspective ÷ zoom; draw, hit and instrumentation all use base × s, so they agree.
   */
  s: number;
  /** This kind's assembly ramp, 0..1, the interpolator for crossfades (label, fog, width). */
  a: number;
  /** Normalised depth this frame, 0 near to 1 far; input to fog and line width. */
  u: number;
}

/** In place, with trig computed once per kind and node entries reused. */
export function updateDomeFrame(
  runtime: DomeRuntime,
  nodes: ReadonlyArray<{ id: string; kind: DomeViewKind; x: number; y: number }>,
  /** Denominator of the `s` inversion. */
  baseRadiusFor: (node: { id: string; kind: DomeViewKind }) => number,
  /** Read only while a morph is in flight. */
  nowMs = 0,
  /** Inverted through, so the drawn radius lands on `DOME_NODE_PX` screen pixels. */
  cameraScale = 1,
): void {
  const { model, frame } = runtime;
  // Ends itself the frame it reaches 1.
  let morphE = 1;
  const morph = runtime.morph;
  if (morph !== null) {
    const t = morph.durationMs <= 0 ? 1 : (nowMs - morph.startMs) / morph.durationMs;
    if (t >= 1) {
      runtime.morph = null;
    } else {
      morphE = domeEaseInOutCubic(t <= 0 ? 0 : t);
    }
  }
  const morphing = runtime.morph !== null;
  const morphCoord: DomeCoord = { px: 0, py: 0, pz: 0 };
  /** The target, or the eased blend from the previous model. */
  const coordFor = (id: string, target: DomeCoord): DomeCoord => {
    if (!morphing) return target;
    const from = morph!.fromCoords.get(id);
    if (!from) return target;
    morphCoord.px = from.px + (target.px - from.px) * morphE;
    morphCoord.py = from.py + (target.py - from.py) * morphE;
    morphCoord.pz = from.pz + (target.pz - from.pz) * morphE;
    return morphCoord;
  };
  /*
   * The entry sweep is an offset on the drawn pose only; writing `runtime.yaw/pitch` would
   * compete with idle spin, the orbit target and the pose tween with no rule for who wins.
   */
  const sweep = runtime.entryArmed ? domeEntrySweep(runtime.entryClock) : 0;
  const drawPitch = runtime.pitch + DOME_ENTRY_PITCH_LIFT * sweep;
  const drawYawOffset = -DOME_ENTRY_YAW_SWEEP * sweep;
  const cp = Math.cos(drawPitch);
  const sp = Math.sin(drawPitch);
  runtime.drawYaw = runtime.yaw + drawYawOffset;
  runtime.drawPitch = drawPitch;
  runtime.drawCosYaw = Math.cos(runtime.drawYaw);
  runtime.drawSinYaw = Math.sin(runtime.drawYaw);
  runtime.drawCosPitch = cp;
  runtime.drawSinPitch = sp;
  const trig: Record<DomeViewKind, [number, number]> = {
    project: [0, 0],
    domain: [0, 0],
    capability: [0, 0],
    element: [0, 0],
  };
  const ramp: Record<DomeViewKind, number> = { project: 0, domain: 0, capability: 0, element: 0 };
  for (const kind of DOME_KINDS) {
    const yawK = runtime.yaw + runtime.lag[kind] + drawYawOffset;
    trig[kind] = [Math.cos(yawK), Math.sin(yawK)];
    ramp[kind] = domeTierRamp(runtime.rampClock, kind, runtime.folding, runtime.rampAnchor[kind]);
    // Kept for `projectDomePlanePoint`, so the lit stage draws at its tier's exact pose.
    runtime.kindTrig[kind][0] = trig[kind][0];
    runtime.kindTrig[kind][1] = trig[kind][1];
    runtime.kindRamp[kind] = ramp[kind];
  }
  // Pass 1 projects and collects this frame's depth range and the drawn bbox, which anchors
  // the pan leash where the dome sits, or the elastic clamp drags it toward the 2D centre.
  let zMin = Infinity;
  let zMax = -Infinity;
  let bMinX = Infinity;
  let bMinY = Infinity;
  let bMaxX = -Infinity;
  let bMaxY = -Infinity;
  for (const node of nodes) {
    const coord = model.coords.get(node.id);
    if (!coord) {
      frame.delete(node.id);
      continue;
    }
    const [cy, sy] = trig[node.kind];
    const r = ramp[node.kind];
    // A tier at r=0 skips projection: offset 0 (not −0), factor 1, identical to 2D.
    const p = r > 0 ? projectWithTrig(model, coordFor(node.id, coord), cy, sy, cp, sp) : null;
    const dx = p === null ? 0 : (p.wx - node.x) * r;
    const dy = p === null ? 0 : (p.wy - node.y) * r;
    let s = 1;
    if (p !== null) {
      const baseR = baseRadiusFor(node);
      /* Screen px → world → multiplier on the 2D base radius; `DOME_NODE_PX.project` is the cap. */
      const domeR = (DOME_NODE_PX[node.kind] * p.s) / (cameraScale > 0 ? cameraScale : 1);
      const target = baseR > 0 ? domeR / baseR : 1;
      s = 1 + (target - 1) * r;
    }
    if (p !== null) {
      if (p.z < zMin) zMin = p.z;
      if (p.z > zMax) zMax = p.z;
    }
    const drawnX = node.x + dx;
    const drawnY = node.y + dy;
    if (drawnX < bMinX) bMinX = drawnX;
    if (drawnX > bMaxX) bMaxX = drawnX;
    if (drawnY < bMinY) bMinY = drawnY;
    if (drawnY > bMaxY) bMaxY = drawnY;
    const entry = frame.get(node.id);
    if (entry) {
      entry.dx = dx;
      entry.dy = dy;
      entry.s = s;
      entry.a = r;
      entry.u = p === null ? 0 : p.z;
    } else {
      frame.set(node.id, { dx, dy, s, a: r, u: p === null ? 0 : p.z });
    }
  }
  /*
   * Rings project at the same pose as the nodes, torsion included, or they slide against
   * their tier during a drag. Ring z stays out of the normalisation range: a ring spans
   * angles with no nodes and would flatten the nodes' fog contrast.
   */
  // Cone bases from the model (the cloud has none); during a morph the old bases fade out
  // behind the new ones.
  let ringCount = 0;
  const sampleCircle = (circle: DomeCircle, alpha: number): void => {
    const { kind } = circle;
    const [cyK, syK] = trig[kind];
    let ring = runtime.rings[ringCount];
    if (!ring) {
      ring = { kind, a: 0, points: [], label: null };
      runtime.rings[ringCount] = ring;
    }
    ring.kind = kind;
    ring.a = ramp[kind] * alpha;
    const samples = domeRingSampleCount(circle.r);
    let rightmost = -1;
    for (let k = 0; k < samples; k++) {
      const theta = (k / samples) * TAU;
      ringCoord.px = circle.cx + Math.cos(theta) * circle.r;
      ringCoord.py = circle.y;
      ringCoord.pz = circle.cz + Math.sin(theta) * circle.r;
      const p = projectWithTrig(model, ringCoord, cyK, syK, cp, sp);
      const point = ring.points[k];
      if (point) {
        point.wx = p.wx;
        point.wy = p.wy;
        point.u = p.z;
      } else {
        ring.points[k] = { wx: p.wx, wy: p.wy, u: p.z };
      }
      if (rightmost < 0 || p.wx > ring.points[rightmost].wx) rightmost = k;
    }
    ring.points.length = samples;
    ring.label = circle.named === true && rightmost >= 0 ? ring.points[rightmost] : null;
    ringCount++;
  };
  for (const circle of model.circles) sampleCircle(circle, morphing ? morphE : 1);
  if (morphing) for (const circle of morph!.fromCircles) sampleCircle(circle, 1 - morphE);
  runtime.rings.length = ringCount;

  // Pass 2 normalises z to u; with no span, u is 0.
  const span = zMax - zMin;
  runtime.zMin = Number.isFinite(zMin) ? zMin : 0;
  runtime.zSpan = Number.isFinite(span) && span > 1e-9 ? span : 0;
  // The cloud reads depth more steeply so the front cluster reads.
  const cloud = model.arrangement === "coupling";
  if (Number.isFinite(span) && span > 1e-9) {
    for (const entry of frame.values()) {
      if (entry.a > 0) {
        const t = (entry.u - zMin) / span;
        entry.u = cloud ? Math.pow(t, CLOUD_DEPTH_GAMMA) : t;
      } else entry.u = 0;
    }
  } else {
    for (const entry of frame.values()) entry.u = 0;
  }
  // Rings read the same scale, clamped.
  if (Number.isFinite(span) && span > 1e-9) {
    for (const ring of runtime.rings) {
      for (const point of ring.points) {
        const t = (point.u - zMin) / span;
        point.u = t <= 0 ? 0 : t >= 1 ? 1 : t;
      }
    }
  } else {
    for (const ring of runtime.rings) for (const point of ring.points) point.u = 0;
  }
  runtime.drawnBounds = Number.isFinite(bMinX)
    ? { minX: bMinX, minY: bMinY, maxX: bMaxX, maxY: bMaxY }
    : null;
  runtime.frameEpoch++;
}

const DOME_KINDS: readonly DomeViewKind[] = ["project", "domain", "capability", "element"];

/** One per module, never per sample. */
const ringCoord: DomeCoord = { px: 0, py: 0, pz: 0 };

export interface DomePlaneSample {
  wx: number;
  wy: number;
  /** The nodes' scale this frame, clamped. */
  u: number;
}

/**
 * Projects a plane point at the pose `updateDomeFrame` drew that tier with (torsion, sweep
 * and normalisation included), so the lit stage never drifts from its nodes.
 */
export function projectDomePlanePoint(
  runtime: DomeRuntime,
  kind: DomeViewKind,
  px: number,
  pz: number,
  out: DomePlaneSample,
): void {
  const [cy, sy] = runtime.kindTrig[kind];
  ringCoord.px = px;
  ringCoord.py = DOME_PLANE[kind].y;
  ringCoord.pz = pz;
  const p = projectWithTrig(runtime.model, ringCoord, cy, sy, runtime.drawCosPitch, runtime.drawSinPitch);
  out.wx = p.wx;
  out.wy = p.wy;
  if (runtime.zSpan <= 0) {
    out.u = 0;
  } else {
    const t = (p.z - runtime.zMin) / runtime.zSpan;
    out.u = t <= 0 ? 0 : t >= 1 ? 1 : t;
  }
}

/** Fewer samples on small bases; the floor keeps the smallest round. */
export function domeRingSampleCount(r: number): number {
  return Math.max(12, Math.min(DOME_RING_SAMPLES, Math.round(r * 0.65)));
}

/** The camera tween's curve, shared by the morph. */
function domeEaseInOutCubic(t: number): number {
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/**
 * Call when a rebuild completes while the dome is on screen; `durationMs` 0 is a cut
 * (reduced motion).
 */
export function beginDomeMorph(runtime: DomeRuntime, next: DomeModel, nowMs: number, durationMs: number): void {
  const prev = runtime.model;
  runtime.model = next;
  runtime.morph =
    durationMs > 0
      ? { fromCoords: prev.coords, fromCircles: prev.circles, startMs: nowMs, durationMs }
      : null;
}

/**
 * The dome step runs only while 3D is on or tearing down, so anything in flight when 2D took
 * over stays frozen and the idle gate counts it as motion forever. Nothing is visible, so
 * this is a pure bookkeeping reset.
 */
export function settleDomeRuntimeOffscreen(runtime: DomeRuntime): void {
  runtime.yawVel = 0;
  runtime.pitchVel = 0;
  runtime.yawSnap = null;
  runtime.poseTween = null;
  runtime.morph = null;
  runtime.orbiting = false;
  runtime.drag = null;
  runtime.entryArmed = false;
  // A fly-to belongs to the 3D view it moved.
  runtime.flyRequest = null;
  runtime.nudgeReturn = null;
  runtime.flight = null;
  runtime.lag.project = 0;
  runtime.lag.domain = 0;
  runtime.lag.capability = 0;
  runtime.lag.element = 0;
  runtime.pitch = clampDomePitch(runtime.pitch);
  runtime.pitchTarget = runtime.pitch;
  runtime.yawTarget = runtime.yaw;
}

/**
 * Closed-form back-projection onto the plane at height py, so a dragged node stays on its
 * kind plane.
 */
export function solveDomePlanePoint(
  model: DomeModel,
  planeY: number,
  wx: number,
  wy: number,
  yaw: number,
  pitch: number,
): { px: number; pz: number } | null {
  const ux = (wx - model.centerX) / model.unit;
  const uy = (wy - model.centerY) / model.unit;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  // Solve uy = −(py·cp + zr·sp)·s, s = F/(F + (−py·sp + zr·cp)) for zr. Near the plane's
  // horizon denom → 0 and past it the solution flips behind the camera, so the magnitude is
  // floored on the side the viewpoint expects (the sign of sp): the node slides out to the
  // radius cap instead of freezing, from above or below.
  const rawDenom = DOME_FOCAL * sp + uy * cp;
  const denom =
    sp >= 0
      ? Math.max(rawDenom, DOME_PLANE_SOLVE_DENOM_MIN)
      : Math.min(rawDenom, -DOME_PLANE_SOLVE_DENOM_MIN);
  const zr = -(uy * (DOME_FOCAL - planeY * sp) + DOME_FOCAL * planeY * cp) / denom;
  const z2 = -planeY * sp + zr * cp;
  const s = DOME_FOCAL / Math.max(DOME_FOCAL + z2, DOME_FOCAL * 0.05);
  if (!Number.isFinite(s) || !Number.isFinite(zr)) return null;
  const x = ux / s;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  let px = x * cy + zr * sy;
  let pz = -x * sy + zr * cy;
  const r = Math.hypot(px, pz);
  if (r > DOME_DRAG_MAX_RADIUS) {
    const k = DOME_DRAG_MAX_RADIUS / r;
    px *= k;
    pz *= k;
  }
  return { px, pz };
}

/** Keeps it from collapsing to edge-on or plan view. */
export function clampDomePitch(pitch: number): number {
  return Math.min(DOME_PITCH_MAX, Math.max(DOME_PITCH_MIN, pitch));
}

/**
 * Past the limit at quarter resistance, like iOS scroll bounds; on release the loop returns
 * exponentially to `clampDomePitch`.
 */
export function resistDomePitch(pitch: number): number {
  if (pitch > DOME_PITCH_MAX)
    return DOME_PITCH_MAX + Math.min(DOME_PITCH_OVERSHOOT_CAP, (pitch - DOME_PITCH_MAX) * 0.25);
  if (pitch < DOME_PITCH_MIN)
    return DOME_PITCH_MIN - Math.min(DOME_PITCH_OVERSHOOT_CAP, (DOME_PITCH_MIN - pitch) * 0.25);
  return pitch;
}

/** Geometric decay per ms, so the feel is dt-independent. */
export function decayOrbitVelocity(velRadPerMs: number, dtMs: number): number {
  const v = velRadPerMs * Math.pow(ORBIT_VEL_DECAY_PER_MS, dtMs);
  return Math.abs(v) < ORBIT_VEL_EPS ? 0 : v;
}

/**
 * Semi-implicit critically damped spring, so a dragged node follows as if it had mass and
 * settles on the last pointer target. `angFreq` is `--map-camera-spring-angfreq-interactive`.
 */
export interface DomeDragSpring {
  px: number;
  pz: number;
  vx: number;
  vz: number;
}

export function stepDomeDragSpring(
  spring: DomeDragSpring,
  targetPx: number,
  targetPz: number,
  dtMs: number,
  angFreq: number,
): void {
  const dt = Math.min(dtMs, 64) / 1000;
  const ax = angFreq * angFreq * (targetPx - spring.px) - 2 * angFreq * spring.vx;
  const az = angFreq * angFreq * (targetPz - spring.pz) - 2 * angFreq * spring.vz;
  spring.vx += ax * dt;
  spring.vz += az * dt;
  spring.px += spring.vx * dt;
  spring.pz += spring.vz * dt;
}

/** Input to 3D fit view. */
export function domeWorldBounds(
  model: DomeModel,
  yaw: number,
  pitch: number,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const coord of model.coords.values()) {
    const p = projectDomeCoord(model, coord, yaw, pitch);
    if (p.wx < minX) minX = p.wx;
    if (p.wx > maxX) maxX = p.wx;
    if (p.wy < minY) minY = p.wy;
    if (p.wy > maxY) maxY = p.wy;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * The `allowancePx` argument pads each centre by its disc. The 3D fit asks it of the right-edge chrome
 * before the drawing uses that column.
 */
export function domeReachesRect(
  model: DomeModel,
  yaw: number,
  pitch: number,
  target: { tx: number; ty: number; tscale: number },
  viewportWidth: number,
  viewportHeight: number,
  rect: { left: number; right: number; top: number; bottom: number },
  allowancePx: number,
): boolean {
  for (const coord of model.coords.values()) {
    const p = projectDomeCoord(model, coord, yaw, pitch);
    const x = (p.wx - target.tx) * target.tscale + viewportWidth / 2;
    const y = (p.wy - target.ty) * target.tscale + viewportHeight / 2;
    if (
      x + allowancePx > rect.left &&
      x - allowancePx < rect.right &&
      y + allowancePx > rect.top &&
      y - allowancePx < rect.bottom
    ) {
      return true;
    }
  }
  return false;
}

/** Keeps a programmatic rotation from taking the long way round. */
export function domeNearestYawTurn(target: number, current: number): number {
  return target + Math.round((current - target) / TAU) * TAU;
}

/**
 * Brings the node to the front, where depth `r·sin(yaw + θ)` is minimal (yaw + θ = −π/2),
 * the short way. A far-side node would otherwise grow under zoom yet stay hidden.
 */
export function domeFocusYaw(coord: DomeCoord, currentYaw: number): number {
  const r = Math.hypot(coord.px, coord.pz);
  // On the axis there is no bearing and no reason to rotate.
  if (r < 1e-6) return currentYaw;
  const theta = Math.atan2(coord.pz, coord.px);
  return domeNearestYawTurn(-Math.PI / 2 - theta, currentYaw);
}

/** Ids missing from the model are skipped. */
export function domeEgoWorldBounds(
  model: DomeModel,
  ids: Iterable<string>,
  yaw: number,
  pitch: number,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of ids) {
    const coord = model.coords.get(id);
    if (!coord) continue;
    const p = projectDomeCoord(model, coord, yaw, pitch);
    if (p.wx < minX) minX = p.wx;
    if (p.wx > maxX) maxX = p.wx;
    if (p.wy < minY) minY = p.wy;
    if (p.wy > maxY) maxY = p.wy;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * Shares the camera tween's ease-in-out clock and is dropped the instant a gesture begins,
 * so the gesture takes over from the current pose.
 */
interface DomePoseTween {
  startYaw: number;
  startPitch: number;
  targetYaw: number;
  targetPitch: number;
  /** The camera tween's clock. */
  startMs: number;
  durationMs: number;
  /** So pose and camera decelerate on one curve. */
  ease?: "out";
}

/**
 * A double-click or Enter flies a node to the front and frames its family; Esc or Home
 * flies back. A single click only selects, so the viewpoint stays the reader's. Longer
 * than `DOME_POSE_MS` because it pairs a turn with a zoom; reduced motion arrives at once.
 */
export const DOME_FLY_MS = 800;

interface DomeFlight {
  slug: string;
  returnYaw: number;
  returnPitch: number;
  returnCamera: { tx: number; ty: number; tscale: number };
}

/** Normalised like `DomeNodeFrame`, or equal depths would draw at different brightness. */
interface DomeRingSample {
  wx: number;
  wy: number;
  u: number;
}

interface DomeRing {
  kind: DomeViewKind;
  /** Rings rise and fall with their tier across the 2D↔3D transition. */
  a: number;
  points: DomeRingSample[];
  /**
   * The screen-rightmost sample, stable under rotation and on the side the index panel never
   * covers; null for cone bases, which carry no name.
   */
  label: DomeRingSample | null;
}

/**
 * Each parent's base circle drawn as a ring, which makes the tree read as cones: bases on
 * the kind planes show height as a fact, an ellipse's flatness and front arc show pitch and
 * yaw, brightness round the ring shows depth, and a base under a parent makes ownership a
 * shape. A coordinate system, not data, so its ink is the lowest tier.
 */

/** At 96 the domain ring's chord-arc error stays under 0.1 dome units, so it never looks faceted. */
export const DOME_RING_SAMPLES = 96;

/** Kept low so the coordinate system never competes with the data. */
export const DOME_RING_ALPHA = 0.34;

/** The depth width attenuation multiplies straight into it. */
export const DOME_RING_WIDTH_PX = 1;

/**
 * Frames between one model and the next when the arrangement or world changes on screen:
 * each node draws at `lerp(from, to, ease(t))`, one without a previous coordinate takes its
 * target, and old bases fade out as new ones fade in. `DOME_POSE_MS` long, so a refit runs
 * on the same clock; reduced motion passes 0 and gets the cut.
 */
interface DomeMorph {
  fromCoords: ReadonlyMap<string, DomeCoord>;
  fromCircles: readonly DomeCircle[];
  startMs: number;
  durationMs: number;
}

/**
 * The one state box the loop (`use-topology-loop.ts`) updates each frame; pointer handlers
 * and instrumentation read this frame's coordinates and pose from it, and gestures decide
 * through the same `hitTestWorld` as 2D.
 */
export interface DomeRuntime {
  model: DomeModel;
  /** The idle gate counts a morph as motion. */
  morph: DomeMorph | null;
  /** Updated in place by `updateDomeFrame`; entries and arrays are reused. */
  rings: DomeRing[];
  /**
   * A pending fly-to: a slug flies to that node, null flies back; consumed by the next dome
   * frame. `nudge` is the one camera move a click may make: slide sideways just enough that
   * the inspector it opened does not cover the selected node.
   */
  flyRequest: { slug: string | null; nudge?: true; unnudge?: true } | null;
  /**
   * A deselect slides back to `before` only while the target still equals `landed`, so a
   * view the reader moved since is never taken; without the return a nudge could leave the
   * next concept under the INDEX panel.
   */
  nudgeReturn: { before: { tx: number; ty: number; tscale: number }; landed: { tx: number; ty: number; tscale: number } } | null;
  /** null when no fly-to has moved the view. */
  flight: DomeFlight | null;
  /** Read by `projectDomePlanePoint`. */
  kindTrig: Record<DomeViewKind, [number, number]>;
  /** The lit stage rises with its tier. */
  kindRamp: Record<DomeViewKind, number>;
  /** `u = (z − zMin) / zSpan`; zSpan 0 means no depth. */
  zMin: number;
  zSpan: number;
  /** Hit testing and instrumentation judge against it. */
  frame: Map<string, DomeNodeFrame>;
  /**
   * Anchors the pan leash where the dome is drawn; the 2D bounds sat off the fit's centre and
   * dragged the camera on the first wheel tick. null when the frame is empty.
   */
  drawnBounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  /**
   * The factor that frames the whole dome with 15% margin. While the dome is on, the camera
   * floor drops to it, so a fit target below the 2D floor stays reachable and zoom-out can
   * return to the whole dome. null = dome off.
   */
  fitScale: number | null;
  /** Invalidates the edge candidate cache, since entries update in place. */
  frameEpoch: number;
  yaw: number;
  pitch: number;
  /**
   * Pointer events set it and the loop relaxes yaw and pitch toward it
   * at `ORBIT_SMOOTH_TAU_MS`; outside a drag it tracks yaw.
   */
  yawTarget: number;
  pitchTarget: number;
  /** Release momentum in rad/ms, reduced every frame by `decayOrbitVelocity`. */
  yawVel: number;
  /** Pitch release momentum in rad/ms, the same decay. */
  pitchVel: number;
  /**
   * The meaningful landing the release momentum is aimed at (see `ORBIT_SNAP_WINDOW_RAD`), or
   * null; any new input clears it.
   */
  yawSnap: number | null;
  /**
   * Idle spin belongs to a screen nobody has touched: any intervention disarms it for good,
   * so rotation never fights the pose being worked on. Only the auto-align chip and
   * re-entering 3D re-arm it.
   */
  spinArmed: boolean;
  /** Any gesture clears it and inherits the current pose. */
  poseTween: DomePoseTween | null;
  /** Per-kind yaw torsion in rad, charged by orbit drag and decayed every frame. */
  lag: Record<DomeViewKind, number>;
  /** Assembly clock in ms, 0 to `DOME_ASSEMBLE_TOTAL_MS`: forward on, backward off. */
  rampClock: number;
  folding: boolean;
  rampAnchor: Record<DomeViewKind, DomeTierRampAnchor>;
  /**
   * Off the moment a hand touches the map: the sweep offsets only the drawn pose, so a grab
   * would back-project against a different pose and the node would jump.
   */
  entryArmed: boolean;
  /** Entry sweep clock in ms, from 0 on every re-entry. */
  entryClock: number;
  /**
   * Holds `yaw/pitch` plus the sweep offset, written every frame; relation control points read it,
   * or during entry a curve would pass through a different world than its endpoints.
   */
  drawYaw: number;
  drawPitch: number;
  /** Computed once per frame, since control points are computed per edge. */
  drawCosYaw: number;
  drawSinYaw: number;
  drawCosPitch: number;
  drawSinPitch: number;
  /** 3D is on and no realm is active: the branch between orbit and in-plane drag. */
  active: boolean;
  /** Stops idle spin and momentum. */
  orbiting: boolean;
  /** Survives `released` until the spring settles, keeping velocity continuous. */
  drag: { nodeId: string; spring: DomeDragSpring; targetPx: number; targetPz: number; released?: boolean } | null;
}

export function createDomeRuntime(model: DomeModel): DomeRuntime {
  return {
    model,
    morph: null,
    frame: new Map(),
    rings: [],
    flyRequest: null,
    nudgeReturn: null,
    flight: null,
    kindTrig: { project: [1, 0], domain: [1, 0], capability: [1, 0], element: [1, 0] },
    kindRamp: { project: 0, domain: 0, capability: 0, element: 0 },
    zMin: 0,
    zSpan: 0,
    drawnBounds: null,
    fitScale: null,
    frameEpoch: 0,
    yaw: 0.55,
    pitch: DOME_PITCH_DEFAULT,
    yawTarget: 0.55,
    pitchTarget: DOME_PITCH_DEFAULT,
    yawVel: 0,
    pitchVel: 0,
    spinArmed: true,
    poseTween: null,
    yawSnap: null,
    entryArmed: true,
    entryClock: 0,
    drawYaw: 0,
    drawPitch: DOME_PITCH_DEFAULT,
    drawCosYaw: 1,
    drawSinYaw: 0,
    drawCosPitch: Math.cos(DOME_PITCH_DEFAULT),
    drawSinPitch: Math.sin(DOME_PITCH_DEFAULT),
    lag: { project: 0, domain: 0, capability: 0, element: 0 },
    rampClock: 0,
    folding: false,
    rampAnchor: {
      project: DOME_TIER_RAMP_START,
      domain: DOME_TIER_RAMP_START,
      capability: DOME_TIER_RAMP_START,
      element: DOME_TIER_RAMP_START,
    },
    active: false,
    orbiting: false,
    drag: null,
  };
}
