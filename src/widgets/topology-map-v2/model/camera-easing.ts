/**
 * Camera transition easing — the reusable pure core behind v2's programmatic
 * camera moves (focus dive, cluster-disc dive, "fit view"/relayout recenter).
 *
 * WHY (S3 마감 폴리시, fable 설계): the interactive camera rides a critically-
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
 * S4 ("영역 전개" 연출) will reuse `easeInOutCubic` + `easeCameraKeyframe`
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
 * spirit: never so short it snaps, never so long it drags. R4 (모션 헌법):
 * derived from the house `CAMERA_TWEEN_MIN/MAX_MS` in `model/motion-physics.ts`
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
export function easeCameraKeyframe(
  start: CameraKeyframe,
  target: CameraKeyframe,
  elapsedMs: number,
  durationMs: number,
): CameraKeyframe {
  const p = durationMs <= 0 ? 1 : elapsedMs / durationMs;
  const e = easeInOutCubic(p);
  return {
    x: start.x + (target.x - start.x) * e,
    y: start.y + (target.y - start.y) * e,
    scale: start.scale + (target.scale - start.scale) * e,
  };
}
