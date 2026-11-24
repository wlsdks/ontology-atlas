import type { Box, DialChordLight, DialEvidenceView, DialFrameInput, DialFrameResult, DialModel, DialPick, DialRowPick, Point } from "../../dial/dial-shapes";
import type { GraphAttention, GraphLineKind } from "../attention";
import { emptyArcPath, type ArcPath } from "../marks";
import type { GraphMotion } from "../motion";
import type { PlacedName } from "../names/placed-name";
import type { OpenedElements } from "../open";
import type { StarRoom } from "../open-star";
import type { FlatGraphLayout, FlatGraphPaintTokens, FlatGraphTokens } from "../flat-graph-shapes";

export const CULL_PX = 80;
export const DRAWN_INK = 0.02;

/**
 * A dot its capability's disc covers, or a name the drawn marks or an earlier name crowd, fades
 * on its room: gone once they overlap by half a pixel, whole once a pixel and a half of air parts them.
 */
export const ROOM_GONE_PX = -0.5;
export const ROOM_WHOLE_PX = 1.5;

export const ELEMENT_PICK_PX = 4;

export interface Disc { id: string; x: number; y: number; r: number; hue: string; ink: number; focus: boolean; state: "current" | "stale" | "unknown" }
export interface Dot { id: string; x: number; y: number; r: number; hue: string; ink: number; alpha: number; lit: boolean }
export interface Segment { x0: number; y0: number; x1: number; y1: number; ink: string; toElement: boolean; spoke: boolean; alpha: number }
/** 0 is a resting domain arc; the rest index `LINE_KINDS`. */
/** `fadeStart` and `fadeEnd` are the shares of the curve that fade in from transparent at each end. */
export interface Arc { path: ArcPath; width: number; alpha: number; head: boolean; glow: number; kind: number; key: string; reach: number; fadeStart: number; fadeEnd: number }
export const LINE_KINDS: readonly GraphLineKind[] = ["needs", "neededBy", "relates", "broader"];
export const REST_ARC = 0;
export interface Glow { x: number; y: number; r: number; ink: string; alpha: number }
export interface Light { x: number; y: number; r: number; ink: string; alpha: number }
/** `markR` is the drawn radius of the name's mark, read only by a leader. */
/** `fading`: no longer admitted, drawn only while its ink runs out; the probe and picking skip it. */
export interface Name { name: PlacedName; x: number; y: number; ink: number; room: number; color: string; halo: number; markR: number; fading: boolean; backed: boolean }
export interface Ring { x: number; y: number; r: number; alpha: number; ink: string }
export type LabelBox = DialFrameResult["labelBoxes"][number];

/**
 * A frame reuses last frame's mark objects in the same order. Storing a double into an object
 * field allocates, so every numeric write into a pooled mark is skipped when the value is
 * unchanged: a still, awake frame allocates nothing per concept.
 */
export function markPool<T>(make: () => T): { take(): T; reset(): void } {
  const items: T[] = [];
  let used = 0;
  return { take: () => (items[used++] ??= make()), reset: () => { used = 0; } };
}

/**
 * A list rebuilt every frame, written by index and cut once: `length = 0` releases the backing
 * store in V8, so the next frame's pushes would allocate it again. An unchanged length keeps it.
 */
export class FrameList<T> {
  readonly items: T[];
  size = 0;
  constructor(items: T[] = []) {
    this.items = items;
  }
  restart(): void {
    this.size = 0;
  }
  add(item: T): void {
    if (this.size < this.items.length) this.items[this.size] = item;
    else this.items.push(item);
    this.size += 1;
  }
  has(item: T): boolean {
    for (let i = 0; i < this.size; i += 1) if (this.items[i] === item) return true;
    return false;
  }
  indexOf(item: T): number {
    for (let i = 0; i < this.size; i += 1) if (this.items[i] === item) return i;
    return -1;
  }
  seal(): T[] {
    if (this.items.length !== this.size) this.items.length = this.size;
    return this.items;
  }
}

export const segments = markPool<Segment>(() => ({ x0: 0, y0: 0, x1: 0, y1: 0, ink: "", toElement: false, spoke: false, alpha: 0 }));
export const dots = markPool<Dot>(() => ({ id: "", x: 0, y: 0, r: 0, hue: "", ink: 0, alpha: 0, lit: false }));
export const discs = markPool<Disc>(() => ({ id: "", x: 0, y: 0, r: 0, hue: "", ink: 0, focus: false, state: "current" }));
export const glows = markPool<Glow>(() => ({ x: 0, y: 0, r: 0, ink: "", alpha: 0 }));
export const lights = markPool<Light>(() => ({ x: 0, y: 0, r: 0, ink: "", alpha: 0 }));
export const arcMarks = markPool<Arc>(() => ({ path: emptyArcPath(), width: 0, alpha: 0, head: false, glow: 0, kind: REST_ARC, key: "", reach: 1, fadeStart: 0, fadeEnd: 0 }));
export const chordPool = markPool<DialChordLight>(() => ({ key: "", sourceDomain: "", targetDomain: "", a: { x: 0, y: 0 }, c: { x: 0, y: 0 }, b: { x: 0, y: 0 }, widthPx: 0, chipRadiusPx: 0, arrivalBloom: false }));
export const names = markPool<Name>(() => ({ name: null as unknown as PlacedName, x: 0, y: 0, ink: 0, room: 1, color: "", halo: 0, markR: 0, fading: false, backed: false }));
export const hubNames = markPool<PlacedName>(() => ({ id: "", role: "units", text: "", font: "", dx: 0, dy: 0, align: "center", box: { minX: 0, maxX: 0, minY: 0, maxY: 0 } }));
export const dotRows = markPool<DialRowPick>(() => ({ id: "", box: { minX: 0, maxX: 0, minY: 0, maxY: 0 } }));
export const nameRows = markPool<DialRowPick>(() => ({ id: "", box: { minX: 0, maxX: 0, minY: 0, maxY: 0 } }));
export const labelBoxPool = markPool<LabelBox>(() => ({ nodeId: "", text: "", minX: 0, minY: 0, maxX: 0, maxY: 0 }));
export const pickPool = markPool<DialPick>(() => ({ id: "", x: 0, y: 0, r: 0, solid: false, reachPx: 0 }));
export const POOLS = [segments, dots, discs, glows, lights, arcMarks, names, hubNames, dotRows, nameRows, labelBoxPool, pickPool, chordPool];

export function setBox(box: Box, minX: number, maxX: number, minY: number, maxY: number): void {
  if (box.minX !== minX) box.minX = minX;
  if (box.maxX !== maxX) box.maxX = maxX;
  if (box.minY !== minY) box.minY = minY;
  if (box.maxY !== maxY) box.maxY = maxY;
}

export interface StampedPoint extends Point { stamp: number }

export const alphaCache = new WeakMap<FlatGraphLayout, Map<string, number>>();

export const frameChords = new FrameList<DialChordLight>();
export const shownElements = new FrameList<string>();

/** One map per layout, overwritten every frame: every id is written each frame or read through its stamp. */
export function cacheFor<V>(cache: WeakMap<FlatGraphLayout, Map<string, V>>, layout: FlatGraphLayout): Map<string, V> {
  let map = cache.get(layout);
  if (!map) {
    map = new Map();
    cache.set(layout, map);
  }
  return map;
}

export interface FramePlan {
  lights: Light[];
  segments: Segment[];
  arcs: Arc[];
  focusArcs: Arc[];
  dots: Dot[];
  glows: Glow[];
  discs: Disc[];
  domains: Disc[];
  project: Disc[];
  selection: Ring | null;
  agentRing: Ring | null;
  names: Name[];
}
export const L = {
  lights: new FrameList<Light>(), segments: new FrameList<Segment>(), arcs: new FrameList<Arc>(), focusArcs: new FrameList<Arc>(),
  dots: new FrameList<Dot>(), glows: new FrameList<Glow>(), discs: new FrameList<Disc>(), domains: new FrameList<Disc>(),
  project: new FrameList<Disc>(), names: new FrameList<Name>(),
};
export const framePlan: FramePlan = {
  lights: L.lights.items, segments: L.segments.items, arcs: L.arcs.items, focusArcs: L.focusArcs.items, dots: L.dots.items,
  glows: L.glows.items, discs: L.discs.items, domains: L.domains.items, project: L.project.items, selection: null, agentRing: null,
  names: L.names.items,
};
export const PLAN_LISTS = [L.lights, L.segments, L.arcs, L.focusArcs, L.dots, L.glows, L.discs, L.domains, L.project, L.names];

/** One frame's inputs, rewritten in place each frame so the frame parts need no per-frame closures. */
interface FrameState {
  input: DialFrameInput;
  model: DialModel;
  layout: FlatGraphLayout;
  tokens: FlatGraphTokens;
  P: FlatGraphPaintTokens;
  motion: GraphMotion;
  attention: GraphAttention;
  settled: boolean;
  contextMode: boolean;
  scale: number;
  originX: number;
  originY: number;
  W: number;
  H: number;
  growth: number;
  stamp: number;
  screen: Map<string, StampedPoint>;
  radii: Map<string, number>;
  orphans: ReadonlySet<string>;
  dotAlpha: number;
  /** World distance between neighbouring elements of one fan. */
  elementPitch: number;
  focusness: number;
  required: ReadonlySet<string>;
  evidence: DialEvidenceView | null;
  /** The fans this frame draws open: the selection's, and a deselected capability's while it closes. */
  opened: { elements: OpenedElements; share: number }[];
  /** The selected capability, element or orphan, drawn toward the selected radius; null otherwise. */
  selectedId: string | null;
  selectedR: number;
  /** The concept a change just deselected, shrinking back from the selected radius; null otherwise. */
  leavingId: string | null;
  leavingR: number;
  /** How far each ringed element steps off its capability this frame so its ring clears that disc, along a unit direction; eased per element. */
  steps: Map<string, { px: number; ux: number; uy: number }>;
  /** Elements whose step has not yet eased back to nothing. */
  stepped: Set<string>;
  /** Set while the plan reads an element where it stands before its step. */
  stepsOff: boolean;
  /** What each mark drew last, so this frame's radius moves from it at no more than `markPxPerMs`. */
  drawn: Map<string, DrawnRadius>;
  /** This world's frame count, so a mark knows whether it drew in the frame before. */
  frame: number;
  /** This world's drawn names: each one's ink, and those the frame before drew. */
  names: DrawnMarks;
  now: number;
  reducedMotion: boolean;
  /** Whether a drawn radius still trails the radius its frame asks for, so the loop paints on. */
  lagging: boolean;
  /** How far the project's own focus shows: its spokes and glow. */
  projectShare: number;
  /** The opened stars this frame grows; the first is the current selection's when `starNow`. */
  stars: OpenStarSlot[];
  starCount: number;
  starNow: boolean;
  /** The rooms of the star the reader left while its marks still shrink, else null. */
  closingRooms: ReadonlyMap<string, StarRoom> | null;
  lineKinds: number;
}
/** One opened star: rooms in world units (`world`) or screen px; a domain star's fixed disc is the domain's, grown with the zoom. */
interface OpenStarSlot { rooms: ReadonlyMap<string, StarRoom>; world: boolean; domain: boolean; fixedPx: number }
interface DrawnRadius { r: number; perMs: number; at: number; frame: number }
/** Per world: its frame count, and what each mark drew and in which of those frames. */
export interface DrawnMarks { frame: number; marks: Map<string, DrawnRadius>; names: Map<string, DrawnName[]>; namesBefore: DrawnName[]; namesNow: DrawnName[] }
/**
 * One name's drawn ink and offset from its mark on one side of the mark, the frame it last drew, the
 * frame it was last admitted in and the last it was admitted off screen.
 */
export interface DrawnName { name: PlacedName; wasFocus: boolean; alpha: number; dx: number; dy: number; at: number; frame: number; admitted: number; offScreen: number; stepped: number; glided: number; glidedAt: number }

/** Two frames at 60 Hz: a stalled frame, or the first frame after an idle loop, steps a radius no further. */
export const MARK_STEP_MAX_MS = 34;
/** Nearer its target than this a radius takes it: a fiftieth of a pixel is not seen. */
export const MARK_REST_PX = 0.02;

/** Nearer its place than this a gliding name takes it. */
export const NAME_REST_PX = 0.05;
const NO_ROOMS: ReadonlyMap<string, StarRoom> = new Map();
const openStarSlot = (): OpenStarSlot => ({ rooms: NO_ROOMS, world: false, domain: false, fixedPx: 0 });
/**
 * The frame being built. Each part binds it to a local `const F` once: wherever modules are not
 * hoisted into one scope (tests, dev), every use of an imported binding is a lookup through its module.
 */
export const F = { stamp: 0, opened: [] as FrameState["opened"], stars: [openStarSlot(), openStarSlot()], starCount: 0, starNow: false, closingRooms: null, steps: new Map(), stepped: new Set(), stepsOff: false } as FrameState;

/**
 * Hot helpers hand doubles back through this slot and take objects, not numbers: a double argument
 * or return value allocates whenever the optimiser does not inline the call.
 */
export const scratch = new Float64Array(1);

/**
 * A capability's fan pushed out of the disc it opens to: every element round it moves out along its
 * own bearing by `d` px, eased like a radius toward `target`, the most its innermost element needs.
 * Element i at reach `h_i·s + d` from the capability's centre, j at `h_j·s + d`, a turn `θ` apart:
 * `|p_i - p_j|²` grows at `2d'(1 - cos θ)(a + b) + 2s'(s|H_i - H_j|² + d(h_i + h_j)(1 - cos θ))`,
 * never below zero while the zoom grows and `d` falls no faster than `h_min·s'`, as the need does.
 * So no two of a fan cross or close in on each other while a star opens.
 */
interface FanPush { domainId: string; layout: FlatGraphLayout; d: number; perMs: number; target: number; need: number; at: number; frame: number; held: number }
export const fanPushes = new Map<string, FanPush>();

/**
 * An element of a pushed fan this frame: its capability, its bearing from it, the room and radius it
 * opens to where it draws, and where its crowd list stands in `near.outside`.
 */
export interface PushedDot { capabilityId: string; ux: number; uy: number; frame: number; room: StarRoom; radius: number; from: number; to: number }
export const pushedDots = new Map<string, PushedDot>();

/** The room a dot of a pushed fan opens into this frame, undefined for a dot no push has moved. */
export function movedRoom(id: string): StarRoom | undefined {
  const dot = pushedDots.get(id);
  return dot !== undefined && dot.frame === F.frame ? dot.room : undefined;
}
