import type { MapLayoutMark } from "@/shared/lib/map-layout-morph-store";
import { collectCanvasObstacles, computeFreeArea, measureEdgeFitObstacle, type Rect } from "../interaction/free-area";
import {
  computeTerritoryLayout,
  type TerritoryLayout,
  type TerritoryLayoutOptions,
  type TerritoryTextRole,
} from "../model/territories-layout";
import { drawTerritories, TERRITORY_FONTS, type TerritoryInks } from "../render/territories";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import type { OntologyMapEdge, OntologyMapNode } from "../ui/OntologyMap";

const ROOM_TOP = 96;
const ROOM_BOTTOM = 64;
const LEGEND_GAP = 8;
const ROOM_RIGHT = 80;
const ROOM_LEFT_PAD = 16;

let measureContext: CanvasRenderingContext2D | null = null;
export function measureTerritoryText(text: string, role: TerritoryTextRole): number {
  if (typeof document === "undefined") return text.length * 7;
  measureContext ??= document.createElement("canvas").getContext("2d");
  if (!measureContext) return text.length * 7;
  measureContext.font = TERRITORY_FONTS[role];
  return measureContext.measureText(text).width;
}

export function readTerritoryInks(): TerritoryInks | null {
  if (typeof window === "undefined") return null;
  const style = getComputedStyle(document.documentElement);
  const read = (name: string) => style.getPropertyValue(name).trim();
  const title = read("--map-territory-title");
  const count = read("--map-territory-count");
  const stale = read("--map-territory-stale");
  const staleFill = read("--map-territory-stale-fill");
  const rimLight = read("--map-territory-rim-light");
  const rollupAlpha = Number.parseFloat(read("--map-territory-rollup-alpha"));
  const glowAlpha = Number.parseFloat(read("--map-territory-glow-alpha"));
  const arrival = read("--map-territory-arrival");
  const arrivalMs = arrival.endsWith("ms") ? Number.parseFloat(arrival) : Number.parseFloat(arrival) * 1000;
  if (!title || !count || !stale || !staleFill || !rimLight || !Number.isFinite(rollupAlpha) || !Number.isFinite(glowAlpha) || !Number.isFinite(arrivalMs)) {
    return null;
  }
  return { title, count, stale, staleFill, rimLight, rollupAlpha, glowAlpha, arrivalMs };
}

export function territoryFreeArea(canvas: HTMLCanvasElement | null, legend: Element | null = null): Rect | null {
  if (!canvas) return null;
  const r = canvas.getBoundingClientRect();
  const canvasRect = { x: r.x, y: r.y, width: r.width, height: r.height };
  const free = computeFreeArea(canvasRect, collectCanvasObstacles(canvas, canvasRect));
  let bottom = free.y + free.height;
  const legendBox = legend?.getBoundingClientRect();
  if (legendBox && legendBox.height > 0 && legendBox.top > free.y) bottom = Math.min(bottom, legendBox.top - LEGEND_GAP);
  return { x: free.x - r.x, y: free.y - r.y, width: free.width, height: bottom - free.y };
}

export function readTerritoryRoom(
  canvas: HTMLCanvasElement | null,
  width: number,
  height: number,
  legend: Element | null,
): { room: Rect; restCentreX: number } {
  const free = territoryFreeArea(canvas, legend) ?? { x: 0, y: 0, width, height };
  const x = free.x + ROOM_LEFT_PAD;
  const y = Math.max(free.y, ROOM_TOP);
  const right = Math.min(free.x + free.width, width - ROOM_RIGHT);
  const bottom = Math.min(free.y + free.height, height - ROOM_BOTTOM);
  const leftEdge = Math.max(free.x, canvas ? (measureEdgeFitObstacle(canvas, "left")?.reach ?? 0) : 0);
  const rightEdge = Math.min(free.x + free.width, width - (canvas ? (measureEdgeFitObstacle(canvas, "right")?.reach ?? 0) : 0));
  return {
    room: { x: Math.round(x), y: Math.round(y), width: Math.round(right - x), height: Math.round(bottom - y) },
    restCentreX: Math.round(((leftEdge + rightEdge) / 2) * 2) / 2,
  };
}

function territoryHub(room: Rect | null): { x: number; y: number } | null {
  return room ? { x: room.x + room.width / 2 - 10, y: room.y + room.height / 2 + 10 } : null;
}

export function layoutTerritories(
  nodes: readonly OntologyMapNode[],
  edges: readonly OntologyMapEdge[],
  room: Rect | null,
  domainStats: TerritoryLayoutOptions["domainStats"],
): TerritoryLayout {
  const hub = territoryHub(room);
  return computeTerritoryLayout(
    nodes.map((n) => ({ id: n.id, label: n.label, kind: n.kind })),
    edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind, relationType: e.relationType })),
    {
      measure: measureTerritoryText,
      domainStats,
      room: room && hub ? { x: room.x - hub.x, y: room.y - hub.y, w: room.width, h: room.height } : null,
    },
  );
}

export function territoryRestOffset(
  layout: TerritoryLayout,
  size: { w: number; h: number },
  room: Rect | null,
  restCentreX: number | null,
): { x: number; y: number } {
  const free = room ?? { x: 0, y: 0, width: size.w, height: size.h };
  const hub = territoryHub(room);
  const b = layout.bounds;
  const x = (restCentreX ?? free.x + free.width / 2) - (b.x + b.w / 2);
  return layout.fitsRoom && hub
    ? { x, y: hub.y }
    : { x, y: b.h > free.height ? free.y + 8 - b.y : free.y + free.height / 2 - (b.y + b.h / 2) };
}

export function territoryMarks(
  layout: TerritoryLayout,
  offset: { x: number; y: number },
  tokens: OntologyMapTokens,
  alphaOf: (id: string) => number,
): MapLayoutMark[] {
  const marks: MapLayoutMark[] = [];
  const p = layout.project;
  if (p) marks.push({ id: p.id, x: p.x + offset.x, y: p.y + offset.y, size: p.r, shape: "hex", fill: tokens.nodeFillProject, stroke: tokens.amberHub, alpha: alphaOf(p.id) });
  for (const d of layout.domains) {
    marks.push({ id: d.id, x: d.x + offset.x, y: d.y + offset.y, size: d.half, shape: "square", fill: tokens.nodeFillDomain, stroke: tokens.nodeStrokeDomain, alpha: alphaOf(d.id) });
  }
  for (const c of layout.capabilities) {
    marks.push({ id: c.id, x: c.x + offset.x, y: c.y + offset.y, size: c.r, shape: "disc", fill: tokens.nodeFillCapability, stroke: tokens.nodeStrokeCapability, alpha: alphaOf(c.id) });
  }
  return marks;
}

export function predictTerritoryTarget({
  nodes,
  edges,
  domainStats,
  host,
  tokens,
}: {
  nodes: readonly OntologyMapNode[];
  edges: readonly OntologyMapEdge[];
  domainStats: TerritoryLayoutOptions["domainStats"];
  host: HTMLCanvasElement;
  tokens: OntologyMapTokens;
}): { marks: MapLayoutMark[]; paint: (ctx: CanvasRenderingContext2D, width: number, height: number) => void } | null {
  const box = host.getBoundingClientRect();
  const inks = readTerritoryInks();
  if (box.width <= 0 || box.height <= 0 || !inks) return null;
  const { room, restCentreX } = readTerritoryRoom(host, box.width, box.height, null);
  const layout = layoutTerritories(nodes, edges, room, domainStats);
  const offset = territoryRestOffset(layout, { w: box.width, h: box.height }, room, restCentreX);
  const projectCount = nodes.find((n) => n.kind === "project")?.descendantCount ?? null;
  const state = {
    offsetX: offset.x,
    offsetY: offset.y,
    dpr: 1,
    arrivalT: 1,
    selectedId: null,
    hoverId: null,
    lit: null,
    dimT: 0,
    evidence: new Map(),
    staleDomains: new Set<string>(),
    elementNames: new Map<string, string>(),
    projectCount,
  };
  return {
    marks: territoryMarks(layout, offset, tokens, () => 1),
    paint: (ctx, width, height) => void drawTerritories(ctx, layout, { ...state, width, height }, tokens, inks),
  };
}
