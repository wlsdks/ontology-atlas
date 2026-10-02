import type { HexTile } from "../model/hex-board";
import { hexFonts, type HexDrawState } from "../render/hex-board";
import type { HexBoardTokens } from "../tokens/read-hex-board-tokens";
import { face, FRONT_SIDES, prismPolygons, wall, type PaintedFace } from "./board-geometry";
import type { TileRects } from "./board-plates";
import type { BoardScene } from "./board-scene";
import { hatch, tileMaterial } from "./board-tones";

interface FloorsFrame {
  pivot: number;
  lift: (t: HexTile) => number;
  alphaOf: (t: HexTile) => number;
  isDimmed: (id: string) => boolean;
  usedBy: ReadonlySet<string>;
  c: number;
  RI: number;
  FAPO: number;
  light: number;
  rimLit: string;
  staleRim: string;
  counts: ReadonlyMap<string, number> | null;
  numberAlpha: number;
  record: PaintedFace[] | null | undefined;
}

interface Layer {
  op: "fill" | "stroke" | "glow";
  alpha: number;
  color: string;
  hatched: boolean;
  width: number;
  dash: boolean;
  path: Path2D;
}

interface RowCache {
  key: string;
  rows: Map<number, { key: string; layers: Layer[] }>;
}

const rowStarts = new WeakMap<BoardScene, number[]>();
const cache = new WeakMap<BoardScene, RowCache>();
const NUMERALS = Array.from({ length: 1000 }, (_, i) => String(i));

function startsOf(scene: BoardScene): number[] {
  let starts = rowStarts.get(scene);
  if (!starts) {
    starts = [];
    for (let i = 0; i < scene.orderY.length; i += 1) if (i === 0 || scene.orderY[i] !== scene.orderY[i - 1]) starts.push(i);
    starts.push(scene.orderY.length);
    rowStarts.set(scene, starts);
  }
  return starts;
}

function buildRow(tiles: readonly HexTile[], state: HexDrawState, T: HexBoardTokens, f: FloorsFrame): Layer[] {
  const { c, RI, light } = f;
  const R = state.R;
  const phases = [new Map<string, Layer>(), new Map<string, Layer>(), new Map<string, Layer>(), new Map<string, Layer>(), new Map<string, Layer>()];
  const at = (phase: number, op: Layer["op"], alpha: number, color: string, width = 0, dash = false, hatched = false) => {
    const k = `${op}|${alpha}|${color}|${width}|${dash}|${hatched}`;
    let l = phases[phase]!.get(k);
    if (!l) phases[phase]!.set(k, (l = { op, alpha, color, hatched, width, dash, path: new Path2D() }));
    return l.path as unknown as CanvasRenderingContext2D;
  };
  for (const t of tiles) {
    const ev = t.kind === "capability" ? (state.evidence.get(t.id) ?? "unknown") : "current";
    const isSel = t.id === state.selectedId;
    const isHov = t.id === state.hoverId || t.id === state.focusId;
    const alpha = f.alphaOf(t);
    const m = tileMaterial(T, t.kind, t.bucket, ev, isSel, isHov, light);
    const h = f.lift(t);
    const x = t.x * R;
    const yb = t.y * R * c;
    const yt = yb - h;
    if (isSel && t.kind === "capability") face(at(0, "glow", alpha * 0.55, T.indigo), x, yt, RI + 4, c);
    if (h > 0.3) for (const k of FRONT_SIDES) wall(at(1, "fill", alpha, m.walls[k]!), x, yt, yb, RI, c, k);
    face(at(2, "fill", alpha, m.topCss, 0, false, !isSel && t.kind === "capability" && ev === "unknown"), x, yt, RI, c);
    const [color, width, dash] =
      t.kind === "domain"
        ? state.focusRegion === t.id
          ? [T.rimSelected, 2, false]
          : [T.rimDomain, 1.5, false]
        : t.kind === "project"
          ? [T.hub, 1.4, false]
          : isSel
            ? [T.rimSelected, 2, false]
            : isHov
              ? [T.indigoBright, 2, false]
              : ev === "stale"
                ? [f.staleRim, 1.6 + 0.4 * light, false]
                : ev === "unknown"
                  ? [T.rimUnknown, 1, true]
                  : [f.rimLit, 1, false];
    face(at(3, "stroke", alpha, color, width, dash), x, yt, RI, c);
    if (R >= 20 && t.kind === "domain") face(at(4, "stroke", alpha * 0.35, T.rimDomain, 1), x, yt, RI - 5, c);
    if (R >= 20 && t.kind === "project") face(at(4, "stroke", alpha, T.hubHairline, 1), x, yt, RI - 6, c);
    if ((isSel || isHov) && ev === "stale") face(at(4, "stroke", alpha * 0.9, T.stale, 1.2), x, yt, RI - 4, c);
    if (f.usedBy.has(t.id)) face(at(4, "stroke", 0.8 * state.dimT, T.usedBy, 1.4), x, yt, RI - 3.5, c);
  }
  return phases.flatMap((p) => [...p.values()]);
}

function paintLayers(ctx: CanvasRenderingContext2D, layers: readonly Layer[], T: HexBoardTokens) {
  for (const l of layers) {
    ctx.globalAlpha = l.alpha;
    if (l.op === "glow") {
      ctx.save();
      ctx.shadowColor = T.indigo;
      ctx.shadowBlur = 20;
      ctx.fillStyle = l.color;
      ctx.fill(l.path);
      ctx.restore();
    } else if (l.op === "fill") {
      ctx.fillStyle = l.hatched ? hatch(ctx, l.color, T.hatch) : l.color;
      ctx.fill(l.path);
    } else {
      ctx.setLineDash(l.dash ? [2, 2] : []);
      ctx.strokeStyle = l.color;
      ctx.lineWidth = l.width;
      ctx.stroke(l.path);
    }
  }
}

export function drawReliefFloors(
  ctx: CanvasRenderingContext2D,
  scene: BoardScene,
  lo: number,
  hi: number,
  state: HexDrawState,
  T: HexBoardTokens,
  f: FloorsFrame,
  rects: TileRects,
): number {
  const { c, RI, FAPO } = f;
  const { R, ox, oy, width, height } = state;
  const dy = f.pivot * (1 - c) + oy * c;
  const key = [R, c, state.dimT, state.staleOnly, f.light, f.rimLit, identity(state.evidence), identity(state.lit)].join("|");
  const marked = (t: HexTile) =>
    t.id === state.selectedId || t.id === state.hoverId || t.id === state.focusId || t.id === state.focusRegion || f.usedBy.has(t.id);
  let rc = cache.get(scene);
  if (!rc || rc.key !== key) cache.set(scene, (rc = { key, rows: new Map() }));
  const starts = startsOf(scene);
  let row = 0;
  while (starts[row + 1]! <= lo) row += 1;
  let drawn = 0;
  ctx.lineJoin = "round";
  ctx.font = hexFonts().plateMeta;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  for (; starts[row]! < hi && row < starts.length - 1; row += 1) {
    const a = starts[row]!;
    const b = starts[row + 1]!;
    let rowKey = "";
    for (let i = a; i < b; i += 1) if (marked(scene.order[i]!)) rowKey += `${scene.order[i]!.id}:${scene.order[i]!.id === state.selectedId}${scene.order[i]!.id === state.hoverId}${f.usedBy.has(scene.order[i]!.id)},`;
    let cached = rc.rows.get(a);
    if (!cached || cached.key !== rowKey) rc.rows.set(a, (cached = { key: rowKey, layers: buildRow(scene.order.slice(a, b), state, T, f) }));
    const layers = cached.layers;
    ctx.translate(ox, dy);
    paintLayers(ctx, layers, T);
    ctx.translate(-ox, -dy);
    ctx.setLineDash([]);
    ctx.globalAlpha = f.numberAlpha;
    for (let i = a; i < b; i += 1) {
      const t = scene.order[i]!;
      const x = ox + t.x * R;
      if (x < -R || x > width + R) continue;
      const yb = dy + t.y * R * c;
      const h = f.lift(t);
      const yt = yb - h;
      if (yt - FAPO * c > height + 2 || yb + FAPO * c < -2) continue;
      const n = t.kind === "capability" ? f.counts?.get(t.id) : undefined;
      if (n != null) {
        ctx.fillStyle = f.isDimmed(t.id) ? T.inkDim : T.inkHi;
        ctx.fillText(NUMERALS[n] ?? String(n), x, yt + 4);
      }
      if (f.record) f.record.push({ id: t.id, ...prismPolygons(x, yt, yb, RI, c, h > 0.3) });
      rects.add({ x0: x - RI, x1: x + RI, y0: yt - FAPO * c, y1: yb + FAPO * c });
      drawn += 1;
    }
  }
  ctx.globalAlpha = 1;
  return drawn;
}

const ids = new WeakMap<object, number>();
let next = 1;
function identity(o: object | null): number {
  if (!o) return 0;
  let id = ids.get(o);
  if (!id) ids.set(o, (id = next++));
  return id;
}
