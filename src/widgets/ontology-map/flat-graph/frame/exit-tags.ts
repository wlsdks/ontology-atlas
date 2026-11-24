import type { ArcPath } from "../marks";
import { font } from "../names/titles";
import { labelFontFamily } from "../../render/labels";
import { F, type Arc } from "./state";

/** Where a lit line leaves the free map: the name of the concept it runs to, held just inside that edge. */
export interface ExitTag {
  text: string;
  /** The words drawn, the arrow on the edge's side. */
  label: string;
  /** The label's width, px. */
  w: number;
  /** The arrow's end of the label: the edge's air in from it, or the label's middle on a top or bottom edge. */
  x: number;
  y: number;
  edge: "left" | "right" | "top" | "bottom";
  ink: string;
  alpha: number;
  /** How far its far end has slid under the edge, 0 to 1, which its line's cut end fades by. */
  whole: number;
  /** The line it names, ended at this tag once the tags are arranged. */
  arc: Arc | null;
  /** Whether that line runs from the selection, so its cut end is its curve's end. */
  fromFocus: boolean;
}

const pool: ExitTag[] = [];
let count = 0;

/** Air between a tag and the free map's edge, px. */
const EDGE_AIR_PX = 10;
/**
 * The least run, px, over which a far end's tag comes in and its disc and name go: from the moment the
 * disc's rim meets the edge to the moment the edge reaches its centre, so a half-cut disc is never named.
 */
const FADE_MIN_PX = 2;
/** Samples along a line's curve when finding where it leaves the free map. */
const EXIT_SAMPLES = 24;
const EXIT_REFINE = 8;
/** The share of its run a line has drawn before its tag starts to show. */
const SHOW_FROM = 0.8;

/** How far each far end of the frame has given its place to its tag, 0 to 1. */
const exited = new Map<string, number>();

export function restartExitTags(): void {
  count = 0;
  exited.clear();
}

/** How far `id`'s disc and name have given way to its tag this frame, 0 to 1. O(1). */
export const exitedShare = (id: string): number => exited.get(id) ?? 0;

export function exitTags(): readonly ExitTag[] {
  return pool.slice(0, count);
}

const smooth = (from: number, to: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

function pointAt(path: ArcPath, t: number, out: { x: number; y: number }): void {
  const u = 1 - t;
  out.x = u * u * path.a.x + 2 * u * t * path.c.x + t * t * path.b.x;
  out.y = u * u * path.a.y + 2 * u * t * path.c.y + t * t * path.b.y;
}

const probe = { x: 0, y: 0 };

/** How far `p` lies outside the free map shrunk by `pad`, px; negative inside it. */
function signedOutside(x: number, y: number, pad: number): number {
  const r = F.input.freeRect;
  return Math.max(r.minX + pad - x, x - r.maxX + pad, r.minY + pad - y, y - r.maxY + pad);
}

const outsideBy = (x: number, y: number, pad: number) => Math.max(0, signedOutside(x, y, pad));

/** The far end's radius and centre the last `exitShare` read the edge by. */
let farPad = 0;
const farAt = { x: 0, y: 0 };

function conceptText(id: string): string | null {
  const { model } = F;
  return model.capabilityById.get(id)?.label ?? model.domainById.get(id)?.label ?? F.input.elementLabel(id) ?? null;
}

let exitWhole = 0;

/** How whole the last `exitShare` line's leaving is, 0 to 1 as its far end's disc slides under the edge, so its fade grows in. */
export const exitWholeShare = (): number => exitWhole;

/**
 * How far along a lit line of the selection, as a share of it from the selection's end, the line
 * leaves the free map toward a far end whose disc, centred at `far` with radius `farR`, a panel or
 * the canvas edge has begun to cut; -1 when that disc is whole on the free map or the selection's own
 * end is not. Sampled from the selection's end, then halved
 * down to the edge. O(EXIT_SAMPLES + EXIT_REFINE).
 */
export function exitShare(path: ArcPath, fromFocus: boolean, far: { x: number; y: number }, farR: number): number {
  const near = fromFocus ? path.a : path.b;
  // The edge is read at the far disc's own radius in from the free map's, so its tag starts as the disc is first cut.
  farPad = farR;
  farAt.x = far.x;
  farAt.y = far.y;
  exitWhole = smooth(0, Math.max(FADE_MIN_PX, farR), outsideBy(far.x, far.y, farR));
  if (exitWhole <= 0 || outsideBy(near.x, near.y, 0) > 0) return -1;
  let inside = 0;
  let out = 1;
  for (let i = 1; i <= EXIT_SAMPLES; i += 1) {
    const s = i / EXIT_SAMPLES;
    pointAt(path, fromFocus ? s : 1 - s, probe);
    if (outsideBy(probe.x, probe.y, farPad) > 0) {
      out = s;
      break;
    }
    inside = s;
  }
  for (let i = 0; i < EXIT_REFINE; i += 1) {
    const mid = (inside + out) / 2;
    pointAt(path, fromFocus ? mid : 1 - mid, probe);
    if (outsideBy(probe.x, probe.y, farPad) > 0) out = mid;
    else inside = mid;
  }
  return inside;
}

/**
 * Records a tag for a lit line of the selection whose far end lies off the free map, under a panel or
 * past the canvas: the line's own ink names where it goes at the point it leaves, `inside` of the way
 * from the selection (from `exitShare`). `arc`, already ended at the edge, is ended again at its tag
 * once the frame's tags are arranged. O(1).
 */
export function addExitTag(arc: Arc, fromId: string, toId: string, focusId: string, ink: string, reach: number, inside: number): void {
  if (reach < SHOW_FROM || inside < 0) return;
  const path = arc.path;
  const fromFocus = fromId === focusId;
  if (!fromFocus && toId !== focusId) return;
  const farId = fromFocus ? toId : fromId;
  const text = conceptText(farId);
  if (!text) return;
  exited.set(farId, Math.max(exited.get(farId) ?? 0, exitWhole));
  pointAt(path, fromFocus ? inside : 1 - inside, probe);
  const r = F.input.freeRect;
  // The edge the line crosses, read at the disc's radius in; a line whose run stays inside that names
  // the edge the far disc is under, the one its centre lies nearest to.
  const crossed = probe.x - r.minX - farPad < 1 ? "left" : r.maxX - farPad - probe.x < 1 ? "right" : probe.y - r.minY - farPad < 1 ? "top" : r.maxY - farPad - probe.y < 1 ? "bottom" : null;
  const least = Math.min(farAt.x - r.minX, r.maxX - farAt.x, farAt.y - r.minY, r.maxY - farAt.y);
  const edge = crossed ?? (least === farAt.x - r.minX ? "left" : least === r.maxX - farAt.x ? "right" : least === farAt.y - r.minY ? "top" : "bottom");
  const tag = pool[count] ?? (pool[count] = { text: "", label: "", w: 0, x: 0, y: 0, edge: "left", ink: "", alpha: 0, whole: 0, arc: null, fromFocus: true });
  count += 1;
  tag.text = text;
  tag.edge = edge;
  tag.label = edge === "left" ? `← ${text}` : edge === "right" ? `${text} →` : edge === "top" ? `↑ ${text}` : `↓ ${text}`;
  tag.w = measureTag(tag.label);
  // The tag stands where its line meets the edge, its arrow at the edge and its words toward the selection.
  tag.x = edge === "left" ? r.minX + EDGE_AIR_PX : edge === "right" ? r.maxX - EDGE_AIR_PX : probe.x;
  tag.y = edge === "top" ? r.minY + EDGE_AIR_PX : edge === "bottom" ? r.maxY - EDGE_AIR_PX : probe.y;
  tag.ink = ink;
  tag.whole = exitWhole;
  tag.alpha = smooth(SHOW_FROM, 1, reach) * exitWhole;
  tag.arc = arc;
  tag.fromFocus = fromFocus;
}

let measured: { font: string; widths: Map<string, number> } | null = null;

/** A tag's label width at the tag font, cached per label while the font holds. O(1) after the first. */
function measureTag(label: string): number {
  const tagFont = font(500, F.P.capNamePx, labelFontFamily());
  if (measured === null || measured.font !== tagFont) measured = { font: tagFont, widths: new Map() };
  let w = measured.widths.get(label);
  if (w === undefined) {
    const ctx = F.input.ctx;
    ctx.save();
    ctx.font = tagFont;
    w = ctx.measureText(label).width;
    ctx.restore();
    measured.widths.set(label, w);
  }
  return w;
}

/** The height one tag takes, its plate and the air to the next. */
const tagRowPx = () => F.P.capNamePx + F.P.namePadPx * 2 + 2;
/** Air a line ends short of its tag's plate, px. */
const TAG_AIR_PX = 3;

const order = (a: ExitTag, b: ExitTag) => (a.edge === b.edge ? (a.edge === "left" || a.edge === "right" ? a.y - b.y : a.x - b.x) : a.edge < b.edge ? -1 : 1);
const arranged: ExitTag[] = [];

/** The left of a tag's words. */
const tagLeft = (tag: ExitTag) => (tag.edge === "left" ? tag.x : tag.edge === "right" ? tag.x - tag.w : tag.x - tag.w / 2);

/**
 * Pushes the frame's tags on one edge apart to a row each, kept inside that edge, then ends each tag's
 * line where it meets the tag's plate, so every line arrives at its own name. O(tags log tags + tags × samples).
 */
export function arrangeExitTags(): void {
  if (count === 0) return;
  const P = F.P;
  const r = F.input.freeRect;
  const row = tagRowPx();
  arranged.length = 0;
  for (let i = 0; i < count; i += 1) arranged.push(pool[i]!);
  arranged.sort(order);
  for (let i = 1; i < arranged.length; i += 1) {
    const a = arranged[i - 1]!;
    const b = arranged[i]!;
    if (a.edge !== b.edge) continue;
    if (a.edge === "left" || a.edge === "right") {
      if (b.y - a.y < row) b.y = a.y + row;
    } else {
      const gap = (a.w + b.w) / 2 + P.backingPadXPx * 2 + EDGE_AIR_PX;
      if (b.x - a.x < gap) b.x = a.x + gap;
    }
  }
  // A run pushed past the bottom of its edge moves up as one, no higher than the edge's top.
  for (let end = arranged.length - 1; end >= 0; ) {
    const edge = arranged[end]!.edge;
    let first = end;
    while (first > 0 && arranged[first - 1]!.edge === edge) first -= 1;
    if (edge === "left" || edge === "right") {
      const over = arranged[end]!.y - (r.maxY - row / 2);
      const room = arranged[first]!.y - (r.minY + row / 2);
      const lift = Math.min(Math.max(0, over), Math.max(0, room));
      if (lift > 0) for (let i = first; i <= end; i += 1) arranged[i]!.y -= lift;
    }
    end = first - 1;
  }
  for (const tag of arranged) {
    if (tag.arc === null) continue;
    const left = tagLeft(tag);
    const half = P.capNamePx / 2 + P.backingPadYPx + TAG_AIR_PX;
    const box = { minX: left - P.backingPadXPx - TAG_AIR_PX, maxX: left + tag.w + P.backingPadXPx + TAG_AIR_PX, minY: tag.y - half, maxY: tag.y + half };
    endAtTag(tag.arc, tag.fromFocus, box, tag.edge, tag.whole);
  }
}

/**
 * Ends `arc` where, run from the selection's end, it first meets `box`; a line that never meets it,
 * its tag pushed off its row, ends where it reaches the box's inner side. O(EXIT_SAMPLES + EXIT_REFINE).
 */
function endAtTag(arc: Arc, fromFocus: boolean, box: { minX: number; minY: number; maxX: number; maxY: number }, edge: ExitTag["edge"], whole: number): void {
  const path = arc.path;
  const reached = (x: number, y: number) => {
    if (x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY) return true;
    return edge === "left" ? x <= box.maxX : edge === "right" ? x >= box.minX : edge === "top" ? y <= box.maxY : y >= box.minY;
  };
  let clear = 0;
  let met = -1;
  for (let i = 1; i <= EXIT_SAMPLES; i += 1) {
    const s = i / EXIT_SAMPLES;
    pointAt(path, fromFocus ? s : 1 - s, probe);
    if (reached(probe.x, probe.y)) {
      met = s;
      break;
    }
    clear = s;
  }
  if (met < 0) return;
  for (let i = 0; i < EXIT_REFINE; i += 1) {
    const mid = (clear + met) / 2;
    pointAt(path, fromFocus ? mid : 1 - mid, probe);
    if (reached(probe.x, probe.y)) met = mid;
    else clear = mid;
  }
  if (clear <= 0) return;
  cutArc(arc, fromFocus ? 0 : 1 - clear, fromFocus ? clear : 1, fromFocus, whole);
  // The cut end lands on the middle of the tag's inner side, so a tag pushed off its row still
  // takes its own line; the control point takes half the move, so the curve bends, never kinks.
  const end = fromFocus ? path.b : path.a;
  const tx = edge === "left" ? box.maxX : edge === "right" ? box.minX : (box.minX + box.maxX) / 2;
  const ty = edge === "top" ? box.maxY : edge === "bottom" ? box.minY : (box.minY + box.maxY) / 2;
  const dx = tx - end.x;
  const dy = ty - end.y;
  end.x = tx;
  end.y = ty;
  path.c.x += dx / 2;
  path.c.y += dy / 2;
}

/**
 * Keeps the share `t0` to `t1` of `arc`'s curve, a quadratic cut by blossoming, and fades the cut end
 * in by `whole` of the line's own fade. O(1).
 */
export function cutArc(arc: Arc, t0: number, t1: number, cutAtEnd: boolean, whole: number): void {
  const { a, c, b } = arc.path;
  const u0 = 1 - t0;
  const u1 = 1 - t1;
  const mid = t0 * u1 + u0 * t1;
  const cx = u0 * u1 * a.x + mid * c.x + t0 * t1 * b.x;
  const cy = u0 * u1 * a.y + mid * c.y + t0 * t1 * b.y;
  const ax = u0 * u0 * a.x + 2 * u0 * t0 * c.x + t0 * t0 * b.x;
  const ay = u0 * u0 * a.y + 2 * u0 * t0 * c.y + t0 * t0 * b.y;
  const bx = u1 * u1 * a.x + 2 * u1 * t1 * c.x + t1 * t1 * b.x;
  const by = u1 * u1 * a.y + 2 * u1 * t1 * c.y + t1 * t1 * b.y;
  a.x = ax;
  a.y = ay;
  c.x = cx;
  c.y = cy;
  b.x = bx;
  b.y = by;
  const fade = Math.min(0.5, F.P.lineFadePx / (Math.hypot(bx - ax, by - ay) || 1)) * whole;
  if (cutAtEnd) arc.fadeEnd = Math.max(arc.fadeEnd, fade);
  else arc.fadeStart = Math.max(arc.fadeStart, fade);
}

/** Paints the frame's arranged tags on their plates. O(tags). */
export function paintExitTags(ctx: CanvasRenderingContext2D, ground: string, halo: string): void {
  if (count === 0) return;
  const P = F.P;
  const px = P.capNamePx;
  ctx.save();
  ctx.font = font(500, px, labelFontFamily());
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  for (let i = 0; i < count; i += 1) {
    const tag = pool[i]!;
    if (tag.alpha <= 0.01) continue;
    const left = tagLeft(tag);
    ctx.globalAlpha = tag.alpha * P.backingAlpha;
    ctx.fillStyle = ground;
    ctx.beginPath();
    ctx.roundRect(left - P.backingPadXPx, tag.y - px / 2 - P.backingPadYPx, tag.w + P.backingPadXPx * 2, px + P.backingPadYPx * 2, P.backingRadiusPx);
    ctx.fill();
    ctx.globalAlpha = tag.alpha;
    ctx.lineWidth = P.nameHaloPx;
    ctx.strokeStyle = halo;
    ctx.strokeText(tag.label, left, tag.y);
    ctx.fillStyle = tag.ink;
    ctx.fillText(tag.label, left, tag.y);
  }
  ctx.restore();
}
