import type { CosmosLayout } from "../layout/cosmos-layout";
import type { CosmosInks, CosmosLabel, CosmosRoom, LabelCandidate } from "../cosmos-types";
import type { CosmosBitmapCache } from "./cosmos-bitmap-cache";

export function measureLabel(ctx: CanvasRenderingContext2D, cache: CosmosBitmapCache, font: string, text: string): number {
  const key = `${font}|${text}`;
  const hit = cache.textWidth.get(key);
  if (hit !== undefined) return hit;
  ctx.font = font;
  const w = ctx.measureText(text).width;
  cache.textWidth.set(key, w);
  return w;
}

const labelCache = new WeakMap<CosmosLayout, Map<string, string>>();

export function registerCosmosLabels(layout: CosmosLayout, labels: ReadonlyMap<string, string>): void {
  labelCache.set(layout, new Map(labels));
}

export function labelOf(layout: CosmosLayout, id: string): string {
  return labelCache.get(layout)?.get(id) ?? id;
}

export function placeCosmosLabels(
  ctx: CanvasRenderingContext2D,
  candidates: LabelCandidate[],
  options: { room: CosmosRoom; cache: CosmosBitmapCache; inks: CosmosInks; metaFont: string; labelOf?: (id: string) => string },
): CosmosLabel[] {
  const { room, cache, inks, metaFont } = options;
  const placed: CosmosLabel[] = [];
  const overlaps = (x: number, y: number, w: number, h: number) =>
    placed.some((p) => x < p.x + p.width && x + w > p.x && y < p.y + p.height && y + h > p.y);
  candidates.sort((p, q) => q.priority - p.priority);
  let elementBudget = 40;
  let clusterBudget = 48;
  for (const c of candidates) {
    if (c.kind === "element" && elementBudget <= 0) continue;
    if (c.kind === "cluster" && clusterBudget <= 0) continue;
    const text = c.kind === "element" ? (options.labelOf?.(c.id) ?? c.id) : c.text;
    if (!text) continue;
    const tw = measureLabel(ctx, cache, c.font, text);
    const metaW = c.meta ? measureLabel(ctx, cache, metaFont, c.meta) + 6 : 0;
    const w = tw + metaW + 10;
    const h = c.kind === "galaxy" || c.kind === "project" ? 20 : 16;
    const x = c.align === "center" ? c.x - w / 2 : c.x;
    const y = c.y - h / 2;
    if (x < room.x - 4 || x + w > room.x + room.width + 4 || y < room.y - 4 || y + h > room.y + room.height + 24) continue;
    if (overlaps(x, y, w, h)) continue;
    placed.push({ text, kind: c.kind, id: c.id, x, y, width: w, height: h });
    if (c.kind === "element") elementBudget -= 1;
    if (c.kind === "cluster") clusterBudget -= 1;
    ctx.fillStyle = inks.bgNear;
    ctx.globalAlpha = c.kind === "count" ? 0.92 : 0.86;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 4);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.font = c.font;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = c.ink;
    ctx.fillText(text, x + 5, y + h / 2 + 0.5);
    if (c.meta) {
      ctx.font = metaFont;
      ctx.fillStyle = inks.labelMeta;
      ctx.fillText(c.meta, x + 5 + tw + 6, y + h / 2 + 0.5);
    }
  }
  return placed;
}
