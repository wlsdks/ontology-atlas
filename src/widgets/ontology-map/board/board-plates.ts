import type { HexBoardLayout, HexTile } from "../model/hex-board";
import { hexKey, SQRT3 } from "../model/hex-grid";
import { hexFonts, type HexDrawState, type HexTextBox } from "../render/hex-board";
import type { HexBoardTokens } from "../tokens/read-hex-board-tokens";
import { COS, face, FRONT_SIDES, side, SIN, wall } from "./board-geometry";
import { arrivalOf, type BoardScene } from "./board-scene";
import { BLACK, cssOf, hatch, mix, rgbOf, solid, WALL_SHADE, tileMaterial, type RGB } from "./board-tones";

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const CELL = 64;

export class TileRects {
  private readonly grid = new Map<number, Box[]>();

  add(b: Box) {
    for (let gx = Math.floor(b.x0 / CELL); gx <= Math.floor(b.x1 / CELL); gx += 1) {
      for (let gy = Math.floor(b.y0 / CELL); gy <= Math.floor(b.y1 / CELL); gy += 1) {
        const k = gx * 100_003 + gy;
        const list = this.grid.get(k);
        if (list) list.push(b);
        else this.grid.set(k, [b]);
      }
    }
  }

  hits(b: Box): boolean {
    for (let gx = Math.floor(b.x0 / CELL); gx <= Math.floor(b.x1 / CELL); gx += 1) {
      for (let gy = Math.floor(b.y0 / CELL); gy <= Math.floor(b.y1 / CELL); gy += 1) {
        for (const r of this.grid.get(gx * 100_003 + gy) ?? []) if (r.x1 > b.x0 && r.x0 < b.x1 && r.y1 > b.y0 && r.y0 < b.y1) return true;
      }
    }
    return false;
  }
}

export interface PlateSpec {
  id: string;
  name: string;
  sub: string;
  cx: number;
  top: number;
  bottom: number;
  warm: boolean;
  alpha: number;
}

export function drawPlate(ctx: CanvasRenderingContext2D, T: HexBoardTokens, p: PlateSpec, tiles: TileRects, plates: HexTextBox[], strokeCss: string) {
  ctx.font = hexFonts().plate;
  const nw = ctx.measureText(p.name).width;
  ctx.font = hexFonts().plateMeta;
  const h = 24;
  const overPlate = (b: Box) => plates.some((q) => q.x < b.x1 && b.x0 < q.x + q.w && q.y < b.y1 && b.y0 < q.y + q.h);
  const place = (w: number, clash = (b: Box) => tiles.hits(b) || overPlate(b)) => {
    for (const dx of [0, -0.25, 0.25, -0.5, 0.5, -0.8, 0.8]) {
      for (const y of [p.top - 16, p.bottom + 16, p.top - 30, p.bottom + 30, p.top - 46, p.bottom + 46]) {
        const x = p.cx + dx * w;
        if (!clash({ x0: x - w / 2 - 3, y0: y - h / 2 - 3, x1: x + w / 2 + 3, y1: y + h / 2 + 3 })) return { x, y };
      }
    }
    return null;
  };
  let sub = p.sub;
  let w = nw + (sub ? ctx.measureText(sub).width + 10 : 0) + 24;
  let pick = place(w);
  if (!pick && sub) {
    sub = "";
    w = nw + 24;
    pick = place(w);
  }
  pick ??= place(w, overPlate) ?? { x: p.cx, y: p.top - 16 };
  const x0 = pick.x - w / 2;
  const y0 = pick.y - h / 2;
  ctx.save();
  ctx.globalAlpha = p.alpha;
  ctx.beginPath();
  ctx.roundRect(x0, y0, w, h, h / 2);
  ctx.fillStyle = T.ground;
  ctx.fill();
  ctx.strokeStyle = p.warm ? T.hub : strokeCss;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = hexFonts().plate;
  ctx.fillStyle = p.warm ? T.hub : T.inkHi;
  ctx.fillText(p.name, x0 + 12, pick.y + 4.5);
  if (sub) {
    ctx.font = hexFonts().plateMeta;
    ctx.fillStyle = sub.includes("◐") ? T.staleInk : T.ink;
    ctx.textAlign = "right";
    ctx.fillText(sub, x0 + w - 12, pick.y + 4.5);
  }
  ctx.restore();
  plates.push({ id: p.id, x: x0, y: y0, w, h });
}

interface BoardFrame {
  sx: (u: number) => number;
  groundY: (u: number) => number;
  unitY: (py: number) => number;
  glow: { x: number; y: number; r: number };
  c: number;
  s: number;
  light: number;
  RI: number;
  plateTone: RGB;
  accent: RGB;
  plateStrokeCss: string;
}

export function drawSlabs(
  ctx: CanvasRenderingContext2D,
  layout: HexBoardLayout,
  state: HexDrawState,
  T: HexBoardTokens,
  scene: BoardScene,
  f: BoardFrame,
  tiles: TileRects,
): number {
  const { sx, groundY, c, s, RI, light } = f;
  const unit = Math.max(1, layout.reg) * state.R;
  const plateR = state.R + 0.6;
  const fapo = (RI * Math.sqrt(3) * c) / 2;
  const slabBase = mix(f.plateTone, f.accent, 0.18);
  const slabWalls = WALL_SHADE.map((k) => cssOf(mix(slabBase, BLACK, k * 0.8)));
  const slabTop = cssOf(mix(f.plateTone, f.accent, 0.07 * light));
  const restAlpha = state.staleOnly ? T.dimFarAlpha : T.dimAlpha;
  let drawn = 0;
  for (const region of scene.regions) {
    const lift = (scene.regionShare.get(region.domainId) ?? 0) * unit * s;
    const ring = layout.byId.get(region.domainId)?.ring ?? 0;
    const arrived = arrivalOf(ring, state.arrivalMs, state.reducedMotion).a;
    if (arrived <= 0.001) continue;
    ctx.globalAlpha = arrived * (state.lit && !state.lit.has(region.domainId) ? 1 - state.dimT * 0.5 : 1);
    if (lift > 0.3) {
      for (const k of FRONT_SIDES) {
        ctx.beginPath();
        for (const e of region.rim) if (e.side === k) wall(ctx, sx(e.x), groundY(e.y) - lift, groundY(e.y), plateR, c, k);
        ctx.fillStyle = slabWalls[k]!;
        ctx.fill();
      }
    }
    ctx.beginPath();
    for (const cell of region.cells) face(ctx, sx(cell.x), groundY(cell.y) - lift, plateR, c);
    ctx.fillStyle = slabTop;
    ctx.fill();
    const fills = new Map<string, { fill: string | CanvasPattern; alpha: number; tiles: HexTile[] }>();
    const rims = new Map<string, { color: string; width: number; dash: number[]; alpha: number; tiles: HexTile[] }>();
    for (const t of region.tiles) {
      const ev = t.kind === "capability" ? (state.evidence.get(t.id) ?? "unknown") : "current";
      const sel = t.id === state.selectedId;
      const m = tileMaterial(T, t.kind, t.bucket, ev, sel, false, light);
      const unknown = t.kind === "capability" && ev === "unknown" && !sel;
      const dim = state.lit != null && !state.lit.has(t.id);
      const alpha = dim ? 1 - state.dimT * (1 - (t.kind === "domain" ? 0.8 : restAlpha)) : 1;
      const fillKey = `${dim ? 1 : 0}|${unknown ? "hatch|" : ""}${m.topCss}`;
      const fl = fills.get(fillKey);
      if (fl) fl.tiles.push(t);
      else fills.set(fillKey, { fill: unknown ? hatch(ctx, m.topCss, T.hatch) : m.topCss, alpha, tiles: [t] });
      const rim =
        t.kind === "domain"
          ? { key: "domain", color: T.rimDomain, width: 1.5, dash: [] }
          : sel
            ? { key: "sel", color: T.rimSelected, width: 2, dash: [] }
            : t.id === state.hoverId || t.id === state.focusId
              ? { key: "hover", color: T.indigoBright, width: 2, dash: [] }
            : ev === "stale"
              ? { key: "stale", color: T.stale, width: 1.6, dash: [] }
              : ev === "unknown"
                ? { key: "unknown", color: T.rimUnknown, width: 1, dash: [2, 2] }
                : { key: "rim", color: T.rim, width: 1, dash: [] };
      const r = rims.get(`${dim ? 1 : 0}|${rim.key}`);
      if (r) r.tiles.push(t);
      else rims.set(`${dim ? 1 : 0}|${rim.key}`, { color: rim.color, width: rim.width, dash: rim.dash, alpha, tiles: [t] });
      tiles.add({ x0: sx(t.x) - RI, x1: sx(t.x) + RI, y0: groundY(t.y) - lift - fapo, y1: groundY(t.y) + fapo });
    }
    const regionAlpha = ctx.globalAlpha;
    for (const { fill, alpha, tiles: list } of fills.values()) {
      ctx.globalAlpha = arrived * alpha;
      ctx.beginPath();
      for (const t of list) face(ctx, sx(t.x), groundY(t.y) - lift, RI, c);
      ctx.fillStyle = fill;
      ctx.fill();
    }
    for (const { color, width, dash, alpha, tiles: list } of rims.values()) {
      ctx.globalAlpha = arrived * alpha;
      ctx.beginPath();
      for (const t of list) face(ctx, sx(t.x), groundY(t.y) - lift, RI, c);
      ctx.setLineDash(dash);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = regionAlpha;
    ctx.beginPath();
    for (const e of region.rim) {
      const x = sx(e.x);
      const y = groundY(e.y) - lift;
      const b = (e.side + 1) % 6;
      ctx.moveTo(x + plateR * COS[e.side]!, y + plateR * SIN[e.side]! * c);
      ctx.lineTo(x + plateR * COS[b]!, y + plateR * SIN[b]! * c);
    }
    const on = state.focusRegion === region.domainId;
    ctx.strokeStyle = on ? T.indigoBright : f.plateStrokeCss;
    ctx.lineWidth = on ? 1.6 : 1;
    ctx.lineCap = "round";
    ctx.stroke();
    drawn += region.tiles.length;
  }
  ctx.globalAlpha = 1;
  return drawn;
}

export function drawFloors(ctx: CanvasRenderingContext2D, layout: HexBoardLayout, state: HexDrawState, T: HexBoardTokens, scene: BoardScene, f: BoardFrame) {
  const { R, ox, width, height, lit, dimT } = state;
  const { sx, groundY, unitY, c, s, light, RI } = f;
  const ground = rgbOf(T.ground);
  if (R >= 12) {
    const moat = solid(T.moat, ground);
    const qLo = Math.ceil((-R - ox) / (1.5 * R));
    const qHi = Math.floor((width + R - ox) / (1.5 * R));
    const yLo = unitY(-R);
    const yHi = unitY(height + R);
    const bands: number[][] = [[], [], [], []];
    for (let q = qLo; q <= qHi; q += 1) {
      const rLo = Math.floor(yLo / SQRT3 - q / 2) - 1;
      const rHi = Math.ceil(yHi / SQRT3 - q / 2) + 1;
      for (let r = rLo; r <= rHi; r += 1) {
        if (layout.occupied.has(hexKey(q, r))) continue;
        const x = sx(1.5 * q);
        const y = groundY(SQRT3 * (r + q / 2));
        const far = Math.hypot(x - f.glow.x, (y - f.glow.y) / Math.max(0.2, c * 0.8)) / f.glow.r;
        if (far <= 1) bands[Math.min(3, Math.floor(far * 4))]!.push(x, y);
      }
    }
    ctx.lineWidth = 1;
    bands.forEach((xy, i) => {
      if (!xy.length) return;
      ctx.beginPath();
      for (let k = 0; k < xy.length; k += 2) face(ctx, xy[k]!, xy[k + 1]!, RI, c);
      ctx.strokeStyle = cssOf(mix(ground, moat, 1 - ((i + 0.5) / 4) * 0.8));
      ctx.stroke();
    });
  }
  const y0 = unitY(-2 * R);
  const y1 = unitY(height + 2 * R + scene.maxHeightShare * R * s);
  const plateCss = cssOf(f.plateTone);
  for (const region of scene.regions) {
    const on = state.focusRegion === region.domainId;
    ctx.globalAlpha = lit && !lit.has(region.domainId) ? 1 - dimT * 0.5 : 1;
    ctx.beginPath();
    for (const cell of region.cells) {
      const x = sx(cell.x);
      if (cell.y >= y0 && cell.y <= y1 && x >= -2 * R && x <= width + 2 * R) face(ctx, x, groundY(cell.y), R + 0.6, c);
    }
    ctx.fillStyle = on ? cssOf(solid(T.plateFocus, ground, 1 + light)) : plateCss;
    ctx.fill();
    ctx.beginPath();
    for (const e of region.rim) {
      const x = sx(e.x);
      if (e.y >= y0 && e.y <= y1 && x >= -2 * R && x <= width + 2 * R) side(ctx, x, groundY(e.y), R + 0.6, c, e.side);
    }
    ctx.strokeStyle = on ? T.indigoBright : f.plateStrokeCss;
    ctx.lineWidth = on ? 1.6 : 1;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
