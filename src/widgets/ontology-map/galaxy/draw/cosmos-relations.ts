import { revealEnd } from "../../expressive/edge-reveal";
import { easeOutCubic } from "../../model/camera-easing";
import { arrowHead } from "../../render/tapered-arrow";
import { worldToScreen } from "../cosmos-camera";
import { MIN_STAR_SPACING, STAR_KIND_CAPABILITY, STAR_KIND_ELEMENT, STAR_KIND_NUCLEUS, STAR_KIND_PROJECT, type CosmosLayout } from "../layout/cosmos-layout";
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
import { starSprite } from "./cosmos-paint";

const SELECTED_RELATION_CAP = 80;
const HOVERED_RELATION_CAP = 24;
const MEMBER_RELATION_CAP = 200;
export const RELATION_REVEAL_MS = 420;
const MEMBER_LABEL_PRIORITY = 950;

function lensRestAlpha(lens: CosmosLens, inks: CosmosInks): number {
  return lens.kind === "path" ? inks.pathRestAlpha : inks.spotlightRestAlpha;
}

export function lensAlpha(lens: CosmosLens | null, id: string, inks: CosmosInks): number {
  if (!lens) return 1;
  return lens.memberIds.has(id) ? 1 : lensRestAlpha(lens, inks);
}

export function galaxyLensAlpha(lens: CosmosLens | null, inks: CosmosInks): number {
  return lens ? lensRestAlpha(lens, inks) : 1;
}

function revealProgress(revealMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  return easeOutCubic(Math.min(1, Math.max(0, revealMs / RELATION_REVEAL_MS)));
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

interface PlannedRow {
  relation: CosmosRelation;
  role: CosmosRelationRow["role"];
  attended: string | null;
  progress: number;
}

function attendedRelations(relationsOf: CosmosRelationsInput["relationsOf"], id: string, cap: number): CosmosRelation[] {
  const other = (r: CosmosRelation) => (r.source === id ? r.target : r.source);
  return [...relationsOf(id)]
    .sort((a, b) => Number(b.directional) - Number(a.directional) || (other(a) < other(b) ? -1 : other(a) > other(b) ? 1 : 0))
    .slice(0, cap);
}

function lensRelations(relationsOf: CosmosRelationsInput["relationsOf"], lens: CosmosLens): CosmosRelation[] {
  const seen = new Set<string>();
  const out: CosmosRelation[] = [];
  const ids = [...lens.memberIds].sort();
  for (const id of ids) {
    for (const r of relationsOf(id)) {
      if (seen.has(r.id)) continue;
      const keep = lens.kind === "path" ? lens.edgeIds?.has(r.id) === true : lens.memberIds.has(r.source) && lens.memberIds.has(r.target);
      if (!keep) continue;
      seen.add(r.id);
      out.push(r);
      if (lens.kind !== "path" && out.length >= MEMBER_RELATION_CAP) return out;
    }
  }
  return out;
}

function planCosmosRelations(input: Pick<CosmosRelationsInput, "attention" | "relationsOf" | "lens" | "trail" | "reducedMotion">): PlannedRow[] {
  const { attention, lens } = input;
  const progress = revealProgress(attention.revealMs, input.reducedMotion);
  const rows: PlannedRow[] = [];
  const attended = attention.selectedId ?? attention.hoverId;
  if (attended) {
    const selected = attention.selectedId !== null;
    const role = selected ? "selected" : "hovered";
    for (const relation of attendedRelations(input.relationsOf, attended, selected ? SELECTED_RELATION_CAP : HOVERED_RELATION_CAP)) {
      rows.push({ relation, role, attended, progress });
    }
  }
  if (lens) {
    const role = lens.kind === "path" ? "path" : "member";
    const drawn = new Set(rows.map((r) => r.relation.id));
    for (const relation of lensRelations(input.relationsOf, lens)) {
      if (!drawn.has(relation.id)) rows.push({ relation, role, attended: null, progress: 1 });
    }
  }
  return rows;
}

const starIndexCache = new WeakMap<CosmosLayout, Map<string, number>>();

function starIndexOf(layout: CosmosLayout, id: string): number {
  let index = starIndexCache.get(layout);
  if (!index) {
    index = new Map();
    for (const g of layout.galaxies) g.starIds.forEach((s, i) => index!.set(s, i));
    layout.core.starIds.forEach((s, i) => index!.set(s, i));
    starIndexCache.set(layout, index);
  }
  return index.get(id) ?? -1;
}

function starOf(layout: CosmosLayout, id: string): { kind: number; magnitude: number } {
  const gi = layout.galaxyOf.get(id);
  const si = starIndexOf(layout, id);
  if (gi === undefined || si < 0) return { kind: STAR_KIND_CAPABILITY, magnitude: 0 };
  const source = gi < 0 ? layout.core : layout.galaxies[gi]!;
  return { kind: source.starKind[si] ?? STAR_KIND_CAPABILITY, magnitude: source.starMagnitude[si] ?? 0 };
}

function inkOf(kind: number, inks: CosmosInks): string {
  if (kind === STAR_KIND_PROJECT) return inks.project;
  if (kind === STAR_KIND_NUCLEUS) return inks.domain;
  return kind === STAR_KIND_ELEMENT ? inks.element : inks.capability;
}

function litIds(lens: CosmosLens | null, trail: CosmosTrail | null): string[] {
  const out = new Set<string>();
  if (lens) for (const id of lens.memberIds) out.add(id);
  if (trail) for (const id of trail.visitedIds) out.add(id);
  return [...out];
}

function drawMembers(ctx: CanvasRenderingContext2D, input: CosmosRelationsInput, candidates: LabelCandidate[]): number {
  const { layout, camera, room, width, height, inks } = input;
  const spacingPx = MIN_STAR_SPACING * camera.scale;
  let lit = 0;
  ctx.globalAlpha = 1;
  for (const id of litIds(input.lens, input.trail)) {
    const w = input.pointOf(id);
    if (!w) continue;
    lit += 1;
    const p = worldToScreen(camera, room, w.x, w.y);
    if (p.x < -12 || p.x > width + 12 || p.y < -12 || p.y > height + 12) continue;
    const { kind, magnitude } = starOf(layout, id);
    const base = kind === STAR_KIND_NUCLEUS || kind === STAR_KIND_PROJECT ? 16 : kind === STAR_KIND_CAPABILITY ? 7.5 : 4.2;
    const r = Math.min(base + 3 * magnitude, Math.max(2.2, spacingPx * (kind === STAR_KIND_ELEMENT ? 0.8 : 1.4)));
    const sprite = starSprite(inkOf(kind, inks));
    if (sprite) ctx.drawImage(sprite, p.x - r, p.y - r, r * 2, r * 2);
    input.record?.(id, p.x, p.y, r);
    candidates.push({ text: input.labelOf(id), kind: "member", id, x: p.x + r * 0.6 + 4, y: p.y, align: "left", font: input.font, ink: inks.labelCapability, priority: MEMBER_LABEL_PRIORITY });
  }
  return lit;
}

function drawRow(ctx: CanvasRenderingContext2D, input: CosmosRelationsInput, row: PlannedRow): boolean {
  const { relation } = row;
  const a = input.pointOf(relation.source);
  const b = input.pointOf(relation.target);
  if (!a || !b) return false;
  const sa = worldToScreen(input.camera, input.room, a.x, a.y);
  const sb = worldToScreen(input.camera, input.room, b.x, b.y);
  const fromSource = revealEnd(relation.directional, relation.source, row.attended) === "a";
  const [start, end] = fromSource ? [sa, sb] : [sb, sa];
  const k = row.progress;
  const tip = { x: start.x + (end.x - start.x) * k, y: start.y + (end.y - start.y) * k };
  const ink = row.role === "hovered" ? input.inks.filamentHead : input.inks.select;
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 1.4;
  ctx.setLineDash(relation.directional ? [] : [4, 3]);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();
  ctx.setLineDash([]);
  if (relation.directional && k >= 1) arrowHead(ctx, sb.x, sb.y, Math.atan2(sb.y - sa.y, sb.x - sa.x), 7);
  return true;
}

function drawRing(ctx: CanvasRenderingContext2D, input: CosmosRelationsInput, id: string, radius: number, width: number): { x: number; y: number } | null {
  const w = input.pointOf(id);
  if (!w) return null;
  const s = worldToScreen(input.camera, input.room, w.x, w.y);
  ctx.strokeStyle = input.inks.select;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  return s;
}

export function drawCosmosHover(ctx: CanvasRenderingContext2D, input: CosmosRelationsInput): CosmosLabel[] {
  const { hoverId, selectedId } = input.attention;
  if (!hoverId || hoverId === selectedId) return [];
  const s = drawRing(ctx, input, hoverId, 7, 1.5);
  if (!s) return [];
  const text = input.labelOf(hoverId);
  const tw = measureLabel(ctx, input.cache, input.font, text);
  ctx.fillStyle = input.inks.bgNear;
  ctx.beginPath();
  ctx.roundRect(s.x + 10, s.y - 9, tw + 10, 18, 4);
  ctx.fill();
  ctx.font = input.font;
  ctx.textBaseline = "middle";
  ctx.fillStyle = input.inks.labelCapability;
  ctx.fillText(text, s.x + 15, s.y + 0.5);
  return [{ text, kind: "hover", id: hoverId, x: s.x + 10, y: s.y - 9, width: tw + 10, height: 18 }];
}

export function drawCosmosRelations(
  ctx: CanvasRenderingContext2D,
  input: CosmosRelationsInput & { hover?: boolean },
): { rows: CosmosRelationRow[]; candidates: LabelCandidate[]; labels: CosmosLabel[]; lens: { kind: string | null; lit: number; restAlpha: number } } {
  const { attention, inks } = input;
  const candidates: LabelCandidate[] = [];
  const rows: CosmosRelationRow[] = [];
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  for (const row of planCosmosRelations(input)) {
    if (!drawRow(ctx, input, row)) continue;
    rows.push({ source: row.relation.source, target: row.relation.target, dashed: !row.relation.directional, progress: row.progress, role: row.role });
  }
  const lit = drawMembers(ctx, input, candidates);
  if (attention.selectedId) drawRing(ctx, input, attention.selectedId, 9, 2);
  const labels = input.hover === false ? [] : drawCosmosHover(ctx, input);
  const kind = input.lens?.kind ?? (input.trail ? "trail" : null);
  return { rows, candidates, labels, lens: { kind, lit, restAlpha: galaxyLensAlpha(input.lens, inks) } };
}
