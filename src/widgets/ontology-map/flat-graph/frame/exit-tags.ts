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
/** How far past the edge a far end must lie before its tag is whole, px, so a tag fades as the end slides out of view. */
const FADE_OUT_PX = 28;
/** Samples along a line's curve when finding where it leaves the free map. */
const EXIT_SAMPLES = 24;
const EXIT_REFINE = 8;
/** The share of its run a line has drawn before its tag starts to show. */
const SHOW_FROM = 0.8;

export function restartExitTags(): void {
  count = 0;
}

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

/** How far `p` lies outside the free map, px; 0 inside it. */
function outsideBy(x: number, y: number): number {
  const r = F.input.freeRect;
  return Math.max(r.minX - x, x - r.maxX, r.minY - y, y - r.maxY, 0);
}

function conceptText(id: string): string | null {
  const { model } = F;
  return model.capabilityById.get(id)?.label ?? model.domainById.get(id)?.label ?? F.input.elementLabel(id) ?? null;
}

let exitWhole = 0;

/** How whole the last `exitShare` line's leaving is, 0 to 1 as its far end slides `FADE_OUT_PX` past the edge, so its fade grows in. */
export const exitWholeShare = (): number => exitWhole;

/**
 * How far along a lit line of the selection, as a share of it from the selection's end, the line
 * leaves the free map toward a far end under a panel or past the canvas; -1 when both ends are on
 * the free map or the selection's own end is not. Sampled from the selection's end, then halved
 * down to the edge. O(EXIT_SAMPLES + EXIT_REFINE).
 */
export function exitShare(path: ArcPath, fromFocus: boolean): number {
  const far = fromFocus ? path.b : path.a;
  const near = fromFocus ? path.a : path.b;
  exitWhole = smooth(0, FADE_OUT_PX, outsideBy(far.x, far.y));
  if (exitWhole <= 0 || outsideBy(near.x, near.y) > 0) return -1;
  let inside = 0;
  let out = 1;
  for (let i = 1; i <= EXIT_SAMPLES; i += 1) {
    const s = i / EXIT_SAMPLES;
    pointAt(path, fromFocus ? s : 1 - s, probe);
    if (outsideBy(probe.x, probe.y) > 0) {
      out = s;
      break;
    }
    inside = s;
  }
  for (let i = 0; i < EXIT_REFINE; i += 1) {
    const mid = (inside + out) / 2;
    pointAt(path, fromFocus ? mid : 1 - mid, probe);
    if (outsideBy(probe.x, probe.y) > 0) out = mid;
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
  const far = fromFocus ? path.b : path.a;
  const away = outsideBy(far.x, far.y);
  const text = conceptText(fromFocus ? toId : fromId);
  if (!text) return;
  // A little way back toward the selection, which side of the edge point the line runs on.
  const back = Math.max(0, inside - INWARD_SHARE);
  pointAt(path, fromFocus ? back : 1 - back, inward);
  pointAt(path, fromFocus ? inside : 1 - inside, probe);
  const r = F.input.freeRect;
  const edge = probe.x - r.minX < 1 ? "left" : r.maxX - probe.x < 1 ? "right" : probe.y - r.minY < 1 ? "top" : "bottom";
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
  tag.alpha = smooth(SHOW_FROM, 1, reach) * smooth(0, FADE_OUT_PX, away);
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
    const label = tag.edge === "left" ? `← ${tag.text}` : tag.edge === "right" ? `${tag.text} →` : tag.text;
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
