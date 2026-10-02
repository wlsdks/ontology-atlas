import { worldToScreen } from "../cosmos-camera";
import type { CosmosLayout } from "../layout/cosmos-layout";
import type {
  CosmosAttention,
  CosmosCamera,
  CosmosInks,
  CosmosLabel,
  CosmosLens,
  CosmosPaintRecorder,
  CosmosRelation,
  CosmosRelationRow,
  CosmosRoom,
  CosmosTrail,
  LabelCandidate,
} from "../cosmos-types";
import type { CosmosBitmapCache } from "./cosmos-bitmap-cache";
import { measureLabel } from "./cosmos-labels";

const SELECTED_RELATION_CAP = 80;

export function lensAlpha(_lens: CosmosLens | null, _id: string, _inks: CosmosInks): number {
  return 1;
}

export function galaxyLensAlpha(_lens: CosmosLens | null, _inks: CosmosInks): number {
  return 1;
}

interface CosmosRelationsInput {
  layout: CosmosLayout;
  camera: CosmosCamera;
  room: CosmosRoom;
  width: number;
  height: number;
  attention: CosmosAttention;
  relationsOf: (id: string) => readonly CosmosRelation[];
  pointOf: (id: string) => { x: number; y: number } | null;
  lens: CosmosLens | null;
  trail: CosmosTrail | null;
  inks: CosmosInks;
  reducedMotion: boolean;
  labelOf: (id: string) => string;
  record: CosmosPaintRecorder;
  font: string;
  cache: CosmosBitmapCache;
}

export function drawCosmosRelations(
  ctx: CanvasRenderingContext2D,
  input: CosmosRelationsInput,
): { rows: CosmosRelationRow[]; candidates: LabelCandidate[]; labels: CosmosLabel[] } {
  const { layout, camera, room, attention, inks } = input;
  const labels: CosmosLabel[] = [];
  const { selectedId, hoverId } = attention;
  if (selectedId) {
    const p = layout.points.get(selectedId);
    if (p) {
      const s = worldToScreen(camera, room, p.x, p.y);
      ctx.strokeStyle = inks.select;
      ctx.lineWidth = 1.4;
      ctx.globalAlpha = 0.9;
      let drawn = 0;
      for (const r of input.relationsOf(selectedId)) {
        const q = input.pointOf(r.source === selectedId ? r.target : r.source);
        if (q) {
          const t = worldToScreen(camera, room, q.x, q.y);
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(t.x, t.y);
          ctx.stroke();
          drawn += 1;
        }
        if (drawn >= SELECTED_RELATION_CAP) break;
      }
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  if (hoverId && hoverId !== selectedId) {
    const p = layout.points.get(hoverId);
    if (p) {
      const s = worldToScreen(camera, room, p.x, p.y);
      const text = input.labelOf(hoverId);
      const tw = measureLabel(ctx, input.cache, input.font, text);
      ctx.fillStyle = inks.bgNear;
      ctx.beginPath();
      ctx.roundRect(s.x + 10, s.y - 9, tw + 10, 18, 4);
      ctx.fill();
      ctx.font = input.font;
      ctx.textBaseline = "middle";
      ctx.fillStyle = inks.labelCapability;
      ctx.fillText(text, s.x + 15, s.y + 0.5);
      ctx.strokeStyle = inks.select;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
      ctx.stroke();
      labels.push({ text, kind: "hover", id: hoverId, x: s.x + 10, y: s.y - 9, width: tw + 10, height: 18 });
    }
  }
  return { rows: [], candidates: [], labels };
}
