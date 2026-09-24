/**
 * **The lit hologram's light** — the 3D map's floors, emissive nodes, and evidence as light
 * (2026-09-25, owner-approved direction: "premium and refined, like a 3D model in a movie,
 * yet usable").
 *
 * Three pieces, all drawn by the existing canvas-2D engine:
 *
 * 1. **The stage** (`drawStrataStage`) — the Strata floors sampled by `model/strata-stage.ts`:
 *    a translucent disc per tier in its kind colour, a faint polar grid, and one sector band
 *    per domain. Grid lines take the same depth fog the rings and nodes take, so the floor
 *    recedes the way the data does.
 * 2. **Emissive light** (`drawEmissiveHalo`) — a radial halo in the node's kind colour, from
 *    0.55 at the disc to nothing at 3.5× its radius, added with `lighter` so overlapping light
 *    brightens rather than covers. Each colour is **rasterised once into a sprite** and only
 *    scaled per frame: no `shadowBlur`, no per-frame filter, so the cost of light is one
 *    `drawImage` per lit node whether the structure is still or turning.
 * 3. **Evidence as light** (`drawEvidenceRing`) — a node's evidence state decides how much it
 *    emits, and one mark says why when it emits less: `current` emits fully; `stale` keeps a
 *    dimmer core and wears a 1 px ring in the warning hue; `unknown` emits nothing and wears a
 *    dashed ring in its kind colour, so its kind is still readable while it is plainly not
 *    lit. Unknown is never drawn as current: a web session with no Git walk is all unknown,
 *    and the legend says so.
 *
 * Token-free by the `render/*` convention: every colour arrives as an `rgb` triple.
 */

export type Rgb = readonly [number, number, number];

export type EvidenceLight = "current" | "stale" | "unknown";

/** The halo's peak alpha at the disc edge, and how far out it reaches (× the disc radius). */
const EMISSIVE_HALO_PEAK_ALPHA = 0.55;
const EMISSIVE_HALO_REACH = 3.5;

/** Floors: disc fill, grid ink, band ink, and the lit band, as alpha of the kind colour. */
const STAGE_DISC_ALPHA = 0.08;
const STAGE_GRID_ALPHA = 0.14;
const STAGE_BAND_ALPHA = 0.16;
/** The second band strength, so two neighbouring domains do not fuse into one annulus. */
const STAGE_BAND_ALT_ALPHA = 0.07;
const STAGE_LIT_BAND_ALPHA = 0.24;

function rgba(rgb: Rgb, alpha: number): string {
  const a = alpha <= 0 ? 0 : alpha >= 1 ? 1 : alpha;
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a.toFixed(3)})`;
}

/** `"126 134 216"` or `"126, 134, 216"` (a `--color-kind-*-rgb` token) → a triple. */
export function parseRgbTriple(raw: string): Rgb | null {
  const parts = raw.trim().split(/[\s,]+/).map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some((v) => !Number.isFinite(v))) return null;
  return [parts[0], parts[1], parts[2]];
}

/** `#rrggbb` / `#rgb` → a triple; null for anything else. */
export function hexToRgb(hex: string): Rgb | null {
  const h = hex.trim();
  const full = /^#[0-9a-f]{3}$/i.test(h) ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
  if (!/^#[0-9a-f]{6}$/i.test(full)) return null;
  return [parseInt(full.slice(1, 3), 16), parseInt(full.slice(3, 5), 16), parseInt(full.slice(5, 7), 16)];
}

/** Mix two triples, `t` of the way from `a` to `b`, as `#rrggbb`. */
export function mixRgbHex(a: Rgb, b: Rgb, t: number): string {
  const k = t <= 0 ? 0 : t >= 1 ? 1 : t;
  const c = (i: number) => Math.round(a[i] + (b[i] - a[i]) * k).toString(16).padStart(2, "0");
  return `#${c(0)}${c(1)}${c(2)}`;
}

/**
 * What one frame of the lit 3D map is drawn from — assembled by the loop, read by the frame
 * draw. Kinds are keyed by name so this file stays free of the model's types.
 */
export interface DomeLightFrame {
  kindRgb: Readonly<Record<string, Rgb>>;
  warningRgb: Rgb;
  focusRgb: Rgb;
  /** node id → evidence state. An id that is absent is `unknown`; null means nothing measured. */
  evidence: ReadonlyMap<string, EvidenceLight> | null;
  /** Samples the Strata floors for this frame's lit sectors; null for arrangements with none. */
  sampleStage: ((litIds: ReadonlySet<string> | null) => StrataStageDraw) | null;
  /** Reduced motion: no particles. The light itself is still, so it stays. */
  reducedMotion: boolean;
}

/**
 * **Focus deepens the fog.** While a focus exists, everything outside the lit line takes an
 * extra depth factor from 1 at the front to 0.28 at the back, scaled by the focus ramp so it
 * arrives and leaves with the focus. The resting fog is untouched: with no focus this is 1.
 */
const FOCUS_FOG_FAR = 0.28;
export function focusFogFactor(u: number, focusRamp: number): number {
  if (focusRamp <= 0.001) return 1;
  const c = u <= 0 ? 0 : u >= 1 ? 1 : u;
  return 1 - focusRamp * (1 - FOCUS_FOG_FAR) * c;
}

/* ── Stage ─────────────────────────────────────────────────────────────── */

interface StagePathLike {
  kind: string;
  a: number;
  xs: readonly number[];
  ys: readonly number[];
  us: readonly number[];
  length: number;
}

export interface StrataStageDraw {
  discs: readonly StagePathLike[];
  grid: readonly StagePathLike[];
  spokes: readonly StagePathLike[];
  bands: readonly (StagePathLike & { alt: boolean; lit: boolean })[];
}

export interface StageInks {
  kindRgb: Readonly<Record<string, Rgb>>;
  /** The focus ink a lit band takes. */
  focusRgb: Rgb;
}

/** Depth fog quantised into this many buckets, so a grid is a handful of strokes, not hundreds. */
const FOG_BUCKETS = 6;
const bucketPaths: Path2D[] = [];

/**
 * Draws the floors, before the rings and relations — a floor is the stage, not an actor.
 * `project` maps a world point to the screen (the same projection the nodes used), `fog` is
 * the depth fog the nodes and rings take, and `presence` scales everything (1 at rest; the
 * focus sinks the floor with the rest of the structure).
 */
export function drawStrataStage(
  ctx: CanvasRenderingContext2D,
  stage: StrataStageDraw,
  inks: StageInks,
  project: (wx: number, wy: number) => { x: number; y: number },
  fog: (u: number) => number,
  presence: number,
): void {
  if (presence <= 0.01) return;
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = 1;

  // Discs — one fill each. A fill cannot fog per point; the disc is the faintest layer and a
  // single alpha keeps it a surface rather than a gradient that fights the grid's own fog.
  for (const disc of stage.discs) {
    const rgb = inks.kindRgb[disc.kind];
    if (!rgb || disc.length < 3) continue;
    ctx.fillStyle = rgba(rgb, STAGE_DISC_ALPHA * disc.a * presence);
    ctx.beginPath();
    for (let i = 0; i < disc.length; i += 1) {
      const p = project(disc.xs[i], disc.ys[i]);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Bands — filled annular sectors, over the disc and under the grid.
  for (const band of stage.bands) {
    const rgb = band.lit ? inks.focusRgb : inks.kindRgb[band.kind];
    if (!rgb || band.length < 4) continue;
    const alpha = band.lit ? STAGE_LIT_BAND_ALPHA : band.alt ? STAGE_BAND_ALT_ALPHA : STAGE_BAND_ALPHA;
    // A lit band is the one thing on the floor the focus asks you to look at, so it keeps its
    // strength while the rest of the floor sinks.
    ctx.fillStyle = rgba(rgb, alpha * band.a * (band.lit ? 1 : presence));
    ctx.beginPath();
    for (let i = 0; i < band.length; i += 1) {
      const p = project(band.xs[i], band.ys[i]);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Grid rings and spokes — hairlines in the kind colour, fogged by depth in buckets.
  ctx.lineWidth = 0.75;
  ctx.lineCap = "butt";
  ctx.setLineDash([]);
  const strokeFogged = (paths: readonly StagePathLike[]) => {
    const byKind = new Map<string, StagePathLike[]>();
    for (const path of paths) {
      const list = byKind.get(path.kind);
      if (list) list.push(path);
      else byKind.set(path.kind, [path]);
    }
    for (const [kind, list] of byKind) {
      const rgb = inks.kindRgb[kind];
      if (!rgb) continue;
      for (let b = 0; b < FOG_BUCKETS; b += 1) bucketPaths[b] = new Path2D();
      let a = 0;
      for (const path of list) {
        a = Math.max(a, path.a);
        for (let i = 0; i + 1 < path.length; i += 1) {
          const u = (path.us[i] + path.us[i + 1]) / 2;
          const bucket = Math.min(FOG_BUCKETS - 1, Math.floor(u * FOG_BUCKETS));
          const p0 = project(path.xs[i], path.ys[i]);
          const p1 = project(path.xs[i + 1], path.ys[i + 1]);
          bucketPaths[bucket].moveTo(p0.x, p0.y);
          bucketPaths[bucket].lineTo(p1.x, p1.y);
        }
      }
      for (let b = 0; b < FOG_BUCKETS; b += 1) {
        const u = (b + 0.5) / FOG_BUCKETS;
        const alpha = STAGE_GRID_ALPHA * a * presence * fog(u);
        if (alpha <= 0.004) continue;
        ctx.strokeStyle = rgba(rgb, alpha);
        ctx.stroke(bucketPaths[b]);
      }
    }
  };
  strokeFogged(stage.grid);
  strokeFogged(stage.spokes);

  ctx.globalAlpha = prevAlpha;
}

/* ── Emissive halo ─────────────────────────────────────────────────────── */

/** Sprite side in device pixels. The halo is a smooth gradient, so scaling it up is invisible. */
const HALO_SPRITE_PX = 128;
const haloSprites = new Map<string, HTMLCanvasElement | null>();

function haloSprite(rgb: Rgb): HTMLCanvasElement | null {
  const key = `${rgb[0]},${rgb[1]},${rgb[2]}`;
  const cached = haloSprites.get(key);
  if (cached !== undefined) return cached;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = HALO_SPRITE_PX;
  const g = canvas.getContext("2d");
  if (!g) {
    haloSprites.set(key, null);
    return null;
  }
  const c = HALO_SPRITE_PX / 2;
  // The gradient starts at the disc edge (1 / reach of the sprite radius) and falls to 0.
  const inner = c / EMISSIVE_HALO_REACH;
  const gradient = g.createRadialGradient(c, c, 0, c, c, c);
  const edge = inner / c;
  gradient.addColorStop(0, rgba(rgb, EMISSIVE_HALO_PEAK_ALPHA));
  gradient.addColorStop(edge, rgba(rgb, EMISSIVE_HALO_PEAK_ALPHA));
  gradient.addColorStop(edge + (1 - edge) * 0.35, rgba(rgb, EMISSIVE_HALO_PEAK_ALPHA * 0.28));
  gradient.addColorStop(1, rgba(rgb, 0));
  g.fillStyle = gradient;
  g.fillRect(0, 0, HALO_SPRITE_PX, HALO_SPRITE_PX);
  if (haloSprites.size > 64) haloSprites.clear();
  haloSprites.set(key, canvas);
  return canvas;
}

/**
 * Adds one node's light around a disc of screen radius `r`. `strength` is 0..1 of the full
 * halo; the composite and alpha are restored before returning.
 */
export function drawEmissiveHalo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  rgb: Rgb,
  strength: number,
): void {
  if (strength <= 0.01 || r <= 0) return;
  const sprite = haloSprite(rgb);
  if (!sprite) return;
  const half = r * EMISSIVE_HALO_REACH;
  const prevAlpha = ctx.globalAlpha;
  const prevOp = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = prevAlpha * Math.min(1, strength);
  ctx.drawImage(sprite, x - half, y - half, half * 2, half * 2);
  ctx.globalAlpha = prevAlpha;
  ctx.globalCompositeOperation = prevOp;
}

/* ── Evidence ──────────────────────────────────────────────────────────── */

/** How much light each evidence state emits, as a share of a current node's. */
export const EVIDENCE_EMISSION: Readonly<Record<EvidenceLight, number>> = {
  current: 1,
  stale: 0.4,
  unknown: 0,
};

/** Gap between a disc and its evidence ring, in screen px. */
const EVIDENCE_RING_GAP_PX = 2.5;
/** The unknown ring's dash — short enough to read as "broken" at a 4 px element. */
const UNKNOWN_DASH: readonly number[] = [2, 2.5];

/**
 * The one mark that says why a node emits less than a current one. Nothing for `current`.
 * Restores stroke state and alpha before returning.
 */
export function drawEvidenceRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  state: EvidenceLight,
  kindRgb: Rgb,
  warningRgb: Rgb,
  alpha: number,
): void {
  if (state === "current" || alpha <= 0.01) return;
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(x, y, r + EVIDENCE_RING_GAP_PX, 0, Math.PI * 2);
  if (state === "stale") {
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(warningRgb, 0.9 * alpha);
  } else {
    ctx.setLineDash(UNKNOWN_DASH as number[]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(kindRgb, 0.7 * alpha);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = prevAlpha;
}
