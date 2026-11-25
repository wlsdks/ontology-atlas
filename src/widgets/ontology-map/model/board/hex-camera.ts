import type { Rect } from "../../interaction/free-area";
import { groundInverseY, type ReliefView } from "../../board/relief-projection";
import { hexRestCamera, type HexCamera as Camera, type MapChrome } from "../../morph/hex-marks";
import { HEX_MAX_RADIUS, HEX_MIN_RADIUS, type HexBoardLayout } from "./hex-board";
import { SQRT3 } from "./hex-grid";

/** The board keeps this much (CSS px) on screen when it is panned or zoomed away. */
const PAN_KEEP = 160;
/** A route keeps this far (CSS px) from the free map's edges and from every piece of chrome. */
const ROUTE_CLEAR = 10;
/** The resting board keeps this far (CSS px) above its own footer. */
const FOOTER_CLEAR = 8;
/** A focused selection keeps this far (CSS px) inside the free map. */
const FOCUS_MARGIN = 16;
/** A region double-clicked into view leaves this much (CSS px) around it. */
const REGION_FIT_PAD = 64;

/**
 * The board rests in the room the glide predicted (`readHexRoom`). Only when its lowest tiles, at
 * the resting pitch, would reach a footer that wrapped past that reserve, and a shorter room lifts
 * them clear, does it rest in that shorter room; a board too large for either stays as predicted.
 */
export function restCameraAboveFooter(layout: HexBoardLayout, room: Rect, footerTop: number | null, pitch: number): Camera {
  const pivot = room.y + room.height / 2;
  const lowest = (c: Camera) => pivot + (c.oy + layout.bounds.maxY * c.R - pivot) * Math.cos(pitch);
  const rest = hexRestCamera(layout, room);
  if (footerTop == null || lowest(rest) <= footerTop - FOOTER_CLEAR) return rest;
  const lifted = hexRestCamera(layout, { ...room, height: Math.max(80, Math.round(footerTop - FOOTER_CLEAR - room.y)) });
  return lowest(lifted) <= footerTop - FOOTER_CLEAR ? lifted : rest;
}

/** Whether two cameras draw the board in the same place: under half a pixel of offset and a hundredth of cell radius apart. O(1). */
export function sameHexCamera(a: Camera, b: Camera): boolean {
  return Math.abs(a.ox - b.ox) < 0.5 && Math.abs(a.oy - b.oy) < 0.5 && Math.abs(a.R - b.R) < 0.01;
}

/** Where routes may run, in the board's unit space, for one camera. */
export interface RouteFrame {
  key: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  blocks: { x0: number; y0: number; x1: number; y1: number }[];
}

export function routeFrameOf(chrome: MapChrome | null, cam: Camera, view: ReliefView): RouteFrame | null {
  if (!chrome) return null;
  const ux = (px: number) => (px - cam.ox) / cam.R;
  const uy = (py: number) => groundInverseY(py, view, cam);
  const f = chrome.free;
  const frame = {
    x0: ux(f.x + ROUTE_CLEAR),
    y0: uy(f.y + ROUTE_CLEAR),
    x1: ux(f.x + f.width - ROUTE_CLEAR),
    y1: uy(f.y + f.height - ROUTE_CLEAR),
    blocks: chrome.blocks
      .filter((b) => b.x < f.x + f.width && b.x + b.width > f.x && b.y < f.y + f.height && b.y + b.height > f.y)
      .map((b) => ({ x0: ux(b.x - ROUTE_CLEAR), y0: uy(b.y - ROUTE_CLEAR), x1: ux(b.x + b.width + ROUTE_CLEAR), y1: uy(b.y + b.height + ROUTE_CLEAR) })),
  };
  const q = (v: number) => Math.round(v * 20);
  const key = [frame.x0, frame.y0, frame.x1, frame.y1, ...frame.blocks.flatMap((b) => [b.x0, b.y0, b.x1, b.y1])].map(q).join(",");
  return { key, ...frame };
}

/** The camera held inside the radius limits, with `PAN_KEEP` of the board always on screen. */
export function clampHexCamera(c: Camera, bounds: HexBoardLayout["bounds"], width: number, height: number): Camera {
  const R = Math.max(HEX_MIN_RADIUS, Math.min(HEX_MAX_RADIUS, c.R));
  const minX = PAN_KEEP - bounds.maxX * R;
  const maxX = width - PAN_KEEP - bounds.minX * R;
  const minY = PAN_KEEP - bounds.maxY * R;
  const maxY = height - PAN_KEEP - bounds.minY * R;
  return { R, ox: Math.min(maxX, Math.max(minX, c.ox)), oy: Math.min(maxY, Math.max(minY, c.oy)) };
}

/** The camera that fits one region's cells in the free map, before clamping. */
export function regionFitCamera(cells: HexBoardLayout["regions"][number]["cells"], free: Rect, pivotY: number, pitch: number): Camera {
  const xs = cells.map(([q]) => 1.5 * q);
  const ys = cells.map(([q, r]) => SQRT3 * (r + q / 2));
  const b = { minX: Math.min(...xs) - 1, maxX: Math.max(...xs) + 1, minY: Math.min(...ys) - SQRT3 / 2, maxY: Math.max(...ys) + SQRT3 / 2 };
  const R = Math.min(HEX_MAX_RADIUS, Math.floor(Math.min((free.width - REGION_FIT_PAD) / (b.maxX - b.minX), (free.height - REGION_FIT_PAD) / (b.maxY - b.minY))));
  const centreY = (free.y + free.height / 2 - pivotY) / Math.cos(pitch) + pivotY;
  return { R, ox: free.x + free.width / 2 - ((b.minX + b.maxX) / 2) * R, oy: centreY - ((b.minY + b.maxY) / 2) * R };
}

/**
 * How far the camera must move, in screen px, to bring the selected tile and what it touches clear
 * of the chrome: the whole focus when it fits the free map, otherwise at least the selected tile.
 * `null` when none of the focus is on the board.
 */
export function focusShift(
  layout: HexBoardLayout,
  cam: Camera,
  free: Rect,
  view: ReliefView,
  selectedId: string,
  litIds: Iterable<string>,
  liftPx: (t: { id: string; domainId: string | null }, R: number) => number,
): { dx: number; dy: number } | null {
  const R = cam.R;
  const c = Math.cos(view.pitch);
  const s = Math.sin(view.pitch);
  const sy = (u: number) => view.pivotY + (cam.oy + u * R - view.pivotY) * c;
  const topOf = (t: { id: string; y: number; domainId: string | null }, reach: number) => sy(t.y) - liftPx(t, R) * s - reach * R * c;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  const sel = layout.byId.get(selectedId);
  for (const id of [selectedId, ...litIds]) {
    const t = layout.byId.get(id);
    if (!t) continue;
    x0 = Math.min(x0, t.x - 1);
    x1 = Math.max(x1, t.x + 1);
    y0 = Math.min(y0, topOf(t, SQRT3 / 2));
    y1 = Math.max(y1, sy(t.y) + (SQRT3 / 2) * R * c);
  }
  if (!Number.isFinite(x0) || !sel) return null;
  const shift = (lo: number, hi: number, freeLo: number, freeLength: number, must: [number, number]) => {
    const [a, b] = hi - lo <= freeLength - 2 * FOCUS_MARGIN ? [lo, hi] : must;
    if (a < freeLo + FOCUS_MARGIN) return freeLo + FOCUS_MARGIN - a;
    if (b > freeLo + freeLength - FOCUS_MARGIN) return freeLo + freeLength - FOCUS_MARGIN - b;
    return 0;
  };
  const sx = (u: number) => cam.ox + u * R;
  const dx = shift(sx(x0), sx(x1), free.x, free.width, [sx(sel.x - 1), sx(sel.x + 1)]);
  const dy = shift(y0, y1, free.y, free.height, [topOf(sel, 1), sy(sel.y) + R * c]);
  return { dx, dy };
}
