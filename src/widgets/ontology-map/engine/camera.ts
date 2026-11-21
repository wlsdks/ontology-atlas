/**
 * Springs the live camera toward its target, frame by frame: `spring.ts` per axis, `momentum.ts`
 * for the flick landing. Fit geometry lives in `ui/camera/camera-target/`.
 */

import { stepSpring, type SpringAxisState } from "./spring";

export interface CameraAxes {
  x: SpringAxisState;
  y: SpringAxisState;
  scale: SpringAxisState;
}

export interface CameraTarget {
  tx: number;
  ty: number;
  tscale: number;
}

export interface PanBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface CameraStepInput {
  camera: CameraAxes;
  target: CameraTarget;
  /** Seconds since the last frame, already clamped by the caller. */
  dt: number;
  damping: number;
  /** ω, rad/s; the caller passes the interactive token during a live wheel gesture, else the transition token. */
  angularFrequency: number;
  scaleMin: number;
  scaleMax: number;
  /** World-space soft pan limits; omit to skip the elastic clamp. */
  panBounds?: PanBounds;
  /** True while the pointer drags; the elastic clamp is skipped so 1:1 tracking is never fought. */
  isDragging?: boolean;
}

/**
 * Scale is always critically damped (ζ = 1) whatever `damping` says, and clamped to
 * `[scaleMin, scaleMax]`; x/y are pulled back toward `panBounds` unless dragging.
 */
const SCALE_CRITICAL_DAMPING = 1.0;
/**
 * The rubber-band return is proportional to time, so the feel is the same at any refresh rate;
 * `tau` is back-computed from 14% pull and 15% velocity bleed per 60 Hz frame.
 */
const REFERENCE_FRAME_SECONDS = 1 / 60;
const PAN_BOUNDS_PULL_PER_REFERENCE_FRAME = 0.14;
const PAN_BOUNDS_VELOCITY_RETENTION_PER_REFERENCE_FRAME = 0.85;
const PAN_BOUNDS_PULL_TAU_SECONDS =
  -REFERENCE_FRAME_SECONDS / Math.log(1 - PAN_BOUNDS_PULL_PER_REFERENCE_FRAME);
const PAN_BOUNDS_VELOCITY_TAU_SECONDS =
  -REFERENCE_FRAME_SECONDS / Math.log(PAN_BOUNDS_VELOCITY_RETENTION_PER_REFERENCE_FRAME);

/** Slack past the world's node bounding box. */
const DEFAULT_PAN_BOUNDS_MARGIN = 320;

export function computePanBounds(
  worldBounds: PanBounds,
  margin: number = DEFAULT_PAN_BOUNDS_MARGIN,
): PanBounds {
  return {
    minX: worldBounds.minX - margin,
    minY: worldBounds.minY - margin,
    maxX: worldBounds.maxX + margin,
    maxY: worldBounds.maxY + margin,
  };
}

/** Hard clamp for a flick's projected landing target; `clampAxisToPanBounds` is the per-frame elastic one. */
export function clampPointToPanBounds(
  x: number,
  y: number,
  panBounds: PanBounds,
): { x: number; y: number } {
  return {
    x: Math.min(panBounds.maxX, Math.max(panBounds.minX, x)),
    y: Math.min(panBounds.maxY, Math.max(panBounds.minY, y)),
  };
}

function clampAxisToPanBounds(
  axis: SpringAxisState,
  min: number,
  max: number,
  dt: number,
): SpringAxisState {
  if (axis.value >= min && axis.value <= max) return axis;
  const target = Math.min(max, Math.max(min, axis.value));
  const pull = 1 - Math.exp(-dt / PAN_BOUNDS_PULL_TAU_SECONDS);
  const retention = Math.exp(-dt / PAN_BOUNDS_VELOCITY_TAU_SECONDS);
  return {
    value: axis.value + (target - axis.value) * pull,
    velocity: axis.velocity * retention,
  };
}

export function stepCamera(input: CameraStepInput): CameraAxes {
  const { camera, target, dt, damping, angularFrequency, scaleMin, scaleMax, panBounds, isDragging } = input;
  let x = stepSpring(camera.x, target.tx, dt, angularFrequency, damping);
  let y = stepSpring(camera.y, target.ty, dt, angularFrequency, damping);
  const steppedScale = stepSpring(
    camera.scale,
    target.tscale,
    dt,
    angularFrequency,
    SCALE_CRITICAL_DAMPING,
  );
  const scale: SpringAxisState = {
    value: Math.min(scaleMax, Math.max(scaleMin, steppedScale.value)),
    velocity: steppedScale.velocity,
  };

  if (panBounds && !isDragging) {
    x = clampAxisToPanBounds(x, panBounds.minX, panBounds.maxX, dt);
    y = clampAxisToPanBounds(y, panBounds.minY, panBounds.maxY, dt);
  }

  return { x, y, scale };
}
