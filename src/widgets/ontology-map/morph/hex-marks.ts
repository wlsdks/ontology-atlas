import type { MapLayoutMark } from "@/shared/lib/map-layout-morph-store";
import { collectCanvasObstacles, computeFreeArea, type Rect } from "../interaction/free-area";
import {
  computeHexBoard,
  hexBandFor,
  HEX_BAND_NAMES,
  fitHexRadius,
  hexGutter,
  type HexBoardLayout,
  type HexPlacementRecord,
  type HexTile,
} from "../model/hex-board";
import { buildBoardScene, isSlabBand, reliefLiftPx } from "../board/board-scene";
import { declaredDependents } from "../board/relief-metric";
import { projectReliefPoint, RELIEF_PITCH_REST, type ReliefView } from "../board/relief-projection";
import type { HexBoardTokens } from "../tokens/read-hex-board-tokens";
import type { OntologyMapEdge, OntologyMapNode } from "../ui/OntologyMap";

const ROOM_TOP = 96;
const ROOM_UNDER_TOOLBAR = 24;
const ROOM_BOTTOM = 96;
const ROOM_RIGHT = 72;
const ROOM_LEFT_PAD = 16;
const TOP_LANE_REACH = 48;
const EDGE_REACH = 8;

export interface HexCamera {
  R: number;
  ox: number;
  oy: number;
}

export interface MapChrome {
  free: Rect;
  blocks: Rect[];
}

export function hexMapChrome(canvas: HTMLCanvasElement | null): MapChrome | null {
  if (!canvas) return null;
  const r = canvas.getBoundingClientRect();
  const canvasRect = { x: r.x, y: r.y, width: r.width, height: r.height };
  const free = computeFreeArea(canvasRect, collectCanvasObstacles(canvas, canvasRect));
  const small = collectCanvasObstacles(canvas, canvasRect, { minSide: 12 });
  const lane = small.filter(
    (b) => b.cameraObstacle !== "side-panel" && b.height < canvasRect.height * 0.6 && b.width < canvasRect.width * 0.6,
  );
  let left = free.x;
  let top = free.y;
  const right = free.x + free.width;
  const bottom = free.y + free.height;
  const floor = Math.min(bottom, r.y + r.height - ROOM_BOTTOM);
  for (const b of lane) {
    if (b.y <= canvasRect.y + TOP_LANE_REACH) top = Math.max(top, b.y + b.height);
  }
  for (const b of lane) {
    if (b.y + b.height <= top || b.y >= floor) continue;
    if (b.x <= left + EDGE_REACH && b.x + b.width > left) left = Math.max(left, b.x + b.width);
  }
  const rel = (b: Rect): Rect => ({ x: b.x - r.x, y: b.y - r.y, width: b.width, height: b.height });
  const out =
    right - left > 80 && bottom - top > 80 ? { x: left, y: top, width: right - left, height: bottom - top } : free;
  return { free: rel(out), blocks: small.map(rel) };
}

export function hexFreeArea(canvas: HTMLCanvasElement | null): Rect | null {
  return hexMapChrome(canvas)?.free ?? null;
}

const ROOM_REST_SLACK = 12;

export function roomMovesRest(prev: Rect | null, next: Rect): boolean {
  if (!prev) return true;
  return (
    Math.abs(prev.x - next.x) > ROOM_REST_SLACK ||
    Math.abs(prev.y - next.y) > ROOM_REST_SLACK ||
    Math.abs(prev.x + prev.width - (next.x + next.width)) > ROOM_REST_SLACK ||
    Math.abs(prev.y + prev.height - (next.y + next.height)) > ROOM_REST_SLACK
  );
}

export function readHexRoom(canvas: HTMLCanvasElement | null, width: number, height: number, measured: Rect | null = hexFreeArea(canvas)): Rect {
  const free = measured ?? { x: 0, y: 0, width, height };
  const x = free.x + ROOM_LEFT_PAD;
  const y = Math.max(free.y + ROOM_UNDER_TOOLBAR, ROOM_TOP);
  const right = Math.min(free.x + free.width, width - ROOM_RIGHT);
  // Reserve the footer and the same clearance used below the toolbar before it mounts.
  const bottom = Math.min(free.y + free.height, height - ROOM_BOTTOM - ROOM_UNDER_TOOLBAR);
  return { x: Math.round(x), y: Math.round(y), width: Math.max(80, Math.round(right - x)), height: Math.max(80, Math.round(bottom - y)) };
}

export function hexRestCamera(layout: HexBoardLayout, room: Rect): HexCamera {
  const b = layout.bounds;
  const R = fitHexRadius(b, { width: room.width, height: room.height });
  return {
    R,
    ox: room.x + room.width / 2 - ((b.minX + b.maxX) / 2) * R,
    oy: room.y + room.height / 2 - ((b.minY + b.maxY) / 2) * R,
  };
}

function hexFace(tile: HexTile, T: HexBoardTokens): { fill: string; stroke: string } {
  if (tile.kind === "project") return { fill: T.faceProject[0], stroke: T.hub };
  if (tile.kind === "domain") return { fill: T.faceDomain[0], stroke: T.rimDomain };
  return { fill: T.face[Math.min(4, tile.bucket)] ?? T.face[0]!, stroke: T.rim };
}

export interface HexMarkRelief extends ReliefView {
  heightOf: (tile: HexTile) => number;
}

export function hexMarks(
  layout: HexBoardLayout,
  cam: HexCamera,
  T: HexBoardTokens,
  alphaOf: (id: string) => number,
  relief?: HexMarkRelief,
): MapLayoutMark[] {
  const size = cam.R - hexGutter(cam.R);
  return layout.tiles.map((tile) => ({
    id: tile.id,
    x: cam.ox + tile.x * cam.R,
    y: relief ? projectReliefPoint(0, cam.oy + tile.y * cam.R, relief.heightOf(tile), relief).y : cam.oy + tile.y * cam.R,
    size,
    shape: "hex" as const,
    ...hexFace(tile, T),
    alpha: alphaOf(tile.id),
  }));
}

export function predictHexMarks({
  nodes,
  edges,
  prior,
  host,
  tokens,
  relief = false,
}: {
  nodes: readonly OntologyMapNode[];
  edges: readonly OntologyMapEdge[];
  prior: HexPlacementRecord | null;
  host: HTMLCanvasElement;
  tokens: HexBoardTokens;
  relief?: boolean;
}): MapLayoutMark[] | null {
  const box = host.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return null;
  const room = readHexRoom(host, box.width, box.height);
  const treeNodes = nodes.map((n) => ({ id: n.id, label: n.label, kind: n.kind }));
  const treeEdges = edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind, relationType: e.relationType }));
  const layout = computeHexBoard(treeNodes, treeEdges, { prior, aspect: room.width / Math.max(1, room.height) });
  const cam = hexRestCamera(layout, room);
  if (!relief) return hexMarks(layout, cam, tokens, () => 1);
  const scene = buildBoardScene(layout, declaredDependents(treeNodes, treeEdges));
  const slabs = isSlabBand(hexBandFor(cam.R, HEX_BAND_NAMES), cam.R);
  const heightOf = (tile: HexTile) => reliefLiftPx(scene, layout, tile, cam.R, slabs);
  return hexMarks(layout, cam, tokens, () => 1, { pitch: RELIEF_PITCH_REST, pivotY: room.y + room.height / 2, heightOf });
}
