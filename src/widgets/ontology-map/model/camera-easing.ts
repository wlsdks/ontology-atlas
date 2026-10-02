/**
 * Programmatic camera moves (focus dive, cluster dive, fit, recenter) ease in and out with
 * a distance-proportional duration, where the interactive camera rides a spring. The loop
 * (`ui/use-topology-loop.ts`) owns the tween state and hands back to the spring when a
 * gesture interrupts. Durations are feel constants, not themable `--map-*` tokens.
 */

import type { CameraTarget } from "../engine/camera";
import { CAMERA_TWEEN_MAX_MS, CAMERA_TWEEN_MIN_MS, easeZoomScale, zoomStepProgress } from "./motion-physics";

export interface CameraKeyframe {
  x: number;
  y: number;
  scale: number;
}

/** Owned by the loop and cleared by a wheel or drag gesture to hand control back to the spring. */
export interface CameraTween {
  start: CameraKeyframe;
  target: CameraKeyframe;
  /** `performance.now()`-compatible, the rAF clock. */
  startMs: number;
  durationMs: number;
  /** `"out"` decelerates only, for the 3D fly-to that moves the instant a double-click lands. */
  ease?: "out";
  altitude?: CameraTweenAltitude;
}

export type CameraTweenAltitude = "follows-camera" | "held-at-target";

export function easeOutCubic(t: number): number {
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return 1 - Math.pow(1 - c, 3);
}

/** Derived from `motion-physics.ts` so the motion constants have one home. */
export const CAMERA_TRANSITION_MIN_MS = CAMERA_TWEEN_MIN_MS;
export const CAMERA_TRANSITION_MAX_MS = CAMERA_TWEEN_MAX_MS;

/**
 * Screen-pan distance (px) that alone earns the full duration; pan is world Δ × mean
 * scale, so the same leap takes longer zoomed in.
 */
const REF_PAN_PX = 1400;
/** Zoom distance in octaves (|log2(scaleRatio)|) that alone earns the full duration. */
const REF_ZOOM_OCTAVES = 2.2;

const SCALE_EPSILON = 1e-6;

/** Clamps `t`; zero slope at both ends, so the camera leaves and arrives at rest. */
export function easeInOutCubic(t: number): number {
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/**
 * Clamped to `[CAMERA_TRANSITION_MIN_MS, CAMERA_TRANSITION_MAX_MS]`; either the pan or the
 * zoom term reaching its reference saturates to the max.
 */
export function cameraTransitionDurationMs(start: CameraKeyframe, target: CameraKeyframe): number {
  const panWorld = Math.hypot(target.x - start.x, target.y - start.y);
  const avgScale = (Math.max(start.scale, SCALE_EPSILON) + Math.max(target.scale, SCALE_EPSILON)) / 2;
  const panScreen = panWorld * avgScale;
  const zoomOctaves = Math.abs(
    Math.log2(Math.max(target.scale, SCALE_EPSILON) / Math.max(start.scale, SCALE_EPSILON)),
  );
  const normalized = panScreen / REF_PAN_PX + zoomOctaves / REF_ZOOM_OCTAVES;
  const span = CAMERA_TRANSITION_MAX_MS - CAMERA_TRANSITION_MIN_MS;
  return Math.min(
    CAMERA_TRANSITION_MAX_MS,
    CAMERA_TRANSITION_MIN_MS + Math.min(1, normalized) * span,
  );
}

/**
 * van Wijk & Nuij, Smooth and Efficient Zooming and Panning (InfoVis 2003,
 * https://vanwijk.win.tue.nl/zoompan.pdf): the path of constant perceived optical flow,
 * pulling back, travelling and diving in; d3 `interpolateZoom` is the same formula. Zoom
 * interpolates in log space and the camera pulls back further on longer trips. ρ = 1.42
 * is the paper's optimum. `easeInOutCubic` still warps progress along the path, so the
 * camera leaves and arrives at rest. O(1) per frame.
 */
export const VAN_WIJK_RHO = 1.42;

/** Scale to the world width on screen, van Wijk's `w`; the formula needs both in world units. */
function worldWidthFor(scale: number, viewportWidthPx: number): number {
  return viewportWidthPx / Math.max(scale, SCALE_EPSILON);
}

/** `p` is already eased; the width is required because the formula runs on travel over visible width. */
export function vanWijkCameraKeyframe(
  start: CameraKeyframe,
  target: CameraKeyframe,
  p: number,
  viewportWidthPx: number,
  rho = VAN_WIJK_RHO,
): CameraKeyframe {
  const w0 = worldWidthFor(start.scale, viewportWidthPx);
  const w1 = worldWidthFor(target.scale, viewportWidthPx);
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const d2 = dx * dx + dy * dy;
  const d1 = Math.sqrt(d2);
  const rho2 = rho * rho;
  const rho4 = rho2 * rho2;

  // A pure zoom degenerates to 0/0, so fall back to log interpolation, or zooming in place yields NaN.
  if (d2 < 1e-9) {
    const w = w0 * Math.pow(w1 / w0, p);
    return { x: target.x, y: target.y, scale: viewportWidthPx / w };
  }

  const b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1);
  const b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1);
  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
  const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
  const S = (r1 - r0) / rho;

  // S near 0 means the two states are effectively identical.
  if (!Number.isFinite(S) || Math.abs(S) < 1e-9) {
    return { x: target.x, y: target.y, scale: target.scale };
  }

  const s = p * S;
  const coshr0 = Math.cosh(r0);
  const u = (w0 / rho2) * (coshr0 * Math.tanh(rho * s + r0) - Math.sinh(r0));
  const w = (w0 * coshr0) / Math.cosh(rho * s + r0);
  return {
    x: start.x + (u / d1) * dx,
    y: start.y + (u / d1) * dy,
    scale: viewportWidthPx / w,
  };
}

export function easeCameraKeyframe(
  start: CameraKeyframe,
  target: CameraKeyframe,
  elapsedMs: number,
  durationMs: number,
  /** Given, the move takes the van Wijk path; omitted, per-axis linear interpolation. */
  viewportWidthPx?: number,
  ease?: "out",
): CameraKeyframe {
  const p = durationMs <= 0 ? 1 : elapsedMs / durationMs;
  const e = ease === "out" ? easeOutCubic(p) : easeInOutCubic(p);
  if (viewportWidthPx !== undefined && viewportWidthPx > 0) {
    // Pin the endpoints exactly, or rounding drift hardens into the next gesture's anchor.
    if (p <= 0) return { ...start };
    if (p >= 1) return { ...target };
    return vanWijkCameraKeyframe(start, target, e, viewportWidthPx);
  }
  return {
    x: start.x + (target.x - start.x) * e,
    y: start.y + (target.y - start.y) * e,
    scale: start.scale + (target.scale - start.scale) * e,
  };
}

export interface ZoomEase {
  target: CameraTarget;
  anchorX: number;
  anchorY: number;
  worldX: number;
  worldY: number;
  fromScale: number;
  startMs: number;
}

export function easeAnchoredZoom(
  ease: ZoomEase,
  nowMs: number,
  width: number,
  height: number,
): CameraKeyframe & { done: boolean } {
  const progress = zoomStepProgress(nowMs - ease.startMs);
  if (progress >= 1) return { x: ease.target.tx, y: ease.target.ty, scale: ease.target.tscale, done: true };
  const scale = easeZoomScale(ease.fromScale, ease.target.tscale, progress);
  return {
    x: ease.worldX - (ease.anchorX - width / 2) / scale,
    y: ease.worldY - (ease.anchorY - height / 2) / scale,
    scale,
    done: false,
  };
}
