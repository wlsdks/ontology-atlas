import type { Box } from "../../dial/types";
import type { GraphLine } from "../attention";
import { arcPathInto, emptyArcPath, litLineTrimsInto } from "../marks";
import type { FlatGraphLayout, FlatGraphPaintTokens } from "../types";
import type { PlacedName } from "./placed-name";

/** Segments per lit line: the frame's bow strays under a pixel from a twelve-chord polyline at any lit length on screen. */
export const LINE_SAMPLES = 12;

const linePath = emptyArcPath();
const lineTrims = new Float64Array(2);

/** The focus's lines as world polylines of the curves the frame draws at `scale`, trimmed alike. */
export function linePolylines(
  lines: readonly GraphLine[], layout: FlatGraphLayout, tokens: FlatGraphPaintTokens, scale: number, growth: number, discRadius: (id: string) => number,
): Float64Array[] {
  const out: Float64Array[] = [];
  for (const line of lines) {
    const from = layout.positions.get(line.from) ?? layout.itemAt.get(line.from);
    const to = layout.positions.get(line.to) ?? layout.itemAt.get(line.to);
    if (!from || !to) continue;
    litLineTrimsInto(lineTrims, layout, line, Math.hypot(to.x - from.x, to.y - from.y) * scale, scale, growth, discRadius(line.from), discRadius(line.to), tokens);
    if (!arcPathInto(linePath, from, to, tokens.lineBow, lineTrims[0]! / scale, lineTrims[1]! / scale)) continue;
    const { a, c, b } = linePath;
    const pts = new Float64Array((LINE_SAMPLES + 1) * 2);
    for (let k = 0; k <= LINE_SAMPLES; k += 1) {
      const t = k / LINE_SAMPLES;
      const u = 1 - t;
      pts[k * 2] = u * u * a.x + 2 * u * t * c.x + t * t * b.x;
      pts[k * 2 + 1] = u * u * a.y + 2 * u * t * c.y + t * t * b.y;
    }
    out.push(pts);
  }
  return out;
}

/** A leader's hairline in screen pixels about its mark's centre: from the mark's rim to one pad short of the text. */
export function leaderSegment(n: PlacedName, markRadius: number, padPx: number): { x0: number; y0: number; x1: number; y1: number } {
  const reach = Math.hypot(n.dx, n.dy);
  return { x0: (n.dx / reach) * markRadius, y0: (n.dy / reach) * markRadius, x1: n.dx - Math.sign(n.dx) * padPx, y1: n.dy };
}

/** Liang–Barsky: whether the segment from (x0, y0) to (x1, y1) enters `b`. */
export function segmentCrossesBox(x0: number, y0: number, x1: number, y1: number, b: Box): boolean {
  let enter = 0;
  let leave = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const edges: [number, number][] = [[-dx, x0 - b.minX], [dx, b.maxX - x0], [-dy, y0 - b.minY], [dy, b.maxY - y0]];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) enter = Math.max(enter, r);
    else leave = Math.min(leave, r);
    if (enter > leave) return false;
  }
  return true;
}

/** Whether any lit line runs through `b`: O(lines × LINE_SAMPLES). */
export function linesCross(polylines: readonly Float64Array[], b: Box): boolean {
  for (const pts of polylines) {
    for (let k = 0; k < LINE_SAMPLES; k += 1) {
      if (segmentCrossesBox(pts[k * 2]!, pts[k * 2 + 1]!, pts[k * 2 + 2]!, pts[k * 2 + 3]!, b)) return true;
    }
  }
  return false;
}
