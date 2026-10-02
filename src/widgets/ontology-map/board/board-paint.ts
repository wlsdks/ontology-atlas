import { hexGutter, type HexBoardLayout, type HexTextLine, type HexTile } from "../model/hex-board";
import { SQRT3 } from "../model/hex-grid";
import { type HexDrawRoute, type HexDrawState, type HexFrameStats, type HexTextBox } from "../render/hex-board";
import type { HexBoardTokens } from "../tokens/read-hex-board-tokens";
import { edges, face, FRONT_SIDES, notch, pips, prismPolygons, smooth, startDot, stubHead, ticks, wall, type PaintedFace } from "./board-geometry";
import { drawReliefFloors } from "./board-relief-floors";
import { drawFloors, drawPlate, drawSlabs, TileRects } from "./board-plates";
import { arrivalOf, BOARD_ARRIVAL, isSlabBand, lowerBound, SLAB_BELOW, type BoardScene } from "./board-scene";
import { RELIEF_PITCH_REST } from "./relief-projection";
import { drawLines, drawNumber, lineSets, placeLinesWithNumber } from "./board-text";
import { cssOf, hatch, mix, rgbOf, solid, tileMaterial, tone, WHITE } from "./board-tones";

export interface BoardPose {
  pitch: number;
  pivotY: number;
  rise?: ((id: string) => number) | null;
  record?: PaintedFace[] | null;
}

export interface BoardFrameStats extends HexFrameStats {
  pitch: number;
  drawnTiles: number;
  slabs: boolean;
  numbers: number;
}


export function drawBoard(
  ctx: CanvasRenderingContext2D,
  layout: HexBoardLayout,
  state: HexDrawState,
  T: HexBoardTokens,
  scene: BoardScene,
  pose: BoardPose,
): { stats: BoardFrameStats; textBoxes: HexTextBox[]; plateBoxes: HexTextBox[] } {
  const { R, ox, oy, band, lit, dimT, width, height } = state;
  const c = Math.cos(pose.pitch);
  const s = Math.sin(pose.pitch);
  const light = Math.max(0, Math.min(1, pose.pitch / RELIEF_PITCH_REST));
  const pivot = pose.pivotY;
  const RI = R - hexGutter(R);
  const APO = (R * SQRT3) / 2;
  const FAPO = (RI * SQRT3) / 2;
  const sx = (u: number) => ox + u * R;
  const groundY = (uy: number) => pivot + (oy + uy * R - pivot) * c;
  const unitY = (py: number) => ((py - pivot) / c + pivot - oy) / R;
  const at = (t: HexTile) => ({ x: sx(t.x), y: groundY(t.y) });
  const lift = (t: HexTile) => (scene.heightShare.get(t.id) ?? 0) * R * s * (pose.rise ? pose.rise(t.id) : 1);
  const counts = light > 0 ? scene.metric : null;
  const numberAlpha = Math.min(1, light * 1.5);
  const ground = rgbOf(T.ground);
  const accent = solid(T.accent, ground);
  const slabs = isSlabBand(band, R);
  const stats: BoardFrameStats = {
    band,
    R,
    tiles: layout.tiles.length,
    names: 0,
    spills: 0,
    routes: 0,
    canals: 0,
    pills: 0,
    plates: 0,
    dimT,
    focus: state.selectedId,
    offset: [Math.round(ox), Math.round(oy)],
    arrived: state.arrivalMs == null,
    arrivalMs: state.arrivalMs == null ? null : Math.round(state.arrivalMs),
    pitch: +pose.pitch.toFixed(4),
    drawnTiles: 0,
    slabs,
    numbers: 0,
  };
  const textBoxes: HexTextBox[] = [];
  const plateBoxes: HexTextBox[] = [];
  const rects = new TileRects();
  const restAlpha = state.staleOnly ? T.dimFarAlpha : T.dimAlpha;
  const alphaOf = (t: HexTile) => (!lit || lit.has(t.id) ? 1 : 1 - dimT * (1 - (t.kind === "domain" ? 0.8 : restAlpha)));
  const isDimmed = (id: string) => lit != null && !lit.has(id) && dimT > 0.5;
  const maxRing = layout.tiles.reduce((m, t) => Math.max(m, t.ring), 0);
  const tilesDoneAt = state.reducedMotion ? 0 : maxRing * BOARD_ARRIVAL.ringStaggerMs + BOARD_ARRIVAL.tileMs;
  const routesAlpha = state.arrivalMs == null ? 1 : Math.max(0, Math.min(1, (state.arrivalMs - tilesDoneAt) / BOARD_ARRIVAL.routesMs));
  const canals = state.routes.filter((r) => r.role === "canal");
  const deps = state.routes.filter((r) => r.role !== "canal");
  const hoverOnly = !state.selectedId && !!state.hoverId;
  const routeWidth = (r: HexDrawRoute) => (hoverOnly ? 1.4 : r.role === "need-inside" ? 1.2 : 1.7);
  const routeAlpha = (r: HexDrawRoute) => (r.role === "need-inside" ? 0.6 : 0.95) * Math.max(dimT, hoverOnly ? 1 : 0);
  const screen = (r: HexDrawRoute) => r.points.map((p) => ({ x: sx(p.x), y: groundY(p.y) }));

  ctx.save();
  ctx.fillStyle = T.ground;
  ctx.fillRect(0, 0, width, height);

  const px0 = layout.project ? sx(layout.project.x) : sx((layout.bounds.minX + layout.bounds.maxX) / 2);
  const py0 = groundY(layout.project ? layout.project.y : (layout.bounds.minY + layout.bounds.maxY) / 2);
  const glowR = Math.max(layout.bounds.maxX - layout.bounds.minX, layout.bounds.maxY - layout.bounds.minY) * R * 0.62;
  ctx.save();
  ctx.translate(px0, py0);
  ctx.scale(1, 0.8 * c);
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
  glow.addColorStop(0, T.glow);
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(-glowR, -glowR, glowR * 2, glowR * 2);
  ctx.restore();

  const plateTone = mix(solid(T.plate, ground), solid(T.plate, ground, 2.6), light);
  const plateStrokeCss = cssOf(solid(T.plateStroke, plateTone, 1 + light * 0.6));

  const strokeRoute = (pts: { x: number; y: number }[], color: string, w: number) => {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    smooth(ctx, pts, R);
    ctx.strokeStyle = T.canvas;
    ctx.lineWidth = w + 3;
    ctx.stroke();
    smooth(ctx, pts, R);
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.stroke();
  };
  const canalAlpha = routesAlpha * (1 - dimT);
  const drawCanals = () => {
    if (canalAlpha <= 0.01) return;
    ctx.globalAlpha = canalAlpha;
    for (const canal of canals) {
      strokeRoute(screen(canal), T.canal, Math.min(4.5, (band === "regions" ? 0.8 : 1.2) + (canal.count ?? 1) * 0.28));
      stats.canals += 1;
    }
    ctx.globalAlpha = 1;
  };
  const head = (route: HexDrawRoute, pts: { x: number; y: number }[], color: string) => {
    const target = layout.byId.get(route.targetId);
    if (!target) return;
    if (route.stub) stubHead(ctx, pts[pts.length - 1]!, at(target), R, color);
    else notch(ctx, pts[pts.length - 1]!, at(target), R, RI, color, T.canvas);
  };
  const drawHeads = () => {
    if (canalAlpha > 0.01) {
      ctx.globalAlpha = canalAlpha;
      for (const canal of canals) {
        const pts = screen(canal);
        head(canal, pts, T.canalHead);
        const source = layout.byId.get(canal.sourceId);
        if (canal.twoWay && source) notch(ctx, pts[0]!, at(source), R, RI, T.canalHead, T.canvas);
      }
    }
    for (const route of deps) {
      const pts = screen(route);
      const color = route.role === "use" ? T.usedBy : T.accent;
      ctx.globalAlpha = routeAlpha(route);
      startDot(ctx, pts[0]!, routeWidth(route) + 1.2, color, T.canvas);
      head(route, pts, color);
    }
    ctx.globalAlpha = 1;
  };
  const plateAlpha = (id: string) => (lit && !lit.has(id) ? 1 - dimT * 0.4 : 1) * routesAlpha;
  const drawPlates = () => {
    const p = layout.project;
    if (p) {
      const y = groundY(p.y);
      drawPlate(ctx, T, { id: p.id, name: p.name, sub: "", cx: sx(p.x), top: y - APO * c, bottom: y + APO * c, warm: true, alpha: plateAlpha(p.id) }, rects, plateBoxes, plateStrokeCss);
    }
    for (const region of scene.regions) {
      const d = layout.byId.get(region.domainId);
      if (!d) continue;
      const lift = (scene.regionShare.get(region.domainId) ?? 0) * Math.max(1, layout.reg) * R * s * (slabs ? 1 : 0);
      const sub = state.plateSub.get(d.id) ?? "";
      const n = counts?.region.get(d.id);
      drawPlate(
        ctx,
        T,
        { id: d.id, name: d.name, sub: n == null ? sub : sub ? `▲ ${n} · ${sub}` : `▲ ${n}`, keep: n == null ? undefined : `▲ ${n}`, cx: sx(region.cx), top: groundY(region.minY) - APO * c - lift, bottom: groundY(region.maxY) + APO * c, warm: false, alpha: plateAlpha(d.id) },
        rects,
        plateBoxes,
        plateStrokeCss,
      );
    }
    stats.plates = plateBoxes.length;
  };

  const frame = { sx, groundY, unitY, c, s, light, RI, rise: pose.rise ?? null, plateTone, accent, plateStrokeCss, glow: { x: px0, y: py0, r: glowR } };
  if (slabs) {
    drawCanals();
    stats.drawnTiles += drawSlabs(ctx, layout, state, T, scene, frame, rects);
  } else {
    drawFloors(ctx, layout, state, T, scene, frame);
  }

  const lo = slabs ? 0 : lowerBound(scene.orderY, unitY(-2 * R - FAPO * c));
  const hi = slabs ? 0 : lowerBound(scene.orderY, unitY(height + 2 * R + scene.maxHeightShare * R * s) + 1e-9);
  const visible = (t: HexTile) => {
    const p = at(t);
    return p.x >= -R && p.x <= width + R && p.y >= -R - scene.maxHeightShare * R * s && p.y <= height + R;
  };
  const halo = (t: HexTile, color: string, alpha: number, blur: number, grow: number) => {
    const p = at(t);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.fillStyle = color;
    ctx.beginPath();
    face(ctx, p.x, p.y - lift(t), RI + grow, c);
    ctx.fill();
    ctx.restore();
  };
  if (!slabs) {
    if (state.staleOnly && dimT > 0) {
      for (const t of layout.capabilities) if (state.evidence.get(t.id) === "stale" && visible(t)) halo(t, T.stale, 0.22 * dimT, 16, 2);
    }
    const hov = state.hoverId && state.hoverId !== state.selectedId ? layout.byId.get(state.hoverId) : undefined;
    if (hov) halo(hov, T.indigo, 0.35, 14, 2);
    const sel = state.selectedId ? layout.byId.get(state.selectedId) : undefined;
    if (pose.pitch === 0 && sel?.kind === "capability") halo(sel, T.indigo, 0.55, 20, 4);
    drawCanals();
  }
  const usedBy = new Set<string>();
  for (const route of deps) {
    ctx.globalAlpha = routeAlpha(route);
    strokeRoute(screen(route), route.role === "use" ? T.usedBy : T.accent, routeWidth(route));
    if (route.role === "use") usedBy.add(route.sourceId);
    stats.routes += 1;
  }
  ctx.globalAlpha = 1;

  const showTicks = !lit && !state.hoverId && band !== "regions";
  const names = band === "names";
  const room = c >= 1 ? Infinity : FAPO * c - 2;
  const rimLit = tone(T, `rim-lit|${Math.round(light * 16)}`, () => cssOf(mix(solid(T.rim, ground), accent, 0.45 * light)));
  const staleRim = tone(T, `stale-rim|${Math.round(light * 16)}`, () => cssOf(mix(solid(T.stale, ground), WHITE, 0.18 * light)));
  const ring = (x: number, y: number, r: number, color: string, w: number, alpha: number) => {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    face(ctx, x, y, r, c);
    ctx.stroke();
  };
  const tiles: HexTile[] = [];
  for (let i = lo; i < hi; i += 1) tiles.push(scene.order[i]!);
  if (slabs && layout.project) tiles.push(layout.project);
  const floors = band === "regions" && !slabs && s > 0 && !pose.rise && state.arrivalMs == null && typeof Path2D !== "undefined";
  if (floors)
    stats.drawnTiles += drawReliefFloors(ctx, scene, lo, hi, state, T, { pivot, lift, alphaOf, isDimmed, usedBy, c, RI, FAPO, light, rimLit, staleRim, counts: counts?.capability ?? null, numberAlpha, record: pose.record }, rects);
  for (const t of floors ? [] : tiles) {
    const x = sx(t.x);
    if (x < -R || x > width + R) continue;
    const arr = arrivalOf(t.ring, state.arrivalMs, state.reducedMotion);
    if (arr.a <= 0.001) continue;
    const ev = t.kind === "capability" ? (state.evidence.get(t.id) ?? "unknown") : "current";
    const isSel = t.id === state.selectedId;
    const isHov = t.id === state.hoverId || t.id === state.focusId;
    const h = lift(t);
    const yb = groundY(t.y) + arr.dy;
    const yt = yb - h;
    if (yt - FAPO * c > height + 2 || yb + FAPO * c < -2) continue;
    const ri = RI * arr.s;
    const alpha = alphaOf(t) * arr.a;
    const m = tileMaterial(T, t.kind, t.bucket, ev, isSel, isHov, light);
    ctx.globalAlpha = alpha;
    if (isSel && t.kind === "capability" && pose.pitch !== 0) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.55;
      ctx.shadowColor = T.indigo;
      ctx.shadowBlur = 20;
      ctx.fillStyle = T.indigo;
      ctx.beginPath();
      face(ctx, x, yt, ri + 4, c);
      ctx.fill();
      ctx.restore();
    }
    if (h > 0.3) {
      for (const k of FRONT_SIDES) {
        ctx.beginPath();
        wall(ctx, x, yt, yb, ri, c, k);
        ctx.fillStyle = m.walls[k]!;
        ctx.fill();
      }
    } else {
      const depth = t.kind === "project" ? 6 : t.kind === "domain" ? 5 : 2 + 0.8 * t.bucket;
      const d = (R >= 28 ? depth : depth * 0.5) * (1 - light) * arr.s;
      if (d > 0.2) {
        ctx.beginPath();
        face(ctx, x + d * 0.5, yb + d, ri, c);
        ctx.fillStyle = T.riser;
        ctx.fill();
      }
    }
    ctx.beginPath();
    face(ctx, x, yt, ri, c);
    ctx.fillStyle = !isSel && t.kind === "capability" && ev === "unknown" ? hatch(ctx, m.topCss, T.hatch) : m.topCss;
    ctx.fill();
    ctx.lineWidth = R >= 28 ? 1.4 : 0.8;
    ctx.beginPath();
    edges(ctx, x, yt, ri - 1.2, c, 2, 3);
    ctx.strokeStyle = m.bevelLight;
    ctx.stroke();
    ctx.beginPath();
    edges(ctx, x, yt, ri - 1.2, c, 5, 3);
    ctx.strokeStyle = m.bevelShade;
    ctx.stroke();
    let rim = rimLit;
    let rimW = 1;
    let dash: number[] = [];
    if (t.kind === "domain") {
      rim = state.focusRegion === t.id ? T.rimSelected : T.rimDomain;
      rimW = state.focusRegion === t.id ? 2 : 1.5;
    } else if (t.kind === "project") {
      rim = T.hub;
      rimW = 1.4;
    } else if (isSel) {
      rim = T.rimSelected;
      rimW = 2;
    } else if (isHov) {
      rim = T.indigoBright;
      rimW = 2;
    } else if (ev === "stale") {
      rim = staleRim;
      rimW = 1.6 + 0.4 * light;
    } else if (ev === "unknown") {
      rim = T.rimUnknown;
      dash = R >= 28 ? [4, 3] : [2, 2];
    }
    ctx.setLineDash(dash);
    ctx.lineJoin = "round";
    ring(x, yt, ri, rim, rimW, alpha);
    ctx.setLineDash([]);
    if (R >= 20 && t.kind === "domain") ring(x, yt, ri - 5, T.rimDomain, 1, alpha * 0.35);
    if (R >= 20 && t.kind === "project") ring(x, yt, ri - 6, T.hubHairline, 1, alpha);
    if ((isSel || isHov) && ev === "stale") ring(x, yt, ri - 4, T.stale, 1.2, alpha * 0.9);
    if (usedBy.has(t.id)) ring(x, yt, ri - 3.5, T.usedBy, 1.4, 0.8 * dimT);
    const sides = showTicks ? state.ports.get(t.id) : undefined;
    if (sides) {
      ctx.globalAlpha = 0.7 * routesAlpha;
      ticks(ctx, x, yt, RI, c, sides, T.indigoBright);
    }
    if (band !== "regions" && t.kind === "capability" && t.elementCount > 0) {
      pips(ctx, t, x, yt + FAPO * c, R, c, alphaOf(t) * arr.a, names, (id) => state.evidence.get(id) === "stale", T);
    }
    const count = t.kind === "capability" ? counts?.capability.get(t.id) : undefined;
    const dimmed = isDimmed(t.id);
    ctx.globalAlpha = arr.a * numberAlpha;
    if (names) {
      const { lines, numberAt } = placeLinesWithNumber(lineSets(layout, t, R, state), room, count != null);
      if (count != null && numberAt != null && lines) {
        drawNumber(ctx, count, x, yt + numberAt, dimmed ? T.inkDim : T.inkHi);
        stats.numbers += 1;
      }
      if (!lines) stats.spills += 1;
      else if (lines.length) {
        const strong = isSel || t.id === state.hoverId || (lit != null && lit.has(t.id));
        const inkOf = (line: HexTextLine) => {
          if (t.kind === "project") return line.role === "meta" ? T.inkMeta : T.hub;
          if (t.kind === "domain") {
            if (line.role !== "meta") return dimmed ? T.ink : T.inkHi;
            return line.tone === "stale" && (state.staleByDomain?.get(t.id) ?? 0) > 0 ? T.staleInk : T.inkMeta;
          }
          if (line.role === "mono") return T.staleInk;
          return dimmed ? T.inkDim : strong ? T.inkHi : T.ink;
        };
        ctx.globalAlpha = arr.a;
        textBoxes.push(drawLines(ctx, t.id, lines, x, yt, inkOf, state.measure));
        stats.names += 1;
      }
    } else if (count != null && R >= SLAB_BELOW) {
      drawNumber(ctx, count, x, band === "pips" ? yt - FAPO * c * 0.15 + 4 : yt + 4, dimmed ? T.inkDim : T.inkHi);
      stats.numbers += 1;
    }
    if (pose.record) pose.record.push({ id: t.id, ...prismPolygons(x, yt, yb, ri, c, h > 0.3) });
    rects.add({ x0: x - RI, x1: x + RI, y0: yt - FAPO * c, y1: yb + FAPO * c });
    stats.drawnTiles += 1;
  }
  ctx.globalAlpha = 1;

  if (state.staleOnly && state.sweep != null && state.sweep < 1) {
    ctx.save();
    ctx.beginPath();
    for (const t of tiles) if (t.kind === "capability" && state.evidence.get(t.id) === "stale") face(ctx, sx(t.x), groundY(t.y) - lift(t), RI, c);
    ctx.clip();
    const span = width * 0.6;
    const cx = -span + state.sweep * (width + 2 * span);
    const g = ctx.createLinearGradient(cx - span / 2, 0, cx + span / 2, span * 0.35);
    g.addColorStop(0, "transparent");
    g.addColorStop(0.5, T.stale);
    g.addColorStop(1, "transparent");
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  drawHeads();
  if (band === "regions") drawPlates();
  ctx.restore();
  return { stats, textBoxes, plateBoxes };
}
