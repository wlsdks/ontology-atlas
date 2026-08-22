/**
 * Camera transition easing — the reusable pure core behind v2's programmatic
 * camera moves (focus dive, cluster-disc dive, "fit view"/relayout recenter).
 *
 * WHY (S3 finishing polish, designed by fable): the interactive camera rides a critically-
 * damped spring (`engine/camera.ts`) — an ease-OUT curve that starts fast and
 * decays. For a PROGRAMMATIC move (the user clicked a node, we're taking them
 * somewhere) a symmetric ease-in-out reads more deliberate and cinematic: the
 * camera accelerates out of rest, cruises, and settles — van Wijk's "smooth
 * and efficient zooming and panning" (2004) in spirit, with a distance-
 * proportional duration so a small nudge is quick and a big leap is given time
 * to be legible. This module is the pure, viewport-agnostic math; the loop
 * (`ui/use-topology-loop.ts`) owns the tween STATE (start keyframe, start time)
 * and drives the camera through `easeCameraKeyframe` each frame while a
 * transition is in flight, handing back to the spring the instant an
 * interactive gesture (wheel/drag) interrupts.
 *
 * S4 (the "realm expansion" staging) will reuse `easeInOutCubic` + `easeCameraKeyframe`
 * directly — that's why the easing lives here as a standalone module rather
 * than inline in the loop.
 *
 * Constants (min/max duration, reference distances) are documented module
 * constants, not `--topology-v2-*` tokens — same "no token yet" precedent as
 * `engine/camera.ts#DEFAULT_PAN_BOUNDS_MARGIN` and
 * `ui/topology-pointer-handlers.ts#RIPPLE_PER_NEIGHBOR_DELAY_MS`. They govern
 * feel (timing), not a themable surface value.
 */

import { CAMERA_TWEEN_MAX_MS, CAMERA_TWEEN_MIN_MS } from "./motion-physics";

/** A camera state snapshot — the three animated axes, value-only (no velocity). */
export interface CameraKeyframe {
  x: number;
  y: number;
  scale: number;
}

/**
 * A live programmatic camera transition. Owned as a ref by
 * `ui/use-topology-loop.ts` (captured when a focus dive / cluster dive / fit
 * fires) and read each frame to drive the camera through `easeCameraKeyframe`;
 * an interactive gesture (wheel/drag, via `ui/topology-pointer-handlers.ts`)
 * clears it to hand control back to the spring.
 */
export interface CameraTween {
  start: CameraKeyframe;
  target: CameraKeyframe;
  /** `performance.now()`-compatible start timestamp (same clock as the rAF `now`). */
  startMs: number;
  durationMs: number;
}

/**
 * Clamp of the distance-proportional transition duration (ms). van Wijk's
 * spirit: never so short it snaps, never so long it drags. R4 (the motion
 * charter): derived from the house `CAMERA_TWEEN_MIN/MAX_MS` in `model/motion-physics.ts`
 * so the widget's motion feel constants have a single home — value unchanged.
 */
export const CAMERA_TRANSITION_MIN_MS = CAMERA_TWEEN_MIN_MS;
export const CAMERA_TRANSITION_MAX_MS = CAMERA_TWEEN_MAX_MS;

/**
 * Reference screen-pan distance (px) that, on its own, earns the full duration.
 * The pan term is measured in screen pixels (world Δ × the average of the two
 * scales) so the same world leap feels proportionally longer when zoomed in.
 */
const REF_PAN_PX = 1400;
/**
 * Reference zoom distance, in octaves (|log2(scaleRatio)|), that on its own
 * earns the full duration. Doubling/halving the scale is ~1 octave.
 */
const REF_ZOOM_OCTAVES = 2.2;

const SCALE_EPSILON = 1e-6;

/**
 * Standard cubic ease-in-out on `[0,1]` (clamps `t` outside the unit range).
 * `0→0`, `1→1`, `0.5→0.5`; symmetric, C¹-continuous at the endpoints (zero
 * slope), so the camera leaves and arrives at rest.
 */
export function easeInOutCubic(t: number): number {
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/**
 * Distance-proportional transition duration (ms), clamped to
 * `[CAMERA_TRANSITION_MIN_MS, CAMERA_TRANSITION_MAX_MS]`. Combines a screen-
 * space pan term and a zoom-octave term; either alone reaching its reference
 * distance saturates to the max. Monotonic non-decreasing in both pan and zoom
 * distance. Pure — no viewport/DOM knowledge (pan is pre-projected via scale).
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
 * The eased camera keyframe at `elapsedMs` into a `durationMs` transition from
 * `start` to `target`. `elapsedMs ≤ 0` returns `start`; `elapsedMs ≥ durationMs`
 * (or a non-positive duration) returns `target` exactly. Each axis is a linear
 * interpolation warped by `easeInOutCubic` — including `scale`, so the zoom and
 * the pan arrive together.
 */
/**
 * **van Wijk optimal path — what the "looks like a lerp" impression actually was.**
 *
 * For a long time this module interpolated x, y and scale **each linearly** and
 * warped only time with ease-in-out. When the camera pans and zooms at once, that
 * combination makes **optical flow on screen explode**: while zoomed in, the same
 * world displacement becomes a far larger pixel displacement, so near things whip
 * across the frame. That is exactly the impression motion reviews call amateurish
 * — and the paper this file's original comment cited as *"van Wijk in spirit"*
 * solves precisely this problem.
 *
 * van Wijk & Nuij, *Smooth and Efficient Zooming and Panning*, InfoVis 2003
 * (https://vanwijk.win.tue.nl/zoompan.pdf) solves analytically for the path along
 * which **perceived optical flow is constant**. The result is a hyperbolic
 * trajectory where the camera **pulls back, travels, and dives in again**. d3's
 * `interpolateZoom` is the same formula.
 *
 * Two things are fixed at once:
 * - **Zoom interpolates in log space.** Interpolating magnification arithmetically
 *   puts the midpoint of 1→4 at 2.5; the value that reads as "halfway" is 2, the
 *   geometric mean. This alone changes how zooming feels.
 * - **Pan and zoom know about each other.** The further the trip, the further the
 *   camera pulls back, so what stays on screen in transit is context rather than
 *   blur streaks.
 *
 * ρ uses the paper's experimentally optimal **1.42** (d3's default √2 is
 * effectively the same).
 *
 * **The time warp is left alone.** The paper assumes constant-speed travel. In a
 * UI, leaving from rest and arriving at rest reads as being taken somewhere, so
 * the path is van Wijk's while the existing `easeInOutCubic` still warps only
 * **progress along that path**. No new easing is introduced.
 */
export const VAN_WIJK_RHO = 1.42;

/** Zoom → the world width the screen holds. This is van Wijk's `w`; the formula only
 * holds if both are in the same units. */
function worldWidthFor(scale: number, viewportWidthPx: number): number {
  return viewportWidthPx / Math.max(scale, SCALE_EPSILON);
}

/**
 * Camera state at progress `p` (0..1) along the path — `p` is already eased.
 *
 * `viewportWidthPx` is required because van Wijk's formula runs on the **ratio**
 * between travel distance (world) and visible width (world). Zoom alone cannot
 * produce that ratio.
 */
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

  // Pure zoom (no travel) — the hyperbolic solution degenerates to 0/0, so fall
  // back to log interpolation. Without this branch, zooming in place yields NaN.
  if (d2 < 1e-9) {
    const w = w0 * Math.pow(w1 / w0, p);
    return { x: target.x, y: target.y, scale: viewportWidthPx / w };
  }

  const b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1);
  const b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1);
  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
  const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
  const S = (r1 - r0) / rho;

  // S degenerates toward 0 (the two states are effectively identical) — snap to target.
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
  /**
   * Viewport width (px) — supplying it takes the **van Wijk optimal path** (see the
   * module doc-block); omitting it falls back to per-axis linear interpolation. It
   * is optional for one reason only: this function was born as pure,
   * viewport-agnostic math, and callers that still cannot supply a width must not
   * break.
   */
  viewportWidthPx?: number,
): CameraKeyframe {
  const p = durationMs <= 0 ? 1 : elapsedMs / durationMs;
  const e = easeInOutCubic(p);
  if (viewportWidthPx !== undefined && viewportWidthPx > 0) {
    // Pin the endpoints exactly: if rounding in the path maths leaves the arrival
    // a few world units off, that drift hardens into the anchor for the next gesture.
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
