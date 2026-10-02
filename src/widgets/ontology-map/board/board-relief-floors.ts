import type { HexTile } from "../model/hex-board";
import type { HexDrawState } from "../render/hex-board";
import type { HexBoardTokens } from "../tokens/read-hex-board-tokens";
import { face, FRONT_SIDES, prismPolygons, wall, type PaintedFace } from "./board-geometry";
import type { TileRects } from "./board-plates";
import type { BoardScene } from "./board-scene";
import { drawNumber } from "./board-text";
import { hatch, tileMaterial } from "./board-tones";

interface FloorsFrame {
  pivot: number;
  lift: (t: HexTile) => number;
  alphaOf: (t: HexTile) => number;
  c: number;
  RI: number;
  FAPO: number;
  light: number;
  rimLit: string;
  staleRim: string;
  counts: ReadonlyMap<string, number> | null;
  numberAlpha: number;
  record: PaintedFace[] | null | undefined;
  rising: boolean;
}

interface Layer {
  op: "fill" | "stroke";
  alpha: number;
  color: string;
  hatched: boolean;
  width: number;
  dash: boolean;
  path: Path2D;
}

const NUMERALS = Array.from({ length: 1000 }, (_, i) => String(i));
const cache = new WeakMap<BoardScene, { key: string; layers: Layer[] }>();

function layersFor(scene: BoardScene, state: HexDrawState, T: HexBoardTokens, f: FloorsFrame, key: string): Layer[] {
  const hit = cache.get(scene);
  if (hit && hit.key === key) return hit.layers;
  const { c, RI, light } = f;
  const R = state.R;
  const byKey = new Map<string, Layer>();
  const layer = (k: string, make: () => Omit<Layer, "path">) => {
    let l = byKey.get(k);
    if (!l) byKey.set(k, (l = { ...make(), path: new Path2D() }));
    return l.path as unknown as CanvasRenderingContext2D;
  };
  for (const t of scene.order) {
    const ev = t.kind === "capability" ? (state.evidence.get(t.id) ?? "unknown") : "current";
    const isSel = t.id === state.selectedId;
    const isHov = t.id === state.hoverId || t.id === state.focusId;
    const alpha = f.alphaOf(t);
    const m = tileMaterial(T, t.kind, t.bucket, ev, isSel, isHov, light);
    const h = f.lift(t);
    const x = t.x * R;
    const yb = t.y * R * c;
    const yt = yb - h;
    if (h > 0.3)
      for (const k of FRONT_SIDES) wall(layer(`0|${alpha}|${m.walls[k]}`, () => ({ op: "fill", alpha, color: m.walls[k]!, hatched: false, width: 0, dash: false })), x, yt, yb, RI, c, k);
    const hatched = !isSel && t.kind === "capability" && ev === "unknown";
    face(layer(`1|${alpha}|${hatched}|${m.topCss}`, () => ({ op: "fill", alpha, color: m.topCss, hatched, width: 0, dash: false })), x, yt, RI, c);
    const [color, width, dash] =
      t.kind === "domain"
        ? [state.focusRegion === t.id ? T.rimSelected : T.rimDomain, 1.5, false]
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
    face(layer(`2|${alpha}|${color}|${width}|${dash}`, () => ({ op: "stroke", alpha, color, hatched: false, width, dash })), x, yt, RI, c);
  }
  const layers = [...byKey.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, l]) => l);
  cache.set(scene, { key, layers });
  return layers;
}

export function drawReliefFloors(
  ctx: CanvasRenderingContext2D,
  scene: BoardScene,
  visible: readonly HexTile[],
  state: HexDrawState,
  T: HexBoardTokens,
  f: FloorsFrame,
  rects: TileRects,
): number {
  const { c, RI, FAPO } = f;
  const { R, ox, oy, width, height } = state;
  const dy = f.pivot * (1 - c) + oy * c;
  const key = [R, c, state.selectedId, state.hoverId, state.focusId, state.focusRegion, state.dimT, state.staleOnly, f.light, f.rimLit, f.rising ? performance.now() : 0].join("|");
  const layers = layersFor(scene, state, T, f, `${key}|${identity(state.evidence)}|${identity(state.lit)}`);
  ctx.save();
  ctx.translate(ox, dy);
  ctx.lineJoin = "round";
  for (const l of layers) {
    ctx.globalAlpha = l.alpha;
    if (l.op === "fill") {
      ctx.fillStyle = l.hatched ? hatch(ctx, l.color, T.hatch) : l.color;
      ctx.fill(l.path);
    } else {
      ctx.setLineDash(l.dash ? [2, 2] : []);
      ctx.strokeStyle = l.color;
      ctx.lineWidth = l.width;
      ctx.stroke(l.path);
    }
  }
  ctx.restore();
  ctx.setLineDash([]);
  let drawn = 0;
  drawNumber(ctx, 0, -1e4, -1e4, T.inkHi);
  ctx.globalAlpha = f.numberAlpha;
  for (const t of visible) {
    const x = ox + t.x * R;
    if (x < -R || x > width + R) continue;
    const yb = dy + t.y * R * c;
    const h = f.lift(t);
    const yt = yb - h;
    if (yt - FAPO * c > height + 2 || yb + FAPO * c < -2) continue;
    const n = t.kind === "capability" ? f.counts?.get(t.id) : undefined;
    if (n != null && R >= 14) ctx.fillText(NUMERALS[n] ?? String(n), x, yt + 4);
    if (f.record) f.record.push({ id: t.id, ...prismPolygons(x, yt, yb, RI, c, h > 0.3) });
    rects.add({ x0: x - RI, x1: x + RI, y0: yt - FAPO * c, y1: yb + FAPO * c });
    drawn += 1;
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
