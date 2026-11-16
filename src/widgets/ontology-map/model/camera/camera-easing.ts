/**
 * Programmatic camera moves (focus dive, cluster dive, fit, recenter) ease in and out with
 * a distance-proportional duration, where the interactive camera rides a spring. The loop
 * (`use-topology-loop.ts`) owns the tween state and hands back to the spring when a
 * gesture interrupts. Durations are feel constants, not themable `--map-*` tokens.
 */

import { SPRING, springSettleMs, springState } from "@/shared/motion/spring";
import { MOTION } from "@/shared/motion/tokens";
import type { CameraTarget } from "../../engine/camera";
import { CAMERA_TWEEN_MAX_MS, CAMERA_TWEEN_MIN_MS, easeZoomScale, zoomStepProgress } from "../motion-physics";

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
  ease?: CameraTweenEase;
  altitude?: CameraTweenAltitude;
  /** The speed a selection tween carries from the one it replaced; absent, it leaves at rest. */
  startSpeed?: CameraSpeed;
}

/** A camera's speed per ms: the pan in world units, the zoom in the natural log of the scale. */
export interface CameraSpeed {
  x: number;
  y: number;
  logScale: number;
}

export type CameraTweenAltitude = "follows-camera" | "held-at-target";

/** `"spring"`: the selection frame and its undo; a pan from rest rides `SPRING.canvas`, anything else `selectionKeyframe`. */
export type CameraTweenEase = "out" | "spring";

export function easeOutCubic(t: number): number {
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return 1 - Math.pow(1 - c, 3);
}

/** Derived from `motion-physics.ts` so the motion constants have one home. */
export const CAMERA_TRANSITION_MIN_MS = CAMERA_TWEEN_MIN_MS;
export const CAMERA_TRANSITION_MAX_MS = CAMERA_TWEEN_MAX_MS;

/** The canvas spring first reaches its target near 415 ms, so it ends inside the camera budget. */
export const CANVAS_SPRING_PAN_MS = Math.min(CAMERA_TRANSITION_MAX_MS, springSettleMs(SPRING.canvas));

/** A selection's zoom takes this long per octave it crosses. */
export const SELECTION_ZOOM_MS_PER_OCTAVE = MOTION.slow.duration * 1000;
/** A selection's zoom takes no longer than this, unless a shorter one would step past `SELECTION_ZOOM_STEP_MAX`. */
export const SELECTION_ZOOM_MAX_MS = 2 * SELECTION_ZOOM_MS_PER_OCTAVE;
/** The largest share a selection's zoom changes in one 60 Hz frame. */
export const SELECTION_ZOOM_STEP_MAX = 0.08;
const SIXTY_HZ_FRAME_MS = 1000 / 60;
/** Smoothstep's fastest speed, as a multiple of its mean. */
const SMOOTHSTEP_PEAK = 1.5;
/** A cubic Hermite that ends still never overshoots while its start slope is at most this multiple of its mean (Fritsch and Carlson, 1980). */
const HERMITE_MONOTONE_SLOPE = 3;
/** Below this many octaves a selection only pans, and rides the spring. */
const SELECTION_ZOOM_MIN_OCTAVES = 0.01;

const octavesBetween = (start: CameraKeyframe, target: CameraKeyframe) =>
  Math.abs(Math.log2(Math.max(target.scale, SCALE_EPSILON) / Math.max(start.scale, SCALE_EPSILON)));

/**
 * A selection frame's duration: the canvas spring's for a pan, else `SELECTION_ZOOM_MS_PER_OCTAVE`
 * for each octave of zoom, at least the spring's and at most `SELECTION_ZOOM_MAX_MS`, but never so
 * short that smoothstep's peak steps the zoom past `SELECTION_ZOOM_STEP_MAX` in a 60 Hz frame.
 */
export function selectionTweenDurationMs(start: CameraKeyframe, target: CameraKeyframe): number {
  const octaves = octavesBetween(start, target);
  if (octaves < SELECTION_ZOOM_MIN_OCTAVES) return CANVAS_SPRING_PAN_MS;
  const peakBoundMs = (SMOOTHSTEP_PEAK * octaves * Math.LN2 * SIXTY_HZ_FRAME_MS) / Math.log1p(SELECTION_ZOOM_STEP_MAX);
  return Math.max(CANVAS_SPRING_PAN_MS, Math.min(SELECTION_ZOOM_MAX_MS, octaves * SELECTION_ZOOM_MS_PER_OCTAVE), peakBoundMs);
}

/**
 * The start slope, as a multiple of the mean, of a Hermite from `from` to `to` over `durationMs`
 * leaving at `speedPerMs`: none against the travel, at most `HERMITE_MONOTONE_SLOPE` with it.
 */
function carriedSlope(from: number, to: number, speedPerMs: number, durationMs: number): number {
  const travel = to - from;
  if (travel === 0) return 0;
  return Math.min(HERMITE_MONOTONE_SLOPE, Math.max(0, (speedPerMs * durationMs) / travel));
}

/** The share of the way a cubic Hermite that leaves at `slope` times its mean and ends still has come at `t`. */
function hermiteShare(t: number, slope: number): number {
  return slope * (t * t * t - 2 * t * t + t) + t * t * (3 - 2 * t);
}

/** `hermiteShare`'s rate at `t`, per unit of `t`. */
function hermiteRate(t: number, slope: number): number {
  return slope * (3 * t * t - 4 * t + 1) + 6 * t * (1 - t);
}

/**
 * A selection's camera `elapsedMs` into `durationMs`: the log of the scale and each pan axis run a
 * cubic Hermite from the start and the speed it carries to the target at rest. From rest the curve
 * is smoothstep; the carried speed is clamped so the curve never overshoots or turns back. O(1).
 */
export function selectionKeyframe(start: CameraKeyframe, target: CameraKeyframe, startSpeed: CameraSpeed | undefined, elapsedMs: number, durationMs: number): CameraKeyframe {
  const t = durationMs <= 0 ? 1 : Math.min(1, Math.max(0, elapsedMs / durationMs));
  const fromLog = Math.log(Math.max(start.scale, SCALE_EPSILON));
  const toLog = Math.log(Math.max(target.scale, SCALE_EPSILON));
  const along = (from: number, to: number, speed: number) => from + (to - from) * hermiteShare(t, carriedSlope(from, to, speed, durationMs));
  return {
    x: along(start.x, target.x, startSpeed?.x ?? 0),
    y: along(start.y, target.y, startSpeed?.y ?? 0),
    scale: Math.exp(along(fromLog, toLog, startSpeed?.logScale ?? 0)),
  };
}

/** The speed a selection tween moves the camera at `elapsedMs`, for the selection that replaces it to carry. */
export function selectionTweenSpeed(tween: CameraTween, elapsedMs: number): CameraSpeed {
  const { start, target, durationMs, startSpeed } = tween;
  if (durationMs <= 0 || elapsedMs >= durationMs) return { x: 0, y: 0, logScale: 0 };
  if (!ridesSelectionCurve(start, target, startSpeed)) {
    const perMs = springState(SPRING.canvas, Math.max(0, elapsedMs) / 1000).v / 1000;
    return { x: (target.x - start.x) * perMs, y: (target.y - start.y) * perMs, logScale: 0 };
  }
  const t = Math.max(0, elapsedMs / durationMs);
  const fromLog = Math.log(Math.max(start.scale, SCALE_EPSILON));
  const toLog = Math.log(Math.max(target.scale, SCALE_EPSILON));
  const rate = (from: number, to: number, speed: number) => ((to - from) * hermiteRate(t, carriedSlope(from, to, speed, durationMs))) / durationMs;
  return {
    x: rate(start.x, target.x, startSpeed?.x ?? 0),
    y: rate(start.y, target.y, startSpeed?.y ?? 0),
    logScale: rate(fromLog, toLog, startSpeed?.logScale ?? 0),
  };
}

/** A selection that zooms, or that carries speed from the one it replaced, rides `selectionKeyframe`; a pan from rest rides the spring. */
function ridesSelectionCurve(start: CameraKeyframe, target: CameraKeyframe, startSpeed: CameraSpeed | undefined): boolean {
  return octavesBetween(start, target) >= SELECTION_ZOOM_MIN_OCTAVES || (startSpeed !== undefined && (startSpeed.x !== 0 || startSpeed.y !== 0 || startSpeed.logScale !== 0));
}

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
  ease?: CameraTweenEase,
  startSpeed?: CameraSpeed,
): CameraKeyframe {
  const p = durationMs <= 0 ? 1 : elapsedMs / durationMs;
  if (ease === "spring") {
    if (p >= 1) return { ...target };
    if (ridesSelectionCurve(start, target, startSpeed)) return selectionKeyframe(start, target, startSpeed, elapsedMs, durationMs);
    const e = springState(SPRING.canvas, Math.max(0, elapsedMs) / 1000).x;
    return {
      x: start.x + (target.x - start.x) * e,
      y: start.y + (target.y - start.y) * e,
      scale: start.scale + (target.scale - start.scale) * e,
    };
  }
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
