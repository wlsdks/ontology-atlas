import { arrowHead, taperedCurve } from "../../render/tapered-arrow";
import { worldToScreen } from "../cosmos-camera";
import { visualRadius, type CosmosLayout } from "../layout/cosmos-layout";
import type { CosmosCamera, CosmosInks, CosmosRoom, CosmosWebItem, GalaxyPose, LabelCandidate } from "../cosmos-types";

function filamentGeometry(
  a: { x: number; y: number; radius: number },
  b: { x: number; y: number; radius: number },
  bowShare = 0.15,
): { x1: number; y1: number; cx: number; cy: number; x2: number; y2: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const x1 = a.x + ux * a.radius * 0.92;
  const y1 = a.y + uy * a.radius * 0.92;
  const x2 = b.x - ux * b.radius * 0.92;
  const y2 = b.y - uy * b.radius * 0.92;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  let px = -uy;
  let py = ux;
  if (px * mx + py * my < 0) {
    px = -px;
    py = -py;
  }
  const bow = Math.hypot(x2 - x1, y2 - y1) * bowShare;
  return { x1, y1, cx: mx + px * bow, cy: my + py * bow, x2, y2 };
}

function filamentWidth(count: number): number {
  return Math.min(2.4, 0.5 + 0.35 * Math.log2(1 + count));
}

const topCounts = new WeakMap<CosmosLayout, number>();

function topFilamentCount(layout: CosmosLayout): number {
  const hit = topCounts.get(layout);
  if (hit !== undefined) return hit;
  const ranked = layout.filaments.map((f) => f.count).sort((a, b) => b - a);
  const top = ranked[Math.min(ranked.length - 1, 4)] ?? Infinity;
  topCounts.set(layout, top);
  return top;
}

const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface CosmosWebInput {
  layout: CosmosLayout;
  poses: readonly GalaxyPose[];
  camera: CosmosCamera;
  room: CosmosRoom;
  width: number;
  height: number;
  zoomRatio: number;
  hoverGalaxy: number;
  focusGalaxy: number;
  inks: CosmosInks;
  settled: boolean;
  lensRest: number;
  metaFont: string;
}

export function drawCosmosWeb(
  ctx: CanvasRenderingContext2D,
  input: CosmosWebInput,
): { alpha: number; items: CosmosWebItem[]; candidates: LabelCandidate[] } {
  const { layout, poses, camera, room, width, height, inks, settled, metaFont, hoverGalaxy } = input;
  const items: CosmosWebItem[] = [];
  const candidates: LabelCandidate[] = [];
  const webAlpha = 1 - smoothstep(1.4, 2.2, input.zoomRatio);
  if (webAlpha <= 0.01) return { alpha: 0, items, candidates };
  ctx.globalAlpha = webAlpha;
  const topCount = topFilamentCount(layout);
  for (const f of layout.filaments) {
    const pa = poses[f.from]!;
    const pb = poses[f.to]!;
    if (Math.min(pa.presence, pb.presence) < 0.05) continue;
    const ga = layout.galaxies[f.from]!;
    const gb = layout.galaxies[f.to]!;
    const geo = filamentGeometry({ x: pa.x, y: pa.y, radius: visualRadius(ga) }, { x: pb.x, y: pb.y, radius: visualRadius(gb) }, settled ? f.bow : 0.15);
    const p1 = worldToScreen(camera, room, geo.x1, geo.y1);
    const pc = worldToScreen(camera, room, geo.cx, geo.cy);
    const p2 = worldToScreen(camera, room, geo.x2, geo.y2);
    const minX = Math.min(p1.x, pc.x, p2.x);
    const maxX = Math.max(p1.x, pc.x, p2.x);
    const minY = Math.min(p1.y, pc.y, p2.y);
    const maxY = Math.max(p1.y, pc.y, p2.y);
    if (maxX < -20 || minX > width + 20 || maxY < -20 || minY > height + 20) continue;
    const w0 = filamentWidth(f.count);
    const touches = hoverGalaxy === f.from || hoverGalaxy === f.to;
    const receded = hoverGalaxy >= 0 && !touches;
    ctx.fillStyle = touches ? inks.filamentHead : receded ? inks.filamentDim : inks.filament;
    const w1 = f.twoWay ? w0 : w0 * 0.45;
    taperedCurve(ctx, p1.x, p1.y, pc.x, pc.y, p2.x, p2.y, w0, w1);
    ctx.fillStyle = receded ? inks.filamentDim : inks.filamentHead;
    arrowHead(ctx, p2.x, p2.y, Math.atan2(p2.y - pc.y, p2.x - pc.x), Math.max(3, 2.4 * w1));
    if (f.twoWay) arrowHead(ctx, p1.x, p1.y, Math.atan2(p1.y - pc.y, p1.x - pc.x), Math.max(3, 2.4 * w0));
    const counted = (f.count >= topCount && hoverGalaxy < 0) || touches;
    items.push({ from: ga.id, to: gb.id, count: f.count, twoWay: f.twoWay, width: w0, tone: touches ? "lit" : receded ? "receded" : "rest", counted });
    if (counted) {
      const mx = 0.25 * p1.x + 0.5 * pc.x + 0.25 * p2.x;
      const my = 0.25 * p1.y + 0.5 * pc.y + 0.25 * p2.y;
      candidates.push({ text: String(f.count), kind: "count", id: `${f.from}-${f.to}`, x: mx, y: my, align: "center", font: metaFont, ink: inks.labelMeta, priority: touches ? 880 : 600 + f.count });
    }
  }
  ctx.globalAlpha = 1;
  return { alpha: webAlpha, items, candidates };
}
