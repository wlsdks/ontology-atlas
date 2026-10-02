import type { HexBoardLayout, HexTile } from "../model/hex-board";
import { hexKey, HEX_NEIGHBORS, SQRT3 } from "../model/hex-grid";
import type { ReliefMetric } from "./relief-metric";
import { reliefHeightPx, reliefRiseDelayMs } from "./relief-projection";

interface RegionShape {
  domainId: string;
  cells: { x: number; y: number }[];
  rim: { x: number; y: number; side: number }[];
  tiles: HexTile[];
  cx: number;
  cy: number;
  minY: number;
  maxY: number;
}

export interface BoardScene {
  order: HexTile[];
  orderY: Float64Array;
  heightShare: Map<string, number>;
  maxHeightShare: number;
  regionShare: Map<string, number>;
  regions: RegionShape[];
  metric: ReliefMetric | null;
  riseDelay: Map<string, number>;
}

export function buildBoardScene(layout: HexBoardLayout, metric: ReliefMetric | null): BoardScene {
  const order = [...layout.tiles].sort((a, b) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const orderY = Float64Array.from(order, (t) => t.y);
  const heightShare = new Map<string, number>();
  let maxHeightShare = 0;
  for (const t of layout.tiles) {
    const share = !metric ? 0 : t.kind === "capability" ? reliefHeightPx(metric.capability.get(t.id) ?? 0, metric.capabilityMax, 1) : reliefHeightPx(0, 0, 1);
    heightShare.set(t.id, share);
    maxHeightShare = Math.max(maxHeightShare, share);
  }
  const regionShare = new Map<string, number>();
  for (const region of layout.regions) regionShare.set(region.domainId, metric ? reliefHeightPx(metric.region.get(region.domainId) ?? 0, metric.regionMax, 1) : 0);
  const rings = layout.capabilities.map((t) => t.ring);
  const ringMin = rings.length ? Math.min(...rings) : 0;
  const ringMax = rings.length ? Math.max(...rings) : 0;
  const riseDelay = new Map<string, number>();
  for (const t of layout.tiles) riseDelay.set(t.id, reliefRiseDelayMs(t.kind, t.ring, ringMin, ringMax));
  const regionOf = new Map<string, string>();
  for (const region of layout.regions) for (const [q, r] of region.cells) regionOf.set(hexKey(q, r), region.domainId);
  const tilesOf = new Map<string, HexTile[]>();
  for (const t of layout.tiles) {
    if (!t.domainId) continue;
    const list = tilesOf.get(t.domainId);
    if (list) list.push(t);
    else tilesOf.set(t.domainId, [t]);
  }
  const regions: RegionShape[] = layout.regions.map((region) => {
    const cells = region.cells.map(([q, r]) => ({ x: 1.5 * q, y: SQRT3 * (r + q / 2) }));
    const rim: RegionShape["rim"] = [];
    region.cells.forEach(([q, r], i) => {
      HEX_NEIGHBORS.forEach(([dq, dr], side) => {
        if (regionOf.get(hexKey(q + dq, r + dr)) !== region.domainId) rim.push({ x: cells[i]!.x, y: cells[i]!.y, side });
      });
    });
    const n = Math.max(1, cells.length);
    return {
      domainId: region.domainId,
      cells,
      rim,
      tiles: tilesOf.get(region.domainId) ?? [],
      cx: cells.reduce((sum, c) => sum + c.x, 0) / n,
      cy: cells.reduce((sum, c) => sum + c.y, 0) / n,
      minY: Math.min(...cells.map((c) => c.y)),
      maxY: Math.max(...cells.map((c) => c.y)),
    };
  });
  regions.sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  return { order, orderY, heightShare, maxHeightShare, regionShare, regions, metric, riseDelay };
}

export function lowerBound(sorted: Float64Array, value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export const BOARD_ARRIVAL = { tileMs: 220, ringStaggerMs: 28, routesMs: 160 } as const;

function easeArrive(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 18; i += 1) {
    const m = (lo + hi) / 2;
    const x = 3 * (1 - m) * (1 - m) * m * 0.2 + 3 * (1 - m) * m * m * 0.2 + m * m * m;
    if (x < t) lo = m;
    else hi = m;
  }
  const s = (lo + hi) / 2;
  return 3 * (1 - s) * (1 - s) * s * 0.7 + 3 * (1 - s) * s * s + s * s * s;
}

export function arrivalOf(ring: number, ms: number | null, reduced: boolean): { a: number; dy: number; s: number } {
  if (ms == null || reduced) return { a: 1, dy: 0, s: 1 };
  const e = easeArrive((ms - ring * BOARD_ARRIVAL.ringStaggerMs) / BOARD_ARRIVAL.tileMs);
  return { a: e, dy: 8 * (1 - e), s: 0.94 + 0.06 * e };
}
