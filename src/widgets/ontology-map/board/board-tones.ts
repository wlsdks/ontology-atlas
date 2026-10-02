import type { HexBoardTokens } from "../tokens/read-hex-board-tokens";

export type RGB = readonly [number, number, number];

export const BLACK: RGB = [0, 0, 0];
export const WHITE: RGB = [255, 255, 255];
export const WALL_SHADE = [0.58, 0.44, 0.3] as const;

const parsed = new Map<string, { rgb: RGB; a: number } | null>();

export function parse(css: string): { rgb: RGB; a: number } | null {
  const hit = parsed.get(css);
  if (hit !== undefined) return hit;
  const s = css.trim();
  let out: { rgb: RGB; a: number } | null = null;
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
  if (hex) {
    const h = hex[1]!.length <= 4 ? [...hex[1]!].map((d) => d + d).join("") : hex[1]!;
    const n = parseInt(h.slice(0, 6), 16);
    out = { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], a: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
  } else {
    const fn = /^rgba?\(([^)]+)\)$/i.exec(s);
    const p = fn ? fn[1]!.split(/[\s,/]+/).filter(Boolean).map(Number) : [];
    if (p.length >= 3 && p.slice(0, 3).every(Number.isFinite)) {
      out = { rgb: [p[0]!, p[1]!, p[2]!], a: p.length > 3 && Number.isFinite(p[3]!) ? p[3]! : 1 };
    }
  }
  parsed.set(css, out);
  return out;
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function cssOf(c: RGB): string {
  return `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`;
}

export function solid(css: string, ground: RGB, alphaScale = 1): RGB {
  const p = parse(css);
  if (!p) return ground;
  return mix(ground, p.rgb, Math.min(1, p.a * alphaScale));
}

interface Material {
  topCss: string;
  walls: readonly [string, string, string];
  bevelLight: string;
  bevelShade: string;
}

const materials = new WeakMap<HexBoardTokens, Map<string, Material>>();

function material(T: HexBoardTokens, key: string, flatTop: RGB, litTop: RGB, light: number): Material {
  let m = materials.get(T);
  if (!m) materials.set(T, (m = new Map()));
  const q = Math.round(light * 16) / 16;
  const k = `${key}|${q}`;
  let hit = m.get(k);
  if (!hit) {
    const top = mix(flatTop, litTop, q);
    hit = {
      topCss: cssOf(top),
      walls: [cssOf(mix(top, BLACK, WALL_SHADE[0])), cssOf(mix(top, BLACK, WALL_SHADE[1])), cssOf(mix(top, BLACK, WALL_SHADE[2]))],
      bevelLight: cssOf(mix(top, WHITE, 0.16)),
      bevelShade: cssOf(mix(top, BLACK, 0.25)),
    };
    m.set(k, hit);
  }
  return hit;
}

const tones = new WeakMap<HexBoardTokens, Map<string, string>>();

export function tone(T: HexBoardTokens, key: string, make: () => string): string {
  let m = tones.get(T);
  if (!m) tones.set(T, (m = new Map()));
  let v = m.get(key);
  if (v === undefined) m.set(key, (v = make()));
  return v;
}

export function tileMaterial(
  T: HexBoardTokens,
  kind: "project" | "domain" | "capability",
  bucket: number,
  ev: string,
  selected: boolean,
  hovered: boolean,
  light: number,
): Material {
  const ground = parse(T.ground)?.rgb ?? BLACK;
  if (selected || kind !== "capability") {
    const pair = selected ? T.faceSelected : kind === "domain" ? T.faceDomain : T.faceProject;
    const flat = mix(solid(pair[0], ground), solid(pair[1], ground), 0.5);
    return material(T, selected ? "sel" : kind, flat, mix(flat, WHITE, 0.07), light);
  }
  const b = Math.min(4, bucket + (hovered ? 1 : 0));
  const base = solid((ev === "stale" ? T.faceStale : T.face)[b]!, ground);
  const flat = mix(base, BLACK, 0.05);
  const lit =
    ev === "current"
      ? mix(mix(base, solid(T.accent, ground), 0.2), WHITE, 0.03)
      : ev === "stale"
        ? mix(base, solid(T.stale, ground), 0.08)
        : mix(base, BLACK, 0.12);
  return material(T, `${ev}|${b}`, flat, lit, light);
}

const hatchTiles = new Map<string, HTMLCanvasElement>();
const hatchPatterns = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();

export function hatch(ctx: CanvasRenderingContext2D, base: string, line: string): CanvasPattern | string {
  if (typeof document === "undefined") return base;
  const key = `${base}|${line}`;
  let byCtx = hatchPatterns.get(ctx);
  if (!byCtx) hatchPatterns.set(ctx, (byCtx = new Map()));
  const hit = byCtx.get(key);
  if (hit) return hit;
  let tile = hatchTiles.get(key);
  if (!tile) {
    tile = document.createElement("canvas");
    tile.width = 6;
    tile.height = 6;
    const g = tile.getContext("2d");
    if (!g) return base;
    g.fillStyle = base;
    g.fillRect(0, 0, 6, 6);
    g.strokeStyle = line;
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(-1, 7);
    g.lineTo(7, -1);
    g.moveTo(-1, 1);
    g.lineTo(1, -1);
    g.moveTo(5, 7);
    g.lineTo(7, 5);
    g.stroke();
    hatchTiles.set(key, tile);
  }
  const pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) return base;
  byCtx.set(key, pattern);
  return pattern;
}
