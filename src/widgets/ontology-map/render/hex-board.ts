/**
 * Canvas 2D drawing for the **hex board** (`model/hex-board.ts`, spec "F2" §3–§8). Pure: it
 * reads a laid-out board, a camera (cell size `R` and offset), what is selected, hovered and
 * lit, the routes already computed for that state, and paints. Every text position comes from
 * `hexTileLines`, the function the unit tests check for fit and overlap.
 *
 * Layers, bottom to top: ground (board glow, moat cells) → region plates → halos (under the
 * tiles, so an opaque neighbour covers them) → canals → tiles (riser, face, bevel, rim) → edge
 * ticks → focus routes and arrival notches → rings → pills → names and pips → region plates of
 * the far band.
 */

import {
  HEX_TYPE,
  hexGutter,
  hexLineSpills,
  hexTileLines,
  middleTruncate,
  type HexBand,
  type HexBoardLayout,
  type HexMeasure,
  type HexTextLine,
  type HexTextRole,
  type HexTile,
} from "../model/hex-board";
import { hexKey, HEX_NEIGHBORS, SQRT3 } from "../model/hex-grid";
import type { HexBoardTokens } from "../tokens/read-hex-board-tokens";

export type HexEvidenceState = "current" | "stale" | "unknown";

const FAMILY = "-apple-system, 'SF Pro Text', 'Apple SD Gothic Neo', sans-serif";
const MONO = "ui-monospace, 'SF Mono', Menlo, monospace";

/** Fonts per text role, on the product's weight ramp (510 signature, 560 emphasis, 650 strong). */
export const HEX_FONTS: Record<HexTextRole, string> = {
  capability: `510 ${HEX_TYPE.capability}px ${FAMILY}`,
  capabilityStrong: `650 ${HEX_TYPE.capability}px ${FAMILY}`,
  domain: `650 ${HEX_TYPE.domain}px ${FAMILY}`,
  meta: `400 ${HEX_TYPE.meta}px ${FAMILY}`,
  project: `650 ${HEX_TYPE.project}px ${FAMILY}`,
  mono: `400 ${HEX_TYPE.mono}px ${MONO}`,
  plate: `650 ${HEX_TYPE.plate}px ${FAMILY}`,
  plateMeta: `510 ${HEX_TYPE.plateMeta}px ${FAMILY}`,
};

/** A route to draw, in unit space, already searched by `model/hex-router.ts`. */
export interface HexDrawRoute {
  points: readonly { x: number; y: number }[];
  /** Lattice node indices (canals keep them to seat their pill). */
  nodes?: readonly number[];
  targetId: string;
  sourceId: string;
  role: "need" | "use" | "need-inside" | "canal";
  /** Canal only: relations counted, both directions, and where its pill sits (unit space). */
  count?: number;
  twoWay?: boolean;
  pill?: { x: number; y: number } | null;
}

export interface HexDrawState {
  width: number;
  height: number;
  /** Cell circumradius in CSS px. */
  R: number;
  /** Screen = offset + unit × R. */
  ox: number;
  oy: number;
  band: HexBand;
  selectedId: string | null;
  hoverId: string | null;
  /** Keyboard focus, drawn like a hover ring when it is not the selection. */
  focusId: string | null;
  /** Nodes kept at full strength while something is focused; null = nothing dimmed. */
  lit: ReadonlySet<string> | null;
  /** Stale-only mode: the non-lit rest recedes further (spec: 16%). */
  staleOnly: boolean;
  /** Region whose plate is outlined (a domain title was chosen). */
  focusRegion: string | null;
  /** 0 → nothing dimmed, 1 → the rest fully receded. */
  dimT: number;
  evidence: ReadonlyMap<string, HexEvidenceState>;
  /** Capability → the moved file's name, shown under the name in stale-only mode. */
  staleFiles: ReadonlyMap<string, string>;
  /** Stale capabilities per domain; null when evidence is not measured. */
  staleByDomain: ReadonlyMap<string, number> | null;
  /** Domain title lines (the counts line and the stale line) and the project's count line. */
  domainMeta: ReadonlyMap<string, { meta: string; stale: string | null }>;
  projectMeta: string | null;
  /** Region nameplate words for the far band: name plus "caps · ◐ stale". */
  plateSub: ReadonlyMap<string, string>;
  routes: readonly HexDrawRoute[];
  /** Edge ticks at rest: capability → sides (0–5) facing regions it relies on. */
  ports: ReadonlyMap<string, readonly number[]>;
  /** Arrival: ms since the board first drew, or null when it has fully arrived. */
  arrivalMs: number | null;
  reducedMotion: boolean;
  /** Stale-only light sweep: 0..1 progress, or null. */
  sweep: number | null;
  measure: HexMeasure;
}

export interface HexFrameStats {
  band: HexBand;
  R: number;
  tiles: number;
  names: number;
  /** Tiles whose name was held back because it did not fit (should be 0 in the names band). */
  spills: number;
  routes: number;
  canals: number;
  pills: number;
  plates: number;
  dimT: number;
  focus: string | null;
  offset: [number, number];
  arrived: boolean;
  /** Milliseconds into the arrival, or null once arrived. */
  arrivalMs: number | null;
}

/** Screen boxes of every drawn text, for the mirror list and the overlap checks. */
export interface HexTextBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/* ── colour helpers (values always come from tokens) ────────────────────── */

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mix a hex token toward white (`to` 255) or black (`to` 0) by `t`. */
function mixHex(hex: string, t: number, to: 0 | 255): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const c = rgb.map((v) => Math.round(v * (1 - t) + to * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/* ── geometry helpers ───────────────────────────────────────────────────── */

function hexPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const a = (i * Math.PI) / 3;
    const px = x + r * Math.cos(a);
    const py = y + r * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** A polyline with rounded corners (radius `min(0.3R, ½ segment)`). */
function smoothPath(ctx: CanvasRenderingContext2D, pts: readonly { x: number; y: number }[], R: number) {
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length - 1; i += 1) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const c = pts[i + 1]!;
    const l1 = Math.hypot(b.x - a.x, b.y - a.y);
    const l2 = Math.hypot(c.x - b.x, c.y - b.y);
    if (l1 < 1e-6 || l2 < 1e-6) continue;
    const rr = Math.min(R * 0.3, l1 * 0.45, l2 * 0.45);
    ctx.lineTo(b.x - ((b.x - a.x) / l1) * rr, b.y - ((b.y - a.y) / l1) * rr);
    ctx.quadraticCurveTo(b.x, b.y, b.x + ((c.x - b.x) / l2) * rr, b.y + ((c.y - b.y) / l2) * rr);
  }
  const e = pts[pts.length - 1]!;
  ctx.lineTo(e.x, e.y);
}

let hatchCache: { key: string; canvas: HTMLCanvasElement } | null = null;
function hatchPattern(ctx: CanvasRenderingContext2D, base: string, line: string): CanvasPattern | string {
  if (typeof document === "undefined") return base;
  const key = `${base}|${line}`;
  if (!hatchCache || hatchCache.key !== key) {
    const c = document.createElement("canvas");
    c.width = 6;
    c.height = 6;
    const g = c.getContext("2d");
    if (!g) return base;
    g.fillStyle = base;
    g.fillRect(0, 0, 6, 6);
    g.strokeStyle = line;
    g.lineWidth = 1.4;
    g.beginPath();
    // Diagonal hatch that tiles seamlessly.
    g.moveTo(-1, 7);
    g.lineTo(7, -1);
    g.moveTo(-1, 1);
    g.lineTo(1, -1);
    g.moveTo(5, 7);
    g.lineTo(7, 5);
    g.stroke();
    hatchCache = { key, canvas: c };
  }
  return ctx.createPattern(hatchCache.canvas, "repeat") ?? base;
}

/** cubic-bezier(.2,.7,.2,1), solved numerically once per call (cheap at this size). */
function easeArrive(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 18; i += 1) {
    const m = (lo + hi) / 2;
    const x = 3 * (1 - m) * (1 - m) * m * 0.2 + 3 * (1 - m) * m * m * 0.2 + m * m * m;
    if (x < t) lo = m;
    else hi = m;
  }
  const s = (lo + hi) / 2;
  return 3 * (1 - s) * (1 - s) * s * 0.7 + 3 * (1 - s) * s * s * 1 + s * s * s;
}

/** Arrival timing (spec §8). */
const HEX_ARRIVAL = { tileMs: 220, ringStaggerMs: 28, routesMs: 160 } as const;

export function hexArrivalDuration(maxRing: number, reduced: boolean): number {
  if (reduced) return 0;
  return maxRing * HEX_ARRIVAL.ringStaggerMs + HEX_ARRIVAL.tileMs + HEX_ARRIVAL.routesMs;
}

/** A tile's arrival at time `ms`: opacity, lift (px) and scale. */
function arrivalOf(ring: number, ms: number | null, reduced: boolean): { a: number; dy: number; s: number } {
  if (ms == null) return { a: 1, dy: 0, s: 1 };
  if (reduced) return { a: 1, dy: 0, s: 1 };
  const e = easeArrive((ms - ring * HEX_ARRIVAL.ringStaggerMs) / HEX_ARRIVAL.tileMs);
  return { a: e, dy: 8 * (1 - e), s: 0.94 + 0.06 * e };
}

/* ── text ───────────────────────────────────────────────────────────────── */

/** The lines a tile shows in the names band — the same call the tests and the mirror use. */
function hexLinesFor(
  tile: HexTile,
  R: number,
  measure: HexMeasure,
  state: Pick<HexDrawState, "domainMeta" | "projectMeta" | "staleOnly" | "staleFiles" | "evidence" | "selectedId">,
): HexTextLine[] {
  if (tile.kind === "domain" || tile.kind === "project") {
    // A title tile carries its counts when they fit, and its name always: the region is never
    // anonymous, and a count that would not fit is left to the plate and the inspector.
    const m = tile.kind === "domain" ? state.domainMeta.get(tile.id) : null;
    const meta = tile.kind === "domain" ? m?.meta : (state.projectMeta ?? undefined);
    const tries = [{ meta, stale: m?.stale ?? undefined }, { meta }, {}];
    for (const extras of tries) {
      const lines = hexTileLines(tile, R, measure, extras);
      if (hexLineSpills(lines, R, measure).length === 0) return lines;
    }
    return hexTileLines(tile, R, measure, {});
  }
  const RI = R - hexGutter(R);
  const file = state.staleOnly && state.evidence.get(tile.id) === "stale" ? state.staleFiles.get(tile.id) : undefined;
  const avail = 2 * (RI - 22 / SQRT3) - 12;
  const fitted = file ? middleTruncate(file, avail, (t) => measure(t, "mono")) : null;
  // Richer first (the selected name in the strong weight, the moved file under a stale name),
  // falling back to the plain lines the names band was sized for — never a clipped name.
  const tries = [
    { staleFile: fitted, strong: tile.id === state.selectedId },
    { staleFile: fitted, strong: false },
    { staleFile: null, strong: tile.id === state.selectedId },
    { staleFile: null, strong: false },
  ];
  for (const extras of tries) {
    const lines = hexTileLines(tile, R, measure, extras);
    if (hexLineSpills(lines, R, measure).length === 0) return lines;
  }
  return hexTileLines(tile, R, measure, {});
}

/* ── the paint ──────────────────────────────────────────────────────────── */

export function drawHexBoard(
  ctx: CanvasRenderingContext2D,
  layout: HexBoardLayout,
  state: HexDrawState,
  T: HexBoardTokens,
): { stats: HexFrameStats; textBoxes: HexTextBox[]; plateBoxes: HexTextBox[] } {
  const { R, ox, oy, band, lit, dimT } = state;
  const GUT = hexGutter(R);
  const RI = R - GUT;
  const APO = (R * SQRT3) / 2;
  const FAPO = (RI * SQRT3) / 2;
  const sx = (u: number) => ox + u * R;
  const sy = (u: number) => oy + u * R;
  const stats: HexFrameStats = {
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
  };
  const textBoxes: HexTextBox[] = [];
  const plateBoxes: HexTextBox[] = [];
  const restAlpha = state.staleOnly ? T.dimFarAlpha : T.dimAlpha;
  const alphaOf = (id: string) => {
    if (!lit || lit.has(id)) return 1;
    const tile = layout.byId.get(id);
    const floor = tile?.kind === "domain" ? 0.8 : restAlpha;
    return 1 - dimT * (1 - floor);
  };
  const isDimmed = (id: string) => lit != null && !lit.has(id) && dimT > 0.5;
  const maxRing = layout.tiles.reduce((m, t) => Math.max(m, t.ring), 0);
  const tilesDoneAt = state.reducedMotion ? 0 : maxRing * HEX_ARRIVAL.ringStaggerMs + HEX_ARRIVAL.tileMs;
  const routesAlpha =
    state.arrivalMs == null ? 1 : Math.max(0, Math.min(1, (state.arrivalMs - tilesDoneAt) / HEX_ARRIVAL.routesMs));

  ctx.save();
  ctx.fillStyle = T.ground;
  ctx.fillRect(0, 0, state.width, state.height);

  /* ── ground: board glow centred on the project, moat cells fading with distance ── */
  const px0 = layout.project ? sx(layout.project.x) : sx((layout.bounds.minX + layout.bounds.maxX) / 2);
  const py0 = layout.project ? sy(layout.project.y) : sy((layout.bounds.minY + layout.bounds.maxY) / 2);
  const boardW = (layout.bounds.maxX - layout.bounds.minX) * R;
  const boardH = (layout.bounds.maxY - layout.bounds.minY) * R;
  const glowR = Math.max(boardW, boardH) * 0.62;
  {
    ctx.save();
    ctx.translate(px0, py0);
    ctx.scale(1, 0.8);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
    g.addColorStop(0, T.glow);
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.fillRect(-glowR, -glowR, glowR * 2, glowR * 2);
    ctx.restore();
  }
  if (R >= 12) {
    ctx.strokeStyle = T.moat;
    ctx.lineWidth = 1;
    const qs = layout.tiles.map((t) => t.q);
    const rs = layout.tiles.map((t) => t.r);
    const pad = 3;
    const qMin = Math.min(...qs) - pad;
    const qMax = Math.max(...qs) + pad;
    const rMin = Math.min(...rs) - pad - 3;
    const rMax = Math.max(...rs) + pad + 3;
    for (let q = qMin; q <= qMax; q += 1) {
      for (let r = rMin; r <= rMax; r += 1) {
        if (layout.occupied.has(hexKey(q, r))) continue;
        const x = sx(1.5 * q);
        const y = sy(SQRT3 * (r + q / 2));
        if (x < -R || x > state.width + R || y < -R || y > state.height + R) continue;
        const far = Math.hypot(x - px0, (y - py0) / 0.8) / glowR;
        if (far > 1) continue;
        ctx.globalAlpha = 1 - far * 0.8;
        hexPath(ctx, x, y, RI);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ── plates: a region is one faint indigo plate with an outline on its outer edges ── */
  const regionOf = new Map<string, string>();
  for (const region of layout.regions) for (const [q, r] of region.cells) regionOf.set(hexKey(q, r), region.domainId);
  for (const region of layout.regions) {
    const on = state.focusRegion === region.domainId;
    ctx.globalAlpha = lit && !lit.has(region.domainId) ? 1 - dimT * 0.5 : 1;
    ctx.fillStyle = on ? T.plateFocus : T.plate;
    for (const [q, r] of region.cells) {
      hexPath(ctx, sx(1.5 * q), sy(SQRT3 * (r + q / 2)), R + 0.6);
      ctx.fill();
    }
    ctx.strokeStyle = on ? T.indigoBright : T.plateStroke;
    ctx.lineWidth = on ? 1.6 : 1;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (const [q, r] of region.cells) {
      const x = sx(1.5 * q);
      const y = sy(SQRT3 * (r + q / 2));
      HEX_NEIGHBORS.forEach(([dq, dr], i) => {
        if (regionOf.get(hexKey(q + dq, r + dr)) === region.domainId) return;
        const a1 = (i * Math.PI) / 3;
        const a2 = a1 + Math.PI / 3;
        const rr = R + 0.6;
        ctx.moveTo(x + rr * Math.cos(a1), y + rr * Math.sin(a1));
        ctx.lineTo(x + rr * Math.cos(a2), y + rr * Math.sin(a2));
      });
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  /* ── halos, under the tiles: opaque neighbours cover them, so they show only in gutters ── */
  const halo = (t: HexTile, color: string, alpha: number, blur: number, grow: number) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.fillStyle = color;
    hexPath(ctx, sx(t.x), sy(t.y), RI + grow);
    ctx.fill();
    ctx.restore();
  };
  if (state.staleOnly) {
    for (const t of layout.capabilities) if (state.evidence.get(t.id) === "stale") halo(t, T.stale, 0.22 * dimT, 16, 2);
  }
  const sel = state.selectedId ? layout.byId.get(state.selectedId) : undefined;
  if (sel && sel.kind === "capability") halo(sel, T.indigo, 0.55, 20, 4);
  const hov = state.hoverId && state.hoverId !== state.selectedId ? layout.byId.get(state.hoverId) : undefined;
  if (hov) halo(hov, T.indigo, 0.35, 14, 2);

  /* ── canals (rest only), under the tiles' labels, never over a face by construction ── */
  const arrivalNotch = (tip: { x: number; y: number }, target: HexTile, color: string) => {
    const tx = sx(target.x);
    const ty = sy(target.y);
    const len = Math.hypot(tip.x - tx, tip.y - ty) || 1;
    const ux = (tip.x - tx) / len;
    const uy = (tip.y - ty) / len;
    const vx = -uy;
    const vy = ux;
    const t0 = FAPO - 1.5;
    const base = APO + (R >= 28 ? 4 : 2);
    const hw = R >= 44 ? 5 : R >= 28 ? 3.5 : 2.2;
    ctx.beginPath();
    ctx.moveTo(tx + ux * t0, ty + uy * t0);
    ctx.lineTo(tx + ux * base + vx * hw, ty + uy * base + vy * hw);
    ctx.lineTo(tx + ux * base - vx * hw, ty + uy * base - vy * hw);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = T.canvas;
    ctx.lineWidth = 1;
    ctx.lineJoin = "round";
    ctx.stroke();
  };
  const canals = state.routes.filter((r) => r.role === "canal");
  const deps = state.routes.filter((r) => r.role !== "canal");
  ctx.globalAlpha = routesAlpha * (1 - dimT);
  if (ctx.globalAlpha > 0.01) {
    for (const c of canals) {
      const pts = c.points.map((p) => ({ x: sx(p.x), y: sy(p.y) }));
      const w = Math.min(4.5, (band === "regions" ? 0.8 : 1.2) + (c.count ?? 1) * 0.28);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      smoothPath(ctx, pts, R);
      ctx.strokeStyle = T.canvas;
      ctx.lineWidth = w + 3;
      ctx.stroke();
      smoothPath(ctx, pts, R);
      ctx.strokeStyle = T.canal;
      ctx.lineWidth = w;
      ctx.stroke();
      const target = layout.byId.get(c.targetId);
      if (target) arrivalNotch(pts[pts.length - 1]!, target, T.canalHead);
      const source = layout.byId.get(c.sourceId);
      if (c.twoWay && source) arrivalNotch(pts[0]!, source, T.canalHead);
      stats.canals += 1;
    }
  }
  ctx.globalAlpha = 1;

  /* ── tiles ── */
  const drawTile = (t: HexTile) => {
    const ev = t.kind === "capability" ? (state.evidence.get(t.id) ?? "unknown") : "current";
    const isSel = t.id === state.selectedId;
    const isHov = t.id === state.hoverId || t.id === state.focusId;
    const arr = arrivalOf(t.ring, state.arrivalMs, state.reducedMotion);
    if (arr.a <= 0.001) return;
    const x = sx(t.x);
    const y = sy(t.y) + arr.dy;
    const alpha = alphaOf(t.id) * arr.a;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (arr.s !== 1) {
      ctx.translate(x, y);
      ctx.scale(arr.s, arr.s);
      ctx.translate(-x, -y);
    }
    const depth = t.kind === "project" ? 6 : t.kind === "domain" ? 5 : 2 + 0.8 * t.bucket;
    const d = R >= 28 ? depth : depth * 0.5;
    // Riser: the tile's thickness, offset down-right from the one light.
    ctx.fillStyle = T.riser;
    hexPath(ctx, x + d * 0.5, y + d, RI);
    ctx.fill();
    // Face.
    let top: string;
    let bottom: string;
    let fill: string | CanvasPattern | CanvasGradient;
    if (isSel) {
      [top, bottom] = T.faceSelected;
    } else if (t.kind === "domain") {
      [top, bottom] = T.faceDomain;
    } else if (t.kind === "project") {
      [top, bottom] = T.faceProject;
    } else {
      const ladder = ev === "stale" ? T.faceStale : T.face;
      const base = ladder[Math.min(4, t.bucket + (isHov ? 1 : 0))]!;
      top = mixHex(base, 0.07, 255);
      bottom = mixHex(base, 0.18, 0);
    }
    if (!isSel && t.kind === "capability" && ev === "unknown") {
      fill = hatchPattern(ctx, T.face[Math.min(4, t.bucket + (isHov ? 1 : 0))]!, T.hatch);
    } else {
      const g = ctx.createLinearGradient(x - RI * 0.6, y - RI, x + RI * 0.6, y + RI);
      g.addColorStop(0, top);
      g.addColorStop(1, bottom);
      fill = g;
    }
    ctx.fillStyle = fill;
    hexPath(ctx, x, y, RI);
    ctx.fill();
    // Bevel: one light, top-left, the same for every tile.
    const bg = ctx.createLinearGradient(x - RI, y - RI, x + RI * 0.4, y + RI);
    bg.addColorStop(0, T.bevel[0]);
    bg.addColorStop(0.45, T.bevel[1]);
    bg.addColorStop(1, T.bevel[2]);
    ctx.strokeStyle = bg;
    ctx.lineWidth = R >= 28 ? 1.4 : 0.8;
    hexPath(ctx, x, y, RI - 1.2);
    ctx.stroke();
    // Rim.
    let rim = T.rim;
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
      rim = T.stale;
      rimW = 1.6;
    } else if (ev === "unknown") {
      rim = T.rimUnknown;
      dash = R >= 28 ? [4, 3] : [2, 2];
    }
    ctx.setLineDash(dash);
    ctx.strokeStyle = rim;
    ctx.lineWidth = rimW;
    ctx.lineJoin = "round";
    hexPath(ctx, x, y, RI);
    ctx.stroke();
    ctx.setLineDash([]);
    // Inner rings: the title tile's double rim, the project's gold ring.
    if (R >= 20 && t.kind === "domain") {
      ctx.globalAlpha = alpha * 0.35;
      ctx.strokeStyle = T.rimDomain;
      ctx.lineWidth = 1;
      hexPath(ctx, x, y, RI - 5);
      ctx.stroke();
    }
    if (R >= 20 && t.kind === "project") {
      ctx.strokeStyle = T.hubHairline;
      ctx.lineWidth = 1;
      hexPath(ctx, x, y, RI - 6);
      ctx.stroke();
    }
    // A selected or hovered stale tile keeps its stale signal as an inner ring.
    if ((isSel || isHov) && ev === "stale") {
      ctx.globalAlpha = alpha * 0.9;
      ctx.strokeStyle = T.stale;
      ctx.lineWidth = 1.2;
      hexPath(ctx, x, y, RI - 4);
      ctx.stroke();
    }
    ctx.restore();
  };
  for (const t of layout.capabilities) drawTile(t);
  for (const t of layout.domains) drawTile(t);
  if (layout.project) drawTile(layout.project);

  /* ── stale-only light sweep: one gold gradient across the stale tiles ── */
  if (state.staleOnly && state.sweep != null && state.sweep < 1) {
    ctx.save();
    ctx.beginPath();
    for (const t of layout.capabilities) {
      if (state.evidence.get(t.id) !== "stale") continue;
      const x = sx(t.x);
      const y = sy(t.y);
      for (let i = 0; i < 6; i += 1) {
        const a = (i * Math.PI) / 3;
        if (i === 0) ctx.moveTo(x + RI * Math.cos(a), y + RI * Math.sin(a));
        else ctx.lineTo(x + RI * Math.cos(a), y + RI * Math.sin(a));
      }
      ctx.closePath();
    }
    ctx.clip();
    const span = state.width * 0.6;
    const cx = -span + state.sweep * (state.width + 2 * span);
    const g = ctx.createLinearGradient(cx - span / 2, 0, cx + span / 2, span * 0.35);
    g.addColorStop(0, "transparent");
    g.addColorStop(0.5, T.stale);
    g.addColorStop(1, "transparent");
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, state.width, state.height);
    ctx.restore();
  }

  /* ── edge ticks at rest: a notch on the face edge facing a region this tile relies on ── */
  if (!lit && band !== "regions" && !state.hoverId) {
    ctx.save();
    ctx.globalAlpha = 0.7 * routesAlpha;
    ctx.strokeStyle = T.indigoBright;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    for (const [id, sides] of state.ports) {
      const t = layout.byId.get(id);
      if (!t) continue;
      const x = sx(t.x);
      const y = sy(t.y);
      for (const k of sides) {
        const a1 = (k * Math.PI) / 3;
        const a2 = a1 + Math.PI / 3;
        const mx = (Math.cos(a1) + Math.cos(a2)) / 2;
        const my = (Math.sin(a1) + Math.sin(a2)) / 2;
        const rr = RI - 1.6;
        const cx = x + rr * mx;
        const cy = y + rr * my;
        const dx = Math.cos(a2) - Math.cos(a1);
        const dy = Math.sin(a2) - Math.sin(a1);
        const L = Math.hypot(dx, dy);
        const half = Math.min(7, RI * 0.15);
        ctx.beginPath();
        ctx.moveTo(cx - (dx / L) * half, cy - (dy / L) * half);
        ctx.lineTo(cx + (dx / L) * half, cy + (dy / L) * half);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* ── focus routes: needs (indigo) and used-by (pale indigo), each with an arrival notch ── */
  if (deps.length) {
    ctx.save();
    const hoverOnly = !state.selectedId && !!state.hoverId;
    for (const route of deps) {
      const pts = route.points.map((p) => ({ x: sx(p.x), y: sy(p.y) }));
      const color = route.role === "use" ? T.usedBy : T.accent;
      const w = hoverOnly ? 1.4 : route.role === "need-inside" ? 1.2 : 1.7;
      ctx.globalAlpha = (route.role === "need-inside" ? 0.6 : 0.95) * Math.max(dimT, hoverOnly ? 1 : 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      smoothPath(ctx, pts, R);
      ctx.strokeStyle = T.canvas;
      ctx.lineWidth = w + 3;
      ctx.stroke();
      smoothPath(ctx, pts, R);
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(pts[0]!.x, pts[0]!.y, w + 1.2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = T.canvas;
      ctx.lineWidth = 1;
      ctx.stroke();
      const target = layout.byId.get(route.targetId);
      if (target) arrivalNotch(pts[pts.length - 1]!, target, color);
      stats.routes += 1;
    }
    // Used-by tiles wear a pale inner ring, so "who relies on this" reads without the lines.
    for (const route of deps) {
      if (route.role !== "use") continue;
      const t = layout.byId.get(route.sourceId);
      if (!t) continue;
      ctx.globalAlpha = 0.8 * dimT;
      ctx.strokeStyle = T.usedBy;
      ctx.lineWidth = 1.4;
      hexPath(ctx, sx(t.x), sy(t.y), RI - 3.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ── canal pills (pips band and up) ── */
  if (band !== "regions" && routesAlpha * (1 - dimT) > 0.01) {
    ctx.save();
    ctx.globalAlpha = routesAlpha * (1 - dimT);
    for (const c of canals) {
      if (!c.pill) continue;
      const x = sx(c.pill.x);
      const y = sy(c.pill.y);
      const text = String(c.count ?? 0);
      ctx.font = HEX_FONTS.plateMeta;
      const w = Math.max(26, ctx.measureText(text).width + 14);
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - 10, w, 20, 10);
      ctx.fillStyle = T.ground;
      ctx.fill();
      ctx.strokeStyle = T.canal;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = T.ink;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(text, x, y + 4);
      stats.pills += 1;
    }
    ctx.restore();
  }

  /* ── names, meta and pips ── */
  if (band === "names") {
    for (const t of layout.tiles) {
      const arr = arrivalOf(t.ring, state.arrivalMs, state.reducedMotion);
      if (arr.a <= 0.001) continue;
      const lines = hexLinesFor(t, R, state.measure, state);
      if (hexLineSpills(lines, R, state.measure).length) {
        stats.spills += 1;
        continue;
      }
      const x = sx(t.x);
      const y = sy(t.y) + arr.dy;
      const dimmed = isDimmed(t.id);
      const litNow = lit != null && lit.has(t.id);
      const isSel = t.id === state.selectedId;
      const isHov = t.id === state.hoverId;
      ctx.save();
      ctx.globalAlpha = arr.a;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const line of lines) {
        ctx.font = HEX_FONTS[line.role];
        let color: string;
        if (t.kind === "project") color = line.role === "meta" ? T.inkMeta : T.hub;
        else if (t.kind === "domain") {
          if (line.role === "meta") color = line.tone === "stale" && (state.staleByDomain?.get(t.id) ?? 0) > 0 ? T.staleInk : T.inkMeta;
          else color = dimmed ? T.ink : T.inkHi;
        } else if (line.role === "mono") color = T.staleInk;
        else color = dimmed ? T.inkDim : isSel || isHov || litNow ? T.inkHi : T.ink;
        ctx.fillStyle = color;
        ctx.fillText(line.text, x, y + line.dy);
        const w = state.measure(line.text, line.role);
        const size = HEX_TYPE[line.role === "capabilityStrong" ? "capability" : line.role];
        x0 = Math.min(x0, x - w / 2);
        x1 = Math.max(x1, x + w / 2);
        y0 = Math.min(y0, y + line.dy - size * 0.85);
        y1 = Math.max(y1, y + line.dy + size * 0.22);
      }
      ctx.restore();
      if (lines.length) {
        stats.names += 1;
        textBoxes.push({ id: t.id, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      }
    }
  }
  if (band !== "regions") {
    for (const t of layout.capabilities) {
      const n = t.elementCount;
      if (!n) continue;
      const arr = arrivalOf(t.ring, state.arrivalMs, state.reducedMotion);
      if (arr.a <= 0.001) continue;
      const show = n > 8 ? 7 : n;
      const pr = R >= 44 ? 2.7 : 2.2;
      const sp = pr * 2.7;
      const w = (show - 1) * sp + (n > 8 ? 14 : 0);
      const x = sx(t.x);
      const py = sy(t.y) + arr.dy + FAPO - pr - (R >= 44 ? 9 : 5);
      ctx.save();
      ctx.globalAlpha = alphaOf(t.id) * arr.a;
      for (let i = 0; i < show; i += 1) {
        const stale = state.evidence.get(t.elementIds[i]!) === "stale";
        ctx.fillStyle = stale ? T.stale : T.accent;
        ctx.globalAlpha = alphaOf(t.id) * arr.a * (stale ? 1 : 0.85);
        hexPath(ctx, x - w / 2 + i * sp, py, pr);
        ctx.fill();
      }
      if (n > 8 && band === "names") {
        ctx.globalAlpha = alphaOf(t.id) * arr.a;
        ctx.font = HEX_FONTS.meta;
        ctx.fillStyle = T.inkMeta;
        ctx.textAlign = "left";
        ctx.fillText(`+${n - show}`, x - w / 2 + show * sp - 2, py + 3.5);
      }
      ctx.restore();
    }
  }

  /* ── far band: one nameplate per region, floating in the moat, never over a tile ── */
  if (band === "regions") {
    const tileRects = layout.tiles.map((t) => ({ x0: sx(t.x) - RI, x1: sx(t.x) + RI, y0: sy(t.y) - FAPO, y1: sy(t.y) + FAPO }));
    const clash = (b: { x0: number; y0: number; x1: number; y1: number }) =>
      tileRects.some((r) => r.x1 > b.x0 && r.x0 < b.x1 && r.y1 > b.y0 && r.y0 < b.y1) ||
      plateBoxes.some((p) => p.x < b.x1 && b.x0 < p.x + p.w && p.y < b.y1 && b.y0 < p.y + p.h);
    const plate = (id: string, name: string, sub: string, cells: readonly { x: number; y: number }[], warm: boolean) => {
      ctx.font = HEX_FONTS.plate;
      const nw = ctx.measureText(name).width;
      ctx.font = HEX_FONTS.plateMeta;
      const subW = sub ? ctx.measureText(sub).width : 0;
      const w = nw + (sub ? subW + 10 : 0) + 24;
      const h = 24;
      const xs = cells.map((c) => sx(c.x));
      const ys = cells.map((c) => sy(c.y));
      const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
      const top = Math.min(...ys) - APO;
      const bottom = Math.max(...ys) + APO;
      let pick: { x: number; y: number } | null = null;
      search: for (const dx of [0, -0.25, 0.25, -0.5, 0.5, -0.8, 0.8]) {
        for (const y of [top - 16, bottom + 16, top - 30, bottom + 30, top - 46, bottom + 46]) {
          const x = cx + dx * w;
          if (!clash({ x0: x - w / 2 - 3, y0: y - h / 2 - 3, x1: x + w / 2 + 3, y1: y + h / 2 + 3 })) {
            pick = { x, y };
            break search;
          }
        }
      }
      pick ??= { x: cx, y: top - 16 };
      const x0 = pick.x - w / 2;
      const y0 = pick.y - h / 2;
      ctx.save();
      ctx.globalAlpha = (lit && !lit.has(id) ? 1 - dimT * 0.4 : 1) * routesAlpha;
      ctx.beginPath();
      ctx.roundRect(x0, y0, w, h, h / 2);
      ctx.fillStyle = T.ground;
      ctx.fill();
      ctx.strokeStyle = warm ? T.hub : T.plateStroke;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      ctx.font = HEX_FONTS.plate;
      ctx.fillStyle = warm ? T.hub : T.inkHi;
      ctx.fillText(name, x0 + 12, pick.y + 4.5);
      if (sub) {
        ctx.font = HEX_FONTS.plateMeta;
        ctx.fillStyle = sub.includes("◐") ? T.staleInk : T.ink;
        ctx.textAlign = "right";
        ctx.fillText(sub, x0 + w - 12, pick.y + 4.5);
      }
      ctx.restore();
      plateBoxes.push({ id, x: x0, y: y0, w, h });
      stats.plates += 1;
    };
    for (const region of layout.regions) {
      const d = layout.byId.get(region.domainId)!;
      plate(region.domainId, d.name, state.plateSub.get(region.domainId) ?? "", region.cells.map(([q, r]) => ({ x: 1.5 * q, y: SQRT3 * (r + q / 2) })), false);
    }
    if (layout.project) plate(layout.project.id, layout.project.name, "", [{ x: layout.project.x, y: layout.project.y }], true);
  }

  ctx.restore();
  return { stats, textBoxes, plateBoxes };
}
