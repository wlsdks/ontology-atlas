import { FONT_WEIGHT } from "@/shared/ui/tokens/font-weight";
import { labelFontFamily } from "../render/labels";
import { treeScreenGrowth } from "../model/tree-view/tree-detail";
import {
  TREE_ARC_BUDGET,
  TREE_TONE_STEPS,
  type TreeDrawMark,
  type TreeFrameInput,
  type TreeModel,
  type TreeNameBox,
  type TreeNodeKind,
  type TreeScreenPoint,
} from "../model/tree-view/tree-shapes";
import type { TreeTokens } from "../tokens/read-tree-tokens";

/** A branch is a ribbon through BRANCH_SAMPLES + 1 points of its cubic, plus two edge crossings. */
const BRANCH_SAMPLES = 16;
const POLY_STRIDE = BRANCH_SAMPLES + 3;
const MAX_CANOPY_GLOWS = 12;
const CANOPY_MID_STOP = 0.55;
const POOL_MID_STOP = 0.35;
/** The amber dot sits on the mark's upper-right edge. */
const STALE_DOT_ANGLE = -Math.PI / 4;
const TAU = Math.PI * 2;
const NEAREST_TONE = TREE_TONE_STEPS - 1;
const HUB_GLOW_STEPS = 5;
const ARC_NEEDS = 0;
const ARC_USED_BY = 1;

const KIND_SLOT: Record<TreeNodeKind, number> = { project: 0, domain: 1, capability: 2, element: 3, fork: 4 };
const SUB_SLOT = 5;
const fonts = new WeakMap<TreeTokens, Map<string, readonly string[]>>();

function fontsFor(tokens: TreeTokens, family: string): readonly string[] {
  let byFamily = fonts.get(tokens);
  if (!byFamily) fonts.set(tokens, (byFamily = new Map()));
  let set = byFamily.get(family);
  if (!set) {
    const { names } = tokens;
    const strong = FONT_WEIGHT.strong;
    const plain = FONT_WEIGHT.signature;
    set = [
      `${strong} ${names.project}px ${family}`,
      `${strong} ${names.domain}px ${family}`,
      `${plain} ${names.capability}px ${family}`,
      `${plain} ${names.element}px ${family}`,
      `${plain} ${names.capability}px ${family}`,
      `${plain} ${names.domainSub}px ${family}`,
    ];
    byFamily.set(family, set);
  }
  return set;
}

/** The font a kind's name is painted in, so a caller measures names in the same font. */
export function treeNameFont(kind: TreeNodeKind, tokens: TreeTokens, family: string): string {
  return fontsFor(tokens, family)[KIND_SLOT[kind]]!;
}

/** Pooled per-frame scratch: grown when the model or list grows, never per frame. */
const point: TreeScreenPoint = { x: 0, y: 0, scale: 0, depth: 0 };
const sampleX = new Float32Array(BRANCH_SAMPLES + 1);
const sampleY = new Float32Array(BRANCH_SAMPLES + 1);
const sampleW = new Float32Array(BRANCH_SAMPLES + 1);
/** Branch slots: one per node drawn this frame, a listed node's or one of its ancestors'. */
let polyX = new Float32Array(0);
let polyY = new Float32Array(0);
let polyW = new Float32Array(0);
let polyLength = new Int32Array(0);
let polyWidest = new Float32Array(0);
let polyCaps = new Uint8Array(0);
let branchNode = new Int32Array(0);
let branchTone = new Uint8Array(0);
let branchCount = 0;
let branchAt = new Int32Array(0);
let branchStamp = new Uint32Array(0);
let markAt = new Int32Array(0);
let markStamp = new Uint32Array(0);
let litStamp = new Uint32Array(0);
let needsStamp = new Uint32Array(0);
let usedByStamp = new Uint32Array(0);
let arcFrom = new Int32Array(0);
let arcTo = new Int32Array(0);
let arcRole = new Uint8Array(0);
let stamp = 0;
/** This frame's glow strength, 1 at rest and 0 from `glowFadeZoom` in. */
let glowFade = 1;

const CAP_START = 1;
const CAP_END = 2;
const MIN_BRANCH_SLOTS = 64;

let staleSource: Uint8Array | null = null;
let staleCount = -1;
let staleSums = new Int32Array(1);

function ensureCapacity(nodes: number, marks: number, arcs: number): void {
  if (markAt.length < nodes) {
    markAt = new Int32Array(nodes);
    markStamp = new Uint32Array(nodes);
    litStamp = new Uint32Array(nodes);
    branchAt = new Int32Array(nodes);
    branchStamp = new Uint32Array(nodes);
  }
  if (needsStamp.length < marks) {
    needsStamp = new Uint32Array(marks);
    usedByStamp = new Uint32Array(marks);
  }
  if (arcFrom.length < arcs) {
    arcFrom = new Int32Array(arcs);
    arcTo = new Int32Array(arcs);
    arcRole = new Uint8Array(arcs);
  }
  if (stamp >= 0xffffffff) {
    markStamp.fill(0);
    litStamp.fill(0);
    branchStamp.fill(0);
    needsStamp.fill(0);
    usedByStamp.fill(0);
    stamp = 0;
  }
  stamp += 1;
  branchCount = 0;
}

/** Doubles the branch slots, keeping this frame's, when one more is needed: amortised O(1). */
function claimBranchSlot(): number {
  const slot = branchCount;
  if (slot >= polyLength.length) {
    const size = Math.max(MIN_BRANCH_SLOTS, polyLength.length * 2);
    const grow = <A extends Float32Array | Int32Array | Uint8Array>(old: A, make: (n: number) => A, stride: number): A => {
      const next = make(size * stride);
      next.set(old);
      return next;
    };
    polyX = grow(polyX, (n) => new Float32Array(n), POLY_STRIDE);
    polyY = grow(polyY, (n) => new Float32Array(n), POLY_STRIDE);
    polyW = grow(polyW, (n) => new Float32Array(n), POLY_STRIDE);
    polyLength = grow(polyLength, (n) => new Int32Array(n), 1);
    polyWidest = grow(polyWidest, (n) => new Float32Array(n), 1);
    polyCaps = grow(polyCaps, (n) => new Uint8Array(n), 1);
    branchNode = grow(branchNode, (n) => new Int32Array(n), 1);
    branchTone = grow(branchTone, (n) => new Uint8Array(n), 1);
  }
  branchCount += 1;
  return slot;
}

function toneAtDepth(depth: number, frame: TreeFrameInput): number {
  const { near, far } = frame.projector;
  const nearness = far > near ? (far - depth) / (far - near) : 1;
  return Math.min(NEAREST_TONE, Math.max(0, Math.round(nearness * NEAREST_TONE)));
}

/** Prefix sums over `stale`, rebuilt only when the array or the model size changes: O(V) then O(1) per query. */
function staleSumsOf(stale: Uint8Array, count: number): Int32Array {
  if (stale === staleSource && count === staleCount) return staleSums;
  if (staleSums.length < count + 1) staleSums = new Int32Array(count + 1);
  staleSums[0] = 0;
  for (let i = 0; i < count; i += 1) staleSums[i + 1] = staleSums[i]! + (i < stale.length && stale[i] ? 1 : 0);
  staleSource = stale;
  staleCount = count;
  return staleSums;
}

function markIndexOf(node: number): number {
  return markStamp[node] === stamp ? markAt[node]! : -1;
}

/** The drawn mark showing `node`: its own, or the nearest drawn ancestor that holds it folded. */
function markHolding(model: TreeModel, node: number): number {
  for (let n = node; n >= 0; n = model.parent[n]!) {
    const at = markIndexOf(n);
    if (at >= 0) return at;
  }
  return -1;
}

/** Node 0's mark stands at the trunk base, where growth starts. */
function isGrown(frame: TreeFrameInput, node: number): boolean {
  return node === 0 || frame.layout.reach[node]! <= frame.growth;
}

function drawsDisc(model: TreeModel, mark: TreeDrawMark): boolean {
  return mark.closed || model.kinds[mark.node] !== "fork";
}

function ringOf(radius: number, growth: number, tokens: TreeTokens): number {
  return Math.max(tokens.paint.ringMinPx * growth, radius * tokens.paint.ringShare);
}

function outerRadius(mark: TreeDrawMark, tokens: TreeTokens): number {
  const { closedRingGapPx, closedRingPx } = tokens.paint;
  const growth = treeScreenGrowth(mark.scale);
  return mark.radius + ringOf(mark.radius, growth, tokens) + (mark.closed ? (closedRingGapPx + closedRingPx) * growth : 0);
}

/** Where segment a→b crosses the circle (cx, cy, r): `leaving` takes the far root, else the near one. */
function crossing(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number, leaving: boolean): number {
  const dx = bx - ax;
  const dy = by - ay;
  const ox = ax - cx;
  const oy = ay - cy;
  const a = dx * dx + dy * dy;
  if (a === 0) return 0;
  const b = 2 * (ox * dx + oy * dy);
  const c = ox * ox + oy * oy - r * r;
  const root = Math.sqrt(Math.max(0, b * b - 4 * a * c));
  const f = (leaving ? -b + root : -b - root) / (2 * a);
  return Math.min(1, Math.max(0, f));
}

function sampleCubic(frame: TreeFrameInput, node: number, tEnd: number, tokens: TreeTokens): void {
  const { layout, projector } = frame;
  const P = layout.position;
  const C = layout.control;
  const parent = layout.model.parent[node]!;
  const x0 = parent < 0 ? 0 : P[parent * 3]!;
  const y0 = parent < 0 ? 0 : P[parent * 3 + 1]!;
  const z0 = parent < 0 ? 0 : P[parent * 3 + 2]!;
  const c = node * 6;
  const ws = layout.widthStart[node]!;
  const we = layout.widthEnd[node]!;
  for (let s = 0; s <= BRANCH_SAMPLES; s += 1) {
    const t = (tEnd * s) / BRANCH_SAMPLES;
    const u = 1 - t;
    const k0 = u * u * u;
    const k1 = 3 * u * u * t;
    const k2 = 3 * u * t * t;
    const k3 = t * t * t;
    projector.project(
      k0 * x0 + k1 * C[c]! + k2 * C[c + 3]! + k3 * P[node * 3]!,
      k0 * y0 + k1 * C[c + 1]! + k2 * C[c + 4]! + k3 * P[node * 3 + 1]!,
      k0 * z0 + k1 * C[c + 2]! + k2 * C[c + 5]! + k3 * P[node * 3 + 2]!,
      point,
    );
    sampleX[s] = point.x;
    sampleY[s] = point.y;
    sampleW[s] = Math.max(tokens.paint.branchMinPx, (ws + (we - ws) * t) * projector.unit * treeScreenGrowth(point.scale));
  }
}

function pushPoly(slot: number, n: number, x: number, y: number, w: number): number {
  const at = slot * POLY_STRIDE + n;
  polyX[at] = x;
  polyY[at] = y;
  polyW[at] = w;
  if (w > polyWidest[slot]!) polyWidest[slot] = w;
  return n + 1;
}

function pushBetween(slot: number, n: number, i: number, f: number): number {
  const j = i + 1;
  return pushPoly(
    slot,
    n,
    sampleX[i]! + (sampleX[j]! - sampleX[i]!) * f,
    sampleY[i]! + (sampleY[j]! - sampleY[i]!) * f,
    sampleW[i]! + (sampleW[j]! - sampleW[i]!) * f,
  );
}

/**
 * The visible stretch of the branch from `node`'s parent to it, cut at the growth front and at
 * the edge of a mark at either end. Returns its point count, 0 when nothing shows; an end that
 * no mark covers (the trunk top, an open fork, the growth front) gets a round cap.
 */
function traceBranch(frame: TreeFrameInput, node: number, slot: number, tokens: TreeTokens): number {
  const { layout, list } = frame;
  const model = layout.model;
  const parent = model.parent[node]!;
  const fromReach = parent < 0 ? 0 : layout.reach[parent]!;
  const toReach = layout.reach[node]!;
  if (frame.growth <= fromReach) return 0;
  const tEnd = frame.growth >= toReach || toReach <= fromReach ? 1 : (frame.growth - fromReach) / (toReach - fromReach);
  sampleCubic(frame, node, tEnd, tokens);

  // Node 0's mark is at the trunk base, which is where the trunk starts; the trunk top has no mark.
  const startAt = parent < 0 ? markIndexOf(0) : parent === 0 ? -1 : markIndexOf(parent);
  const start = startAt >= 0 && drawsDisc(model, list.marks[startAt]!) ? list.marks[startAt]! : null;
  const endAt = node === 0 || tEnd < 1 ? -1 : markIndexOf(node);
  const end = endAt >= 0 && drawsDisc(model, list.marks[endAt]!) ? list.marks[endAt]! : null;

  let first = 0;
  let firstCut = -1;
  if (start) {
    const r = outerRadius(start, tokens);
    while (first <= BRANCH_SAMPLES && Math.hypot(sampleX[first]! - start.x, sampleY[first]! - start.y) < r) first += 1;
    if (first > BRANCH_SAMPLES) return 0;
    if (first > 0) firstCut = crossing(sampleX[first - 1]!, sampleY[first - 1]!, sampleX[first]!, sampleY[first]!, start.x, start.y, r, true);
  }
  let last = BRANCH_SAMPLES;
  let lastCut = -1;
  if (end) {
    const r = outerRadius(end, tokens);
    while (last >= 0 && Math.hypot(sampleX[last]! - end.x, sampleY[last]! - end.y) < r) last -= 1;
    if (last < first) return 0;
    if (last < BRANCH_SAMPLES) lastCut = crossing(sampleX[last]!, sampleY[last]!, sampleX[last + 1]!, sampleY[last + 1]!, end.x, end.y, r, false);
  }

  polyWidest[slot] = 0;
  polyCaps[slot] = (start ? 0 : CAP_START) | (end ? 0 : CAP_END);
  let n = 0;
  if (firstCut >= 0) n = pushBetween(slot, n, first - 1, firstCut);
  for (let s = first; s <= last; s += 1) n = pushPoly(slot, n, sampleX[s]!, sampleY[s]!, sampleW[s]!);
  if (lastCut >= 0) n = pushBetween(slot, n, last, lastCut);
  return n >= 2 ? n : 0;
}

/** Each listed node's chain of branches down to the trunk, every node's branch traced once. */
function traceBranches(frame: TreeFrameInput, tokens: TreeTokens): void {
  const { list, layout, projector } = frame;
  const P = layout.position;
  for (let i = 0; i < list.count; i += 1) {
    for (let node = list.marks[i]!.node; node >= 0 && branchStamp[node] !== stamp; node = layout.model.parent[node]!) {
      branchStamp[node] = stamp;
      const slot = claimBranchSlot();
      branchAt[node] = slot;
      branchNode[slot] = node;
      projector.project(P[node * 3]!, P[node * 3 + 1]!, P[node * 3 + 2]!, point);
      branchTone[slot] = toneAtDepth(point.depth, frame);
      polyLength[slot] = traceBranch(frame, node, slot, tokens);
    }
  }
}

/** A closed ribbon along a traced branch, `share` of its width, with a disc on each capped end. */
function addRibbon(ctx: CanvasRenderingContext2D, slot: number, share: number): void {
  const n = polyLength[slot]!;
  const base = slot * POLY_STRIDE;
  for (let pass = 0; pass < 2; pass += 1) {
    for (let k = 0; k < n; k += 1) {
      const i = pass === 0 ? k : n - 1 - k;
      const a = base + Math.max(0, i - 1);
      const b = base + Math.min(n - 1, i + 1);
      const tx = polyX[b]! - polyX[a]!;
      const ty = polyY[b]! - polyY[a]!;
      const len = Math.hypot(tx, ty) || 1;
      const half = ((pass === 0 ? 1 : -1) * polyW[base + i]! * share) / 2;
      const x = polyX[base + i]! - (ty / len) * half;
      const y = polyY[base + i]! + (tx / len) * half;
      if (pass === 0 && k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  if (polyCaps[slot]! & CAP_START) addCap(ctx, base, share);
  if (polyCaps[slot]! & CAP_END) addCap(ctx, base + n - 1, share);
}

/** Wound anticlockwise like every ribbon, so a cap over a ribbon adds to the nonzero fill. */
function addCap(ctx: CanvasRenderingContext2D, at: number, share: number): void {
  const r = (polyW[at]! * share) / 2;
  ctx.moveTo(polyX[at]! + r, polyY[at]!);
  ctx.arc(polyX[at]!, polyY[at]!, r, 0, TAU, true);
}

/**
 * Glows hold their zoom-1 size and fade out by `glowFadeZoom`, so zooming in never washes the
 * ground. Zoom is read as the projector's scale at the tree centre, 1 at rest.
 */
function paintGlows(ctx: CanvasRenderingContext2D, frame: TreeFrameInput, tokens: TreeTokens): void {
  const { layout, list, projector, width, height } = frame;
  const { paint, inks } = tokens;
  const [cx, cy, cz] = layout.centre;
  projector.project(cx, cy, cz, point);
  const zoom = Math.max(1, point.scale);
  const fade = Math.min(1, Math.max(0, (paint.glowFadeZoom - zoom) / (paint.glowFadeZoom - 1)));
  glowFade = fade;
  if (fade === 0) return;
  ctx.globalAlpha = fade;
  const backdrop = Math.max(1, layout.radius * projector.unit * (point.scale / zoom) * paint.backdropReach);
  const wash = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, backdrop);
  wash.addColorStop(0, inks.backdropGlow[0]);
  wash.addColorStop(1, inks.backdropGlow[1]);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);

  const trunk = markIndexOf(0);
  if (trunk >= 0) {
    const base = list.marks[trunk]!;
    const reach = Math.max(1, (base.radius / treeScreenGrowth(zoom)) * paint.poolReach);
    ctx.save();
    ctx.translate(base.x, base.y);
    ctx.scale(1, paint.poolFlatten);
    const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, reach);
    pool.addColorStop(0, inks.poolGlow[0]);
    pool.addColorStop(POOL_MID_STOP, inks.poolGlow[1]);
    pool.addColorStop(1, inks.poolGlow[2]);
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(0, 0, reach, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  const B = layout.bound;
  let canopies = 0;
  for (let i = list.count - 1; i >= 0 && canopies < MAX_CANOPY_GLOWS; i -= 1) {
    const mark = list.marks[i]!;
    if (layout.model.kinds[mark.node] !== "domain" || !isGrown(frame, mark.node)) continue;
    const b = mark.node * 4;
    projector.project(B[b]!, B[b + 1]!, B[b + 2]!, point);
    const reach = Math.max(1, B[b + 3]! * projector.unit * (point.scale / zoom) * paint.canopyReach);
    const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, reach);
    glow.addColorStop(0, inks.canopyGlow[0]);
    glow.addColorStop(CANOPY_MID_STOP, inks.canopyGlow[1]);
    glow.addColorStop(1, inks.canopyGlow[2]);
    ctx.globalAlpha = (fade * (mark.tone + 1)) / TREE_TONE_STEPS;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(point.x, point.y, reach, 0, TAU);
    ctx.fill();
    canopies += 1;
  }
  ctx.globalAlpha = 1;
}

/**
 * Three nested ribbons, each narrower and lighter, stand in for a soft edge. Each layer is
 * painted for every tone, far first, before the next, so no body covers a core at a joint.
 */
function paintBranches(ctx: CanvasRenderingContext2D, tokens: TreeTokens): void {
  const { tones, paint } = tokens;
  for (let tone = 0; tone < TREE_TONE_STEPS; tone += 1) fillBranches(ctx, tone, 1, 0, tones.branch[tone]!);
  for (let tone = 0; tone < TREE_TONE_STEPS; tone += 1) fillBranches(ctx, tone, paint.branchMidShare, paint.branchCoreMinPx, tones.branchMid[tone]!);
  for (let tone = 0; tone < TREE_TONE_STEPS; tone += 1) fillBranches(ctx, tone, paint.branchCoreShare, paint.branchCoreMinPx, tones.branchCore[tone]!);
}

function fillBranches(ctx: CanvasRenderingContext2D, tone: number, share: number, minWidthPx: number, ink: string): void {
  let drawn = 0;
  ctx.beginPath();
  for (let slot = 0; slot < branchCount; slot += 1) {
    if (branchTone[slot] !== tone || polyLength[slot] === 0 || polyWidest[slot]! < minWidthPx) continue;
    addRibbon(ctx, slot, share);
    drawn += 1;
  }
  if (drawn === 0) return;
  ctx.fillStyle = ink;
  ctx.fill();
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
}

function hasStaleInside(sums: Int32Array | null, from: number, to: number): boolean {
  return sums !== null && sums[to]! - sums[from]! > 0;
}

/** A soft light behind a domain hub: stacked translucent discs, no filter and no gradient. */
function paintHubGlow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, tone: number, tokens: TreeTokens): void {
  const { hubGlowAlpha, hubGlowReach } = tokens.paint;
  if (glowFade === 0) return;
  ctx.fillStyle = tokens.inks.nameStrong;
  ctx.globalAlpha = (glowFade * hubGlowAlpha * (tone + 1)) / TREE_TONE_STEPS;
  for (let step = 0; step < HUB_GLOW_STEPS; step += 1) {
    ctx.beginPath();
    ctx.arc(x, y, radius * (1 + ((hubGlowReach - 1) * (HUB_GLOW_STEPS - step)) / HUB_GLOW_STEPS), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function paintMark(ctx: CanvasRenderingContext2D, frame: TreeFrameInput, mark: TreeDrawMark, tone: number, sums: Int32Array | null, tokens: TreeTokens): void {
  const model = frame.layout.model;
  const { paint, inks, tones } = tokens;
  const { node, x, y, radius } = mark;
  const kind = model.kinds[node]!;
  const growth = treeScreenGrowth(mark.scale);
  const ring = ringOf(radius, growth, tokens);
  if (mark.closed) {
    ctx.beginPath();
    ctx.arc(x, y, radius + ring + (paint.closedRingGapPx + paint.closedRingPx / 2) * growth, 0, TAU);
    ctx.lineWidth = paint.closedRingPx * growth;
    ctx.strokeStyle = tones.mark[tone]!;
    ctx.stroke();
  }
  if (kind === "domain") paintHubGlow(ctx, x, y, radius, tone, tokens);
  const selfStale = frame.stale !== null && frame.stale[node] === 1;
  // A hub's light disc stands on its glow; smaller marks keep a dark ring to part them from wood.
  if (kind !== "domain") disc(ctx, x, y, radius + ring, inks.discFill);
  const fill = kind === "project" ? tones.project : kind === "element" && selfStale ? tones.stale : tones.mark;
  disc(ctx, x, y, radius, fill[tone]!);
  if (kind === "domain") {
    ctx.beginPath();
    ctx.arc(x, y, radius * paint.domainCoreShare, 0, TAU);
    ctx.lineWidth = paint.domainCoreRingPx * growth;
    ctx.strokeStyle = inks.discFill;
    ctx.stroke();
  }

  const end = model.subtreeEnd[node]!;
  const dot = kind === "element"
    ? mark.closed && hasStaleInside(sums, node + 1, end)
    : selfStale || (mark.closed && hasStaleInside(sums, node, end));
  if (!dot) return;
  const r = Math.max(paint.staleDotMinPx * growth, radius * paint.staleDotShare);
  const dx = x + Math.cos(STALE_DOT_ANGLE) * radius;
  const dy = y + Math.sin(STALE_DOT_ANGLE) * radius;
  disc(ctx, dx, dy, r + ringOf(r, growth, tokens), inks.discFill);
  disc(ctx, dx, dy, r, tones.stale[tone]!);
}

function nameInk(kind: TreeNodeKind, tone: number, tokens: TreeTokens, lit: boolean): string {
  if (lit) return tokens.inks.nameStrong;
  if (kind === "project") return tokens.tones.project[tone]!;
  return (kind === "domain" ? tokens.tones.nameStrong : tokens.tones.name)[tone]!;
}

function paintName(ctx: CanvasRenderingContext2D, box: TreeNameBox, kind: TreeNodeKind, tone: number, tokens: TreeTokens, family: string, lit: boolean): void {
  const { names, paint, inks, tones } = tokens;
  const set = fontsFor(tokens, family);
  const subHeight = box.sub === null ? 0 : names.domainSub * names.leading;
  const x = box.side === 0 ? box.x : box.side === 1 ? box.x + box.width : box.x + box.width / 2;
  ctx.textAlign = box.side === 0 ? "left" : box.side === 1 ? "right" : "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = inks.halo;
  ctx.lineWidth = kind === "domain" ? paint.domainNameHaloPx : paint.nameHaloPx;
  ctx.font = set[KIND_SLOT[kind]]!;
  const y = box.y + (box.height - subHeight) / 2;
  ctx.strokeText(box.text, x, y);
  ctx.fillStyle = nameInk(kind, tone, tokens, lit);
  ctx.fillText(box.text, x, y);
  if (box.sub === null) return;
  const subY = box.y + box.height - subHeight / 2;
  ctx.font = set[SUB_SLOT]!;
  ctx.lineWidth = paint.nameHaloPx;
  ctx.strokeText(box.sub, x, subY);
  ctx.fillStyle = tones.nameSub[lit ? NEAREST_TONE : tone]!;
  ctx.fillText(box.sub, x, subY);
}

function paintNames(ctx: CanvasRenderingContext2D, frame: TreeFrameInput, tokens: TreeTokens, family: string, litOnly: boolean): void {
  const { names, list, layout } = frame;
  for (let i = 0; i < names.count; i += 1) {
    const box = names.boxes[i]!;
    const at = markIndexOf(box.node);
    if (at < 0 || !isGrown(frame, box.node)) continue;
    const lit = litStamp[box.node] === stamp;
    if (litOnly && !lit) continue;
    paintName(ctx, box, layout.model.kinds[box.node]!, litOnly ? NEAREST_TONE : list.marks[at]!.tone, tokens, family, litOnly);
  }
}

function arcEnd(model: TreeModel, frame: TreeFrameInput, node: number, focusAt: number, seen: Uint32Array): number {
  const at = markHolding(model, node);
  if (at < 0 || at === focusAt || seen[at] === stamp || !isGrown(frame, frame.list.marks[at]!.node)) return -1;
  seen[at] = stamp;
  return at;
}

/** Needs first, then used-by, until the arc budget; ends folded into one closed mark draw once. */
function collectArcs(frame: TreeFrameInput, focusAt: number, budget: number): number {
  const focus = frame.focus!;
  const model = frame.layout.model;
  let count = 0;
  for (let i = 0; i < focus.needs.length && count < budget; i += 1) {
    const at = arcEnd(model, frame, focus.needs[i]!, focusAt, needsStamp);
    if (at < 0) continue;
    arcFrom[count] = focusAt;
    arcTo[count] = at;
    arcRole[count] = ARC_NEEDS;
    count += 1;
  }
  for (let i = 0; i < focus.usedBy.length && count < budget; i += 1) {
    const at = arcEnd(model, frame, focus.usedBy[i]!, focusAt, usedByStamp);
    if (at < 0) continue;
    arcFrom[count] = at;
    arcTo[count] = focusAt;
    arcRole[count] = ARC_USED_BY;
    count += 1;
  }
  return count;
}

/** A quadratic bowed upward on screen, cut back to the edge of both marks. */
function addArc(ctx: CanvasRenderingContext2D, a: TreeDrawMark, b: TreeDrawMark, tokens: TreeTokens): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const side = dx >= 0 ? 1 : -1;
  const cx = (a.x + b.x) / 2 + (dy / len) * len * tokens.paint.arcBow * side;
  const cy = (a.y + b.y) / 2 - (dx / len) * len * tokens.paint.arcBow * side;
  const ra = outerRadius(a, tokens) + tokens.paint.arcGapPx;
  const rb = outerRadius(b, tokens) + tokens.paint.arcGapPx;
  const la = Math.hypot(cx - a.x, cy - a.y) || 1;
  const lb = Math.hypot(cx - b.x, cy - b.y) || 1;
  ctx.moveTo(a.x + ((cx - a.x) / la) * ra, a.y + ((cy - a.y) / la) * ra);
  ctx.quadraticCurveTo(cx, cy, b.x + ((cx - b.x) / lb) * rb, b.y + ((cy - b.y) / lb) * rb);
}

function paintFocus(ctx: CanvasRenderingContext2D, frame: TreeFrameInput, sums: Int32Array | null, tokens: TreeTokens, family: string): void {
  const focus = frame.focus!;
  const { list, layout, width, height } = frame;
  const model = layout.model;
  const { paint, inks } = tokens;
  const focusAt = markHolding(model, focus.node);
  if (focusAt < 0 || !isGrown(frame, list.marks[focusAt]!.node)) return;

  for (let node = focus.node; node >= 0; node = model.parent[node]!) litStamp[node] = stamp;
  const arcs = collectArcs(frame, focusAt, TREE_ARC_BUDGET);
  for (let i = 0; i < arcs; i += 1) litStamp[list.marks[arcFrom[i] === focusAt ? arcTo[i]! : arcFrom[i]!]!.node] = stamp;

  ctx.globalAlpha = paint.focusVeilAlpha;
  ctx.fillStyle = inks.ground;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;

  paintFocusPath(ctx, frame, tokens);

  for (let i = 0; i < list.count; i += 1) {
    const mark = list.marks[i]!;
    if (litStamp[mark.node] !== stamp || !drawsDisc(model, mark) || !isGrown(frame, mark.node)) continue;
    paintMark(ctx, frame, mark, NEAREST_TONE, sums, tokens);
  }
  paintNames(ctx, frame, tokens, family, true);

  for (let role = ARC_NEEDS; role <= ARC_USED_BY; role += 1) {
    ctx.beginPath();
    let drawn = 0;
    for (let i = 0; i < arcs; i += 1) {
      if (arcRole[i] !== role) continue;
      addArc(ctx, list.marks[arcFrom[i]!]!, list.marks[arcTo[i]!]!, tokens);
      drawn += 1;
    }
    if (drawn === 0) continue;
    ctx.lineCap = "round";
    ctx.strokeStyle = inks.halo;
    ctx.lineWidth = paint.arcHaloPx;
    ctx.stroke();
    ctx.strokeStyle = role === ARC_NEEDS ? inks.arc : inks.reach;
    ctx.lineWidth = paint.arcWidthPx;
    ctx.stroke();
  }

  const held = list.marks[focusAt]!;
  ctx.beginPath();
  ctx.arc(held.x, held.y, outerRadius(held, tokens) + paint.focusRingGapPx * treeScreenGrowth(held.scale), 0, TAU);
  ctx.strokeStyle = inks.nameStrong;
  ctx.lineWidth = paint.focusRingPx;
  ctx.stroke();
}

/**
 * The focus's own branches down to the trunk, redrawn over the veil in their rest inks and
 * widths, with only the core in the strong ink: light running inside the wood.
 */
function paintFocusPath(ctx: CanvasRenderingContext2D, frame: TreeFrameInput, tokens: TreeTokens): void {
  const { paint, inks, tones } = tokens;
  fillFocusPath(ctx, frame, 1, 0, tones.branch);
  fillFocusPath(ctx, frame, paint.branchMidShare, paint.branchCoreMinPx, tones.branchMid);
  fillFocusPath(ctx, frame, paint.branchCoreShare, 0, inks.nameStrong);
}

function fillFocusPath(ctx: CanvasRenderingContext2D, frame: TreeFrameInput, share: number, minWidthPx: number, ink: string | readonly string[]): void {
  const parent = frame.layout.model.parent;
  const shared = typeof ink === "string";
  if (shared) ctx.beginPath();
  let drawn = 0;
  for (let node = frame.focus!.node; node >= 0; node = parent[node]!) {
    if (branchStamp[node] !== stamp) continue;
    const slot = branchAt[node]!;
    if (polyLength[slot] === 0 || polyWidest[slot]! < minWidthPx) continue;
    if (!shared) ctx.beginPath();
    addRibbon(ctx, slot, share);
    drawn += 1;
    if (!shared) {
      ctx.fillStyle = ink[branchTone[slot]!]!;
      ctx.fill();
    }
  }
  if (!shared || drawn === 0) return;
  ctx.fillStyle = ink;
  ctx.fill();
}

/**
 * Paints one frame far to near: glows, branches, marks, names, then the focus with its arcs.
 * Inputs are CSS pixels; the context is scaled by `dpr`. Work is O(marks + names + arcs); the
 * only allocations are the canvas gradients.
 */
export function paintTreeFrame(ctx: CanvasRenderingContext2D, frame: TreeFrameInput, tokens: TreeTokens): void {
  const { layout, list, width, height, dpr } = frame;
  const model = layout.model;
  ensureCapacity(model.count, list.count, TREE_ARC_BUDGET);
  for (let i = 0; i < list.count; i += 1) {
    const node = list.marks[i]!.node;
    markAt[node] = i;
    markStamp[node] = stamp;
  }
  const sums = frame.stale === null ? null : staleSumsOf(frame.stale, model.count);
  const family = labelFontFamily();

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = tokens.inks.ground;
  ctx.fillRect(0, 0, width, height);
  paintGlows(ctx, frame, tokens);
  traceBranches(frame, tokens);
  paintBranches(ctx, tokens);
  for (let i = 0; i < list.count; i += 1) {
    const mark = list.marks[i]!;
    if (drawsDisc(model, mark) && isGrown(frame, mark.node)) paintMark(ctx, frame, mark, mark.tone, sums, tokens);
  }
  paintNames(ctx, frame, tokens, family, false);
  if (frame.focus) paintFocus(ctx, frame, sums, tokens, family);
  ctx.restore();
}
