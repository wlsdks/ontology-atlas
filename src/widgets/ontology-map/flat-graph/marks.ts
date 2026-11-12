import { mixOver } from "../dial/ink";
import type { DialModel, Point } from "../dial/types";
import { byId } from "./seed";
import type { FlatGraphPaintTokens } from "./types";

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

export interface ArcPath { a: Point; c: Point; b: Point; tip: Point; angle: number }

/** A quadratic bowed to the left of travel, trimmed at both discs; `tip` and `angle` place the head. */
export function arcPath(from: Point, to: Point, bow: number, trimStart: number, trimEnd: number): ArcPath | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length <= trimStart + trimEnd + 1) return null;
  const c = { x: (from.x + to.x) / 2 - dy * bow, y: (from.y + to.y) / 2 + dx * bow };
  const toStart = Math.hypot(c.x - from.x, c.y - from.y) || 1;
  const toEnd = Math.hypot(to.x - c.x, to.y - c.y) || 1;
  const a = { x: from.x + ((c.x - from.x) / toStart) * trimStart, y: from.y + ((c.y - from.y) / toStart) * trimStart };
  const b = { x: to.x - ((to.x - c.x) / toEnd) * trimEnd, y: to.y - ((to.y - c.y) / toEnd) * trimEnd };
  return { a, c, b, tip: b, angle: Math.atan2(b.y - c.y, b.x - c.x) };
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
