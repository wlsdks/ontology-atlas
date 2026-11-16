import { dialEvidenceView } from "../dial/dial-model";
import { createMeasureText } from "../dial/fit";
import type { MeasureText } from "../dial/label-marks";
import { emptyDialFrameMarks, type DialFrameMarks, type DialMarksResult } from "../dial/frame/marks";
import { dialChordPresence, recordDialFrame } from "../dial/frame/frame";
import { dialPlacementLine, dialPlacementOf } from "../dial/placement";
import type { Box, DialChordLight, DialEvidenceView, DialFrameInput, DialFrameResult, DialModel, DialPick, DialRowPick, GlyphMark, Point, StripMark, TextMark } from "../dial/types";
import { HITTABLE_MIN_TIER_ALPHA } from "../model/visibility/tier-visibility";
import { labelFontFamily } from "../render/labels";
import { AGENT_FOCUS_RING_OFFSET } from "../render/node-shapes";
import { FONT_WEIGHT } from "@/shared/ui/tokens/font-weight";
import { cachedGraphAttention, FLAT_LINE_BITS, inkUnder, type GraphAttention, type GraphLineKind } from "./attention";
import { directItemId } from "./layout";
import {
  arcPathInto, capabilityDiscRadiusPx, emptyArcPath, glowSprite, graphDiscRadiusPx, LIT_DOT_SHARE, ORPHAN_ROOM, lightSprite, litLineTrimsInto, restArcs, smoothstep, sunk, zoomGrowth, type ArcPath,
} from "./marks";
import { DAMPED, dampedStep, FLAT_MOTION, graphMotionOf, MOTION_SHARE, waveDelays, type GraphMotion } from "./motion";
import { admittedNames, boxUnderAny, nameBlockDraws, leaderSegment, nameBlockEnd, selectedDiscRadius, stepScale, zoomStep, type PlacedName } from "./names";
import { FLAT_TIER_TIMING, tierNameAlpha } from "../morph/tier-assembly";
import { openedElements, type OpenedElements } from "./open";
import { domainStarRooms, openRadiusPx, roomLimitPx, starRooms, type StarPoint, type StarRoom } from "./open-star";
import type { FlatGraphCluster, FlatGraphItem, FlatGraphLayout, FlatGraphPaintTokens, FlatGraphTokens } from "./types";

const CULL_PX = 80;
const DRAWN_INK = 0.02;
const FOCUS_GLOW_ALPHA = 0.4;
const FOCUS_RIM_PX = 2.4;
const ARROW_SPREAD = 0.5;
const TAPER_STEPS = 18;
const TAPER_TIP_PX = 0.35;
const ARROW_WIDTH_PX = 1.3;
const DOT_ALPHA = 0.7;
/**
 * A dot its capability's disc covers, or a name the drawn marks or an earlier name crowd, fades
 * on its room: gone once they overlap by half a pixel, whole once a pixel and a half of air parts them.
 */
const ROOM_GONE_PX = -0.5;
const ROOM_WHOLE_PX = 1.5;
/** The step a name that starts to arrive takes in its first frame: one 60 Hz frame. */
const NAME_FIRST_STEP_MS = 1000 / 60;
/** World units a fanned element may sit from its laid-out place before it counts as dragged. */
const DRAG_SLACK = 1e-6;
/** The most of the pitch between two elements a dot's radius takes, so a lit dot (`LIT_DOT_SHARE`) still stops short of its neighbour. */
const ELEMENT_PITCH_FILL = 0.33;
const LIGHT_SINK_GAIN = 1.4;
const AGENT_RING_WIDTH_PX = 1;
const PIP_SHARE = 0.3;
const PIP_MIN_PX = 2;
const UNKNOWN_DASH = [2, 2];
const ELEMENT_PICK_PX = 4;

/** One width memo per model, so a closed folder's names leave with its model. */
const measureByModel = new WeakMap<DialModel, MeasureText>();
function measureTextOf(model: DialModel): MeasureText {
  let measure = measureByModel.get(model);
  if (!measure) measureByModel.set(model, (measure = createMeasureText()));
  return measure;
}

interface Disc { id: string; x: number; y: number; r: number; hue: string; ink: number; focus: boolean; state: "current" | "stale" | "unknown" }
interface Dot { id: string; x: number; y: number; r: number; hue: string; ink: number; alpha: number; lit: boolean }
interface Segment { x0: number; y0: number; x1: number; y1: number; ink: string; toElement: boolean; spoke: boolean; alpha: number }
/** 0 is a resting domain arc; the rest index `LINE_KINDS`. */
/** `fadeStart` and `fadeEnd` are the shares of the curve that fade in from transparent at each end. */
interface Arc { path: ArcPath; width: number; alpha: number; head: boolean; glow: number; kind: number; key: string; reach: number; fadeStart: number; fadeEnd: number }
const LINE_KINDS: readonly GraphLineKind[] = ["needs", "neededBy", "relates", "broader"];
const REST_ARC = 0;
interface Glow { x: number; y: number; r: number; ink: string; alpha: number }
interface Light { x: number; y: number; r: number; ink: string; alpha: number }
/** `markR` is the drawn radius of the name's mark, read only by a leader. */
/** `fading`: no longer admitted, drawn only while its ink runs out; the probe and picking skip it. */
interface Name { name: PlacedName; x: number; y: number; ink: number; room: number; color: string; halo: number; markR: number; fading: boolean }
interface Ring { x: number; y: number; r: number; alpha: number; ink: string }
type LabelBox = DialFrameResult["labelBoxes"][number];

/**
 * A frame reuses last frame's mark objects in the same order. Storing a double into an object
 * field allocates, so every numeric write below is skipped when the value is unchanged: a still,
 * awake frame allocates nothing per concept.
 */
function markPool<T>(make: () => T): { take(): T; reset(): void } {
  const items: T[] = [];
  let used = 0;
  return { take: () => (items[used++] ??= make()), reset: () => { used = 0; } };
}

/**
 * A list rebuilt every frame, written by index and cut once: `length = 0` releases the backing
 * store in V8, so the next frame's pushes would allocate it again. An unchanged length keeps it.
 */
class FrameList<T> {
  constructor(readonly items: T[] = []) {}
  size = 0;
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

const segments = markPool<Segment>(() => ({ x0: 0, y0: 0, x1: 0, y1: 0, ink: "", toElement: false, spoke: false, alpha: 0 }));
const dots = markPool<Dot>(() => ({ id: "", x: 0, y: 0, r: 0, hue: "", ink: 0, alpha: 0, lit: false }));
const discs = markPool<Disc>(() => ({ id: "", x: 0, y: 0, r: 0, hue: "", ink: 0, focus: false, state: "current" }));
const glows = markPool<Glow>(() => ({ x: 0, y: 0, r: 0, ink: "", alpha: 0 }));
const lights = markPool<Light>(() => ({ x: 0, y: 0, r: 0, ink: "", alpha: 0 }));
const arcMarks = markPool<Arc>(() => ({ path: emptyArcPath(), width: 0, alpha: 0, head: false, glow: 0, kind: REST_ARC, key: "", reach: 1, fadeStart: 0, fadeEnd: 0 }));
const chordPool = markPool<DialChordLight>(() => ({ key: "", sourceDomain: "", targetDomain: "", a: { x: 0, y: 0 }, c: { x: 0, y: 0 }, b: { x: 0, y: 0 }, widthPx: 0, chipRadiusPx: 0, arrivalBloom: false }));
const names = markPool<Name>(() => ({ name: null as unknown as PlacedName, x: 0, y: 0, ink: 0, room: 1, color: "", halo: 0, markR: 0, fading: false }));
const hubNames = markPool<PlacedName>(() => ({ id: "", role: "units", text: "", font: "", dx: 0, dy: 0, align: "center", box: { minX: 0, maxX: 0, minY: 0, maxY: 0 } }));
const dotRows = markPool<DialRowPick>(() => ({ id: "", box: { minX: 0, maxX: 0, minY: 0, maxY: 0 } }));
const nameRows = markPool<DialRowPick>(() => ({ id: "", box: { minX: 0, maxX: 0, minY: 0, maxY: 0 } }));
const labelBoxPool = markPool<LabelBox>(() => ({ nodeId: "", text: "", minX: 0, minY: 0, maxX: 0, maxY: 0 }));
const pickPool = markPool<DialPick>(() => ({ id: "", x: 0, y: 0, r: 0, solid: false, reachPx: 0 }));
const POOLS = [segments, dots, discs, glows, lights, arcMarks, names, hubNames, dotRows, nameRows, labelBoxPool, pickPool, chordPool];
const selectionRing: Ring = { x: 0, y: 0, r: 0, alpha: 0, ink: "" };
const agentRing: Ring = { x: 0, y: 0, r: 0, alpha: 1, ink: "" };

function setBox(box: Box, minX: number, maxX: number, minY: number, maxY: number): void {
  if (box.minX !== minX) box.minX = minX;
  if (box.maxX !== maxX) box.maxX = maxX;
  if (box.minY !== minY) box.minY = minY;
  if (box.maxY !== maxY) box.maxY = maxY;
}

function ring(into: Ring, x: number, y: number, r: number, alpha: number, ink: string): Ring {
  if (into.x !== x) into.x = x;
  if (into.y !== y) into.y = y;
  if (into.r !== r) into.r = r;
  if (into.alpha !== alpha) into.alpha = alpha;
  into.ink = ink;
  return into;
}

/** A drawn dot answers before a name drawn over it: rows are hit last-first, so dots go last. */
function dotRow(p: DialPick): DialRowPick {
  const row = dotRows.take();
  row.id = p.id;
  const box = row.box;
  const minX = p.x - p.r;
  const maxX = p.x + p.r;
  const minY = p.y - p.r;
  const maxY = p.y + p.r;
  if (box.minX !== minX) box.minX = minX;
  if (box.maxX !== maxX) box.maxX = maxX;
  if (box.minY !== minY) box.minY = minY;
  if (box.maxY !== maxY) box.maxY = maxY;
  return row;
}

function elementPick(id: string, at: Point): DialPick {
  const p = pickPool.take();
  p.id = id;
  const r = Math.max(ELEMENT_PICK_PX, dotRadius(id));
  p.solid = false;
  if (p.x !== at.x) p.x = at.x;
  if (p.y !== at.y) p.y = at.y;
  if (p.r !== r) p.r = r;
  p.reachPx = Math.max(r, F.P.pickMinPx);
  return p;
}

function disc(id: string, at: Point, r: number, hue: string, ink: number, focus: boolean, state: Disc["state"]): Disc {
  const d = discs.take();
  d.id = id;
  if (d.x !== at.x) d.x = at.x;
  if (d.y !== at.y) d.y = at.y;
  if (d.r !== r) d.r = r;
  d.hue = hue;
  if (d.ink !== ink) d.ink = ink;
  d.focus = focus;
  d.state = state;
  return d;
}

function light(x: number, y: number, r: number, ink: string, alpha: number): Light {
  const l = lights.take();
  if (l.x !== x) l.x = x;
  if (l.y !== y) l.y = y;
  if (l.r !== r) l.r = r;
  l.ink = ink;
  if (l.alpha !== alpha) l.alpha = alpha;
  return l;
}

function arcMark(from: Point, to: Point, bow: number, trimStart: number, trimEnd: number, width: number, alpha: number, head: boolean, glowAlpha: number, kind: number): Arc | null {
  const arc = arcMarks.take();
  if (!arcPathInto(arc.path, from, to, bow, trimStart, trimEnd)) return null;
  if (arc.width !== width) arc.width = width;
  if (arc.alpha !== alpha) arc.alpha = alpha;
  arc.head = head;
  if (arc.glow !== glowAlpha) arc.glow = glowAlpha;
  if (arc.kind !== kind) arc.kind = kind;
  arc.key = "";
  if (arc.reach !== 1) arc.reach = 1;
  if (arc.fadeStart !== 0) arc.fadeStart = 0;
  if (arc.fadeEnd !== 0) arc.fadeEnd = 0;
  return arc;
}

function nameMark(name: PlacedName, x: number, y: number, ink: number, color: string, halo: number): Name {
  const n = names.take();
  n.name = name;
  if (n.x !== x) n.x = x;
  if (n.y !== y) n.y = y;
  if (n.ink !== ink) n.ink = ink;
  if (n.room !== 1) n.room = 1;
  n.fading = false;
  n.color = color;
  if (n.halo !== halo) n.halo = halo;
  return n;
}

interface StampedPoint extends Point { stamp: number }
const ORIGIN: Point = { x: 0, y: 0 };
const screenCache = new WeakMap<FlatGraphLayout, Map<string, StampedPoint>>();
const alphaCache = new WeakMap<FlatGraphLayout, Map<string, number>>();
const orphanCache = new WeakMap<FlatGraphLayout, ReadonlySet<string>>();
const radiusCaches = new WeakMap<FlatGraphLayout, { growth: number; scale: number; radii: Map<string, number> }>();
const flowKeyCache = new WeakMap<DialModel, Map<string, Map<string, string>>>();
const linkProbeCache = new WeakMap<DialModel, DialMarksResult["flows"]["links"]>();
const framePicks = new FrameList<DialPick>();
const frameRows = new FrameList<DialRowPick>();
const frameLabelBoxes = new FrameList<LabelBox>();
const drawnFlowKeys = new FrameList<string>();
const frameChords = new FrameList<DialChordLight>();
const shownElements = new FrameList<string>();
const expandedItems = new Set<string>();
const NO_IDS: ReadonlySet<string> = new Set();
const NO_LINES: GraphAttention["lines"] = [];
const NO_BOXES: readonly Box[] = [];

/** Disc radii at one growth and scale, kept until the zoom changes either. */
function radiusCacheFor(layout: FlatGraphLayout, growth: number, scale: number): Map<string, number> {
  const hit = radiusCaches.get(layout);
  if (hit && hit.growth === growth && hit.scale === scale) return hit.radii;
  const radii = new Map<string, number>();
  radiusCaches.set(layout, { growth, scale, radii });
  return radii;
}

/** One map per layout, overwritten every frame: every id is written each frame or read through its stamp. */
function cacheFor<V>(cache: WeakMap<FlatGraphLayout, Map<string, V>>, layout: FlatGraphLayout): Map<string, V> {
  let map = cache.get(layout);
  if (!map) {
    map = new Map();
    cache.set(layout, map);
  }
  return map;
}

function orphansOf(layout: FlatGraphLayout): ReadonlySet<string> {
  let set = orphanCache.get(layout);
  if (!set) orphanCache.set(layout, (set = new Set(layout.orphanIds)));
  return set;
}

/** The flow a domain pair belongs to, either way round; built once per model. */
function flowKeyOf(model: DialModel, a: string, b: string): string | undefined {
  let byFrom = flowKeyCache.get(model);
  if (!byFrom) {
    byFrom = new Map();
    for (const f of model.flows) {
      for (const [u, v] of [[f.a, f.b], [f.b, f.a]] as const) {
        let to = byFrom.get(u);
        if (!to) byFrom.set(u, (to = new Map()));
        to.set(v, f.key);
      }
    }
    flowKeyCache.set(model, byFrom);
  }
  return byFrom.get(a)?.get(b);
}

function linkProbes(model: DialModel): DialMarksResult["flows"]["links"] {
  let links = linkProbeCache.get(model);
  if (!links) linkProbeCache.set(model, (links = model.flows.map((f) => ({ key: f.key, u: f.a, v: f.b, uv: f.ab, vu: f.ba, total: f.total, relatesOnly: f.relatesOnly, attended: false }))));
  return links;
}

interface FramePlan {
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
const L = {
  lights: new FrameList<Light>(), segments: new FrameList<Segment>(), arcs: new FrameList<Arc>(), focusArcs: new FrameList<Arc>(),
  dots: new FrameList<Dot>(), glows: new FrameList<Glow>(), discs: new FrameList<Disc>(), domains: new FrameList<Disc>(),
  project: new FrameList<Disc>(), names: new FrameList<Name>(),
};
const framePlan: FramePlan = {
  lights: L.lights.items, segments: L.segments.items, arcs: L.arcs.items, focusArcs: L.focusArcs.items, dots: L.dots.items,
  glows: L.glows.items, discs: L.discs.items, domains: L.domains.items, project: L.project.items, selection: null, agentRing: null,
  names: L.names.items,
};
const PLAN_LISTS = [L.lights, L.segments, L.arcs, L.focusArcs, L.dots, L.glows, L.discs, L.domains, L.project, L.names];

let deferred: { plan: FramePlan; tokens: FlatGraphTokens; ground: string; warning: string } | null = null;

/** One frame's inputs, rewritten in place each frame so the helpers below need no per-frame closures. */
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
interface DrawnMarks { frame: number; marks: Map<string, DrawnRadius>; names: Map<string, DrawnName[]>; namesBefore: DrawnName[]; namesNow: DrawnName[] }
/**
 * One name's drawn ink and offset from its mark on one side of the mark, the frame it last drew, the
 * frame it was last admitted in and the last it was admitted off screen.
 */
interface DrawnName { name: PlacedName; wasFocus: boolean; alpha: number; dx: number; dy: number; at: number; frame: number; admitted: number; offScreen: number; stepped: number; glided: number; glidedAt: number }
const drawnRadii = new WeakMap<object, DrawnMarks>();
/** Two frames at 60 Hz: a stalled frame, or the first frame after an idle loop, steps a radius no further. */
const MARK_STEP_MAX_MS = 34;
/** Nearer its target than this a radius takes it: a fiftieth of a pixel is not seen. */
const MARK_REST_PX = 0.02;
/** Nearer its place than this a gliding name takes it. */
const NAME_REST_PX = 0.05;
const NO_ROOMS: ReadonlyMap<string, StarRoom> = new Map();
const openStarSlot = (): OpenStarSlot => ({ rooms: NO_ROOMS, world: false, domain: false, fixedPx: 0 });
const F = { stamp: 0, opened: [] as FrameState["opened"], stars: [openStarSlot(), openStarSlot()], starCount: 0, starNow: false, closingRooms: null } as FrameState;

/**
 * A domain's hue. The map rests achromatic, so every mark takes the neutral ink until attention
 * reaches the domain it sits in, which takes the project's ink over the same clock as the light.
 * Colour on this canvas says whose domain a mark is in and which way a relation runs.
 */
function hueOf(domainId: string): string {
  const tint = F.motion.tintShare(domainId);
  return tint <= 0 ? F.tokens.inks.name : sunk(F.tokens.inks.project, F.tokens.inks.name, tint);
}

/**
 * Hot helpers hand doubles back through this slot and take objects, not numbers: a double argument
 * or return value allocates whenever the optimiser does not inline the call.
 */
const scratch = new Float64Array(1);

function loadInkAt(id: string, rest: number): void {
  const input = F.input;
  const attention = F.attention;
  const sink = F.P.sinkInk;
  F.motion.see(id);
  const focus = F.settled ? inkUnder(attention, id, sink, rest) : F.motion.ink(id, sink, rest);
  const brightened = attention.selected && id === input.hoveredNodeId ? 1 : focus;
  const lens = F.contextMode ? input.contextInkAlphas?.get(id) ?? 1 : 1;
  scratch[0] = brightened * lens * input.appearOf(id);
}

/** A concept's ink for its name and light: full at rest. */
function loadInk(id: string): void {
  loadInkAt(id, 1);
}

/** A concept's ink for its disc, dot and links: `restHue` of the hue at rest, full when lit. */
function loadMarkInk(id: string): void {
  loadInkAt(id, F.P.restHue);
}

/** How far a concept's glow shows: only the lit set of a hover or selection glows. */
function loadGlowShare(id: string): void {
  scratch[0] = F.settled ? inkUnder(F.attention, id, 0, 0) : F.motion.litShare(id);
}

function inkOf(id: string): number {
  loadInk(id);
  return scratch[0]!;
}

function screenOf(id: string): StampedPoint {
  const home = F.input.nodeAt?.(id) ?? F.layout.positions.get(id) ?? F.layout.itemAt.get(id) ?? ORIGIN;
  let at = F.screen.get(id);
  if (!at) {
    at = { x: 0, y: 0, stamp: 0 };
    F.screen.set(id, at);
  }
  let x = home.x * F.scale + F.originX;
  let y = home.y * F.scale + F.originY;
  for (let i = 0; i < F.opened.length; i += 1) {
    const fan = F.opened[i]!;
    const offset = fan.elements.offsets.get(id);
    if (!offset) continue;
    const rest = F.layout.positions.get(fan.elements.capabilityId)!;
    const centre = F.input.nodeAt?.(fan.elements.capabilityId) ?? rest;
    const own = F.layout.positions.get(id);
    // A dot dragged away from its capability follows the pointer; the rest follow the capability wherever it goes.
    if (own && Math.hypot(home.x - own.x - (centre.x - rest.x), home.y - own.y - (centre.y - rest.y)) > DRAG_SLACK) continue;
    x += (centre.x * F.scale + F.originX + offset.x - x) * fan.share;
    y += (centre.y * F.scale + F.originY + offset.y - y) * fan.share;
  }
  if (at.x !== x) at.x = x;
  if (at.y !== y) at.y = y;
  at.stamp = F.stamp;
  return at;
}

/** How far `id` has moved into an opened fan, 0 when it is in none. */
function fanShare(id: string): number {
  let share = 0;
  for (let i = 0; i < F.opened.length; i += 1) {
    if (F.opened[i]!.elements.offsets.has(id)) share = Math.max(share, F.opened[i]!.share * F.opened[i]!.elements.open);
  }
  return share;
}

function alongSpoke(from: string, to: string): boolean {
  for (let i = 0; i < F.opened.length; i += 1) {
    const { capabilityId, offsets } = F.opened[i]!.elements;
    if ((from === capabilityId && offsets.has(to)) || (to === capabilityId && offsets.has(from))) return true;
  }
  return false;
}

function screenAt(id: string): StampedPoint | undefined {
  const at = F.screen.get(id);
  return at && at.stamp === F.stamp ? at : undefined;
}

function onScreen(p: Point): boolean {
  return p.x > -CULL_PX && p.y > -CULL_PX && p.x < F.W + CULL_PX && p.y < F.H + CULL_PX;
}

function pickable(p: Point): boolean {
  return p.x > -ELEMENT_PICK_PX && p.y > -ELEMENT_PICK_PX && p.x < F.W + ELEMENT_PICK_PX && p.y < F.H + ELEMENT_PICK_PX;
}

/** The radius at this frame's growth; a cached value is returned as stored, so it never allocates. */
function radiusNow(id: string): number {
  return F.radii.get(id) ?? radiusAt(id, F.growth);
}

/**
 * The radius `id` draws this frame: `target`, approached from the radius and speed the frame before
 * drew, so a mark grows, shrinks and retargets with no jump in size or in speed. A frame later than
 * `MARK_STEP_MAX_MS` moves it as that long a frame would. A mark the frame before did not draw (it
 * was off screen, or the map slept) and reduced motion take the target at once. Settled once per
 * mark and frame.
 */
function drawnRadius(id: string, wanted: number, limit = Infinity): number {
  // A mark heads for the room it has when that is smaller than its radius, so it settles there.
  const target = Math.min(wanted, limit);
  let last = F.drawn.get(id);
  if (!last) {
    F.drawn.set(id, (last = { r: target, perMs: 0, at: F.now, frame: F.frame }));
    return target;
  }
  if (last.frame === F.frame) return last.r;
  const continuing = last.frame === F.frame - 1;
  const stepMs = Math.min(Math.max(0, F.now - last.at), MARK_STEP_MAX_MS);
  let r = target;
  let perMs = 0;
  if (continuing && !F.reducedMotion && Math.abs(target - last.r) > MARK_REST_PX) {
    r = dampedStep(last.r, last.perMs, target, stepMs, FLAT_MOTION.riseMs, F.P.markPxPerMs);
    perMs = DAMPED.perMs;
    F.lagging = true;
  }
  // However its speed carried it, a mark never passes the room it has at this frame's zoom.
  if (r > limit) {
    r = limit;
    perMs = Math.min(perMs, 0);
  }
  if (last.r !== r) last.r = r;
  last.perMs = perMs;
  last.at = F.now;
  last.frame = F.frame;
  return r;
}

/** The drawn radius: the selected concept's toward the selected radius, an opened star's marks toward the room they have at this frame's zoom. */
function discRadius(id: string): number {
  const own = radiusNow(id);
  if (id === F.selectedId || id === F.leavingId) return noteGrown(id, own, drawnRadius(id, id === F.selectedId ? F.selectedR : F.leavingR));
  return noteGrown(id, own, drawnRadius(id, openedRadius(id, own), roomLimit(id, own)));
}

/** The largest radius `id` may draw at this frame's zoom in every star that holds it, open or closing. O(stars). */
function roomLimit(id: string, own: number): number {
  let limit = Infinity;
  for (let i = 0; i < F.starCount; i += 1) {
    const star = F.stars[i]!;
    const room = star.rooms.get(id);
    if (room !== undefined) limit = Math.min(limit, roomLimitPx(own, room, star.world ? F.scale : 1, star.fixedPx, room.nearestId === null ? 0 : radiusNow(room.nearestId)));
  }
  const closing = F.closingRooms?.get(id);
  if (closing !== undefined) limit = Math.min(limit, roomLimitPx(own, closing, F.scale, graphDiscRadiusPx("domain", 0, F.P, F.growth), closing.nearestId === null ? 0 : radiusNow(closing.nearestId)));
  return limit;
}

/** Marks drawn past their resting radius this frame: the only marks a name gives way to. */
const grownIds = new Set<string>();

function noteGrown(id: string, rest: number, r: number): number {
  if (r > rest + MARK_REST_PX) grownIds.add(id);
  return r;
}

/** `own` grown by every opened star that holds `id` into the room it has at this frame's zoom. O(stars). */
function openedRadius(id: string, own: number): number {
  let r = own;
  for (let i = 0; i < F.starCount; i += 1) {
    const star = F.stars[i]!;
    const room = star.rooms.get(id);
    if (room === undefined) continue;
    r = Math.max(r, openRadiusPx(own, room, star.world ? F.scale : 1, star.fixedPx, F.P, room.nearestId === null ? 0 : radiusNow(room.nearestId)));
  }
  return r;
}

/** An element dot's drawn radius: a lit dot stands out, and an opened star grows it. */
function dotRadius(id: string): number {
  if (id === F.selectedId || id === F.leavingId) return discRadius(id);
  const rest = radiusNow(id) * (F.attention.lit?.has(id) === true ? LIT_DOT_SHARE : 1);
  return noteGrown(id, rest, drawnRadius(id, openedRadius(id, rest), roomLimit(id, rest)));
}

function setStar(rooms: ReadonlyMap<string, StarRoom>, world: boolean, domain: boolean, fixedPx: number): void {
  const star = F.stars[F.starCount]!;
  star.rooms = rooms;
  star.world = world;
  star.domain = domain;
  if (star.fixedPx !== fixedPx) star.fixedPx = fixedPx;
  F.starCount += 1;
}

interface FanRooms { world: ReadonlyMap<string, StarRoom> | null; fanned: ReadonlyMap<string, StarRoom> | null; ringPx: number }
const fanRoomCache = new WeakMap<FlatGraphLayout, Map<string, FanRooms>>();

/** A capability's elements' rooms round its centre: `fan` offsets in px, or their own places in world units. O(n²), n = its elements. */
function elementRooms(capabilityId: string, fan: OpenedElements | null): ReadonlyMap<string, StarRoom> {
  const centre = F.layout.positions.get(capabilityId);
  const points: StarPoint[] = [];
  for (const id of F.model.capabilityById.get(capabilityId)?.elementIds ?? []) {
    const offset = fan?.offsets.get(id);
    const at = F.layout.positions.get(id);
    if (fan) {
      if (offset) points.push({ id, kind: "element", x: offset.x, y: offset.y });
    } else if (at && centre) points.push({ id, kind: "element", x: at.x - centre.x, y: at.y - centre.y });
  }
  return starRooms(points, ORIGIN, F.P);
}

/**
 * A selected capability's elements' rooms beside its selection ring. Unfanned, they stand in their
 * own places, kept once per layout in world units; fully fanned, the fan's px places hold at any zoom
 * and are kept per ring; only a half-closed fan, which moves with the zoom, is measured each frame.
 */
function setFanStar(capabilityId: string, fan: OpenedElements | null, ringPx: number): void {
  let byCapability = fanRoomCache.get(F.layout);
  if (!byCapability) fanRoomCache.set(F.layout, (byCapability = new Map()));
  let known = byCapability.get(capabilityId);
  if (!known) byCapability.set(capabilityId, (known = { world: null, fanned: null, ringPx: 0 }));
  if (fan === null) {
    known.world ??= elementRooms(capabilityId, null);
    setStar(known.world, true, false, ringPx);
    return;
  }
  if (fan.open < 1) {
    setStar(elementRooms(capabilityId, fan), false, false, ringPx);
    return;
  }
  if (known.fanned === null || known.ringPx !== ringPx) {
    known.fanned = elementRooms(capabilityId, fan);
    known.ringPx = ringPx;
  }
  setStar(known.fanned, false, false, ringPx);
}

/** The fan drawn for `capabilityId` this frame, if any. */
function fanOf(capabilityId: string): OpenedElements | null {
  for (let i = 0; i < F.opened.length; i += 1) if (F.opened[i]!.elements.capabilityId === capabilityId) return F.opened[i]!.elements;
  return null;
}

/** A capability's elements open round its selection ring as it is drawn this frame. */
function setCapabilityStar(capabilityId: string): void {
  const ringPx = discRadius(capabilityId) + F.P.selectedRingGapPx + F.P.selectedRingPx;
  setFanStar(capabilityId, fanOf(capabilityId), ringPx);
}

let openDomainId: string | null = null;
/** A domain whose star the reader left while its marks still shrink: they keep within its rooms. */
let closingDomainId: string | null = null;

/** The domain whose star the last Flat frame drew open, or still drew closing; null when it drew none. */
export function lastOpenedDomainStar(): string | null {
  return openDomainId;
}

/**
 * This frame's opened star: the focused domain's, or the selected capability's elements. A star
 * a change just left needs none: its marks shrink from what they drew, at the drawn radius's pace.
 */
function planOpenStars(focused: string | null): void {
  const { model, P, layout } = F;
  F.starCount = 0;
  F.starNow = false;
  const focusedDomain = focused !== null && model.domainById.has(focused) ? focused : null;
  if (openDomainId !== null && openDomainId !== focusedDomain) closingDomainId = openDomainId;
  if (closingDomainId === focusedDomain) closingDomainId = null;
  F.closingRooms = closingDomainId === null ? null : domainStarRooms(model, layout, closingDomainId, P);
  if (focusedDomain !== null) {
    setStar(domainStarRooms(model, layout, focusedDomain, P), true, true, graphDiscRadiusPx("domain", 0, P, F.growth));
    F.starNow = true;
    openDomainId = focusedDomain;
  } else if (F.selectedId !== null && model.capabilityById.has(F.selectedId)) {
    setCapabilityStar(F.selectedId);
    F.starNow = true;
  }
}

function segmentOnScreen(a: Point, b: Point): boolean {
  return !(Math.max(a.x, b.x) < -CULL_PX || Math.min(a.x, b.x) > F.W + CULL_PX || Math.max(a.y, b.y) < -CULL_PX || Math.min(a.y, b.y) > F.H + CULL_PX);
}

function lensHidden(id: string): boolean {
  return F.contextMode && (F.input.contextAlphas!.get(id) ?? 0) < HITTABLE_MIN_TIER_ALPHA;
}

function radiusOf(id: string, g: number, scale: number): number {
  const { model, P } = F;
  if (id === model.projectId) return graphDiscRadiusPx("project", 0, P, g);
  if (model.domainById.has(id)) return graphDiscRadiusPx("domain", 0, P, g);
  const capability = model.capabilityById.get(id);
  if (capability) return capabilityDiscRadiusPx(F.layout, model.domainOf.get(id)!, capability.elementIds.length, P, scale, g);
  if (F.orphans.has(id)) return capabilityDiscRadiusPx(F.layout, ORPHAN_ROOM, 0, P, scale, g);
  return Math.min(graphDiscRadiusPx("element", 0, P, g), F.elementPitch * scale * ELEMENT_PITCH_FILL);
}

function radiusAt(id: string, g: number): number {
  if (g !== F.growth) return radiusOf(id, g, F.scale);
  const known = F.radii.get(id);
  if (known !== undefined) return known;
  const r = radiusOf(id, g, F.scale);
  F.radii.set(id, r);
  return r;
}

/** A name waits for its mark: it fades in once the first open has nearly set its concept down. */
function nameLanded(id: string): number {
  return tierNameAlpha(F.input.appearOf(id), FLAT_TIER_TIMING.riseMs);
}

function loadNameInk(n: PlacedName): void {
  if (n.role === "project" || n.role === "domain" || n.role === "units" || n.role === "orphans" || n.role === "reach") {
    loadInk(n.id);
    const landed = nameLanded(n.id);
    scratch[0] = scratch[0]! * (n.role === "units" || n.role === "orphans" ? F.P.restHue * landed : landed);
    return;
  }
  const input = F.input;
  const attention = F.attention;
  const focus = F.settled ? inkUnder(attention, n.id, 0) : F.motion.ink(n.id, 0, 1);
  const brightened = attention.selected && n.id === input.hoveredNodeId ? 1 : focus;
  const lens = F.contextMode ? input.contextInkAlphas?.get(n.id) ?? 1 : 1;
  const elementShare = n.role === "element" && attention.lit?.has(n.id) !== true ? F.dotAlpha : 1;
  scratch[0] = brightened * lens * elementShare * nameLanded(n.id);
}

/** One admitted name, when its concept draws, its box reaches the viewport and its ink shows. */
/**
 * The record of `n`'s drawn ink in this world, one per side of its mark: a name that changes side
 * fades out where it stood and in where it goes, and one that moves along its side glides. O(rows
 * of its concept).
 */
function drawnNameOf(n: PlacedName, wasFocus: boolean): DrawnName {
  let rows = F.names.names.get(n.id);
  if (!rows) F.names.names.set(n.id, (rows = []));
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;
    if (row.name.role === n.role && row.wasFocus === wasFocus && sideOf(row.name) === sideOf(n)) return row;
  }
  const row: DrawnName = { name: n, wasFocus, alpha: 0, dx: n.dx, dy: n.dy, at: F.now, frame: -1, admitted: -1, offScreen: -1, stepped: -1, glided: -1, glidedAt: F.now };
  rows.push(row);
  return row;
}

/** Which side of its mark a name stands on: right, left, above or below; two names on different sides never overlap. */
function sideOf(n: PlacedName): number {
  return n.align === "left" ? 0 : n.align === "right" ? 1 : n.dy < 0 ? 2 : 3;
}

/**
 * Moves a name's drawn offset from its mark toward the offset its admission placed it at, at most a
 * `FLAT_MOTION.riseMs` share of the way per ms, so a name moving along its side glides. Once a frame.
 */
function glideName(row: DrawnName): void {
  if (row.glided === F.frame) return;
  const continuing = row.glided === F.frame - 1;
  const stepMs = Math.min(Math.max(0, F.now - row.glidedAt), MARK_STEP_MAX_MS);
  row.glided = F.frame;
  row.glidedAt = F.now;
  const n = row.name;
  if (!continuing || F.reducedMotion) {
    row.dx = n.dx;
    row.dy = n.dy;
    return;
  }
  const share = Math.min(1, stepMs / FLAT_MOTION.riseMs);
  row.dx = Math.abs(n.dx - row.dx) < NAME_REST_PX ? n.dx : row.dx + (n.dx - row.dx) * share;
  row.dy = Math.abs(n.dy - row.dy) < NAME_REST_PX ? n.dy : row.dy + (n.dy - row.dy) * share;
  if (row.dx !== n.dx || row.dy !== n.dy) F.lagging = true;
}

/**
 * The ink a name draws this frame: its target approached from what the frame before drew, at most
 * full ink per `FLAT_MOTION.riseMs` arriving and per `exitMs` leaving. A name the frame before did
 * not draw starts from nothing, unless it was admitted off screen then (a pan brought it on
 * screen); reduced motion and the map's first frame take the target at once.
 */
function drawnNameInk(row: DrawnName, target: number): number {
  // A name planned twice in one frame draws the ink its first plan stepped to.
  if (row.stepped === F.frame) return row.alpha;
  row.stepped = F.frame;
  let alpha = target;
  if (!F.reducedMotion && F.frame > 1) {
    const continuing = row.frame === F.frame - 1;
    if (continuing || row.offScreen !== F.frame - 1) {
      const from = continuing ? row.alpha : 0;
      const stepMs = continuing ? Math.min(Math.max(0, F.now - row.at), MARK_STEP_MAX_MS) : NAME_FIRST_STEP_MS;
      alpha = target > from ? Math.min(target, from + stepMs / FLAT_MOTION.riseMs) : Math.max(target, from - stepMs / FLAT_MOTION.exitMs);
    }
  }
  if (alpha !== target) F.lagging = true;
  row.alpha = alpha;
  row.at = F.now;
  if (alpha > 0) {
    row.frame = F.frame;
    F.names.namesNow.push(row);
  }
  return alpha;
}

function planName(n: PlacedName, alphas: ReadonlyMap<string, number>, share: number, wasFocus: boolean): void {
  const row = drawnNameOf(n, wasFocus);
  row.admitted = F.frame;
  row.name = n;
  placeName(row, alphas, share, false);
}

/** Plans a name's mark at the ink it draws this frame; `fading` names one no longer admitted, its ink running out. */
function placeName(row: DrawnName, alphas: ReadonlyMap<string, number>, share: number, fading: boolean): void {
  const n = row.name;
  const wasFocus = row.wasFocus;
  const at = screenAt(n.id);
  if (!at || alphas.get(n.id) === 0) return;
  if (at.x + n.box.maxX < 0 || at.x + n.box.minX > F.W || at.y + n.box.maxY < 0 || at.y + n.box.minY > F.H) {
    if (!fading) row.offScreen = F.frame;
    return;
  }
  let target = 0;
  let room = 1;
  if (!fading) {
    loadNameInk(n);
    target = scratch[0]! * share;
  }
  glideName(row);
  // The selection's name stays with it at every zoom; every other name arrives only where it is clear.
  if (target > DRAWN_INK && n.id !== F.attention.focusId) {
    room = grownMarks.size > 0 ? smoothstep(ROOM_GONE_PX, ROOM_WHOLE_PX, nameRoom(n, at.x + row.dx - n.dx, at.y + row.dy - n.dy)) : 1;
    target *= room;
  }
  if (target <= DRAWN_INK) target = 0;
  const ink = drawnNameInk(row, target);
  if (ink <= DRAWN_INK) return;
  const { P, attention } = F;
  const inks = F.tokens.inks;
  const childSelected = n.role === "domain" && attention.selected && attention.focusId !== n.id && F.model.domainOf.get(attention.focusId ?? "") === n.id;
  const strong = (n.role === "domain" && !childSelected) || n.role === "project" || ((n.role === "capability" || n.role === "element") && (wasFocus || n.id === attention.focusId));
  const color = strong ? inks.nameStrong : inks.name;
  const mark = names.take();
  mark.name = n;
  const x = at.x + row.dx;
  const y = at.y + row.dy;
  const halo = n.role === "domain" ? P.domainNameHaloPx : P.nameHaloPx;
  if (mark.x !== x) mark.x = x;
  if (mark.y !== y) mark.y = y;
  if (mark.ink !== ink) mark.ink = ink;
  if (mark.room !== room) mark.room = room;
  mark.fading = fading;
  mark.color = color;
  if (mark.halo !== halo) mark.halo = halo;
  const markR = n.leader ? (n.role === "element" ? dotRadius(n.id) : discRadius(n.id)) : 0;
  if (mark.markR !== markR) mark.markR = markR;
  L.names.add(mark);
}

const TITLE_ROLES: ReadonlySet<PlacedName["role"]> = new Set(["project", "domain", "orphans"]);

/**
 * Titles and the names a lit picture asks for (the selection and its lines' far ends) hold their place
 * over marks, as admission placed them; a far end's name still gives way to a higher-ranked name, and a
 * census or reach row is a caption that gives way like any name.
 */
function holdsPlace(n: PlacedName): boolean {
  return TITLE_ROLES.has(n.role) || ((n.role === "capability" || n.role === "element") && F.attention.named.has(n.id));
}

const NAME_RANKS = 5;
const nameRanks: number[] = [];
/** This frame's admitted names, each on the side it draws: an open star's member may trade its side for one clear of chrome. */
const plannedNames: PlacedName[] = [];

/** Which names win where two would cross: places held, then names the lit picture asks for, capabilities, elements, and captions last. */
function nameRank(n: PlacedName): number {
  if (holdsPlace(n)) return n.id === F.attention.focusId || TITLE_ROLES.has(n.role) ? 0 : 1;
  if (n.role !== "capability" && n.role !== "element") return 4;
  return n.role === "capability" ? 2 : 3;
}
/** This frame's grown discs, then its grown dots from `grownDiscCount` on. */
const grownMarks = new FrameList<Disc | Dot>();
let grownDiscCount = 0;

/** This frame's discs and dots an opened star or a selection grew, gathered once before the names. O(marks). */
function collectGrownMarks(): void {
  grownMarks.restart();
  grownDiscCount = 0;
  if (grownIds.size === 0) return;
  for (let i = 0; i < L.discs.size; i += 1) if (grownIds.has(L.discs.items[i]!.id)) grownMarks.add(L.discs.items[i]!);
  grownDiscCount = grownMarks.size;
  for (let i = 0; i < L.dots.size; i += 1) if (grownIds.has(L.dots.items[i]!.id)) grownMarks.add(L.dots.items[i]!);
}

/**
 * The air, in px, between a name's glyphs where this frame draws them, from `x`, `y`, and the nearest
 * disc not its own, grown dot (none for a backed name, whose plate covers them) or name drawn before
 * it, less the pad two names keep. Only while marks grow: O(discs + grown dots + names) per name.
 */
function nameRoom(n: PlacedName, x: number, y: number): number {
  const pad = F.P.namePadPx;
  const minX = x + n.box.minX + pad;
  const maxX = x + n.box.maxX - pad;
  const minY = y + n.box.minY + pad;
  const maxY = y + n.box.maxY - pad;
  let room = Infinity;
  for (let i = 0; i < L.discs.size; i += 1) {
    const m = L.discs.items[i]!;
    if (m.id !== n.id) room = Math.min(room, Math.hypot(Math.max(minX - m.x, 0, m.x - maxX), Math.max(minY - m.y, 0, m.y - maxY)) - m.r);
  }
  if (n.backed !== true) {
    for (let i = grownDiscCount; i < grownMarks.size; i += 1) {
      const m = grownMarks.items[i]!;
      if (m.id !== n.id) room = Math.min(room, Math.hypot(Math.max(minX - m.x, 0, m.x - maxX), Math.max(minY - m.y, 0, m.y - maxY)) - m.r);
    }
  }
  for (let i = 0; i < L.names.size; i += 1) {
    const o = L.names.items[i]!;
    if (o.name.id === n.id) continue;
    const ox = o.x - o.name.dx;
    const oy = o.y - o.name.dy;
    const apart = Math.max(ox + o.name.box.minX + pad - maxX, minX - (ox + o.name.box.maxX - pad), oy + o.name.box.minY + pad - maxY, minY - (oy + o.name.box.maxY - pad));
    room = Math.min(room, apart - pad);
  }
  return room;
}

/** Whether a concept's block of names may draw: its concept is not placed this frame, it is the selection, or every line clears the chrome. */
function blockShows(list: readonly PlacedName[], from: number, to: number, chrome: readonly Box[], selectedId: string | null): boolean {
  const at = screenAt(list[from]!.id);
  return !at || nameBlockDraws(list, from, to, at.x, at.y, chrome, selectedId);
}

/** Whether every line of a block stands inside the free map by the frame margin, as a framed star does. O(block). */
function blockInsideFree(list: readonly PlacedName[], from: number, to: number): boolean {
  const at = screenAt(list[from]!.id);
  if (!at) return true;
  const f = F.input.freeRect;
  const m = F.P.frameMarginPx;
  const pad = F.P.namePadPx;
  for (let i = from; i < to; i += 1) {
    const b = list[i]!.box;
    if (at.x + b.minX + pad < f.minX + m || at.x + b.maxX - pad > f.maxX - m || at.y + b.minY + pad < f.minY + m || at.y + b.maxY - pad > f.maxY - m) return false;
  }
  return true;
}

/** Whether an opened domain star's member block may draw: clear of the chrome and inside the free map. */
function memberBlockShows(list: readonly PlacedName[], from: number, to: number, chrome: readonly Box[]): boolean {
  return blockShows(list, from, to, chrome, null) && blockInsideFree(list, from, to);
}

/** The share of its full radius a capability disc is drawn at, 1 for a disc no crowd shrank. */
function crowdKept(d: Disc): number {
  const full = graphDiscRadiusPx("capability", F.model.capabilityById.get(d.id)?.elementIds.length ?? 0, F.P, F.growth);
  return Math.min(1, d.r / full);
}

/** A glow under one disc of the hovered or selected set, no wider for a crowd-shrunk disc than its size carries; the rest picture draws none. */
function addGlow(d: Disc, isProject: boolean): void {
  const { P, growth } = F;
  if (isProject) scratch[0] = F.projectShare;
  else loadGlowShare(d.id);
  const share = scratch[0]!;
  if (share <= DRAWN_INK) return;
  const halo = isProject ? P.projectGlowPx * growth : F.model.domainById.has(d.id) ? P.domainGlowPx * growth : d.r + P.capGlowPx * growth * crowdKept(d);
  const focusGain = d.focus ? FOCUS_GLOW_ALPHA / P.glowAlpha : 1;
  const alpha = Math.min(1, P.glowAlpha * focusGain) * d.ink * d.ink * share;
  const g = glows.take();
  if (g.x !== d.x) g.x = d.x;
  if (g.y !== d.y) g.y = d.y;
  if (g.r !== halo) g.r = halo;
  g.ink = d.hue;
  if (g.alpha !== alpha) g.alpha = alpha;
  L.glows.add(g);
}

function segmentBetween(a: Point, b: Point, ink: string, toElement: boolean): Segment {
  const s = segments.take();
  if (s.x0 !== a.x) s.x0 = a.x;
  if (s.y0 !== a.y) s.y0 = a.y;
  if (s.x1 !== b.x) s.x1 = b.x;
  if (s.y1 !== b.y) s.y1 = b.y;
  s.ink = ink;
  s.toElement = toElement;
  s.spoke = false;
  return s;
}

function discAt(id: string, at: Point, hue: string, focus: boolean, state: Disc["state"]): Disc {
  const d = discs.take();
  d.id = id;
  if (d.x !== at.x) d.x = at.x;
  if (d.y !== at.y) d.y = at.y;
  d.hue = hue;
  d.focus = focus;
  d.state = state;
  return d;
}

function pickOf(d: Disc): DialPick {
  const p = pickPool.take();
  p.id = d.id;
  p.solid = true;
  if (p.x !== d.x) p.x = d.x;
  if (p.y !== d.y) p.y = d.y;
  if (p.r !== d.r) p.r = d.r;
  p.reachPx = Math.max(d.r, F.P.pickMinPx);
  return p;
}

/** One domain's disc, its capability discs and links, and any element fan that draws. O(members). */
function planCluster(c: FlatGraphCluster, projectAt: Point | null, projectInk: number): void {
  const { P, attention, contextMode } = F;
  const alphas = cacheFor(alphaCache, F.layout);
  const hue = hueOf(c.domainId);
  const at = screenOf(c.domainId);
  const domainHidden = lensHidden(c.domainId);
  alphas.set(c.domainId, domainHidden ? 0 : 1);
  loadMarkInk(c.domainId);
  const ink = scratch[0]!;
  if (projectAt && !contextMode && F.projectShare > DRAWN_INK && segmentOnScreen(projectAt, at)) {
    const s = segmentBetween(projectAt, at, F.tokens.inks.project, false);
    const alpha = P.linkDomainAlpha * F.projectShare * Math.min(ink, projectInk);
    if (s.alpha !== alpha) s.alpha = alpha;
    L.segments.add(s);
  }
  if (!domainHidden && onScreen(at)) {
    const d = discAt(c.domainId, at, hue, c.domainId === attention.focusId, "current");
    const r = discRadius(c.domainId);
    if (d.r !== r) d.r = r;
    if (d.ink !== ink) d.ink = ink;
    L.domains.add(d);
  }
  const evidence = F.evidence;
  for (let i = 0; i < c.items.length; i += 1) {
    const it = c.items[i]!;
    if (it.direct) {
      if (F.dotAlpha > DRAWN_INK || expandedItems.has(it.id)) planElements(it, at, hue);
      continue;
    }
    const itemAt = screenOf(it.id);
    loadMarkInk(it.id);
    const itemInk = scratch[0]!;
    const itemHidden = lensHidden(it.id);
    alphas.set(it.id, itemHidden ? 0 : 1);
    if (!contextMode && segmentOnScreen(at, itemAt)) {
      const s = segmentBetween(at, itemAt, hue, false);
      const alpha = P.linkCapAlpha * Math.min(ink, itemInk);
      if (s.alpha !== alpha) s.alpha = alpha;
      L.segments.add(s);
    }
    if (!itemHidden && onScreen(itemAt)) {
      const d = discAt(it.id, itemAt, hue, it.id === attention.focusId, evidence !== null ? evidence.stateOf(it.id) : "current");
      const r = discRadius(it.id);
      if (d.r !== r) d.r = r;
      if (d.ink !== itemInk) d.ink = itemInk;
      L.discs.add(d);
    }
    if (F.dotAlpha > DRAWN_INK || expandedItems.has(it.id)) planElements(it, itemAt, hue);
  }
}

/** The items whose element fans draw although dots are hidden: lit, required or the agent's. O(lit). */
function markExpandedItems(lit: ReadonlySet<string> | null, required: ReadonlySet<string>, agentId: string | null): void {
  expandedItems.clear();
  const model = F.model;
  const add = (id: string) => {
    const owner = model.capabilityOf.get(id);
    if (owner !== undefined) expandedItems.add(owner);
    else if (!model.capabilityById.has(id) && !model.domainById.has(id)) {
      const domain = model.domainOf.get(id);
      if (domain) expandedItems.add(directItemId(domain));
    }
  };
  if (lit) for (const id of lit) add(id);
  for (const id of required) add(id);
  if (agentId) add(agentId);
}

function planElements(it: FlatGraphItem, itemAt: Point, hue: string): void {
  const { P, input, attention, contextMode } = F;
  const alphas = cacheFor(alphaCache, F.layout);
  loadMarkInk(it.direct ? it.domainId : it.id);
  const itemInk = scratch[0]!;
  const itemR = it.direct ? 0 : discRadius(it.id);
  for (let i = 0; i < it.elementIds.length; i += 1) {
    const el = it.elementIds[i]!;
    const lit = attention.lit?.has(el) === true;
    const uncovered = lensHidden(el) ? 0 : Math.max(F.dotAlpha, lit ? F.focusness : 0, fanShare(el), F.required.has(el) || el === input.agentFocusNodeId ? 1 : 0);
    if (uncovered <= DRAWN_INK) continue;
    const elAt = screenOf(el);
    const visible = onScreen(elAt);
    // A dot off screen keeps no radius, so it neither steps nor keeps the loop awake.
    const r = visible ? dotRadius(el) : 0;
    // Only a disc larger than the dot covers it, and never the selection's own, which its ring marks.
    const coverR = !visible || el === F.selectedId || el === F.leavingId ? 0 : itemR;
    const clear = coverR > r ? Math.hypot(elAt.x - itemAt.x, elAt.y - itemAt.y) - coverR - r : ROOM_WHOLE_PX;
    const shown = uncovered * smoothstep(ROOM_GONE_PX, ROOM_WHOLE_PX, clear);
    if (shown <= DRAWN_INK) continue;
    alphas.set(el, 1);
    shownElements.add(el);
    loadMarkInk(el);
    const elInk = scratch[0]!;
    if (!contextMode && segmentOnScreen(itemAt, elAt)) {
      const fanned = fanShare(el);
      const s = segmentBetween(itemAt, elAt, hue, true);
      s.spoke = fanned > 0;
      if (s.spoke) {
        // A spoke starts outside the selection ring, so the ring stays one unbroken circle.
        const length = Math.hypot(elAt.x - itemAt.x, elAt.y - itemAt.y) || 1;
        const start = Math.min(1, ((itemR + P.selectedRingGapPx + P.selectedRingPx) * fanned) / length);
        s.x0 = itemAt.x + (elAt.x - itemAt.x) * start;
        s.y0 = itemAt.y + (elAt.y - itemAt.y) * start;
      }
      const alpha = (P.linkElementAlpha + (P.fanSpokeAlpha - P.linkElementAlpha) * fanned) * Math.min(itemInk, elInk) * shown;
      if (s.alpha !== alpha) s.alpha = alpha;
      L.segments.add(s);
    }
    if (visible) {
      const d = dots.take();
      const alpha = DOT_ALPHA * shown;
      d.id = el;
      if (d.x !== elAt.x) d.x = elAt.x;
      if (d.y !== elAt.y) d.y = elAt.y;
      if (d.r !== r) d.r = r;
      d.hue = hue;
      if (d.ink !== elInk) d.ink = elInk;
      if (d.alpha !== alpha) d.alpha = alpha;
      d.lit = lit;
      L.dots.add(d);
    }
  }
}

function buildPlan(input: DialFrameInput, tokens: FlatGraphTokens, motion: GraphMotion) {
  const attention = motion.current;
  const mix = motion.baseMix;
  const { model, scene } = input.dial;
  const measureText = measureTextOf(model);
  const layout = scene.graph!;
  const P = tokens.paint;
  const inks = tokens.inks;
  const contextMode = input.contextAlphas !== undefined;
  const growth = zoomGrowth(input.zoomRatio, P);
  const origin = input.toScreen(0, 0);
  F.input = input; F.model = model; F.layout = layout; F.tokens = tokens; F.P = P;
  F.motion = motion; F.attention = attention;
  F.contextMode = contextMode; F.scale = input.scale; F.originX = origin.x; F.originY = origin.y;
  F.W = input.viewportWidth; F.H = input.viewportHeight; F.growth = growth; F.stamp += 1;
  F.screen = cacheFor(screenCache, layout); F.radii = radiusCacheFor(layout, growth, input.scale); F.orphans = orphansOf(layout);
  let drawn = drawnRadii.get(input.worldKey);
  if (!drawn) drawnRadii.set(input.worldKey, (drawn = { frame: 0, marks: new Map(), names: new Map(), namesBefore: [], namesNow: [] }));
  drawn.frame += 1;
  const before = drawn.namesBefore;
  drawn.namesBefore = drawn.namesNow;
  drawn.namesNow = before;
  drawn.namesNow.length = 0;
  F.names = drawn;
  F.drawn = drawn.marks; F.frame = drawn.frame; F.now = input.now; F.reducedMotion = input.reducedMotion; F.lagging = false;
  grownIds.clear();
  const step = zoomStep(input.scale, P.zoomStepsPerOctave);
  const stepGrowth = zoomGrowth((input.zoomRatio * stepScale(step, P.zoomStepsPerOctave)) / input.scale, P);
  stepGrowthNow[0] = stepGrowth;
  stepGrowthNow[1] = stepScale(step, P.zoomStepsPerOctave);
  const focusness = motion.share(MOTION_SHARE.focus, attention.lit ? 1 : 0);
  const evidence = input.evidence ? dialEvidenceView(model, input.evidence) : null;
  const measured = evidence?.measured === true;
  F.elementPitch = scene.medianElementPitch;
  const elementSpacingPx = scene.medianElementPitch * input.scale;
  const dotAlpha = smoothstep(P.dotSpacingFromPx, P.dotSpacingFullPx, elementSpacingPx);
  F.dotAlpha = dotAlpha;
  F.focusness = focusness;
  F.evidence = measured ? evidence : null;
  const selected = contextMode ? null : input.focusedNodeId;
  F.selectedId = selected !== null && selected !== model.projectId && !model.domainById.has(selected) ? selected : null;
  F.opened.length = 0;
  F.starCount = 0;
  const left = motion.previous.focusId;
  F.leavingId = !motion.settled && motion.previous.selected && left !== null && left !== F.selectedId && left !== model.projectId && !model.domainById.has(left) ? left : null;
  // The selection never stands in its own star, so its radius asks for the selected radius alone; its fan rings what it draws.
  if (F.selectedId !== null) {
    const r = selectedDiscRadius(radiusNow(F.selectedId), P, growth);
    if (F.selectedR !== r) F.selectedR = r;
    const share = attention.selected && attention.focusId === F.selectedId ? mix : 1;
    const elements = openedElements(model, layout, F.selectedId, P, discRadius(F.selectedId), input.scale, growth);
    if (elements !== null && share > 0) F.opened.push({ elements, share });
  }
  planOpenStars(input.focusedNodeId);
  if (F.leavingId !== null) {
    const r = openedRadius(F.leavingId, radiusNow(F.leavingId));
    if (F.leavingR !== r) F.leavingR = r;
    const elements = openedElements(model, layout, F.leavingId, P, discRadius(F.leavingId), input.scale, growth);
    if (elements !== null && mix < 1) F.opened.push({ elements, share: 1 - mix });
  }
  const projectShare = motion.share(MOTION_SHARE.project, attention.focusId !== null && attention.focusId === model.projectId ? 1 : 0);
  if (F.projectShare !== projectShare) F.projectShare = projectShare;
  F.lineKinds = 0;

  for (let pIndex = 0; pIndex < POOLS.length; pIndex += 1) {
    const p = POOLS[pIndex]!;
    p.reset();
  }
  const plan = framePlan;
  for (let listIndex = 0; listIndex < PLAN_LISTS.length; listIndex += 1) PLAN_LISTS[listIndex]!.restart();
  plan.selection = null;
  plan.agentRing = null;
  const alphas = cacheFor(alphaCache, layout);
  if (alphas.size === 0) for (const id of model.domainOf.keys()) alphas.set(id, 0);
  for (let elIndex = 0; elIndex < shownElements.size; elIndex += 1) alphas.set(shownElements.items[elIndex]!, 0);
  shownElements.restart();
  const picks = framePicks;
  picks.restart();
  const required = input.requiredBranchIds ?? NO_IDS;
  F.required = required;
  markExpandedItems(contextMode ? null : attention.lit, required, input.agentFocusNodeId);

  for (let cIndex = 0; cIndex < layout.clusters.length; cIndex += 1) {
    const c = layout.clusters[cIndex]!;
    const ink = inkOf(c.domainId);
    const home = layout.positions.get(c.domainId) ?? c.centre;
    const domainAt = screenOf(c.domainId);
    const x = domainAt.x + (c.centre.x - home.x) * input.scale;
    const y = domainAt.y + (c.centre.y - home.y) * input.scale;
    const r = c.footprint * input.scale * P.lightReach;
    const alpha = P.lightAlpha * Math.min(1, ink * LIGHT_SINK_GAIN) * (contextMode ? P.sinkInk : 1);
    if (!lensHidden(c.domainId) && alpha > 0.002 && x + r > 0 && y + r > 0 && x - r < F.W && y - r < F.H) L.lights.add(light(x, y, r, hueOf(c.domainId), alpha));
  }

  const project = model.projectId !== null && layout.positions.has(model.projectId) ? model.projectId : null;
  const projectAt = project ? screenOf(project) : null;
  if (project && projectAt) {
    alphas.set(project, 1);
    loadMarkInk(project);
    L.project.add(disc(project, projectAt, radiusAt(project, growth), inks.project, scratch[0]!, project === attention.focusId, "current"));
  }

  if (project) loadMarkInk(project);
  const projectInk = project ? scratch[0]! : 0;
  for (let cIndex = 0; cIndex < layout.clusters.length; cIndex += 1) planCluster(layout.clusters[cIndex]!, projectAt, projectInk);
  for (let idIndex = 0; idIndex < layout.orphanIds.length; idIndex += 1) {
    const id = layout.orphanIds[idIndex]!;
    const at = screenOf(id);
    const hidden = lensHidden(id);
    alphas.set(id, hidden ? 0 : 1);
    if (hidden || !onScreen(at)) continue;
    const d = discAt(id, at, inks.name, id === attention.focusId, "current");
    const r = discRadius(id);
    loadMarkInk(id);
    const ink = scratch[0]!;
    if (d.r !== r) d.r = r;
    if (d.ink !== ink) d.ink = ink;
    L.discs.add(d);
  }
  L.lights.seal(); L.project.seal(); L.segments.seal(); L.domains.seal(); L.discs.seal(); L.dots.seal();
  shownElements.seal();

  const presence = dialChordPresence(input.dialTokens, input.domainAppear);
  const restAlpha = (1 - focusness) * presence;
  drawnFlowKeys.restart();
  if (!contextMode && restAlpha > DRAWN_INK) {
    const rest = restArcs(model, P.restBudget);
    for (let arcIndex = 0; arcIndex < rest.length; arcIndex += 1) {
      const arc = rest[arcIndex]!;
      const a = screenAt(arc.from);
      const b = screenAt(arc.to);
      if (!a || !b) continue;
      const width = Math.min(P.arcWidthMaxPx, P.arcWidthBasePx + P.arcWidthGain * arc.count);
      const alpha = Math.min(P.arcAlphaMax, P.arcAlphaBase + P.arcAlphaGain * arc.count) * restAlpha * Math.min(inkOf(arc.from), inkOf(arc.to));
      const mark = arcMark(a, b, P.arcBow, radiusAt(arc.from, growth), radiusAt(arc.to, growth) + P.arcTrimPx, width, alpha, true, P.arcGlowAlpha * restAlpha, REST_ARC);
      if (!mark) continue;
      L.arcs.add(mark);
      F.lineKinds |= FLAT_LINE_BITS.rest;
      const key = flowKeyOf(model, arc.from, arc.to);
      if (key !== undefined && !drawnFlowKeys.has(key)) drawnFlowKeys.add(key);
    }
  }
  frameChords.restart();
  if (!contextMode) focusLinks(motion);
  L.arcs.seal(); L.focusArcs.seal(); drawnFlowKeys.seal(); frameChords.seal();

  for (let dIndex = 0; dIndex < plan.domains.length; dIndex += 1) {
    const d = plan.domains[dIndex]!;
    addGlow(d, false);
  }
  for (let dIndex = 0; dIndex < plan.discs.length; dIndex += 1) {
    const d = plan.discs[dIndex]!;
    addGlow(d, false);
  }
  for (let dIndex = 0; dIndex < plan.project.length; dIndex += 1) {
    const d = plan.project[dIndex]!;
    addGlow(d, true);
  }
  L.glows.seal();

  const selectedId = input.focusedNodeId;
  if (selectedId && !contextMode) {
    const at = screenAt(selectedId);
    if (at) {
      const pulse = input.selectionPulse?.nodeId === selectedId ? input.selectionPulse.scaleFactor : 1;
      plan.selection = ring(selectionRing, at.x, at.y, (discRadius(selectedId) + P.selectedRingGapPx) * pulse, mix, inks.project);
    }
  } else if (F.leavingId !== null && !contextMode) {
    const at = screenAt(F.leavingId);
    if (at) plan.selection = ring(selectionRing, at.x, at.y, discRadius(F.leavingId) + P.selectedRingGapPx, 1 - mix, inks.project);
  }

  const agentId = contextMode ? null : input.agentFocusNodeId;
  const agentAt = agentId ? screenAt(agentId) : undefined;
  if (agentId && agentAt && alphas.get(agentId) !== 0) {
    plan.agentRing = ring(agentRing, agentAt.x, agentAt.y, radiusAt(agentId, growth) + AGENT_FOCUS_RING_OFFSET, 1, input.mapTokens.amberHub);
  }

  const fontFamily = labelFontFamily();
  const unmeasuredLine = evidence !== null && !evidence.measured ? input.labels?.evidenceUnmeasured?.() ?? null : null;
  const admitUnder = (a: GraphAttention) => admittedNames({
    model, layout, tokens: P, labels: input.labels, measureText, fontFamily, scale: input.scale, growth: stepGrowth,
    elementLabel: input.elementLabel, staleByDomain: measured ? evidence!.staleByDomain : null,
    lit: contextMode ? null : a.lit, focusId: a.focusId, attentionKey: a.key, openStarId: F.starNow ? input.focusedNodeId : null, agentFocusId: contextMode ? null : input.agentFocusNodeId,
    selected: a.selected, named: a.named, reach: a.reach, lines: contextMode ? NO_LINES : a.lines,
    discRadius: stepRadius, elementSpacingPx, hubCaption: unmeasuredLine,
  });
  collectGrownMarks();
  const admission = admitUnder(attention);
  const leaving = F.leavingId;
  const chrome = input.nameObstacles ?? NO_BOXES;
  // A name gives way to the names drawn before it, so while names give way they are drawn in the
  // order they rank; with nothing grown no name gives way, and admission's order stands. O(names).
  const ranked = grownMarks.size > 0;
  const ranks = nameRanks;
  const planned = plannedNames;
  ranks.length = admission.names.length;
  planned.length = admission.names.length;
  const starId = F.starNow && input.focusedNodeId !== null && model.domainById.has(input.focusedNodeId) ? input.focusedNodeId : null;
  for (let nIndex = 0; nIndex < admission.names.length;) {
    const end = nameBlockEnd(admission.names, nIndex);
    const id = admission.names[nIndex]!.id;
    const member = starId !== null && model.capabilityById.has(id) && model.domainOf.get(id) === starId;
    let show = member ? memberBlockShows(admission.names, nIndex, end, chrome) : blockShows(admission.names, nIndex, end, chrome, contextMode ? null : selectedId);
    planned[nIndex] = admission.names[nIndex]!;
    // An open star's member whose side runs under chrome or out of the free map takes the best of its other sides that clears it.
    const alternates = show ? undefined : admission.alternates.get(id);
    if (alternates !== undefined && end === nIndex + 1) {
      for (let k = 0; k < alternates.length && !show; k += 1) {
        if (memberBlockShows(alternates, k, k + 1, chrome)) {
          planned[nIndex] = alternates[k]!;
          show = true;
        }
      }
    }
    for (let i = nIndex; i < end; i += 1) {
      const n = i === nIndex ? planned[i]! : (planned[i] = admission.names[i]!);
      if (!ranked && show) planName(n, alphas, n.id === leaving ? mix : 1, false);
      ranks[i] = ranked && show ? nameRank(n) : -1;
    }
    nIndex = end;
  }
  if (ranked) {
    for (let rank = 0; rank < NAME_RANKS; rank += 1) {
      for (let i = 0; i < planned.length; i += 1) {
        const n = planned[i]!;
        if (ranks[i] === rank) planName(n, alphas, n.id === leaving ? mix : 1, false);
      }
    }
  }
  // A deselected name keeps its selected size and fades on the exit mix while its rest name fades in.
  if (leaving !== null) {
    const before = admitUnder(motion.previous);
    for (let nIndex = 0; nIndex < before.names.length;) {
      const end = nameBlockEnd(before.names, nIndex);
      if (before.names[nIndex]!.id === leaving && blockShows(before.names, nIndex, end, chrome, null)) {
        for (let i = nIndex; i < end; i += 1) planName(before.names[i]!, alphas, 1 - mix, true);
      }
      nIndex = end;
    }
  }
  // A name the frame before drew that is no longer admitted keeps its place while its ink runs out.
  const drewBefore = F.names.namesBefore;
  for (let i = 0; i < drewBefore.length; i += 1) {
    const row = drewBefore[i]!;
    if (row.frame !== F.frame && row.admitted !== F.frame) placeName(row, alphas, 1, true);
  }
  const hub = plan.project[0];
  if (hub) {
    const placement = dialPlacementOf(input.dial);
    let line = 0;
    const hubLine = (text: string | null | undefined) => {
      if (!text) return;
      const font = hubCaptionFont(P.captionPx, fontFamily);
      const w = measureText(text, font);
      const dy = hub.r + P.nameGapPx + P.captionPx / 2 + line * (P.captionPx + P.captionGapPx);
      line += 1;
      const name = hubNames.take();
      name.id = hub.id; name.text = text; name.font = font;
      if (name.dy !== dy) name.dy = dy;
      setBox(name.box, -w / 2 - P.namePadPx, w / 2 + P.namePadPx, dy - P.captionPx / 2 - P.namePadPx, dy + P.captionPx / 2 + P.namePadPx);
      if (boxUnderAny(chrome, hub.x + name.box.minX, hub.x + name.box.maxX, hub.y + name.box.minY, hub.y + name.box.maxY)) return;
      L.names.add(nameMark(name, hub.x, hub.y + dy, inkOf(hub.id), inks.name, P.nameHaloPx));
    };
    hubLine(dialPlacementLine(placement.state, placement.progress, input.labels));
    hubLine(unmeasuredLine);
  }

  L.names.seal();

  if (plan.dots.length > 0) for (let elIndex = 0; elIndex < shownElements.size; elIndex += 1) {
    const el = shownElements.items[elIndex]!;
    const at = screenAt(el);
    if (at && pickable(at)) picks.add(elementPick(el, at));
  }
  const elementPicks = picks.size;
  for (let dIndex = 0; dIndex < plan.discs.length; dIndex += 1) {
    const d = plan.discs[dIndex]!;
    picks.add(pickOf(d));
  }
  for (let dIndex = 0; dIndex < plan.domains.length; dIndex += 1) {
    const d = plan.domains[dIndex]!;
    picks.add(pickOf(d));
  }
  for (let dIndex = 0; dIndex < plan.project.length; dIndex += 1) {
    const d = plan.project[dIndex]!;
    picks.add(pickOf(d));
  }
  const rows = frameRows;
  rows.restart();
  const labelBoxes = frameLabelBoxes;
  labelBoxes.restart();
  const pad = P.namePadPx;
  for (let nIndex = 0; nIndex < plan.names.length; nIndex += 1) {
    const n = plan.names[nIndex]!;
    if (n.fading) continue;
    const ox = n.x - n.name.dx;
    const oy = n.y - n.name.dy;
    const label = labelBoxPool.take();
    label.nodeId = n.name.id;
    label.text = n.name.text;
    setBox(label, ox + n.name.box.minX + pad, ox + n.name.box.maxX - pad, oy + n.name.box.minY + pad, oy + n.name.box.maxY - pad);
    labelBoxes.add(label);
    if (n.ink > P.sinkInk && n.name.role !== "units" && n.name.role !== "orphans" && n.name.role !== "reach") {
      const row = nameRows.take();
      row.id = n.name.id;
      setBox(row.box, ox + n.name.box.minX, ox + n.name.box.maxX, oy + n.name.box.minY, oy + n.name.box.maxY);
      rows.add(row);
    }
  }
  for (let i = 0; i < elementPicks; i += 1) rows.add(dotRow(picks.items[i]!));

  return { plan, alphas, picks: picks.seal(), rows: rows.seal(), labelBoxes: labelBoxes.seal(), presence, tier: (dotAlpha > 0.5 ? "element" : "circuit") as DialFrameResult["tier"] };
}

const hubFonts = new Map<string, string>();

function hubCaptionFont(px: number, family: string): string {
  let font = hubFonts.get(family);
  if (font === undefined) hubFonts.set(family, (font = `${FONT_WEIGHT.signature} ${px}px ${family}`));
  return font;
}

/**
 * The name admission's disc radius at this frame's zoom step. A module function, not a closure: a
 * closure kept across frames would hold the frame that made it, and through it an unmounted canvas.
 */
const stepGrowthNow = new Float64Array(2);
const LINE_TRIMS = new Float64Array(2);
function stepRadius(id: string): number {
  const own = radiusOf(id, stepGrowthNow[0]!, stepGrowthNow[1]!);
  const star = F.stars[0]!;
  const room = F.starNow ? star.rooms.get(id) : undefined;
  if (room === undefined) return own;
  // Names stand where the star has fully opened, so they never move as it opens.
  const nearestOwn = room.nearestId === null ? 0 : radiusOf(room.nearestId, stepGrowthNow[0]!, stepGrowthNow[1]!);
  const fixedPx = star.domain ? graphDiscRadiusPx("domain", 0, F.P, stepGrowthNow[0]!) : star.fixedPx;
  return openRadiusPx(own, room, star.world ? stepGrowthNow[1]! : 1, fixedPx, F.P, nearestOwn);
}

/**
 * The focus's relations as kinded lines, each drawn `reach` of the way from its source end; a
 * taper's point stops short of the disc it reaches. A selection's fully drawn lines also become the
 * light layer's chords.
 */
function focusLinks(motion: GraphMotion): void {
  const P = F.P;
  // A selection the map opened with (a deep link, a rebuilt world) changed nothing here, so it does not light.
  const chorded = motion.current.selected && motion.settled && Number.isFinite(motion.changedAt) && !F.input.reducedMotion;
  const devicePxPerCss = F.W > 0 ? F.input.ctx.canvas.width / F.W : 1;
  for (let lineIndex = 0; lineIndex < motion.drawnCount; lineIndex += 1) {
    const { line, reach, current } = motion.drawn[lineIndex]!;
    if (reach <= DRAWN_INK) continue;
    const a = screenAt(line.from);
    const b = screenAt(line.to);
    if (!a || !b) continue;
    const kind = LINE_KINDS.indexOf(line.kind) + 1;
    const tapered = line.kind === "needs" || line.kind === "neededBy";
    const betweenDomains = F.model.domainById.has(line.from) && F.model.domainById.has(line.to);
    litLineTrimsInto(LINE_TRIMS, F.layout, line, Math.hypot(b.x - a.x, b.y - a.y), F.scale, F.growth, discRadius(line.from), discRadius(line.to), P);
    // A line to a fanned element is a fan's length long: a taper that short reads as a blot, so it draws as a hair.
    const withinFan = fanShare(line.from) > 0 || fanShare(line.to) > 0;
    const width = tapered && !withinFan ? Math.min(P.lineTaperMaxPx, P.lineTaperPx + P.lineTaperGainPx * (line.weight - 1)) : line.kind === "relates" ? P.lineDotPx : P.lineHairPx;
    // A relation between a capability and its own fanned element runs straight along that element's spoke, from outside the ring.
    const spoke = alongSpoke(line.from, line.to);
    const ring = spoke ? P.selectedRingGapPx + P.selectedRingPx : 0;
    const ownsFrom = spoke && F.model.capabilityById.has(line.from) && fanShare(line.to) > 0;
    const mark = arcMark(a, b, spoke ? 0 : P.lineBow, LINE_TRIMS[0]! + (ownsFrom ? ring : 0), LINE_TRIMS[1]! + (spoke && !ownsFrom ? ring : 0), width, P.lineAlpha, false, 0, kind);
    if (!mark) continue;
    const { a: start, b: end } = mark.path;
    if (reach * Math.hypot(end.x - start.x, end.y - start.y) * devicePxPerCss < 1) continue;
    mark.key = line.key;
    if (mark.reach !== reach) mark.reach = reach;
    if (betweenDomains) {
      // The end outside the member star fades in, so the line emerges from the cluster's light.
      const fade = Math.min(0.5, P.lineFadePx / (Math.hypot(end.x - start.x, end.y - start.y) || 1));
      if (line.kind === "needs") mark.fadeStart = fade;
      else mark.fadeEnd = fade;
    }
    L.focusArcs.add(mark);
    if (current) F.lineKinds |= FLAT_LINE_BITS[line.kind] | (betweenDomains ? FLAT_LINE_BITS.domains : 0);
    if (chorded && current) frameChords.add(chordOf(mark, line.kind === "relates"));
  }
}

/** A chord runs the way impact travels: from what is needed, or the broader concept, toward what rests on it. */
function chordOf(arc: Arc, symmetric: boolean): DialChordLight {
  const chord = chordPool.take();
  const { a, c, b } = arc.path;
  const start = symmetric ? a : b;
  const end = symmetric ? b : a;
  chord.key = arc.key;
  if (chord.a.x !== start.x) chord.a.x = start.x;
  if (chord.a.y !== start.y) chord.a.y = start.y;
  if (chord.c.x !== c.x) chord.c.x = c.x;
  if (chord.c.y !== c.y) chord.c.y = c.y;
  if (chord.b.x !== end.x) chord.b.x = end.x;
  if (chord.b.y !== end.y) chord.b.y = end.y;
  if (chord.widthPx !== arc.width) chord.widthPx = arc.width;
  return chord;
}

function strokeArcs(ctx: CanvasRenderingContext2D, arcs: readonly Arc[], ink: string, headPx: number): void {
  for (let arcIndex = 0; arcIndex < arcs.length; arcIndex += 1) {
    const arc = arcs[arcIndex]!;
    const { a, c, b } = arc.path;
    if (arc.glow > 0.002) {
      ctx.globalAlpha = arc.glow * Math.min(1, arc.alpha * 4);
      ctx.lineWidth = arc.width + 4;
      ctx.strokeStyle = ink;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = arc.alpha;
    ctx.lineWidth = arc.width;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
    ctx.stroke();
    if (arc.head) {
      ctx.lineWidth = ARROW_WIDTH_PX;
      ctx.beginPath();
      ctx.moveTo(b.x - Math.cos(arc.path.angle - ARROW_SPREAD) * headPx, b.y - Math.sin(arc.path.angle - ARROW_SPREAD) * headPx);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(b.x - Math.cos(arc.path.angle + ARROW_SPREAD) * headPx, b.y - Math.sin(arc.path.angle + ARROW_SPREAD) * headPx);
      ctx.stroke();
    }
  }
}

/**
 * Fills a quadratic as a taper: `width` across at its start, a point at its end, so direction
 * reads without an arrowhead or a second hue.
 */
function fillTaper(ctx: CanvasRenderingContext2D, path: ArcPath, width: number, t0: number, t1: number, roundStart: boolean): void {
  const { a, c, b } = path;
  ctx.beginPath();
  for (let side = 1; side >= -1; side -= 2) {
    for (let k = 0; k <= TAPER_STEPS; k += 1) {
      const t = t0 + (side === 1 ? k / TAPER_STEPS : 1 - k / TAPER_STEPS) * (t1 - t0);
      const u = 1 - t;
      const x = u * u * a.x + 2 * u * t * c.x + t * t * b.x;
      const y = u * u * a.y + 2 * u * t * c.y + t * t * b.y;
      const tx = u * (c.x - a.x) + t * (b.x - c.x);
      const ty = u * (c.y - a.y) + t * (b.y - c.y);
      const len = Math.hypot(tx, ty) || 1;
      const half = side * ((width / 2) * u + TAPER_TIP_PX * t);
      if (side === 1 && k === 0) ctx.moveTo(x - (ty / len) * half, y + (tx / len) * half);
      else ctx.lineTo(x - (ty / len) * half, y + (tx / len) * half);
      if (roundStart && side === -1 && k === TAPER_STEPS) {
        // Back round the start: from the far side's edge, behind the start point, to the near side's.
        const heading = Math.atan2(ty, tx);
        ctx.arc(x, y, Math.abs(half), heading - Math.PI / 2, heading + Math.PI / 2, true);
      }
    }
  }
  ctx.closePath();
  ctx.fill();
}

/** Steps a faded end takes from transparent to the line's ink: no gradient object, so no allocation. */
const FADE_STEPS = 8;

/** A taper drawn to `reach`, its faded ends stepping up from transparent; a faded start is rounded. */
function fillFadedTaper(ctx: CanvasRenderingContext2D, arc: Arc): void {
  const { path, width, reach, fadeStart, fadeEnd, alpha } = arc;
  const bodyFrom = Math.min(reach, fadeStart);
  const bodyTo = Math.min(reach, 1 - fadeEnd);
  for (let k = 0; k < FADE_STEPS && fadeStart > 0; k += 1) {
    const from = (fadeStart * k) / FADE_STEPS;
    if (from >= reach) break;
    ctx.globalAlpha = (alpha * (k + 0.5)) / FADE_STEPS;
    fillTaper(ctx, path, width, from, Math.min(reach, (fadeStart * (k + 1)) / FADE_STEPS), k === 0);
  }
  ctx.globalAlpha = alpha;
  if (bodyTo > bodyFrom) fillTaper(ctx, path, width, bodyFrom, bodyTo, false);
  for (let k = 0; k < FADE_STEPS && fadeEnd > 0; k += 1) {
    const from = 1 - fadeEnd + (fadeEnd * k) / FADE_STEPS;
    if (from >= reach) break;
    ctx.globalAlpha = (alpha * (FADE_STEPS - k - 0.5)) / FADE_STEPS;
    fillTaper(ctx, path, width, from, Math.min(reach, 1 - fadeEnd + (fadeEnd * (k + 1)) / FADE_STEPS), false);
  }
}

/** Strokes the first `reach` of a quadratic: its own sub-curve, so a drawing line keeps its final bow. */
function strokeQuad(ctx: CanvasRenderingContext2D, path: ArcPath, offset: number, reach: number): void {
  const { a, c, b } = path;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ox = (-dy / len) * offset;
  const oy = (dx / len) * offset;
  const u = 1 - reach;
  const cx = a.x + (c.x - a.x) * reach;
  const cy = a.y + (c.y - a.y) * reach;
  const ex = u * u * a.x + 2 * u * reach * c.x + reach * reach * b.x;
  const ey = u * u * a.y + 2 * u * reach * c.y + reach * reach * b.y;
  ctx.beginPath();
  ctx.moveTo(a.x + ox, a.y + oy);
  ctx.quadraticCurveTo(cx + ox, cy + oy, ex + ox, ey + oy);
  ctx.stroke();
}

const lineDash = [0, 0];

/** The focus's lines: a taper per dependency, a dotted hairline per relation, a double hairline toward a broader concept. */
function paintLines(ctx: CanvasRenderingContext2D, arcs: readonly Arc[], tokens: FlatGraphTokens): void {
  const P = tokens.paint;
  for (let arcIndex = 0; arcIndex < arcs.length; arcIndex += 1) {
    const arc = arcs[arcIndex]!;
    const kind = LINE_KINDS[arc.kind - 1];
    ctx.globalAlpha = arc.alpha;
    if (kind === "needs" || kind === "neededBy") {
      ctx.fillStyle = kind === "needs" ? tokens.inks.arc : tokens.inks.reach;
      if (arc.fadeStart > 0 || arc.fadeEnd > 0) fillFadedTaper(ctx, arc);
      else fillTaper(ctx, arc.path, arc.width, 0, arc.reach, false);
      continue;
    }
    ctx.strokeStyle = tokens.inks.arc;
    ctx.lineWidth = arc.width;
    if (kind === "relates") {
      if (lineDash[1] !== P.lineDotGapPx) lineDash[1] = P.lineDotGapPx;
      ctx.setLineDash(lineDash);
      strokeQuad(ctx, arc.path, 0, arc.reach);
      ctx.setLineDash(NO_DASH);
      continue;
    }
    strokeQuad(ctx, arc.path, P.lineDoubleGapPx / 2, arc.reach);
    strokeQuad(ctx, arc.path, -P.lineDoubleGapPx / 2, arc.reach);
  }
  ctx.globalAlpha = 1;
}

const inkCodes = new Map<string, number>();
const inkCode = (ink: string): number => {
  let code = inkCodes.get(ink);
  if (code === undefined) inkCodes.set(ink, (code = inkCodes.size));
  return code;
};
const GROUP_LEVELS = 64;

interface Buckets<T> {
  byKey: Map<number, FrameList<T>>;
  all: FrameList<T>[];
  filled: FrameList<FrameList<T>>;
}
const buckets = <T>(): Buckets<T> => ({ byKey: new Map(), all: [], filled: new FrameList() });

/** Buckets marks by a numeric paint key, in first-seen key order; every list is reused across frames. */
function group<T>(into: Buckets<T>, items: readonly T[], key: (item: T) => number, keep?: (item: T) => boolean): FrameList<FrameList<T>> {
  for (let bIndex = 0; bIndex < into.all.length; bIndex += 1) into.all[bIndex]!.restart();
  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex]!;
    if (keep && !keep(item)) continue;
    const k = key(item);
    let list = into.byKey.get(k);
    if (!list) {
      into.byKey.set(k, (list = new FrameList<T>()));
      into.all.push(list);
    }
    list.add(item);
  }
  const out = into.filled;
  out.restart();
  for (let bIndex = 0; bIndex < into.all.length; bIndex += 1) if (into.all[bIndex]!.size > 0) out.add(into.all[bIndex]!);
  return out;
}

const level = (share: number): number => Math.round(Math.min(1, Math.max(0, share)) * (GROUP_LEVELS - 1)) | 0;
const discKey = (d: Disc): number => (((inkCode(d.hue) * GROUP_LEVELS + level(d.ink)) * 2 + (d.focus ? 1 : 0)) * 2 + (d.state === "unknown" ? 1 : 0)) | 0;
const segmentKey = (s: Segment): number => ((inkCode(s.ink) * 3 + (s.spoke ? 2 : s.toElement ? 1 : 0)) * GROUP_LEVELS + level(s.alpha * 8)) | 0;
const segmentDrawn = (s: Segment): boolean => s.alpha > 0.004;
const dotLit = (d: Dot): boolean => d.lit;
const dotUnlit = (d: Dot): boolean => !d.lit;

/** Lit element dots paint over the discs: a selected disc grows over its own elements' ring. */
function paintDots(ctx: CanvasRenderingContext2D, marks: readonly Dot[], ground: string, keep: (d: Dot) => boolean): void {
  const dotLists = group(dotBuckets, marks, dotKey, keep);
  for (let listIndex = 0; listIndex < dotLists.size; listIndex += 1) {
    const list = dotLists.items[listIndex]!;
    const first = list.items[0]!;
    ctx.globalAlpha = first.alpha;
    ctx.fillStyle = sunk(first.hue, ground, first.ink);
    ctx.beginPath();
    for (let dIndex = 0; dIndex < list.size; dIndex += 1) {
      const d = list.items[dIndex]!;
      ctx.moveTo(d.x + d.r, d.y);
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

const dotKey = (d: Dot): number => ((inkCode(d.hue) * GROUP_LEVELS + level(d.ink)) * GROUP_LEVELS + level(d.alpha)) | 0;
const NO_DASH: number[] = [];
/** Slack under the smallest full disc, so rounding never paints an uncrowded disc as a dot. */
const RADIUS_EPSILON_PX = 1e-6;
const discBuckets = buckets<Disc>();
const segmentBuckets = buckets<Segment>();
const dotBuckets = buckets<Dot>();

function paintDiscs(ctx: CanvasRenderingContext2D, marks: readonly Disc[], tokens: FlatGraphTokens, ground: string, warning: string, kind: "domain" | "capability" | "project", growth: number): void {
  const P = tokens.paint;
  const rimPx = kind === "capability" ? P.capRimPx : P.domainRimPx;
  const ringMinPx = kind === "capability" ? P.capDiscMinPx * growth - RADIUS_EPSILON_PX : 0;
  const discLists = group(discBuckets, marks, discKey);
  for (let listIndex = 0; listIndex < discLists.size; listIndex += 1) {
    const list = discLists.items[listIndex]!;
    const first = list.items[0]!;
    const plain = ringMinPx > 0 && !first.focus && first.state !== "unknown";
    if (plain && paintPlainDots(ctx, list, ringMinPx, sunk(first.hue, ground, first.ink)) === list.size) continue;
    const ringFromPx = plain ? ringMinPx : 0;
    ctx.beginPath();
    for (let dIndex = 0; dIndex < list.size; dIndex += 1) {
      const d = list.items[dIndex]!;
      if (d.r < ringFromPx) continue;
      ctx.moveTo(d.x + d.r, d.y);
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    }
    ctx.fillStyle = tokens.inks.discFill;
    ctx.globalAlpha = Math.min(1, first.ink * 4);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = first.focus ? FOCUS_RIM_PX : rimPx;
    ctx.strokeStyle = sunk(first.hue, ground, first.ink);
    ctx.setLineDash(first.state === "unknown" ? UNKNOWN_DASH : NO_DASH);
    ctx.stroke();
    ctx.setLineDash(NO_DASH);
    if (first.state === "unknown") continue;
    ctx.beginPath();
    for (let dIndex = 0; dIndex < list.size; dIndex += 1) {
      const d = list.items[dIndex]!;
      if (d.r < ringFromPx) continue;
      const core = kind === "project" ? P.projectCorePx * growth : kind === "domain" ? P.domainCorePx * growth : Math.max(P.capCoreMinPx, d.r - P.capCoreInsetPx);
      ctx.moveTo(d.x + core, d.y);
      ctx.arc(d.x, d.y, core, 0, Math.PI * 2);
    }
    ctx.fillStyle = sunk(first.hue, ground, first.ink * (first.focus ? 1 : P.coreAlpha));
    ctx.fill();
  }
  for (let dIndex = 0; dIndex < marks.length; dIndex += 1) {
    const d = marks[dIndex]!;
    if (d.state !== "stale") continue;
    ctx.beginPath();
    ctx.arc(d.x + d.r * 0.75, d.y - d.r * 0.75, Math.max(PIP_MIN_PX, d.r * PIP_SHARE), 0, Math.PI * 2);
    ctx.fillStyle = sunk(warning, ground, d.ink);
    ctx.fill();
  }
}

/** Paints the discs of one paint key that a crowd shrank under the smallest full disc as plain dots, and counts them. */
function paintPlainDots(ctx: CanvasRenderingContext2D, list: FrameList<Disc>, ringMinPx: number, ink: string): number {
  let plain = 0;
  for (let dIndex = 0; dIndex < list.size; dIndex += 1) {
    const d = list.items[dIndex]!;
    if (d.r >= ringMinPx) continue;
    if (plain === 0) ctx.beginPath();
    plain += 1;
    ctx.moveTo(d.x + d.r, d.y);
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
  }
  if (plain > 0) {
    ctx.fillStyle = ink;
    ctx.fill();
  }
  return plain;
}

/** One stroke per paint key; kept out of `paintPlan` so the optimiser passes the coordinates unboxed. */
function strokeSegments(ctx: CanvasRenderingContext2D, list: FrameList<Segment>, P: FlatGraphPaintTokens): void {
  const first = list.items[0]!;
  ctx.globalAlpha = first.alpha;
  ctx.strokeStyle = first.ink;
  // A fan's spoke keeps its weight beside the selected disc, which grows with the zoom.
  ctx.lineWidth = first.spoke ? Math.min(P.fanSpokeMaxPx, P.linkCapWidthPx * Math.max(1, F.growth)) : first.toElement ? P.linkElementWidthPx : P.linkCapWidthPx;
  ctx.beginPath();
  for (let sIndex = 0; sIndex < list.size; sIndex += 1) {
    const s = list.items[sIndex]!;
    ctx.moveTo(s.x0, s.y0);
    ctx.lineTo(s.x1, s.y1);
  }
  ctx.stroke();
}

/** Soft sprites land on whole pixels: fractional `drawImage` arguments allocate on every call. */
function drawSprite(ctx: CanvasRenderingContext2D, sprite: CanvasImageSource, mark: Glow | Light): void {
  const size = Math.round(mark.r * 2) | 0;
  ctx.drawImage(sprite, Math.round(mark.x - mark.r) | 0, Math.round(mark.y - mark.r) | 0, size, size);
}

/**
 * A rounded veil of the canvas ground just around each backed name's glyphs, feathered at its
 * edge, over the lines and under every disc and name: it dims the lines and the light beneath
 * rather than cutting them out. Whole pixels keep the rectangle's arguments small integers.
 */
function paintBackings(ctx: CanvasRenderingContext2D, marks: readonly Name[], ground: string, P: FlatGraphPaintTokens): void {
  const insetX = P.namePadPx - P.backingPadXPx;
  const insetY = P.namePadPx - P.backingPadYPx;
  let feathered = false;
  for (let nIndex = 0; nIndex < marks.length; nIndex += 1) {
    const n = marks[nIndex]!;
    if (n.name.backed !== true) continue;
    if (!feathered) {
      feathered = true;
      ctx.save();
      ctx.fillStyle = ground;
      ctx.shadowColor = ground;
      // shadowBlur ignores the transform, so it is scaled to the backing store's pixels here.
      ctx.shadowBlur = P.backingFeatherPx * ctx.getTransform().a;
    }
    const ox = n.x - n.name.dx;
    const oy = n.y - n.name.dy;
    const box = n.name.box;
    const x = Math.floor(ox + box.minX + insetX) | 0;
    const y = Math.floor(oy + box.minY + insetY) | 0;
    ctx.globalAlpha = n.ink * P.backingAlpha;
    ctx.beginPath();
    ctx.roundRect(x, y, (Math.ceil(ox + box.maxX - insetX) - x) | 0, (Math.ceil(oy + box.maxY - insetY) - y) | 0, P.backingRadiusPx);
    ctx.fill();
  }
  if (feathered) ctx.restore();
}

function paintPlan(ctx: CanvasRenderingContext2D, plan: FramePlan, tokens: FlatGraphTokens, ground: string, warning: string, growth: number): void {
  const P = tokens.paint;
  ctx.save();
  for (let lIndex = 0; lIndex < plan.lights.length; lIndex += 1) {
    const l = plan.lights[lIndex]!;
    const sprite = lightSprite(l.ink);
    if (!sprite) continue;
    ctx.globalAlpha = l.alpha;
    drawSprite(ctx, sprite, l);
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = "round";
  const segmentLists = group(segmentBuckets, plan.segments, segmentKey, segmentDrawn);
  for (let listIndex = 0; listIndex < segmentLists.size; listIndex += 1) strokeSegments(ctx, segmentLists.items[listIndex]!, P);
  ctx.strokeStyle = tokens.inks.arc;
  ctx.lineJoin = "round";
  strokeArcs(ctx, plan.arcs, tokens.inks.arc, P.arcHeadPx);
  paintLines(ctx, plan.focusArcs, tokens);
  paintBackings(ctx, plan.names, ground, P);
  paintDots(ctx, plan.dots, ground, dotUnlit);
  for (let glowIndex = 0; glowIndex < plan.glows.length; glowIndex += 1) {
    const glow = plan.glows[glowIndex]!;
    if (glow.alpha <= 0.004) continue;
    const sprite = glowSprite(glow.ink);
    if (!sprite) continue;
    ctx.globalAlpha = glow.alpha;
    drawSprite(ctx, sprite, glow);
  }
  ctx.globalAlpha = 1;
  paintDiscs(ctx, plan.discs, tokens, ground, warning, "capability", growth);
  paintDiscs(ctx, plan.domains, tokens, ground, warning, "domain", growth);
  if (plan.project.length > 0) paintDiscs(ctx, plan.project, tokens, ground, warning, "project", growth);
  paintDots(ctx, plan.dots, ground, dotLit);
  if (plan.agentRing) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = plan.agentRing.ink;
    ctx.lineWidth = AGENT_RING_WIDTH_PX;
    ctx.beginPath();
    ctx.arc(plan.agentRing.x, plan.agentRing.y, plan.agentRing.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (plan.selection && plan.selection.alpha > DRAWN_INK) {
    ctx.globalAlpha = plan.selection.alpha;
    ctx.strokeStyle = plan.selection.ink;
    ctx.lineWidth = P.selectedRingPx;
    ctx.beginPath();
    ctx.arc(plan.selection.x, plan.selection.y, plan.selection.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  for (let nIndex = 0; nIndex < plan.names.length; nIndex += 1) {
    const n = plan.names[nIndex]!;
    if (n.name.leader) {
      const s = leaderSegment(n.name, n.markR, P.namePadPx);
      const cx = n.x - n.name.dx;
      const cy = n.y - n.name.dy;
      ctx.globalAlpha = n.ink * P.nameLeaderAlpha;
      ctx.lineWidth = P.lineHairPx;
      ctx.strokeStyle = n.color;
      ctx.beginPath();
      ctx.moveTo(cx + s.x0, cy + s.y0);
      ctx.lineTo(cx + s.x1, cy + s.y1);
      ctx.stroke();
    }
    ctx.font = n.name.font;
    ctx.textAlign = n.name.align;
    ctx.globalAlpha = n.ink;
    ctx.lineWidth = n.halo;
    ctx.strokeStyle = tokens.inks.halo;
    const pieces = n.name.pieces;
    if (pieces) {
      ctx.textAlign = "left";
      for (let pIndex = 0; pIndex < pieces.length; pIndex += 1) ctx.strokeText(pieces[pIndex]!.text, n.x + pieces[pIndex]!.dx, n.y);
    } else ctx.strokeText(n.name.text, n.x, n.y);
    ctx.globalAlpha = 1;
    ctx.fillStyle = sunk(n.color, ground, n.ink);
    if (pieces) for (let pIndex = 0; pIndex < pieces.length; pIndex += 1) ctx.fillText(pieces[pIndex]!.text, n.x + pieces[pIndex]!.dx, n.y);
    else ctx.fillText(n.name.text, n.x, n.y);
  }
  ctx.restore();
}

const pool = emptyDialFrameMarks();
type DiscProbe = DialFrameMarks["discs"][number];
const probeDiscs = markPool<DiscProbe>(() => ({ id: "", x: 0, y: 0, r: 0, fill: 0, rim: 0, dashed: false, lineWidth: 0 }));
const probeStrips = markPool<StripMark>(() => ({ flowKey: "", role: "chord", ink: 0, ax: 0, ay: 0, cx: 0, cy: 0, bx: 0, by: 0, w0: 0, w1: 0, gapT0: 0, gapT1: 0, dashed: false, headStart: false, headEnd: true, headSize: 0 }));
const probeTexts = markPool<TextMark>(() => ({ id: "", role: "domain", text: "", x: 0, y: 0, align: "center", font: "", ink: 0, box: { minX: 0, maxX: 0, minY: 0, maxY: 0 }, parts: null, backed: false, alpha: 1, room: 1, fading: false, side: 0 }));
const probeGlyphs = markPool<GlyphMark>(() => ({ id: "", kind: "element", x: 0, y: 0, r: 0, egoState: "normal", fill: null, stroke: null, hovered: false, agentFocus: false, selectionPulse: null, count: null, stalePip: false, grown: false }));
const probeInks = new FrameList(pool.inks);
const probeDiscList = new FrameList(pool.discs);
const probeStripList = new FrameList(pool.strips);
const probeTextList = new FrameList(pool.texts);
const probeGlyphList = new FrameList(pool.glyphs);
const UNUSED_PROBE_LISTS = [pool.squares, pool.ticks, pool.rails, pool.numerals, pool.leaders, pool.plates, pool.extraTexts];
const arcKeys: string[] = [];

function inkIndex(ink: string): number {
  const at = probeInks.indexOf(ink);
  if (at >= 0) return at;
  probeInks.add(ink);
  return probeInks.size - 1;
}

function probeDisc(d: Disc, fill: number, ground: string, tokens: FlatGraphTokens): void {
  const lineWidth = tokens.paint.capRimPx;
  const mark = probeDiscs.take();
  mark.id = d.id;
  if (mark.x !== d.x) mark.x = d.x;
  if (mark.y !== d.y) mark.y = d.y;
  if (mark.r !== d.r) mark.r = d.r;
  mark.fill = fill;
  mark.rim = inkIndex(sunk(d.hue, ground, d.ink));
  mark.dashed = d.state === "unknown";
  if (mark.lineWidth !== lineWidth) mark.lineWidth = lineWidth;
  probeDiscList.add(mark);
}

/** A resting arc or focus line as the probe's strip; a focus line's key is `kind:from>to`, a taper's end width 0. */
function probeStrip(arc: Arc, key: string, ink: number, headSize: number): void {
  const { path, width } = arc;
  const kind = arc.kind === REST_ARC ? null : LINE_KINDS[arc.kind - 1];
  const end = kind === "needs" || kind === "neededBy" ? 0 : width;
  const strip = probeStrips.take();
  strip.flowKey = key;
  strip.role = kind === "relates" ? "relates" : "chord";
  strip.dashed = kind === "relates";
  strip.headEnd = kind === null;
  strip.ink = ink;
  if (strip.ax !== path.a.x) strip.ax = path.a.x;
  if (strip.ay !== path.a.y) strip.ay = path.a.y;
  if (strip.cx !== path.c.x) strip.cx = path.c.x;
  if (strip.cy !== path.c.y) strip.cy = path.c.y;
  if (strip.bx !== path.b.x) strip.bx = path.b.x;
  if (strip.by !== path.b.y) strip.by = path.b.y;
  if (strip.w0 !== width) strip.w0 = width;
  if (strip.w1 !== end) strip.w1 = end;
  if (strip.headSize !== headSize) strip.headSize = headSize;
  probeStripList.add(strip);
}

/** Records the painted inks, sinking included, so the probe sees what the eye sees. */
function fillProbeMarks(plan: FramePlan, tokens: FlatGraphTokens, ground: string): void {
  for (let listIndex = 0; listIndex < UNUSED_PROBE_LISTS.length; listIndex += 1) {
    const list = UNUSED_PROBE_LISTS[listIndex]!;
    if (list.length !== 0) list.length = 0;
  }
  probeInks.restart();
  probeDiscList.restart();
  probeStripList.restart();
  probeTextList.restart();
  probeGlyphList.restart();
  probeGlyphs.reset();
  probeDiscs.reset();
  probeStrips.reset();
  probeTexts.reset();
  const fill = inkIndex(tokens.inks.discFill);
  for (let dIndex = 0; dIndex < plan.discs.length; dIndex += 1) {
    const d = plan.discs[dIndex]!;
    probeDisc(d, fill, ground, tokens);
  }
  for (let dIndex = 0; dIndex < plan.domains.length; dIndex += 1) {
    const d = plan.domains[dIndex]!;
    probeDisc(d, fill, ground, tokens);
  }
  // An element's dot is the probe's glyph: its drawn centre and radius.
  for (let dIndex = 0; dIndex < plan.dots.length; dIndex += 1) {
    const d = plan.dots[dIndex]!;
    const glyph = probeGlyphs.take();
    glyph.id = d.id;
    if (glyph.x !== d.x) glyph.x = d.x;
    if (glyph.y !== d.y) glyph.y = d.y;
    if (glyph.r !== d.r) glyph.r = d.r;
    glyph.grown = grownIds.has(d.id);
    probeGlyphList.add(glyph);
  }
  const arcInk = inkIndex(tokens.inks.arc);
  const reachInk = inkIndex(tokens.inks.reach);
  for (let i = 0; i < plan.arcs.length; i += 1) probeStrip(plan.arcs[i]!, (arcKeys[i] ??= `arc:${i}`), arcInk, tokens.paint.arcHeadPx);
  for (let i = 0; i < plan.focusArcs.length; i += 1) {
    const arc = plan.focusArcs[i]!;
    probeStrip(arc, arc.key, LINE_KINDS[arc.kind - 1] === "neededBy" ? reachInk : arcInk, 0);
  }
  const pad = tokens.paint.namePadPx;
  for (let nIndex = 0; nIndex < plan.names.length; nIndex += 1) {
    const n = plan.names[nIndex]!;
    const ox = n.x - n.name.dx;
    const oy = n.y - n.name.dy;
    const text = probeTexts.take();
    text.id = n.name.id; text.role = n.name.role === "reach" ? "status" : n.name.role; text.text = n.name.text; text.align = n.name.align; text.font = n.name.font;
    if (text.x !== n.x) text.x = n.x;
    if (text.y !== n.y) text.y = n.y;
    text.ink = inkIndex(sunk(n.color, ground, n.ink));
    text.backed = n.name.backed === true;
    text.fading = n.fading;
    text.side = sideOf(n.name);
    if (text.alpha !== n.ink) text.alpha = n.ink;
    if (text.room !== n.room) text.room = n.room;
    setBox(text.box, ox + n.name.box.minX + pad, ox + n.name.box.maxX - pad, oy + n.name.box.minY + pad, oy + n.name.box.maxY - pad);
    probeTextList.add(text);
  }
  probeInks.seal();
  probeDiscList.seal();
  probeStripList.seal();
  probeTextList.seal();
  probeGlyphList.seal();
}

const UNSETTLED_MIX = 0.999;
const waveCache = new WeakMap<GraphAttention, { layout: FlatGraphLayout; delays: ReadonlyMap<string, number> }>();

/** One attention's wave delays over this layout's positions, kept while the layout stands. */
function wavesOf(attention: GraphAttention, layout: FlatGraphLayout): ReadonlyMap<string, number> {
  const hit = waveCache.get(attention);
  if (hit && hit.layout === layout) return hit.delays;
  const delays = waveDelays(attention, (id) => layout.positions.get(id) ?? layout.itemAt.get(id), FLAT_MOTION.waveMs);
  waveCache.set(attention, { layout, delays });
  return delays;
}

/** Paints the deferred lens-context frame once the classic edges are down. */
export function paintDeferredFlatGraph(ctx: CanvasRenderingContext2D, zoomRatio: number): void {
  if (!deferred) return;
  paintPlan(ctx, deferred.plan, deferred.tokens, deferred.ground, deferred.warning, zoomGrowth(zoomRatio, deferred.tokens.paint));
  deferred = null;
}

/** Flat as an attention-lit graph: same input and result contract as the dial frame it replaces. */
export function paintFlatGraphFrame(input: DialFrameInput, tokens: FlatGraphTokens): DialFrameResult {
  const { model } = input.dial;
  const contextMode = input.contextAlphas !== undefined;
  const focusId = contextMode ? null : input.focusedNodeId ?? input.hoveredNodeId;
  const attention = cachedGraphAttention(model, focusId, !contextMode && input.focusedNodeId !== null);
  const motion = graphMotionOf(input.worldKey, attention);
  const layout = input.dial.scene.graph!;
  motion.advance(attention, input.now, input.reducedMotion, (a) => wavesOf(a, layout));
  const mix = motion.settled ? 1 : Math.min(motion.progress, UNSETTLED_MIX);
  const built = buildPlan(input, tokens, motion);
  // A closing domain star stays the open one until its marks have shrunk, so a member pressed meanwhile keeps its zoom.
  if (!F.lagging && !(input.focusedNodeId !== null && model.domainById.has(input.focusedNodeId))) openDomainId = null;
  if (!F.lagging) closingDomainId = null;
  const ground = input.mapTokens.canvasBgNear;
  const warning = tokens.inks.warning;
  if (input.deferPaint) deferred = { plan: built.plan, tokens, ground, warning };
  else paintPlan(input.ctx, built.plan, tokens, ground, warning, zoomGrowth(input.zoomRatio, tokens.paint));
  fillProbeMarks(built.plan, tokens, ground);
  const directed = restArcs(model, Number.POSITIVE_INFINITY).length;
  const drawn = drawnFlowKeys.items;
  const result: DialFrameResult = {
    branchScene: undefined,
    branchMembersAnimating: motion.active || F.lagging,
    contextOnly: contextMode,
    drawnCount: built.plan.discs.length + built.plan.domains.length + built.plan.dots.length + built.plan.project.length,
    tier: built.tier, alphas: built.alphas, picks: built.picks, rows: built.rows, labelBoxes: built.labelBoxes,
    light: { attentionKey: attention.key, focused: attention.selected, inkMix: mix, chords: frameChords.items },
    inkMix: mix, chordPresence: built.presence, marks: pool,
  };
  recordDialFrame(input, result, {
    links: linkProbes(model),
    drawn,
    entered: null, resolved: true,
    budget: { shown: built.plan.arcs.length, total: directed, perEndCap: 0 },
    stubs: [],
  }, F.lineKinds);
  return result;
}

