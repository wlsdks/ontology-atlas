import { dialEvidenceView } from "../dial/dial-model";
import { createMeasureText } from "../dial/fit";
import { emptyDialFrameMarks, type DialFrameMarks, type DialMarksResult } from "../dial/frame/marks";
import { dialChordPresence, recordDialFrame } from "../dial/frame/frame";
import { dialPlacementLine, dialPlacementOf } from "../dial/placement";
import type { Box, DialChordLight, DialEvidenceView, DialFrameInput, DialFrameResult, DialModel, DialPick, DialRowPick, Point, StripMark, TextMark } from "../dial/types";
import { HITTABLE_MIN_TIER_ALPHA } from "../model/visibility/tier-visibility";
import { labelFontFamily } from "../render/labels";
import { AGENT_FOCUS_RING_OFFSET } from "../render/node-shapes";
import { FONT_WEIGHT } from "@/shared/ui/tokens/font-weight";
import { cachedGraphAttention, FLAT_LINE_BITS, inkUnder, type GraphAttention, type GraphLineKind } from "./attention";
import { directItemId } from "./layout";
import {
  arcPathInto, capabilityDiscRadiusPx, emptyArcPath, glowSprite, graphDiscRadiusPx, ORPHAN_ROOM, lightSprite, litLineTrimsInto, restArcs, smoothstep, sunk, zoomGrowth, type ArcPath,
} from "./marks";
import { FLAT_MOTION, graphMotionOf, MOTION_SHARE, waveDelays, type GraphMotion } from "./motion";
import { admittedNames, boxUnderAny, nameBlockDraws, leaderSegment, nameBlockEnd, selectedDiscRadius, stepScale, zoomStep, type PlacedName } from "./names";
import { FLAT_TIER_TIMING, tierNameAlpha } from "../morph/tier-assembly";
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
const LIT_DOT_SHARE = 1.5;
/** The most of the pitch between two elements a dot's radius takes, so a lit dot (`LIT_DOT_SHARE`) still stops short of its neighbour. */
const ELEMENT_PITCH_FILL = 0.33;
const LIGHT_SINK_GAIN = 1.4;
const AGENT_RING_WIDTH_PX = 1;
const PIP_SHARE = 0.3;
const PIP_MIN_PX = 2;
const UNKNOWN_DASH = [2, 2];
const ELEMENT_PICK_PX = 4;

const measureText = createMeasureText();

interface Disc { id: string; x: number; y: number; r: number; hue: string; ink: number; focus: boolean; state: "current" | "stale" | "unknown" }
interface Dot { x: number; y: number; r: number; hue: string; ink: number; alpha: number; lit: boolean }
interface Segment { x0: number; y0: number; x1: number; y1: number; ink: string; toElement: boolean; alpha: number }
/** 0 is a resting domain arc; the rest index `LINE_KINDS`. */
/** `fadeStart` and `fadeEnd` are the shares of the curve that fade in from transparent at each end. */
interface Arc { path: ArcPath; width: number; alpha: number; head: boolean; glow: number; kind: number; key: string; reach: number; fadeStart: number; fadeEnd: number }
const LINE_KINDS: readonly GraphLineKind[] = ["needs", "neededBy", "relates", "broader"];
const REST_ARC = 0;
interface Glow { x: number; y: number; r: number; ink: string; alpha: number }
interface Light { x: number; y: number; r: number; ink: string; alpha: number }
/** `markR` is the drawn radius of the name's mark, read only by a leader. */
interface Name { name: PlacedName; x: number; y: number; ink: number; color: string; halo: number; markR: number }
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

const segments = markPool<Segment>(() => ({ x0: 0, y0: 0, x1: 0, y1: 0, ink: "", toElement: false, alpha: 0 }));
const dots = markPool<Dot>(() => ({ x: 0, y: 0, r: 0, hue: "", ink: 0, alpha: 0, lit: false }));
const discs = markPool<Disc>(() => ({ id: "", x: 0, y: 0, r: 0, hue: "", ink: 0, focus: false, state: "current" }));
const glows = markPool<Glow>(() => ({ x: 0, y: 0, r: 0, ink: "", alpha: 0 }));
const lights = markPool<Light>(() => ({ x: 0, y: 0, r: 0, ink: "", alpha: 0 }));
const arcMarks = markPool<Arc>(() => ({ path: emptyArcPath(), width: 0, alpha: 0, head: false, glow: 0, kind: REST_ARC, key: "", reach: 1, fadeStart: 0, fadeEnd: 0 }));
const chordPool = markPool<DialChordLight>(() => ({ key: "", sourceDomain: "", targetDomain: "", a: { x: 0, y: 0 }, c: { x: 0, y: 0 }, b: { x: 0, y: 0 }, widthPx: 0, chipRadiusPx: 0, arrivalBloom: false }));
const names = markPool<Name>(() => ({ name: null as unknown as PlacedName, x: 0, y: 0, ink: 0, color: "", halo: 0, markR: 0 }));
const hubNames = markPool<PlacedName>(() => ({ id: "", role: "units", text: "", font: "", dx: 0, dy: 0, align: "center", box: { minX: 0, maxX: 0, minY: 0, maxY: 0 } }));
const dotRows = markPool<DialRowPick>(() => ({ id: "", box: { minX: 0, maxX: 0, minY: 0, maxY: 0 } }));
const nameRows = markPool<DialRowPick>(() => ({ id: "", box: { minX: 0, maxX: 0, minY: 0, maxY: 0 } }));
const labelBoxPool = markPool<LabelBox>(() => ({ nodeId: "", text: "", minX: 0, minY: 0, maxX: 0, maxY: 0 }));
const pickPool = markPool<DialPick>(() => ({ id: "", x: 0, y: 0, r: 0, solid: false }));
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
  const r = Math.max(ELEMENT_PICK_PX, radiusNow(id));
  p.solid = false;
  if (p.x !== at.x) p.x = at.x;
  if (p.y !== at.y) p.y = at.y;
  if (p.r !== r) p.r = r;
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
  /** The selected capability, element or orphan, drawn at the selected radius; null otherwise. */
  selectedId: string | null;
  selectedR: number;
  /** The concept a change just deselected, shrinking back from the selected radius; null otherwise. */
  leavingId: string | null;
  leavingR: number;
  /** How far the project's own focus shows: its spokes and glow. */
  projectShare: number;
  lineKinds: number;
}
const F = { stamp: 0 } as FrameState;

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
  const x = home.x * F.scale + F.originX;
  const y = home.y * F.scale + F.originY;
  if (at.x !== x) at.x = x;
  if (at.y !== y) at.y = y;
  at.stamp = F.stamp;
  return at;
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

/** The drawn radius: the selected concept's grows to the selected radius with the attention mix. */
function discRadius(id: string): number {
  return id === F.selectedId ? F.selectedR : id === F.leavingId ? F.leavingR : radiusNow(id);
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
function planName(n: PlacedName, alphas: ReadonlyMap<string, number>, share: number, wasFocus: boolean): void {
  const at = screenAt(n.id);
  if (!at || alphas.get(n.id) === 0) return;
  if (at.x + n.box.maxX < 0 || at.x + n.box.minX > F.W || at.y + n.box.maxY < 0 || at.y + n.box.minY > F.H) return;
  loadNameInk(n);
  const ink = scratch[0]! * share;
  if (ink <= DRAWN_INK) return;
  const { P, attention } = F;
  const inks = F.tokens.inks;
  const childSelected = n.role === "domain" && attention.selected && attention.focusId !== n.id && F.model.domainOf.get(attention.focusId ?? "") === n.id;
  const strong = (n.role === "domain" && !childSelected) || n.role === "project" || ((n.role === "capability" || n.role === "element") && (wasFocus || n.id === attention.focusId));
  const color = strong ? inks.nameStrong : inks.name;
  const mark = names.take();
  mark.name = n;
  const x = at.x + n.dx;
  const y = at.y + n.dy;
  const halo = n.role === "domain" ? P.domainNameHaloPx : P.nameHaloPx;
  if (mark.x !== x) mark.x = x;
  if (mark.y !== y) mark.y = y;
  if (mark.ink !== ink) mark.ink = ink;
  mark.color = color;
  if (mark.halo !== halo) mark.halo = halo;
  const markR = n.leader ? (n.role === "element" ? radiusNow(n.id) * LIT_DOT_SHARE : discRadius(n.id)) : 0;
  if (mark.markR !== markR) mark.markR = markR;
  L.names.add(mark);
}

/** Whether a concept's block of names may draw: its concept is not placed this frame, it is the selection, or every line clears the chrome. */
function blockShows(list: readonly PlacedName[], from: number, to: number, chrome: readonly Box[], selectedId: string | null): boolean {
  const at = screenAt(list[from]!.id);
  return !at || nameBlockDraws(list, from, to, at.x, at.y, chrome, selectedId);
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
  for (let i = 0; i < it.elementIds.length; i += 1) {
    const el = it.elementIds[i]!;
    const lit = attention.lit?.has(el) === true;
    const shown = lensHidden(el) ? 0 : Math.max(F.dotAlpha, lit ? F.focusness : 0, F.required.has(el) || el === input.agentFocusNodeId ? 1 : 0);
    if (shown <= DRAWN_INK) continue;
    alphas.set(el, 1);
    shownElements.add(el);
    const elAt = screenOf(el);
    loadMarkInk(el);
    const elInk = scratch[0]!;
    if (!contextMode && segmentOnScreen(itemAt, elAt)) {
      const s = segmentBetween(itemAt, elAt, hue, true);
      const alpha = P.linkElementAlpha * Math.min(itemInk, elInk) * shown;
      if (s.alpha !== alpha) s.alpha = alpha;
      L.segments.add(s);
    }
    if (onScreen(elAt)) {
      const d = dots.take();
      const r = el === F.selectedId || el === F.leavingId ? discRadius(el) : radiusNow(el) * (lit ? LIT_DOT_SHARE : 1);
      const alpha = DOT_ALPHA * shown;
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
  if (F.selectedId !== null) {
    const own = radiusNow(F.selectedId);
    const grown = selectedDiscRadius(own, P, growth);
    const share = attention.selected && attention.focusId === F.selectedId ? mix : 1;
    const r = own + (grown - own) * share;
    if (F.selectedR !== r) F.selectedR = r;
  }
  const left = motion.previous.focusId;
  F.leavingId = !motion.settled && motion.previous.selected && left !== null && left !== F.selectedId && left !== model.projectId && !model.domainById.has(left) ? left : null;
  if (F.leavingId !== null) {
    const own = radiusNow(F.leavingId);
    const r = own + (selectedDiscRadius(own, P, growth) - own) * (1 - mix);
    if (F.leavingR !== r) F.leavingR = r;
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
    if (at) plan.selection = ring(selectionRing, at.x, at.y, F.leavingR + P.selectedRingGapPx, 1 - mix, inks.project);
  }

  const agentId = contextMode ? null : input.agentFocusNodeId;
  const agentAt = agentId ? screenAt(agentId) : undefined;
  if (agentId && agentAt && alphas.get(agentId) !== 0) {
    plan.agentRing = ring(agentRing, agentAt.x, agentAt.y, radiusAt(agentId, growth) + AGENT_FOCUS_RING_OFFSET, 1, input.mapTokens.amberHub);
  }

  const fontFamily = labelFontFamily();
  const admitUnder = (a: GraphAttention) => admittedNames({
    model, layout, tokens: P, labels: input.labels, measureText, fontFamily, scale: input.scale, growth: stepGrowth,
    elementLabel: input.elementLabel, staleByDomain: measured ? evidence!.staleByDomain : null,
    lit: contextMode ? null : a.lit, focusId: a.focusId, attentionKey: a.key, agentFocusId: contextMode ? null : input.agentFocusNodeId,
    selected: a.selected, named: a.named, reach: a.reach, lines: contextMode ? NO_LINES : a.lines,
    discRadius: stepRadius, elementSpacingPx,
  });
  const admission = admitUnder(attention);
  const leaving = F.leavingId;
  const chrome = input.nameObstacles ?? NO_BOXES;
  for (let nIndex = 0; nIndex < admission.names.length;) {
    const end = nameBlockEnd(admission.names, nIndex);
    if (blockShows(admission.names, nIndex, end, chrome, contextMode ? null : selectedId)) {
      for (let i = nIndex; i < end; i += 1) planName(admission.names[i]!, alphas, admission.names[i]!.id === leaving ? mix : 1, false);
    }
    nIndex = end;
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
    if (evidence !== null && !evidence.measured) hubLine(input.labels?.evidenceUnmeasured?.());
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
  return radiusOf(id, stepGrowthNow[0]!, stepGrowthNow[1]!);
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
    const width = tapered ? Math.min(P.lineTaperMaxPx, P.lineTaperPx + P.lineTaperGainPx * (line.weight - 1)) : line.kind === "relates" ? P.lineDotPx : P.lineHairPx;
    const mark = arcMark(a, b, P.lineBow, LINE_TRIMS[0]!, LINE_TRIMS[1]!, width, P.lineAlpha, false, 0, kind);
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
const segmentKey = (s: Segment): number => ((inkCode(s.ink) * 2 + (s.toElement ? 1 : 0)) * GROUP_LEVELS + level(s.alpha * 8)) | 0;
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
  ctx.lineWidth = first.toElement ? P.linkElementWidthPx : P.linkCapWidthPx;
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
const probeTexts = markPool<TextMark>(() => ({ id: "", role: "domain", text: "", x: 0, y: 0, align: "center", font: "", ink: 0, box: { minX: 0, maxX: 0, minY: 0, maxY: 0 }, parts: null, backed: false }));
const probeInks = new FrameList(pool.inks);
const probeDiscList = new FrameList(pool.discs);
const probeStripList = new FrameList(pool.strips);
const probeTextList = new FrameList(pool.texts);
const UNUSED_PROBE_LISTS = [pool.squares, pool.ticks, pool.rails, pool.glyphs, pool.numerals, pool.leaders, pool.plates, pool.extraTexts];
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
    setBox(text.box, ox + n.name.box.minX + pad, ox + n.name.box.maxX - pad, oy + n.name.box.minY + pad, oy + n.name.box.maxY - pad);
    probeTextList.add(text);
  }
  probeInks.seal();
  probeDiscList.seal();
  probeStripList.seal();
  probeTextList.seal();
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
  const ground = input.mapTokens.canvasBgNear;
  const warning = tokens.inks.warning;
  if (input.deferPaint) deferred = { plan: built.plan, tokens, ground, warning };
  else paintPlan(input.ctx, built.plan, tokens, ground, warning, zoomGrowth(input.zoomRatio, tokens.paint));
  fillProbeMarks(built.plan, tokens, ground);
  const directed = restArcs(model, Number.POSITIVE_INFINITY).length;
  const drawn = drawnFlowKeys.items;
  const result: DialFrameResult = {
    branchScene: undefined,
    branchMembersAnimating: motion.active,
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

