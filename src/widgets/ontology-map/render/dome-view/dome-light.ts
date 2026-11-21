/**
 * The lit hologram's light: Strata floors, emissive node halos and evidence rings on the canvas-2D
 * engine. Each halo colour is rasterised once into a sprite and only scaled per frame (no
 * `shadowBlur`). Unknown is never drawn as current. Token-free: colours arrive as `rgb` triples.
 */

import type { StrataLodState } from "../../model/dome-view/strata/strata-lod";

export type Rgb = readonly [number, number, number];

export type EvidenceLight = "current" | "stale" | "unknown";

/** The halo's peak alpha at the disc edge, and how far out it reaches (× the disc radius). */
const EMISSIVE_HALO_PEAK_ALPHA = 0.55;
const EMISSIVE_HALO_REACH = 3.5;

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

export function hexToRgb(hex: string): Rgb | null {
  const h = hex.trim();
  const full = /^#[0-9a-f]{3}$/i.test(h) ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
  if (!/^#[0-9a-f]{6}$/i.test(full)) return null;
  return [parseInt(full.slice(1, 3), 16), parseInt(full.slice(3, 5), 16), parseInt(full.slice(5, 7), 16)];
}

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
  /** Reduced motion: no particles. The light itself is still, so it stays. */
  reducedMotion: boolean;
  lod: StrataLodState | null;
}

/** While a focus exists, everything outside the lit line gains a depth factor from 1 (front) to 0.28 (back), scaled by the focus ramp; with no focus it is 1. */
const FOCUS_FOG_FAR = 0.28;
export function focusFogFactor(u: number, focusRamp: number): number {
  if (focusRamp <= 0.001) return 1;
  const c = u <= 0 ? 0 : u >= 1 ? 1 : u;
  return 1 - focusRamp * (1 - FOCUS_FOG_FAR) * c;
}

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

/** One node's light around a disc of screen radius `r`; `strength` is 0..1 of the full halo. Restores the composite and alpha. */
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
