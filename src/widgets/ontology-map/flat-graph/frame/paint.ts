import { glowSprite, lightSprite, sunk, type ArcPath } from "../marks";
import { leaderSegment } from "../names/lit-lines";
import type { FlatGraphPaintTokens, FlatGraphTokens } from "../flat-graph-shapes";
import { DRAWN_INK, type Disc, type Dot, type Segment, type Arc, LINE_KINDS, type Glow, type Light, type Name, FrameList, type FramePlan, F as frameState } from "./state";

// A module-local name: see `F` in ./state.
const F = frameState;

const FOCUS_RIM_PX = 2.4;
const ARROW_SPREAD = 0.5;
const TAPER_STEPS = 18;
const TAPER_TIP_PX = 0.35;
const ARROW_WIDTH_PX = 1.3;

const AGENT_RING_WIDTH_PX = 1;
const UNKNOWN_DASH = [2, 2];

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
      const length = Math.hypot(tx, ty) || 1;
      const half = side * ((width / 2) * u + TAPER_TIP_PX * t);
      if (side === 1 && k === 0) ctx.moveTo(x - (ty / length) * half, y + (tx / length) * half);
      else ctx.lineTo(x - (ty / length) * half, y + (tx / length) * half);
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
  const length = Math.hypot(dx, dy) || 1;
  const ox = (-dy / length) * offset;
  const oy = (dx / length) * offset;
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
  // Stale evidence recolours the rim at its own width, the amber the legend names; a heavier ring outshouts the map when most evidence is stale.
  ctx.lineWidth = rimPx;
  for (let dIndex = 0; dIndex < marks.length; dIndex += 1) {
    const d = marks[dIndex]!;
    if (d.state !== "stale") continue;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.strokeStyle = sunk(warning, ground, d.ink);
    ctx.stroke();
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
    if (!n.backed) continue;
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

export function paintPlan(ctx: CanvasRenderingContext2D, plan: FramePlan, tokens: FlatGraphTokens, ground: string, warning: string, growth: number): void {
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
