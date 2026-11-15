import { MOMENTUM_TAU_MS, rubberband } from "../motion-physics";
import type { TreeLayout, TreePose, TreeProjector, TreeRect, TreeScreenPoint } from "./types";

const TAU = Math.PI * 2;

/** Always looking down: below the minimum the boughs stack into one line, above the maximum the trunk vanishes. */
const TREE_PITCH_MIN = 0.17;
const TREE_PITCH_MAX = 0.7;
const TREE_PITCH_REST = 0.42;
/** A pressed wall gives at most 0.55 x this, so the lower limit still looks from above. */
const TREE_PITCH_STRETCH_RAD = 0.16;

/** Below the minimum the whole tree is a small island; the maximum lets a leaf head fill the free area. */
const TREE_ZOOM_MIN = 0.75;
const TREE_ZOOM_MAX = 32;

/** Camera distance in tree radii: perspective that reads as depth without bending the crown. */
const TREE_CAMERA_DISTANCE_RADII = 3;
/** Share of the free area's shorter half-side the tree sphere's silhouette fills at zoom 1. */
const TREE_FIT_FILL = 0.94;
/** Below this the coast is at rest, or its exponential tail keeps the loop awake. */
const TREE_YAW_REST_RAD_PER_MS = 0.000005;

export const TREE_POSE_REST: Readonly<TreePose> = Object.freeze({
  yaw: 0,
  pitch: TREE_PITCH_REST,
  zoom: 1,
  panX: 0,
  panY: 0,
});

/** Orbits the tree's sphere centre; the camera looks along -z after yaw, from above by `pitch`. */
class OrbitTreeProjector implements TreeProjector {
  unit = 1;
  near = 0;
  far = 0;
  private centreX = 0;
  private centreY = 0;
  private centreZ = 0;
  private cosYaw = 1;
  private sinYaw = 0;
  private cosPitch = 1;
  private sinPitch = 0;
  private distance = 1;
  private zoom = 1;
  private originX = 0;
  private originY = 0;

  aim(
    layout: Pick<TreeLayout, "centre" | "radius">,
    pose: TreePose,
    canvas: { width: number; height: number },
    free: TreeRect,
  ): void {
    const hasFree = free.width > 0 && free.height > 0;
    const rectX = hasFree ? free.x : 0;
    const rectY = hasFree ? free.y : 0;
    const rectWidth = hasFree ? free.width : canvas.width;
    const rectHeight = hasFree ? free.height : canvas.height;
    const radius = layout.radius > 0 ? layout.radius : 1;
    this.centreX = layout.centre[0];
    this.centreY = layout.centre[1];
    this.centreZ = layout.centre[2];
    this.cosYaw = Math.cos(pose.yaw);
    this.sinYaw = Math.sin(pose.yaw);
    this.cosPitch = Math.cos(pose.pitch);
    this.sinPitch = Math.sin(pose.pitch);
    this.distance = radius * TREE_CAMERA_DISTANCE_RADII;
    this.zoom = pose.zoom;
    this.unit = (Math.max(0, Math.min(rectWidth, rectHeight)) / 2) * TREE_FIT_FILL / silhouetteRadius(radius);
    this.near = this.distance - radius;
    this.far = this.distance + radius;
    this.originX = rectX + rectWidth / 2 + pose.panX;
    this.originY = rectY + rectHeight / 2 + pose.panY;
  }

  project(x: number, y: number, z: number, out: TreeScreenPoint): void {
    const dx = x - this.centreX;
    const dy = y - this.centreY;
    const dz = z - this.centreZ;
    const across = this.cosYaw * dx + this.sinYaw * dz;
    const toward = -this.sinYaw * dx + this.cosYaw * dz;
    const up = this.cosPitch * dy - this.sinPitch * toward;
    const depth = this.distance - this.sinPitch * dy - this.cosPitch * toward;
    const scale = (this.zoom * this.distance) / depth;
    out.x = this.originX + across * this.unit * scale;
    out.y = this.originY - up * this.unit * scale;
    out.scale = scale;
    out.depth = depth;
  }
}

/** A sphere of `radius` centred on the view axis shows as a disc of this many world units at scale 1. */
function silhouetteRadius(radius: number): number {
  const d = TREE_CAMERA_DISTANCE_RADII;
  return (radius * d) / Math.sqrt(d * d - 1);
}

export function createTreeProjector(): TreeProjector {
  return new OrbitTreeProjector();
}

/** `zoom = 1` fits the tree's sphere in `free` at every yaw; `canvas` stands in when `free` is empty. */
export function aimTreeProjector(
  p: TreeProjector,
  layout: Pick<TreeLayout, "centre" | "radius">,
  pose: TreePose,
  canvas: { width: number; height: number },
  free: TreeRect,
): void {
  if (!(p instanceof OrbitTreeProjector)) throw new Error("aimTreeProjector needs a projector from createTreeProjector");
  p.aim(layout, pose, canvas, free);
}

export function clampTreePitch(pitch: number): number {
  return Math.min(TREE_PITCH_MAX, Math.max(TREE_PITCH_MIN, pitch));
}

/** While dragging past a limit the pitch follows less the further it goes; release settles on `clampTreePitch`. */
export function resistTreePitch(pitch: number): number {
  if (pitch > TREE_PITCH_MAX) return TREE_PITCH_MAX + rubberband(pitch - TREE_PITCH_MAX, TREE_PITCH_STRETCH_RAD);
  if (pitch < TREE_PITCH_MIN) return TREE_PITCH_MIN + rubberband(pitch - TREE_PITCH_MIN, TREE_PITCH_STRETCH_RAD);
  return pitch;
}

/** Zoom scales every screen offset about the projector's origin, so the pan solves exactly for any depth. */
export function zoomTreePoseAbout(
  pose: TreePose,
  factor: number,
  x: number,
  y: number,
  free: TreeRect,
  out: TreePose,
): void {
  const zoom = Math.min(TREE_ZOOM_MAX, Math.max(TREE_ZOOM_MIN, pose.zoom * factor));
  const ratio = zoom / pose.zoom;
  const offsetX = x - (free.x + free.width / 2);
  const offsetY = y - (free.y + free.height / 2);
  out.yaw = pose.yaw;
  out.pitch = pose.pitch;
  out.zoom = zoom;
  out.panX = offsetX - (offsetX - pose.panX) * ratio;
  out.panY = offsetY - (offsetY - pose.panY) * ratio;
}

/** Geometric decay per ms on the shared momentum time constant, so the coast is frame-rate independent. */
export function decayTreeYawVelocity(radPerMs: number, dtMs: number): number {
  const next = radPerMs * Math.exp(-dtMs / MOMENTUM_TAU_MS);
  return Math.abs(next) < TREE_YAW_REST_RAD_PER_MS ? 0 : next;
}

/** The equivalent of `target` nearest `current`, so a turn never takes the long way round. */
function nearestYaw(target: number, current: number): number {
  return target + Math.round((current - target) / TAU) * TAU;
}

/** Turns the node to the near side the short way; pitch, zoom and pan stay as in `from`. */
export function treePoseFacing(layout: TreeLayout, node: number, from: TreePose, out: TreePose): void {
  const dx = layout.position[node * 3] - layout.centre[0];
  const dz = layout.position[node * 3 + 2] - layout.centre[2];
  const onAxis = Math.hypot(dx, dz) < 1e-6;
  // After yaw the node's offset toward the camera is r·sin(θ − yaw), greatest at yaw = θ − π/2.
  const yaw = onAxis ? from.yaw : nearestYaw(Math.atan2(dz, dx) - Math.PI / 2, from.yaw);
  out.pitch = from.pitch;
  out.zoom = from.zoom;
  out.panX = from.panX;
  out.panY = from.panY;
  out.yaw = yaw;
}

/** Zoom mixes geometrically so a zoom flight moves at an even visual rate; yaw takes the short way. */
export function mixTreePose(from: TreePose, to: TreePose, t: number, out: TreePose): void {
  const yaw = from.yaw + (nearestYaw(to.yaw, from.yaw) - from.yaw) * t;
  const pitch = from.pitch + (to.pitch - from.pitch) * t;
  const zoom = from.zoom * Math.pow(to.zoom / from.zoom, t);
  const panX = from.panX + (to.panX - from.panX) * t;
  const panY = from.panY + (to.panY - from.panY) * t;
  out.yaw = yaw;
  out.pitch = pitch;
  out.zoom = zoom;
  out.panX = panX;
  out.panY = panY;
}
