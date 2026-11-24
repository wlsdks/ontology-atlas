import type { ArcPath } from "../marks";
import { font } from "../names/titles";
import { labelFontFamily } from "../../render/labels";
import { F } from "./state";

/** Where a lit line leaves the free map: the name of the concept it runs to, held just inside that edge. */
export interface ExitTag {
  text: string;
  x: number;
  y: number;
  edge: "left" | "right" | "top" | "bottom";
  ink: string;
  alpha: number;
  /** Which side of its line the tag stands on: 1 below or right of it, -1 above or left. */
  side: 1 | -1;
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
const inward = { x: 0, y: 0 };
/** How far back along the line, as a share of it, the side the tag takes is read. */
const INWARD_SHARE = 0.04;

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
 * from the selection (from `exitShare`). O(1).
 */
export function addExitTag(path: ArcPath, fromId: string, toId: string, focusId: string, ink: string, reach: number, inside: number): void {
  if (reach < SHOW_FROM || inside < 0) return;
  const fromFocus = fromId === focusId;
  if (!fromFocus && toId !== focusId) return;
  const farId = fromFocus ? toId : fromId;
  const text = conceptText(farId);
  if (!text) return;
  exited.set(farId, Math.max(exited.get(farId) ?? 0, exitWhole));
  // A little way back toward the selection, which side of the edge point the line runs on.
  const back = Math.max(0, inside - INWARD_SHARE);
  pointAt(path, fromFocus ? back : 1 - back, inward);
  pointAt(path, fromFocus ? inside : 1 - inside, probe);
  const r = F.input.freeRect;
  // The edge the line crosses, read at the disc's radius in; a line whose run stays inside that names
  // the edge the far disc is under, the one its centre lies nearest to.
  const crossed = probe.x - r.minX - farPad < 1 ? "left" : r.maxX - farPad - probe.x < 1 ? "right" : probe.y - r.minY - farPad < 1 ? "top" : r.maxY - farPad - probe.y < 1 ? "bottom" : null;
  const least = Math.min(farAt.x - r.minX, r.maxX - farAt.x, farAt.y - r.minY, r.maxY - farAt.y);
  const edge = crossed ?? (least === farAt.x - r.minX ? "left" : least === r.maxX - farAt.x ? "right" : least === farAt.y - r.minY ? "top" : "bottom");
  const tag = pool[count] ?? (pool[count] = { text: "", x: 0, y: 0, edge: "left", ink: "", alpha: 0, side: 1 });
  count += 1;
  tag.text = text;
  tag.edge = edge;
  tag.x = edge === "left" ? r.minX + EDGE_AIR_PX : edge === "right" ? r.maxX - EDGE_AIR_PX : probe.x;
  tag.y = edge === "top" ? r.minY + EDGE_AIR_PX : edge === "bottom" ? r.maxY - EDGE_AIR_PX : probe.y;
  // The tag stands beside its line, on the side the line turns away from, so the line never strikes it through.
  tag.side = edge === "left" || edge === "right" ? (inward.y < probe.y ? 1 : -1) : inward.x < probe.x ? 1 : -1;
  if (edge === "left" || edge === "right") tag.y += tag.side * tagRowPx() / 2;
  tag.ink = ink;
  tag.alpha = smooth(SHOW_FROM, 1, reach) * exitWhole;
}

/** The height one tag takes, its plate and the air to the next. */
const tagRowPx = () => F.P.capNamePx + F.P.namePadPx * 2 + 2;

const order = (a: ExitTag, b: ExitTag) => (a.edge === b.edge ? (a.edge === "left" || a.edge === "right" ? a.y - b.y : a.x - b.x) : a.edge < b.edge ? -1 : 1);
const arranged: ExitTag[] = [];

/** Paints the frame's tags on their plates, tags on one edge pushed apart to a row each. O(tags log tags). */
export function paintExitTags(ctx: CanvasRenderingContext2D, ground: string, halo: string): void {
  if (count === 0) return;
  const P = F.P;
  const px = P.capNamePx;
  const tagFont = font(500, px, labelFontFamily());
  const row = tagRowPx();
  arranged.length = 0;
  for (let i = 0; i < count; i += 1) arranged.push(pool[i]!);
  arranged.sort(order);
  for (let i = 1; i < arranged.length; i += 1) {
    const a = arranged[i - 1]!;
    const b = arranged[i]!;
    if (a.edge !== b.edge || a.edge === "top" || a.edge === "bottom") continue;
    if (b.y - a.y < row) b.y = a.y + row;
  }
  ctx.save();
  ctx.font = tagFont;
  ctx.textBaseline = "middle";
  for (const tag of arranged) {
    if (tag.alpha <= 0.01) continue;
    const label = tag.edge === "left" ? `← ${tag.text}` : tag.edge === "right" ? `${tag.text} →` : tag.edge === "top" ? `↑ ${tag.text}` : `↓ ${tag.text}`;
    const w = ctx.measureText(label).width;
    const left = tag.edge === "left" ? tag.x : tag.edge === "right" ? tag.x - w : tag.x - w / 2;
    ctx.textAlign = "left";
    ctx.globalAlpha = tag.alpha * P.backingAlpha;
    ctx.fillStyle = ground;
    ctx.beginPath();
    ctx.roundRect(left - P.backingPadXPx, tag.y - px / 2 - P.backingPadYPx, w + P.backingPadXPx * 2, px + P.backingPadYPx * 2, P.backingRadiusPx);
    ctx.fill();
    ctx.globalAlpha = tag.alpha;
    ctx.lineWidth = P.nameHaloPx;
    ctx.strokeStyle = halo;
    ctx.strokeText(label, left, tag.y);
    ctx.fillStyle = tag.ink;
    ctx.fillText(label, left, tag.y);
  }
  ctx.restore();
}
