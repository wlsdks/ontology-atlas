import type { Rect } from "../../interaction/free-area";
import type { HexCamera as Camera } from "../../morph/hex-marks";
import type { HexTextBox } from "../../render/hex-board";
import type { HexBoardLayout } from "./hex-board";
import { SQRT3 } from "./hex-grid";

/** Slack (unit space) around a hexagon's inscribed radius when a point is tested against it. */
const HIT_SLACK = 0.02;
/** The hover tooltip stands this far (CSS px) from the tile it names. */
const TIP_GAP = 8;
/** ...and this far inside the free map's edges. */
const TIP_EDGE = 8;

export interface TipSpot {
  x: number;
  y: number;
  d: number;
}

/**
 * The tile whose hexagon contains the screen point, on the flat (untilted) board: the nearest
 * occupied cell among the nine around the point's axial cell. O(1) per call.
 */
export function pickFlatTile(layout: HexBoardLayout, cam: Camera, px: number, py: number): string | null {
  const ux = (px - cam.ox) / cam.R;
  const uy = (py - cam.oy) / cam.R;
  const q = ux / 1.5;
  const r = uy / SQRT3 - q / 2;
  const rq = Math.round(q);
  const rr = Math.round(r);
  let best: string | null = null;
  let bestD = Infinity;
  for (let dq = -1; dq <= 1; dq += 1)
    for (let dr = -1; dr <= 1; dr += 1) {
      const id = layout.occupied.get(`${rq + dq},${rr + dr}`);
      if (!id) continue;
      const t = layout.byId.get(id)!;
      const d = Math.hypot(t.x - ux, t.y - uy);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
  return bestD <= SQRT3 / 2 + HIT_SLACK ? best : null;
}

/**
 * Where the hover tooltip (`W` by `H`) goes for the tile drawn at (`x`, `y`) with cell size `R`
 * under tilt cosine `c`: beside the tile first (right, left, below, above), then the same sides
 * swept outward in 6 px steps. The nearest spot inside the free map that covers no drawn name wins,
 * then the nearest inside it, then the nearest at all. Never over the hovered tile itself.
 * O(candidates x names) per call, run per frame while a tile is hovered.
 */
export function placeHexTooltip(x: number, y: number, R: number, c: number, W: number, H: number, free: Rect, boxes: readonly HexTextBox[]): TipSpot {
  const cands: TipSpot[] = [];
  const apo = (R * SQRT3 * c) / 2;
  for (let dy = -2 * R; dy <= 2 * R; dy += 6) {
    cands.push({ x: x + R + TIP_GAP, y: y - H / 2 + dy, d: Math.abs(dy) });
    cands.push({ x: x - R - TIP_GAP - W, y: y - H / 2 + dy, d: Math.abs(dy) + 1 });
  }
  for (let dx = -W; dx <= 0; dx += 12) {
    for (let dy = 0; dy <= 2 * R; dy += 6) {
      cands.push({ x: x + dx, y: y + apo + TIP_GAP + dy, d: 2 + dy + Math.abs(dx + W / 2) * 0.25 });
      cands.push({ x: x + dx, y: y - apo - TIP_GAP - H - dy, d: 3 + dy + Math.abs(dx + W / 2) * 0.25 });
    }
  }
  cands.sort((a, b) => a.d - b.d);
  const inside = (c: { x: number; y: number }) =>
    c.x >= free.x + TIP_EDGE && c.y >= free.y + TIP_EDGE && c.x + W <= free.x + free.width - TIP_EDGE && c.y + H <= free.y + free.height - TIP_EDGE;
  const clear = (c: { x: number; y: number }) => !boxes.some((b) => b.x < c.x + W && c.x < b.x + b.w && b.y < c.y + H && c.y < b.y + b.h);
  const offTile = (c: { x: number; y: number }) => !(c.x < x + R && x - R < c.x + W && c.y < y + apo && y - apo < c.y + H);
  return cands.find((c) => inside(c) && clear(c) && offTile(c)) ?? cands.find((c) => inside(c) && offTile(c)) ?? cands[0]!;
}
