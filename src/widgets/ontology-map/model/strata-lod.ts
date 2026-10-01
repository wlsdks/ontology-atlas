import { smoothstep } from "./altitude";
import {
  DOME_NODE_PX,
  DOME_PLANE,
  projectDomePlanePoint,
  type DomeModel,
  type DomeNodeFrame,
  type DomePlaneSample,
  type DomeRuntime,
  type DomeViewKind,
} from "./dome-view";

export type StrataLodPlane = "capability" | "element";

const STRATA_LOD_PLANES: readonly StrataLodPlane[] = ["capability", "element"];

export const STRATA_LOD_AGGREGATE_RATIO = 0.5;
export const STRATA_LOD_RESOLVE_RATIO = 0.9;
export const STRATA_LOD_DISC_BUDGET_LOW = 1500;
export const STRATA_LOD_DISC_BUDGET_HIGH = 3000;
const STRATA_LOD_PICK_RADIUS_PX = 6;
export const STRATA_LOD_MAX_STEP_MS = 1000 / 60;

const TAU = Math.PI * 2;
const ARC_SAMPLES_PER_TURN = 96;
const ARC_LANE_FILL = 0.828;
const BAND_INNER = 0.6;
const BAND_OUTER = 0.965;
const SHEET_GAP_SHARE = 0.08;
const VISIBILITY_SAMPLES = 32;
const DOMAIN_SEARCH_HOPS = 8;

interface LodNode {
  id: string;
  kind: DomeViewKind;
  parentId: string | null;
}

interface StrataLodSpan {
  lo: number;
  hi: number;
  count: number;
}

interface StrataLodDomain {
  slot: number;
  nodeIndex: number;
  from: number;
  to: number;
  capability: StrataLodSpan | null;
  element: StrataLodSpan | null;
  direct: StrataLodSpan | null;
}

export interface StrataLodIndex {
  world: unknown;
  model: DomeModel;
  domainIds: readonly string[];
  indexOf: ReadonlyMap<string, number>;
  kindOf: readonly DomeViewKind[];
  domainSlotOf: Int32Array;
  domains: readonly StrataLodDomain[];
  planeCount: Readonly<Record<StrataLodPlane, number>>;
  planeGap: Readonly<Record<StrataLodPlane, number>>;
}

type StrataLodShapeKind = "fan" | "curtain" | "direct";

interface StrataLodShape {
  kind: StrataLodShapeKind;
  slot: number;
  xs: number[];
  ys: number[];
  length: number;
  x0: number;
  y0: number;
  u0: number;
  x1: number;
  y1: number;
  u1: number;
  weight: number;
  depth: number;
}

interface StrataLodRegion {
  slot: number;
  xs: number[];
  ys: number[];
  length: number;
  depth: number;
}

interface StrataLodView {
  runtime: DomeRuntime;
  world: { nodes: readonly (LodNode & { x: number; y: number })[] };
  camera: StrataLodCamera;
}

export interface StrataLodState {
  index: StrataLodIndex | null;
  ramps: Float32Array;
  planeResolve: Record<StrataLodPlane, number>;
  spacingPx: Record<StrataLodPlane, number>;
  hub: { x: number; y: number };
  presence: Float32Array;
  hoverSlot: number;
  pointerSlot: number;
  pickedAt: { x: number; y: number } | null;
  focusSlot: number;
  settling: boolean;
  active: boolean;
  primed: boolean;
  view: StrataLodView | null;
  lastCamera: { x: number; y: number; scale: number } | null;
  frames: (DomeNodeFrame | undefined)[];
  framesOf: unknown;
  framesNodes: unknown;
  framesSize: number;
  shapes: StrataLodShape[];
  shapeCount: number;
  regions: StrataLodRegion[];
  regionCount: number;
}

export function createStrataLodState(): StrataLodState {
  return {
    index: null,
    ramps: new Float32Array(0),
    planeResolve: { capability: 1, element: 1 },
    spacingPx: { capability: Infinity, element: Infinity },
    hub: { x: 0, y: 0 },
    presence: new Float32Array(0),
    hoverSlot: -1,
    pointerSlot: -1,
    pickedAt: null,
    focusSlot: -1,
    settling: false,
    active: false,
    primed: false,
    view: null,
    lastCamera: null,
    frames: [],
    framesOf: null,
    framesNodes: null,
    framesSize: -1,
    shapes: [],
    shapeCount: 0,
    regions: [],
    regionCount: 0,
  };
}

function unwrapFrom(angle: number, from: number): number {
  let d = (angle - from) % TAU;
  if (d < 0) d += TAU;
  return from + d;
}

function widen(span: StrataLodSpan | null, bearing: number): StrataLodSpan {
  if (span === null) return { lo: bearing, hi: bearing, count: 1 };
  if (bearing < span.lo) span.lo = bearing;
  if (bearing > span.hi) span.hi = bearing;
  span.count += 1;
  return span;
}

function medianLaneGap(coords: readonly { px: number; pz: number }[]): number {
  const lanes = new Map<number, number[]>();
  for (const c of coords) {
    const r = Math.hypot(c.px, c.pz);
    const key = Math.round(r * 10);
    const list = lanes.get(key);
    const bearing = Math.atan2(c.pz, c.px);
    if (list) list.push(bearing);
    else lanes.set(key, [bearing]);
  }
  const gaps: number[] = [];
  for (const [key, bearings] of lanes) {
    if (bearings.length < 2) continue;
    const r = key / 10;
    bearings.sort((a, b) => a - b);
    for (let i = 1; i < bearings.length; i += 1) gaps.push(r * (bearings[i] - bearings[i - 1]));
    gaps.push(r * (bearings[0] + TAU - bearings[bearings.length - 1]));
  }
  if (gaps.length === 0) return Infinity;
  gaps.sort((a, b) => a - b);
  return gaps[gaps.length >> 1];
}

export function buildStrataLodIndex(world: { nodes: readonly LodNode[] }, model: DomeModel): StrataLodIndex {
  const nodes = world.nodes;
  const indexOf = new Map<string, number>();
  nodes.forEach((node, i) => indexOf.set(node.id, i));
  const kindOf = nodes.map((node) => node.kind);

  const domainIds: string[] = [];
  const slotOfDomain = new Map<string, number>();
  for (const node of nodes) {
    if (node.kind !== "domain") continue;
    slotOfDomain.set(node.id, domainIds.length);
    domainIds.push(node.id);
  }

  const domainSlotOf = new Int32Array(nodes.length).fill(-1);
  for (let i = 0; i < nodes.length; i += 1) {
    let cursor: string | null = nodes[i].id;
    for (let hop = 0; cursor !== null && hop < DOMAIN_SEARCH_HOPS; hop += 1) {
      const slot = slotOfDomain.get(cursor);
      if (slot !== undefined) {
        domainSlotOf[i] = slot;
        break;
      }
      const at = indexOf.get(cursor);
      cursor = at === undefined ? null : nodes[at].parentId;
    }
  }

  const sectorOf = new Map<string, { from: number; to: number }>();
  for (const sector of model.sectors) if (sector.kind === "domain") sectorOf.set(sector.id, sector);

  const domains: StrataLodDomain[] = domainIds.map((id, slot) => {
    const sector = sectorOf.get(id);
    return {
      slot,
      nodeIndex: indexOf.get(id) ?? -1,
      from: sector?.from ?? 0,
      to: sector?.to ?? 0,
      capability: null,
      element: null,
      direct: null,
    };
  });

  const planeCoords: Record<StrataLodPlane, { px: number; pz: number }[]> = { capability: [], element: [] };
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (node.kind !== "capability" && node.kind !== "element") continue;
    const coord = model.coords.get(node.id);
    if (!coord) continue;
    planeCoords[node.kind].push(coord);
    const slot = domainSlotOf[i];
    if (slot < 0) continue;
    const domain = domains[slot];
    if (domain.to - domain.from <= 1e-9) continue;
    const bearing = unwrapFrom(Math.atan2(coord.pz, coord.px), domain.from);
    if (bearing > domain.to + 1e-6) continue;
    if (node.kind === "capability") {
      domain.capability = widen(domain.capability, bearing);
    } else {
      domain.element = widen(domain.element, bearing);
      if (node.parentId === domainIds[slot]) domain.direct = widen(domain.direct, bearing);
    }
  }

  return {
    world,
    model,
    domainIds,
    indexOf,
    kindOf,
    domainSlotOf,
    domains,
    planeCount: { capability: planeCoords.capability.length, element: planeCoords.element.length },
    planeGap: { capability: medianLaneGap(planeCoords.capability), element: medianLaneGap(planeCoords.element) },
  };
}

export function strataPlaneResolve(
  gapUnits: number,
  pxPerUnit: number,
  kind: StrataLodPlane,
  onScreenCount: number,
): number {
  if (!Number.isFinite(gapUnits)) return 1;
  const ratio = (gapUnits * pxPerUnit) / (2 * DOME_NODE_PX[kind]);
  const density = smoothstep(STRATA_LOD_AGGREGATE_RATIO, STRATA_LOD_RESOLVE_RATIO, ratio);
  const budget = 1 - smoothstep(STRATA_LOD_DISC_BUDGET_LOW, STRATA_LOD_DISC_BUDGET_HIGH, onScreenCount);
  return Math.min(density, budget);
}

const sample: DomePlaneSample = { wx: 0, wy: 0, u: 0 };

interface StrataLodCamera {
  x: number;
  y: number;
  scale: number;
  width: number;
  height: number;
}

function toScreenX(camera: StrataLodCamera, wx: number): number {
  return (wx - camera.x) * camera.scale + camera.width / 2;
}

function toScreenY(camera: StrataLodCamera, wy: number): number {
  return (wy - camera.y) * camera.scale + camera.height / 2;
}

function visibleShare(runtime: DomeRuntime, kind: StrataLodPlane, camera: StrataLodCamera): number {
  const r = DOME_PLANE[kind].r * ARC_LANE_FILL;
  let inside = 0;
  for (let k = 0; k < VISIBILITY_SAMPLES; k += 1) {
    const theta = (k / VISIBILITY_SAMPLES) * TAU;
    projectDomePlanePoint(runtime, kind, Math.cos(theta) * r, Math.sin(theta) * r, sample);
    const x = toScreenX(camera, sample.wx);
    const y = toScreenY(camera, sample.wy);
    if (x >= 0 && x <= camera.width && y >= 0 && y <= camera.height) inside += 1;
  }
  return inside / VISIBILITY_SAMPLES;
}

function pointInPolygon(xs: readonly number[], ys: readonly number[], length: number, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = length - 1; i < length; j = i, i += 1) {
    const yi = ys[i];
    const yj = ys[j];
    if (yi > y !== yj > y && x < ((xs[j] - xs[i]) * (y - yi)) / (yj - yi) + xs[i]) inside = !inside;
  }
  return inside;
}

function framesFor(state: StrataLodState, runtime: DomeRuntime, world: { nodes: readonly LodNode[] }): (DomeNodeFrame | undefined)[] {
  if (state.framesOf !== runtime.frame || state.framesNodes !== world.nodes || state.framesSize !== runtime.frame.size) {
    state.frames.length = world.nodes.length;
    for (let i = 0; i < world.nodes.length; i += 1) state.frames[i] = runtime.frame.get(world.nodes[i].id);
    state.framesOf = runtime.frame;
    state.framesNodes = world.nodes;
    state.framesSize = runtime.frame.size;
  }
  return state.frames;
}

export function pickStrataLodSlot(state: StrataLodState, x: number, y: number): number {
  const index = state.index;
  const view = state.view;
  if (index === null || view === null || !state.active) return -1;
  const { world, camera } = view;
  const frames = framesFor(state, view.runtime, world);
  let best = -1;
  let bestD2 = STRATA_LOD_PICK_RADIUS_PX * STRATA_LOD_PICK_RADIUS_PX;
  for (let i = 0; i < world.nodes.length; i += 1) {
    const slot = index.domainSlotOf[i];
    if (slot < 0) continue;
    const kind = index.kindOf[i];
    if (kind !== "capability" && kind !== "element") continue;
    const frame = frames[i];
    if (frame === undefined || frame.a <= 0.01) continue;
    const node = world.nodes[i];
    const dx = toScreenX(camera, node.x + frame.dx) - x;
    const dy = toScreenY(camera, node.y + frame.dy) - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = slot;
    }
  }
  if (best >= 0) return best;
  let bestDepth = Infinity;
  for (let i = 0; i < state.shapeCount; i += 1) {
    const shape = state.shapes[i];
    if (shape.depth >= bestDepth) continue;
    if (!pointInPolygon(shape.xs, shape.ys, shape.length, x, y)) continue;
    best = shape.slot;
    bestDepth = shape.depth;
  }
  return best;
}

export interface StrataLodInput {
  runtime: DomeRuntime;
  world: { nodes: readonly (LodNode & { x: number; y: number })[] };
  camera: StrataLodCamera;
  hoveredId: string | null;
  focusedId: string | null;
  pointer: { x: number; y: number } | null;
  evidence?: ReadonlyMap<string, "current" | "stale" | "unknown"> | null;
  dtMs: number;
  fadeMs: number;
}

export function stepStrataLod(state: StrataLodState, input: StrataLodInput): StrataLodState {
  const { runtime, world, camera } = input;
  let index = state.index;
  if (index === null || index.model !== runtime.model || !sameNodes(index, world.nodes)) {
    const previous = index;
    index = buildStrataLodIndex(world, runtime.model);
    state.index = index;
    const sameDomains =
      previous !== null &&
      previous.domainIds.length === index.domainIds.length &&
      previous.domainIds.every((id, i) => id === index!.domainIds[i]);
    if (!sameDomains) state.ramps = new Float32Array(index.domainIds.length);
  } else if (index.world !== world) {
    index.world = world;
  }
  if (state.presence.length !== world.nodes.length) state.presence = new Float32Array(world.nodes.length);
  state.view = { runtime, world, camera };

  const dtMs = Math.min(Math.max(0, input.dtMs), STRATA_LOD_MAX_STEP_MS);
  const step = input.fadeMs > 0 ? dtMs / input.fadeMs : 1;
  let settling = false;
  const pxPerUnit = runtime.model.unit * camera.scale;
  const assembled = runtime.kindRamp.capability >= 1 && runtime.kindRamp.element >= 1;
  for (const plane of STRATA_LOD_PLANES) {
    const count = index.planeCount[plane];
    const onScreen = count === 0 ? 0 : count * visibleShare(runtime, plane, camera);
    const target = count === 0 ? 1 : strataPlaneResolve(index.planeGap[plane], pxPerUnit, plane, onScreen);
    const current = state.primed ? state.planeResolve[plane] : assembled ? 1 : target;
    const next = target > current ? Math.min(target, current + step) : Math.max(target, current - step);
    state.planeResolve[plane] = next;
    if (next !== target) settling = true;
    state.spacingPx[plane] = index.planeGap[plane] * pxPerUnit;
  }
  state.primed = true;
  state.active = state.planeResolve.capability < 1 || state.planeResolve.element < 1;
  projectDomePlanePoint(runtime, "domain", 0, 0, sample);
  state.hub.x = toScreenX(camera, sample.wx);
  state.hub.y = toScreenY(camera, sample.wy);

  const slotOf = (id: string | null): number => {
    if (id === null) return -1;
    const at = index!.indexOf.get(id);
    return at === undefined ? -1 : index!.domainSlotOf[at];
  };
  const pointer = input.pointer;
  const last = state.lastCamera;
  const cameraMoved =
    last === null ||
    Math.abs(last.x - camera.x) * camera.scale > 0.25 ||
    Math.abs(last.y - camera.y) * camera.scale > 0.25 ||
    Math.abs(last.scale - camera.scale) > camera.scale * 1e-3;
  state.lastCamera = { x: camera.x, y: camera.y, scale: camera.scale };
  const domeMoving =
    runtime.orbiting ||
    runtime.drag !== null ||
    runtime.yawVel !== 0 ||
    runtime.pitchVel !== 0 ||
    runtime.yawSnap !== null ||
    runtime.poseTween !== null ||
    runtime.morph !== null;
  if (pointer === null || !state.active) {
    state.pointerSlot = -1;
    state.pickedAt = null;
  } else {
    const moved = state.pickedAt === null || state.pickedAt.x !== pointer.x || state.pickedAt.y !== pointer.y;
    if (moved && !domeMoving && !cameraMoved) {
      state.pointerSlot = pickStrataLodSlot(state, pointer.x, pointer.y);
      state.pickedAt = { x: pointer.x, y: pointer.y };
    }
  }
  const hovered = slotOf(input.hoveredId);
  state.hoverSlot = state.active ? (hovered >= 0 ? hovered : state.pointerSlot) : -1;
  state.focusSlot = state.active ? slotOf(input.focusedId) : -1;

  for (let slot = 0; slot < state.ramps.length; slot += 1) {
    const target = slot === state.hoverSlot || slot === state.focusSlot ? 1 : 0;
    const current = state.ramps[slot];
    if (current === target) continue;
    const next = target > current ? Math.min(target, current + step) : Math.max(target, current - step);
    state.ramps[slot] = next;
    if (next !== target) settling = true;
  }
  state.settling = settling;

  writePresence(state, index, input.evidence ?? null);
  buildShapes(state, index, runtime, world, camera);
  return state;
}

function writePresence(
  state: StrataLodState,
  index: StrataLodIndex,
  evidence: ReadonlyMap<string, "current" | "stale" | "unknown"> | null,
): void {
  const presence = state.presence;
  const resolveCap = state.planeResolve.capability;
  const resolveEl = state.planeResolve.element;
  const nodes = (index.world as { nodes: readonly LodNode[] }).nodes;
  for (let i = 0; i < presence.length; i += 1) {
    const kind = index.kindOf[i];
    if (kind !== "capability" && kind !== "element") {
      presence[i] = 1;
      continue;
    }
    if (evidence !== null && evidence.get(nodes[i].id) !== "current") {
      presence[i] = 1;
      continue;
    }
    const plane = kind === "capability" ? resolveCap : resolveEl;
    const slot = index.domainSlotOf[i];
    presence[i] = slot < 0 ? plane : Math.max(plane, state.ramps[slot]);
  }
}

export function fadeStrataLodOut(
  state: StrataLodState,
  world: { nodes: readonly LodNode[] },
  dtMs: number,
  fadeMs: number,
  evidence: ReadonlyMap<string, "current" | "stale" | "unknown"> | null = null,
): boolean {
  const index = state.index;
  if (!state.active || index === null || !sameNodes(index, world.nodes) || state.presence.length !== world.nodes.length) {
    restStrataLod(state);
    return false;
  }
  const step = fadeMs > 0 ? Math.min(Math.max(0, dtMs), STRATA_LOD_MAX_STEP_MS) / fadeMs : 1;
  for (const plane of STRATA_LOD_PLANES) state.planeResolve[plane] = Math.min(1, state.planeResolve[plane] + step);
  for (let slot = 0; slot < state.ramps.length; slot += 1) state.ramps[slot] = Math.max(0, state.ramps[slot] - step);
  state.hoverSlot = -1;
  state.pointerSlot = -1;
  state.pickedAt = null;
  state.focusSlot = -1;
  state.shapeCount = 0;
  state.regionCount = 0;
  state.active = state.planeResolve.capability < 1 || state.planeResolve.element < 1;
  state.settling = state.active;
  if (!state.active) {
    restStrataLod(state);
    return false;
  }
  writePresence(state, index, evidence);
  return true;
}

function sameNodes(index: StrataLodIndex, nodes: readonly LodNode[]): boolean {
  if (nodes.length !== index.kindOf.length) return false;
  const previous = (index.world as { nodes: readonly LodNode[] }).nodes;
  if (previous === nodes) return true;
  for (let i = 0; i < nodes.length; i += 1) {
    const a = nodes[i];
    const b = previous[i];
    if (a.id !== b.id || a.kind !== b.kind || a.parentId !== b.parentId) return false;
  }
  return true;
}

function takeShape(state: StrataLodState, kind: StrataLodShapeKind, slot: number): StrataLodShape {
  let shape = state.shapes[state.shapeCount];
  if (!shape) {
    shape = { kind, slot, xs: [], ys: [], length: 0, x0: 0, y0: 0, u0: 0, x1: 0, y1: 0, u1: 0, weight: 0, depth: 0 };
    state.shapes[state.shapeCount] = shape;
  }
  shape.kind = kind;
  shape.slot = slot;
  shape.length = 0;
  state.shapeCount += 1;
  return shape;
}

function takeRegion(state: StrataLodState, slot: number): StrataLodRegion {
  let region = state.regions[state.regionCount];
  if (!region) {
    region = { slot, xs: [], ys: [], length: 0, depth: 0 };
    state.regions[state.regionCount] = region;
  }
  region.slot = slot;
  region.length = 0;
  region.depth = 0;
  state.regionCount += 1;
  return region;
}

interface PathLike {
  xs: number[];
  ys: number[];
  length: number;
}

function pushArc(
  path: PathLike,
  runtime: DomeRuntime,
  camera: StrataLodCamera,
  kind: StrataLodPlane,
  radius: number,
  from: number,
  to: number,
): number {
  const steps = Math.max(2, Math.ceil((Math.abs(to - from) / TAU) * ARC_SAMPLES_PER_TURN));
  let depth = 0;
  for (let k = 0; k <= steps; k += 1) {
    const theta = from + ((to - from) * k) / steps;
    projectDomePlanePoint(runtime, kind, Math.cos(theta) * radius, Math.sin(theta) * radius, sample);
    const i = path.length;
    path.xs[i] = toScreenX(camera, sample.wx);
    path.ys[i] = toScreenY(camera, sample.wy);
    path.length = i + 1;
    depth += sample.u;
  }
  return depth / (steps + 1);
}

function arcMid(runtime: DomeRuntime, kind: StrataLodPlane, radius: number, theta: number): DomePlaneSample {
  projectDomePlanePoint(runtime, kind, Math.cos(theta) * radius, Math.sin(theta) * radius, sample);
  return sample;
}

function inset(span: StrataLodSpan, domain: StrataLodDomain): { lo: number; hi: number } {
  const room = domain.to - domain.from;
  const lo = Math.max(span.lo, domain.from + room * SHEET_GAP_SHARE);
  const hi = Math.min(span.hi, domain.to - room * SHEET_GAP_SHARE);
  if (hi > lo) return { lo, hi };
  const mid = (span.lo + span.hi) / 2;
  const half = Math.max(1e-3, room * (0.5 - SHEET_GAP_SHARE) * 0.25);
  return { lo: mid - half, hi: mid + half };
}

function buildShapes(
  state: StrataLodState,
  index: StrataLodIndex,
  runtime: DomeRuntime,
  world: { nodes: readonly (LodNode & { x: number; y: number })[] },
  camera: StrataLodCamera,
): void {
  state.shapeCount = 0;
  state.regionCount = 0;
  if (!state.active) return;
  const rampCap = runtime.kindRamp.capability;
  const rampEl = runtime.kindRamp.element;
  const resolveCap = state.planeResolve.capability;
  const resolveEl = state.planeResolve.element;
  const capR = DOME_PLANE.capability.r * ARC_LANE_FILL;
  const elR = DOME_PLANE.element.r * ARC_LANE_FILL;

  for (const domain of index.domains) {
    const node = world.nodes[domain.nodeIndex];
    const frame = node ? runtime.frame.get(node.id) : undefined;
    if (!node || !frame || domain.to - domain.from <= 1e-9) continue;
    const ramp = state.ramps[domain.slot] ?? 0;
    const apexX = toScreenX(camera, node.x + frame.dx);
    const apexY = toScreenY(camera, node.y + frame.dy);

    for (const plane of STRATA_LOD_PLANES) {
      if (index.planeCount[plane] === 0) continue;
      const r = DOME_PLANE[plane].r;
      const region = takeRegion(state, domain.slot);
      let depth = pushArc(region, runtime, camera, plane, r * BAND_OUTER, domain.from, domain.to);
      depth += pushArc(region, runtime, camera, plane, r * BAND_INNER, domain.to, domain.from);
      region.depth = depth / 2;
    }

    if (domain.capability !== null) {
      const weight = rampCap * (1 - Math.max(resolveCap, ramp));
      const span = inset(domain.capability, domain);
      const shape = takeShape(state, "fan", domain.slot);
      shape.xs[0] = apexX;
      shape.ys[0] = apexY;
      shape.length = 1;
      const baseDepth = pushArc(shape, runtime, camera, "capability", capR, span.lo, span.hi);
      const mid = arcMid(runtime, "capability", capR, (span.lo + span.hi) / 2);
      shape.x0 = apexX;
      shape.y0 = apexY;
      shape.u0 = frame.u;
      shape.x1 = toScreenX(camera, mid.wx);
      shape.y1 = toScreenY(camera, mid.wy);
      shape.u1 = mid.u;
      shape.weight = weight;
      shape.depth = (frame.u + baseDepth) / 2;
    }

    if (domain.capability !== null && domain.element !== null) {
      const weight = rampEl * (1 - Math.max(Math.min(resolveCap, resolveEl), ramp));
      const top = inset(domain.capability, domain);
      const bottom = inset(domain.element, domain);
      const shape = takeShape(state, "curtain", domain.slot);
      const topDepth = pushArc(shape, runtime, camera, "capability", capR, top.lo, top.hi);
      const bottomDepth = pushArc(shape, runtime, camera, "element", elR, bottom.hi, bottom.lo);
      const upper = arcMid(runtime, "capability", capR, (top.lo + top.hi) / 2);
      shape.x0 = toScreenX(camera, upper.wx);
      shape.y0 = toScreenY(camera, upper.wy);
      shape.u0 = upper.u;
      const lower = arcMid(runtime, "element", elR, (bottom.lo + bottom.hi) / 2);
      shape.x1 = toScreenX(camera, lower.wx);
      shape.y1 = toScreenY(camera, lower.wy);
      shape.u1 = lower.u;
      shape.weight = weight;
      shape.depth = (topDepth + bottomDepth) / 2;
    }

    if (domain.direct !== null) {
      const weight = rampEl * (1 - Math.max(resolveEl, ramp));
      const span = inset(domain.direct, domain);
      const shape = takeShape(state, "direct", domain.slot);
      shape.xs[0] = apexX;
      shape.ys[0] = apexY;
      shape.length = 1;
      const baseDepth = pushArc(shape, runtime, camera, "element", elR, span.lo, span.hi);
      const mid = arcMid(runtime, "element", elR, (span.lo + span.hi) / 2);
      shape.x0 = apexX;
      shape.y0 = apexY;
      shape.u0 = frame.u;
      shape.x1 = toScreenX(camera, mid.wx);
      shape.y1 = toScreenY(camera, mid.wy);
      shape.u1 = mid.u;
      shape.weight = weight;
      shape.depth = (frame.u + baseDepth) / 2;
    }
  }
}

export function restStrataLod(state: StrataLodState): void {
  state.active = false;
  state.settling = false;
  state.primed = false;
  state.hoverSlot = -1;
  state.pointerSlot = -1;
  state.pickedAt = null;
  state.lastCamera = null;
  state.view = null;
  state.focusSlot = -1;
  state.shapeCount = 0;
  state.regionCount = 0;
  state.ramps.fill(0);
}

export interface StrataLodChords {
  slots: number;
  weight: Float64Array;
  count: Int32Array;
  represented: number;
  hidden: number;
}

export function createStrataLodChords(): StrataLodChords {
  return { slots: 0, weight: new Float64Array(0), count: new Int32Array(0), represented: 0, hidden: 0 };
}

export function rollUpStrataDependencies(
  chords: StrataLodChords,
  slots: number,
  domainSlotOf: Int32Array,
  edges: readonly { kind: string }[],
  sourceIndex: Int32Array,
  targetIndex: Int32Array,
  presenceOf: (nodeIndex: number) => number,
  rampOf: (nodeIndex: number) => number,
): void {
  if (chords.slots !== slots) {
    chords.slots = slots;
    chords.weight = new Float64Array(slots * slots);
    chords.count = new Int32Array(slots * slots);
  } else {
    chords.weight.fill(0);
    chords.count.fill(0);
  }
  chords.represented = 0;
  chords.hidden = 0;
  for (let e = 0; e < edges.length; e += 1) {
    if (edges[e].kind !== "depends") continue;
    const a = sourceIndex[e];
    const b = targetIndex[e];
    if (a < 0 || b < 0) continue;
    const weight = Math.min(rampOf(a), rampOf(b)) * (1 - Math.min(presenceOf(a), presenceOf(b)));
    if (weight <= 0.004) continue;
    const from = domainSlotOf[a];
    const to = domainSlotOf[b];
    if (from < 0 || to < 0 || from === to) {
      chords.hidden += 1;
      continue;
    }
    const key = from * slots + to;
    chords.weight[key] += weight;
    chords.count[key] += 1;
    chords.represented += 1;
  }
}
