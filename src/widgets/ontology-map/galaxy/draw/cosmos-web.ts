import { domainFlowWidth, drawDomainFlow } from "../../aggregate/domain-flows";
import { worldToScreen } from "../cosmos-camera";
import { visualRadius, type CosmosLayout } from "../layout/cosmos-layout";
import type { CosmosCamera, CosmosInks, CosmosRoom, CosmosWebItem, GalaxyPose, LabelCandidate } from "../cosmos-types";

const WEB_WIDTH = { base: 0.5, slope: 0.35, max: 2.4 };
const COUNTED_AT_REST = 5;

function filamentGeometry(
  a: { x: number; y: number; radius: number },
  b: { x: number; y: number; radius: number },
  bowShare: number,
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

const restThresholds = new WeakMap<CosmosLayout, number>();

function restThreshold(layout: CosmosLayout): number {
  const hit = restThresholds.get(layout);
  if (hit !== undefined) return hit;
  const ranked = layout.filaments.map((f) => f.count).sort((a, b) => b - a);
  const threshold = ranked[Math.min(ranked.length, COUNTED_AT_REST) - 1] ?? Infinity;
  restThresholds.set(layout, threshold);
  return threshold;
}

function webFade(zoomRatio: number): number {
  const t = Math.min(1, Math.max(0, (zoomRatio - 1.4) / 0.8));
  return 1 - t * t * (3 - 2 * t);
}

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
  const { layout, poses, camera, room, width, height, inks, settled, metaFont, hoverGalaxy, focusGalaxy } = input;
  const items: CosmosWebItem[] = [];
  const candidates: LabelCandidate[] = [];
  const alpha = webFade(input.zoomRatio) * input.lensRest;
  if (alpha <= 0.01) return { alpha: 0, items, candidates };
  const attended = hoverGalaxy >= 0 ? hoverGalaxy : focusGalaxy;
  const threshold = restThreshold(layout);
  ctx.globalAlpha = alpha;
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
    if (Math.max(p1.x, pc.x, p2.x) < -20 || Math.min(p1.x, pc.x, p2.x) > width + 20) continue;
    if (Math.max(p1.y, pc.y, p2.y) < -20 || Math.min(p1.y, pc.y, p2.y) > height + 20) continue;
    const w = domainFlowWidth(f.count, WEB_WIDTH);
    const lit = attended >= 0 && (attended === f.from || attended === f.to);
    const receded = hoverGalaxy >= 0 && !lit;
    const tone = lit ? "lit" : receded ? "receded" : "rest";
    const fill = lit ? inks.filamentHead : receded ? inks.filamentDim : inks.filament;
    drawDomainFlow(ctx, p1, pc, p2, w, f.twoWay, fill, receded ? inks.filamentDim : inks.filamentHead);
    const counted = attended >= 0 ? lit : f.count >= threshold;
    items.push({ from: ga.id, to: gb.id, count: f.count, twoWay: f.twoWay, width: w, tone, counted });
    if (!counted) continue;
    candidates.push({
      text: String(f.count),
      kind: "count",
      id: `${f.from}-${f.to}`,
      x: 0.25 * p1.x + 0.5 * pc.x + 0.25 * p2.x,
      y: 0.25 * p1.y + 0.5 * pc.y + 0.25 * p2.y,
      align: "center",
      font: metaFont,
      ink: inks.labelMeta,
      priority: lit ? 880 : 600 + f.count,
    });
  }
  ctx.globalAlpha = 1;
  return { alpha, items, candidates };
}
