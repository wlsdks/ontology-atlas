/**
 * **The lit Strata stage** — the floors the nodes stand on (2026-09-25, owner-approved
 * lit-hologram direction).
 *
 * Strata's four planes used to exist only as one hairline ring each. That was enough to say
 * "there are levels" and not enough to read a level off: the plane was an outline around empty
 * space, and "which domain owns this capability" had to be inferred from where the containment
 * line happened to run. The approved look makes the planes into floors:
 *
 * - **a translucent disc per tier**, filled with that kind's colour, so the level a node is on
 *   is the colour of the floor under it;
 * - **a faint polar grid** (two inner rings and twelve spokes) on the three lower discs, which
 *   is what makes a translucent disc read as a surface under perspective instead of a blur;
 * - **one sector band per domain** on the capability and element discs, alternating two
 *   strengths so neighbouring domains separate. The bands are not decoration: every node's
 *   bearing stays inside its domain's sector by construction (`buildStrataTargets`), so the
 *   band is the ownership fact the placement already proved, drawn where the eye looks for it.
 *   Under a focus the focused line's own sectors are lit instead.
 *
 * Everything here is **geometry only**: it samples plane points through
 * `projectDomePlanePoint` (the pose the nodes were drawn at, per-tier torsion included) into
 * reused arrays of world coordinates. Colours, fog and the canvas live in `render/dome-light.ts`.
 */
import {
  DOME_PLANE,
  projectDomePlanePoint,
  type DomePlaneSample,
  type DomeRuntime,
  type DomeSector,
  type DomeViewKind,
} from "./dome-view";

const TAU = Math.PI * 2;

/** A closed or open polyline in world 2D, with each point's normalised depth. */
interface StagePath {
  kind: DomeViewKind;
  /** Tier assembly ramp 0..1 — the stage rises and fades with its tier. */
  a: number;
  xs: number[];
  ys: number[];
  us: number[];
  length: number;
}

interface StageBand extends StagePath {
  /** The sector's owner — a domain, or a capability on the element plane. */
  ownerId: string;
  /** Alternate strength, so two neighbouring domains' bands do not fuse into one. */
  alt: boolean;
  /** Part of the focused line: drawn in the focus ink instead of the plane's own. */
  lit: boolean;
}

export interface StrataStage {
  /** One filled disc per plane, the rim of the plane ring. */
  discs: StagePath[];
  /** Polar grid rings — open paths on the domain, capability and element planes. */
  grid: StagePath[];
  /** Polar grid spokes — two points each. */
  spokes: StagePath[];
  bands: StageBand[];
}

/** Planes that carry a grid and bands — the project plane is a small cap with one node on it. */
const GRID_PLANES: readonly DomeViewKind[] = ["domain", "capability", "element"];
/** Inner grid rings as a share of the plane radius. */
const GRID_RING_FRACTIONS = [0.42, 0.7] as const;
/** Spokes per plane — every 30°. */
const GRID_SPOKES = 12;
/** Spokes start here (share of radius), so the centre is not a star of converging lines. */
const SPOKE_INNER = 0.18;
/**
 * The band's radial extent as a share of its plane's radius. Placed nodes sit on two lanes at
 * 0.738 and 0.918 (`STRATA_PLACED_FILL` × the stagger), so this annulus holds both lanes with a
 * margin and leaves the rim, where unparented nodes land, outside every domain's band.
 */
const BAND_INNER = 0.6;
const BAND_OUTER = 0.965;
/** Arc samples per full turn, for discs, grid rings and band arcs. */
const SAMPLES_PER_TURN = 72;
/** The project plane's disc radius — matches `STRATA_PROJECT_RING_R` in `dome-view.ts`. */
const PROJECT_DISC_R = 34;

const scratch: DomePlaneSample = { wx: 0, wy: 0, u: 0 };

function takePath<T extends StagePath>(list: T[], index: number, make: () => T): T {
  let path = list[index];
  if (!path) {
    path = make();
    list[index] = path;
  }
  path.length = 0;
  return path;
}

function push(path: StagePath, runtime: DomeRuntime, kind: DomeViewKind, px: number, pz: number): void {
  projectDomePlanePoint(runtime, kind, px, pz, scratch);
  const i = path.length;
  path.xs[i] = scratch.wx;
  path.ys[i] = scratch.wy;
  path.us[i] = scratch.u;
  path.length = i + 1;
}

function planeRadius(kind: DomeViewKind): number {
  return kind === "project" ? PROJECT_DISC_R : DOME_PLANE[kind].r;
}

function arc(
  path: StagePath,
  runtime: DomeRuntime,
  kind: DomeViewKind,
  radius: number,
  from: number,
  to: number,
): void {
  const steps = Math.max(2, Math.ceil((Math.abs(to - from) / TAU) * SAMPLES_PER_TURN));
  for (let k = 0; k <= steps; k += 1) {
    const theta = from + ((to - from) * k) / steps;
    push(path, runtime, kind, Math.cos(theta) * radius, Math.sin(theta) * radius);
  }
}

const emptyPath = (kind: DomeViewKind): StagePath => ({ kind, a: 0, xs: [], ys: [], us: [], length: 0 });

/**
 * Samples the whole stage for this frame into `out`, reusing its arrays. `litIds` names the
 * sectors of the focused line (a domain, and a capability under it) — their bands light and a
 * lit capability's own band is added on the element plane. Returns `out`.
 *
 * Only planes that carry nodes are drawn (the model's named circles), for the reason the rings
 * already give: a floor for a level this vault does not have would assert one.
 */
export function sampleStrataStage(
  runtime: DomeRuntime,
  litIds: ReadonlySet<string> | null,
  out: StrataStage,
): StrataStage {
  const planes = new Set<DomeViewKind>();
  for (const circle of runtime.model.circles) if (circle.named === true) planes.add(circle.kind);

  let discs = 0;
  let grid = 0;
  let spokes = 0;
  for (const kind of ["project", "domain", "capability", "element"] as const) {
    if (!planes.has(kind)) continue;
    const a = runtime.kindRamp[kind];
    if (a <= 0.01) continue;
    const r = planeRadius(kind);
    const disc = takePath(out.discs, discs++, () => emptyPath(kind));
    disc.kind = kind;
    disc.a = a;
    arc(disc, runtime, kind, r, 0, TAU);
    if (!GRID_PLANES.includes(kind)) continue;
    for (const fraction of GRID_RING_FRACTIONS) {
      const ring = takePath(out.grid, grid++, () => emptyPath(kind));
      ring.kind = kind;
      ring.a = a;
      arc(ring, runtime, kind, r * fraction, 0, TAU);
    }
    for (let s = 0; s < GRID_SPOKES; s += 1) {
      const theta = (s / GRID_SPOKES) * TAU;
      const spoke = takePath(out.spokes, spokes++, () => emptyPath(kind));
      spoke.kind = kind;
      spoke.a = a;
      push(spoke, runtime, kind, Math.cos(theta) * r * SPOKE_INNER, Math.sin(theta) * r * SPOKE_INNER);
      push(spoke, runtime, kind, Math.cos(theta) * r, Math.sin(theta) * r);
    }
  }
  out.discs.length = discs;
  out.grid.length = grid;
  out.spokes.length = spokes;

  let bands = 0;
  const domains: DomeSector[] = [];
  const capabilities: DomeSector[] = [];
  for (const sector of runtime.model.sectors) {
    if (sector.kind === "domain") domains.push(sector);
    else if (litIds !== null && litIds.has(sector.id)) capabilities.push(sector);
  }
  domains.sort((x, y) => x.from - y.from);
  const addBand = (sector: DomeSector, plane: DomeViewKind, alt: boolean, lit: boolean): void => {
    if (!planes.has(plane)) return;
    const a = runtime.kindRamp[plane];
    if (a <= 0.01 || sector.to - sector.from <= 1e-6) return;
    const r = planeRadius(plane);
    const band = takePath(out.bands, bands++, () => ({
      ...emptyPath(plane),
      ownerId: "",
      alt: false,
      lit: false,
    }));
    band.kind = plane;
    band.a = a;
    band.ownerId = sector.id;
    band.alt = alt;
    band.lit = lit;
    arc(band, runtime, plane, r * BAND_OUTER, sector.from, sector.to);
    arc(band, runtime, plane, r * BAND_INNER, sector.to, sector.from);
  };
  domains.forEach((sector, index) => {
    const lit = litIds !== null && litIds.has(sector.id);
    addBand(sector, "capability", index % 2 === 1, lit);
    addBand(sector, "element", index % 2 === 1, lit);
  });
  for (const sector of capabilities) addBand(sector, "element", false, true);
  out.bands.length = bands;
  return out;
}

export function createStrataStage(): StrataStage {
  return { discs: [], grid: [], spokes: [], bands: [] };
}
