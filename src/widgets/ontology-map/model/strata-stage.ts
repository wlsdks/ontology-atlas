/**
 * The lit Strata stage: a translucent disc per tier in its kind's colour, a faint polar
 * grid on the lower three so a disc reads as a surface under perspective, and one sector
 * band per domain on the capability and element discs. Every node's bearing stays in its
 * domain's sector (`buildStrataTargets`), so a band draws a proven ownership fact. Geometry
 * only, through `projectDomePlanePoint` into reused arrays; paint is `render/dome-light.ts`.
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

interface StagePath {
  kind: DomeViewKind;
  a: number;
  xs: number[];
  ys: number[];
  us: number[];
  length: number;
}

interface StageBand extends StagePath {
  /** A domain, or a capability on the element plane. */
  ownerId: string;
  /** So two neighbouring domains' bands do not fuse. */
  alt: boolean;
  lit: boolean;
}

export interface StrataStage {
  discs: StagePath[];
  grid: StagePath[];
  spokes: StagePath[];
  bands: StageBand[];
}

/** The project plane is a small cap with one node on it. */
const GRID_PLANES: readonly DomeViewKind[] = ["domain", "capability", "element"];
const GRID_RING_FRACTIONS = [0.42, 0.7] as const;
const GRID_SPOKES = 12;
/** So the centre is not a star of converging lines. */
const SPOKE_INNER = 0.18;
/**
 * Placed nodes sit on lanes at 0.738 and 0.918 (`STRATA_PLACED_FILL` × the stagger), so this
 * annulus holds both and leaves the rim, where unparented nodes land, outside every band.
 */
const BAND_INNER = 0.6;
const BAND_OUTER = 0.965;
const SAMPLES_PER_TURN = 72;
/** Matches `STRATA_PROJECT_RING_R` in `dome-view.ts`. */
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
 * The `litIds` set names the focused line's sectors, whose bands light. Only planes that carry
 * nodes get a floor, or it would assert a level this vault does not have.
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
