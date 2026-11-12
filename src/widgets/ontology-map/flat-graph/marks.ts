import { mixOver } from "../dial/ink";
import type { DialModel, Point } from "../dial/types";
import { byId } from "./seed";
import type { GraphLine } from "./attention";
import type { FlatGraphLayout, FlatGraphPaintTokens } from "./types";

export type GraphKind = "project" | "domain" | "capability" | "element";

export function zoomGrowth(zoomRatio: number, tokens: Pick<FlatGraphPaintTokens, "shrinkMin" | "growthMax">): number {
  return Math.min(tokens.growthMax, Math.max(tokens.shrinkMin, Math.sqrt(Math.max(0, zoomRatio))));
}

/** Capability radius follows the square root of its element count. */
export function graphDiscRadiusPx(kind: GraphKind, elementCount: number, tokens: FlatGraphPaintTokens, growth: number): number {
  if (kind === "project") return tokens.projectDiscPx * growth;
  if (kind === "domain") return tokens.domainDiscPx * growth;
  if (kind === "element") return tokens.elementDotPx * growth;
  return Math.min(tokens.capDiscMaxPx, tokens.capDiscMinPx + tokens.capDiscGainPx * Math.sqrt(elementCount)) * growth;
}

export function smoothstep(from: number, to: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from || 1)));
  return t * t * (3 - 2 * t);
}

export interface RestArc { key: string; from: string; to: string; count: number }

const arcsCache = new WeakMap<DialModel, Map<number, RestArc[]>>();

/** Directed domain dependencies, strongest first, cut to the budget. O(F log F) once per model. */
export function restArcs(model: DialModel, budget: number): readonly RestArc[] {
  let byBudget = arcsCache.get(model);
  if (!byBudget) {
    byBudget = new Map();
    arcsCache.set(model, byBudget);
  }
  let hit = byBudget.get(budget);
  if (!hit) {
    const all: RestArc[] = [];
    for (const f of model.flows) {
      if (f.relatesOnly || f.a === f.b) continue;
      if (f.ab > 0) all.push({ key: `${f.a}>${f.b}`, from: f.a, to: f.b, count: f.ab });
      if (f.ba > 0) all.push({ key: `${f.b}>${f.a}`, from: f.b, to: f.a, count: f.ba });
    }
    hit = all.sort((p, q) => q.count - p.count || byId(p.key, q.key)).slice(0, Math.max(0, Math.round(budget)));
    byBudget.set(budget, hit);
  }
  return hit;
}

const starReachCache = new WeakMap<FlatGraphLayout, Map<string, number>>();

/**
 * World distance from a domain's disc to its farthest member mark: where the domain's own lines
 * leave its lit star, so they never run under its members. O(members) once per layout.
 */
function domainStarReach(layout: FlatGraphLayout, domainId: string): number {
  let byDomain = starReachCache.get(layout);
  if (!byDomain) {
    byDomain = new Map();
    for (const c of layout.clusters) {
      const home = layout.positions.get(c.domainId) ?? c.centre;
      let reach = 0;
      const reachTo = (id: string) => {
        const at = layout.itemAt.get(id) ?? layout.positions.get(id);
        if (at) reach = Math.max(reach, Math.hypot(at.x - home.x, at.y - home.y));
      };
      for (const it of c.items) {
        reachTo(it.id);
        for (const el of it.elementIds) reachTo(el);
      }
      byDomain.set(c.domainId, reach);
    }
    starReachCache.set(layout, byDomain);
  }
  return byDomain.get(domainId) ?? 0;
}

/** The least share of a domain line its end trims leave drawn. */
const DOMAIN_LINE_KEPT = 0.3;

/** A domain line's trimmed end keeps short of its bow's control point by this share, so the curve never doubles back. */
const DOMAIN_LINE_CONTROL_KEPT = 0.8;

/**
 * Writes into `out` the trims, in screen px, at which a lit line leaves `from` and reaches `to`
 * (`length` px apart): each disc, a taper's point short of the disc it reaches, and a domain line's
 * own end outside its member star. The frame draws and the names avoid the curve these trims cut.
 */
export function litLineTrimsInto(
  out: Float64Array, layout: FlatGraphLayout, line: Pick<GraphLine, "from" | "to" | "kind">, length: number, scale: number, growth: number,
  discFrom: number, discTo: number, P: Pick<FlatGraphPaintTokens, "arcTrimPx" | "capDiscMaxPx" | "lineBow">,
): void {
  let trimStart = discFrom;
  let trimEnd = discTo + (line.kind === "needs" || line.kind === "neededBy" ? P.arcTrimPx / 2 : 0);
  if (layout.clusterByDomain.has(line.from) && layout.clusterByDomain.has(line.to)) {
    const own = line.kind === "needs" ? line.from : line.to;
    const star = domainStarReach(layout, own) * scale + P.capDiscMaxPx * growth;
    if (own === line.from) trimStart = Math.max(trimStart, star);
    else trimEnd = Math.max(trimEnd, star + P.arcTrimPx / 2);
    const trims = trimStart + trimEnd;
    const fit = Math.min(1, ((1 - DOMAIN_LINE_KEPT) * length) / trims);
    const toControl = DOMAIN_LINE_CONTROL_KEPT * length * Math.hypot(0.5, P.lineBow);
    trimStart = Math.min(trimStart * fit, toControl);
    trimEnd = Math.min(trimEnd * fit, toControl);
  }
  out[0] = trimStart;
  out[1] = trimEnd;
}

export interface ArcPath { a: Point; c: Point; b: Point; tip: Point; angle: number }

export function emptyArcPath(): ArcPath {
  const b = { x: 0, y: 0 };
  return { a: { x: 0, y: 0 }, c: { x: 0, y: 0 }, b, tip: b, angle: 0 };
}

function setPoint(p: Point, x: number, y: number): void {
  if (p.x !== x) p.x = x;
  if (p.y !== y) p.y = y;
}

/**
 * Writes a quadratic bowed to the left of travel, trimmed at both discs, into `path`; `tip` and
 * `angle` place the head. Unchanged values are not rewritten, so a still frame allocates nothing.
 * False when the discs leave no room for a curve.
 */
export function arcPathInto(path: ArcPath, from: Point, to: Point, bow: number, trimStart: number, trimEnd: number): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.hypot(dx, dy) <= trimStart + trimEnd + 1) return false;
  const cx = (from.x + to.x) / 2 - dy * bow;
  const cy = (from.y + to.y) / 2 + dx * bow;
  const toStart = Math.hypot(cx - from.x, cy - from.y) || 1;
  const toEnd = Math.hypot(to.x - cx, to.y - cy) || 1;
  const bx = to.x - ((to.x - cx) / toEnd) * trimEnd;
  const by = to.y - ((to.y - cy) / toEnd) * trimEnd;
  setPoint(path.c, cx, cy);
  setPoint(path.a, from.x + ((cx - from.x) / toStart) * trimStart, from.y + ((cy - from.y) / toStart) * trimStart);
  setPoint(path.b, bx, by);
  const angle = Math.atan2(by - cy, bx - cx);
  if (path.angle !== angle) path.angle = angle;
  return true;
}

export function hexRgb(hex: string): [number, number, number] {
  const h = hex.trim().replace("#", "");
  const full = h.length === 3 ? h.split("").map((ch) => ch + ch).join("") : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

export function rgbaOf(hex: string, alpha: number): string {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(Math.min(1, Math.max(0, alpha)) * 1000) / 1000})`;
}

const INK_LEVELS = 32;
const mixed = new Map<string, Map<string, string[]>>();

/** The ink pre-mixed over the ground at a quantised share, so a sunk disc stays opaque. */
export function sunk(ink: string, ground: string, share: number): string {
  const level = Math.round(Math.min(1, Math.max(0, share)) * INK_LEVELS);
  if (level >= INK_LEVELS) return ink;
  let byGround = mixed.get(ink);
  if (!byGround) mixed.set(ink, (byGround = new Map()));
  let levels = byGround.get(ground);
  if (!levels) byGround.set(ground, (levels = []));
  return (levels[level] ??= mixOver(ink, ground, level / INK_LEVELS));
}

const GLOW_SPRITE_PX = 64;
const LIGHT_SPRITE_PX = 256;
const GLOW_STOPS: readonly [number, number][] = [[0, 1], [0.22, 0.72], [0.45, 0.34], [0.7, 0.1], [1, 0]];
const glowSprites = new Map<string, CanvasImageSource | null>();
const lightSprites = new Map<string, CanvasImageSource | null>();

function radialSprite(cache: Map<string, CanvasImageSource | null>, ink: string, stops: readonly (readonly [number, number])[], px: number): CanvasImageSource | null {
  if (cache.has(ink)) return cache.get(ink)!;
  let sprite: CanvasImageSource | null = null;
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const half = px / 2;
      const g = ctx.createRadialGradient(half, half, 0, half, half, half);
      for (const [at, alpha] of stops) g.addColorStop(at, rgbaOf(ink, alpha));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, px, px);
      sprite = canvas;
    }
  }
  cache.set(ink, sprite);
  return sprite;
}

/** A cached radial glow per ink, drawn with drawImage so no frame pays for a blur. */
export function glowSprite(ink: string): CanvasImageSource | null {
  return radialSprite(glowSprites, ink, GLOW_STOPS, GLOW_SPRITE_PX);
}

/** A cached cluster light per hue at full strength; a frame scales it and sets `globalAlpha`. */
export function lightSprite(ink: string): CanvasImageSource | null {
  return radialSprite(lightSprites, ink, LIGHT_STOPS, LIGHT_SPRITE_PX);
}

/** Stops of an edgeless falloff: a Gaussian sampled densely enough that 8-bit steps do not band. */
const LIGHT_STOPS: readonly [number, number][] = Array.from({ length: 13 }, (_, i) => {
  const t = i / 12;
  return [t, Math.exp(-4.2 * t * t) * (1 - t)] as [number, number];
});
