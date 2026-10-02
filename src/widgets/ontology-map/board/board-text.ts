import {
  HEX_TYPE,
  hexGutter,
  hexLineSpills,
  hexTileLines,
  middleTruncate,
  type HexBoardLayout,
  type HexMeasure,
  type HexTextLine,
  type HexTile,
} from "../model/hex-board";
import { SQRT3 } from "../model/hex-grid";
import { hexFonts, type HexDrawState, type HexTextBox } from "../render/hex-board";

type TextState = Pick<HexDrawState, "domainMeta" | "projectMeta" | "staleOnly" | "staleFiles" | "evidence" | "selectedId" | "measure">;

interface LineSets {
  R: number;
  measure: HexMeasure;
  sets: HexTextLine[][];
}

const lineCache = new WeakMap<HexBoardLayout, Map<string, LineSets>>();

function triesFor(t: HexTile, R: number, state: TextState, file: string | undefined): Parameters<typeof hexTileLines>[3][] {
  if (t.kind === "domain") {
    const meta = state.domainMeta.get(t.id);
    return [{ meta: meta?.meta, stale: meta?.stale ?? undefined }, { meta: meta?.meta }, {}];
  }
  if (t.kind === "project") return [{ meta: state.projectMeta ?? undefined }, {}];
  const strong = state.selectedId === t.id;
  if (!file) return [{ strong }, {}];
  const avail = 2 * (R - hexGutter(R) - 22 / SQRT3) - 12;
  const staleFile = middleTruncate(file, avail, (text) => state.measure(text, "mono"));
  return [{ staleFile, strong }, { staleFile, strong: false }, { strong }, {}];
}

export function lineSets(layout: HexBoardLayout, t: HexTile, R: number, state: TextState): HexTextLine[][] {
  let byTile = lineCache.get(layout);
  if (!byTile) lineCache.set(layout, (byTile = new Map()));
  const file = t.kind === "capability" && state.staleOnly && state.evidence.get(t.id) === "stale" ? state.staleFiles.get(t.id) : undefined;
  const meta = t.kind === "domain" ? state.domainMeta.get(t.id) : null;
  const key = `${t.id}|${state.selectedId === t.id ? 1 : 0}|${file ?? ""}|${meta ? `${meta.meta}|${meta.stale}` : t.kind === "project" ? state.projectMeta : ""}`;
  const hit = byTile.get(key);
  if (hit && hit.R === R && hit.measure === state.measure) return hit.sets;
  const sets: HexTextLine[][] = [];
  for (const extras of triesFor(t, R, state, file)) {
    const lines = hexTileLines(t, R, state.measure, extras);
    if (hexLineSpills(lines, R, state.measure).length === 0) sets.push(lines);
  }
  byTile.set(key, { R, measure: state.measure, sets });
  return sets;
}

function extent(lines: readonly HexTextLine[]): { top: number; bottom: number } {
  let top = Infinity;
  let bottom = -Infinity;
  for (const line of lines) {
    const size = HEX_TYPE[line.role === "capabilityStrong" ? "capability" : line.role];
    top = Math.min(top, line.dy - size * 0.85);
    bottom = Math.max(bottom, line.dy + size * 0.22);
  }
  return { top, bottom };
}

export function placeLines(sets: readonly HexTextLine[][], room: number): HexTextLine[] | null {
  for (const set of sets) {
    const e = extent(set);
    if (e.bottom <= room && e.top >= -room) return set;
  }
  return null;
}

export function placeLinesWithNumber(
  sets: readonly HexTextLine[][],
  room: number,
  withNumber: boolean,
): { lines: HexTextLine[] | null; numberAt: number | null } {
  if (withNumber) {
    for (const set of sets) {
      const e = extent(set);
      if (e.bottom > room || e.top < -room) continue;
      if (e.top - 12.5 >= -room) return { lines: set, numberAt: e.top - 3 };
      if (e.bottom + 13.5 <= room) return { lines: set, numberAt: e.bottom + 11 };
    }
  }
  return { lines: placeLines(sets, room), numberAt: null };
}

export function drawNumber(ctx: CanvasRenderingContext2D, count: number, x: number, y: number, ink: string) {
  ctx.font = hexFonts().plateMeta;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = ink;
  ctx.fillText(String(count), x, y);
}

export function drawLines(
  ctx: CanvasRenderingContext2D,
  id: string,
  lines: readonly HexTextLine[],
  x: number,
  y: number,
  inkOf: (line: HexTextLine) => string,
  measure: HexMeasure,
): HexTextBox {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const line of lines) {
    ctx.font = hexFonts()[line.role];
    ctx.fillStyle = inkOf(line);
    ctx.fillText(line.text, x, y + line.dy);
    const w = measure(line.text, line.role);
    const size = HEX_TYPE[line.role === "capabilityStrong" ? "capability" : line.role];
    x0 = Math.min(x0, x - w / 2);
    x1 = Math.max(x1, x + w / 2);
    y0 = Math.min(y0, y + line.dy - size * 0.85);
    y1 = Math.max(y1, y + line.dy + size * 0.22);
  }
  return { id, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
