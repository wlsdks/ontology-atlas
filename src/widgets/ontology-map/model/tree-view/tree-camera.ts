import { MOMENTUM_TAU_MS, rubberband } from "../motion-physics";
import type { TreeLayout, TreePose, TreeProjector, TreeRect, TreeScreenPoint } from "./tree-shapes";

const TAU = Math.PI * 2;

/** Always looking down: below the minimum the boughs stack into one line, above the maximum the trunk vanishes. */
const TREE_PITCH_MIN = 0.17;
const TREE_PITCH_MAX = 0.7;
const TREE_PITCH_REST = 0.42;
/** The rubber band's overshoot approaches this, so a pressed lower wall still looks from above. */
const TREE_PITCH_STRETCH_RAD = 0.16;

/** Below the minimum the whole tree is a small island; the maximum lets a leaf head fill the free area. */
const TREE_ZOOM_MIN = 0.75;
const TREE_ZOOM_MAX = 32;

/** Camera distance in tree radii: perspective that reads as depth without bending the crown. */
const TREE_CAMERA_DISTANCE_RADII = 3;
/** Share of the free area's binding side the tree's swept silhouette fills at zoom 1. */
const TREE_FIT_FILL = 0.96;
/** Pitch steps of the silhouette table; the Lipschitz margin it costs is under 1% of the height. */
const TREE_FIT_PITCH_STEPS = 128;
/** Below this the coast is at rest, or its exponential tail keeps the loop awake. */
const TREE_YAW_REST_RAD_PER_MS = 0.000005;

export const TREE_POSE_REST: Readonly<TreePose> = Object.freeze({
  yaw: 0,
  pitch: TREE_PITCH_REST,
  zoom: 1,
  panX: 0,
  panY: 0,
});

/**
 * What the tree shows over every yaw, in world units at the orbit centre's depth (screen offset
 * divided by unit x zoom). `halfWidth` and `height` are the worst case over the settled pitch
 * range; `middleUp` is the swept box's vertical middle at each step of that range.
 */
interface TreeSilhouette {
  orbitY: number;
  radius: number;
  distance: number;
  halfWidth: number;
  height: number;
  middleUp: Float64Array;
}

const silhouettes = new WeakMap<TreeLayout, TreeSilhouette>();

/** O(V log V) once per layout; every later aim reads the cache in O(1). */
function silhouetteOf(layout: TreeLayout): TreeSilhouette {
  let silhouette = silhouettes.get(layout);
  if (!silhouette) {
    silhouette = scanSilhouette(layout);
    silhouettes.set(layout, silhouette);
  }
  return silhouette;
}

/**
 * A point at height y and distance r from the trunk axis sweeps a circle as the tree turns.
 * Over that circle the projected height is monotone in the point's offset toward the camera,
 * so its extremes sit at offsets +-r; the projected half-width peaks at r·D / sqrt(K² - cos²p·r²)
 * with K = D - sin p·(y - orbitY). Every level set of these is a line in the (r, y) plane, so
 * the extremes over the tree lie on the convex hull of its (r, y) profile.
 */
function scanSilhouette(layout: TreeLayout): TreeSilhouette {
  const { position, control } = layout;
  const count = layout.model.count;
  const orbitY = layout.centre[1];
  const profileR: number[] = [0];
  const profileY: number[] = [0];
  let farthest = Math.abs(orbitY);
  const addPoint = (x: number, y: number, z: number) => {
    const r = Math.hypot(x, z);
    profileR.push(r);
    profileY.push(y);
    farthest = Math.max(farthest, Math.hypot(r, y - orbitY));
  };
  for (let node = 0; node < count; node++) {
    addPoint(position[node * 3], position[node * 3 + 1], position[node * 3 + 2]);
    addPoint(control[node * 6], control[node * 6 + 1], control[node * 6 + 2]);
    addPoint(control[node * 6 + 3], control[node * 6 + 4], control[node * 6 + 5]);
  }
  const radius = Math.max(layout.radius, farthest) || 1;
  const distance = radius * TREE_CAMERA_DISTANCE_RADII;
  const hull = profileHull(profileR, profileY);
  const middleUp = new Float64Array(TREE_FIT_PITCH_STEPS + 1);
  const box = { top: 0, bottom: 0, halfWidth: 0 };
  let height = 0;
  let halfWidth = 0;
  for (let step = 0; step <= TREE_FIT_PITCH_STEPS; step++) {
    sweptBoxAt(pitchAtStep(step), hull, orbitY, distance, box);
    height = Math.max(height, box.top - box.bottom);
    halfWidth = Math.max(halfWidth, box.halfWidth);
    middleUp[step] = (box.top + box.bottom) / 2;
  }
  // Every projected coordinate moves at most `slope` per radian of pitch, so between steps the
  // box can grow by half a step's worth, and the interpolated middle can drift by as much.
  const slope = (distance * radius * (distance + 2 * radius)) / (distance - radius) ** 2;
  const stepRad = (TREE_PITCH_MAX - TREE_PITCH_MIN) / TREE_FIT_PITCH_STEPS;
  return {
    orbitY,
    radius,
    distance,
    halfWidth: halfWidth + (slope * stepRad) / 2,
    height: height + 2 * slope * stepRad,
    middleUp,
  };
}

function pitchAtStep(step: number): number {
  return TREE_PITCH_MIN + ((TREE_PITCH_MAX - TREE_PITCH_MIN) * step) / TREE_FIT_PITCH_STEPS;
}

/** Upper convex hull plus lower convex hull of the (r, y) points (monotone chain), as [r, y] pairs. */
function profileHull(rs: number[], ys: number[]): Float64Array {
  const order = rs.map((_, i) => i).sort((a, b) => rs[a] - rs[b] || ys[a] - ys[b]);
  const chain: number[] = [];
  const turnsLeft = (a: number, b: number, c: number) =>
    (rs[b] - rs[a]) * (ys[c] - ys[a]) - (ys[b] - ys[a]) * (rs[c] - rs[a]) > 0;
  for (const pass of [order, [...order].reverse()]) {
    const start = chain.length;
    for (const i of pass) {
      while (chain.length >= start + 2 && !turnsLeft(chain[chain.length - 2], chain[chain.length - 1], i)) chain.pop();
      chain.push(i);
    }
    chain.pop();
  }
  if (chain.length === 0) chain.push(order[0]);
  const hull = new Float64Array(chain.length * 2);
  chain.forEach((i, k) => {
    hull[k * 2] = rs[i];
    hull[k * 2 + 1] = ys[i];
  });
  return hull;
}

function sweptBoxAt(
  pitch: number,
  hull: Float64Array,
  orbitY: number,
  distance: number,
  out: { top: number; bottom: number; halfWidth: number },
): void {
  const cos = Math.cos(pitch);
  const sin = Math.sin(pitch);
  out.top = -Infinity;
  out.bottom = Infinity;
  out.halfWidth = 0;
  for (let k = 0; k < hull.length; k += 2) {
    const r = hull[k];
    const h = hull[k + 1] - orbitY;
    for (const toward of [r, -r]) {
      const up = (distance * (cos * h - sin * toward)) / (distance - sin * h - cos * toward);
      out.top = Math.max(out.top, up);
      out.bottom = Math.min(out.bottom, up);
    }
    const reach = distance - sin * h;
    out.halfWidth = Math.max(out.halfWidth, (distance * r) / Math.sqrt(reach * reach - cos * cos * r * r));
  }
}

/** The swept box's vertical middle at `pitch`, interpolated; overshoot past the range holds the end. */
function middleUpAt(silhouette: TreeSilhouette, pitch: number): number {
  const at = ((clampTreePitch(pitch) - TREE_PITCH_MIN) / (TREE_PITCH_MAX - TREE_PITCH_MIN)) * TREE_FIT_PITCH_STEPS;
  const step = Math.min(TREE_FIT_PITCH_STEPS - 1, Math.floor(at));
  const t = at - step;
  return silhouette.middleUp[step] * (1 - t) + silhouette.middleUp[step + 1] * t;
}

/** Orbits a point on the trunk axis; the camera looks along -z after yaw, from above by `pitch`. */
class OrbitTreeProjector implements TreeProjector {
  unit = 1;
  near = 0;
  far = 0;
  private orbitY = 0;
  private cosYaw = 1;
  private sinYaw = 0;
  private cosPitch = 1;
  private sinPitch = 0;
  private distance = 1;
  private zoom = 1;
  private originX = 0;
  private originY = 0;

  aim(layout: TreeLayout, pose: TreePose, canvas: { width: number; height: number }, free: TreeRect): void {
    const hasFree = hasArea(free);
    const rectX = hasFree ? free.x : 0;
    const rectY = hasFree ? free.y : 0;
    const rectWidth = hasFree ? free.width : canvas.width;
    const rectHeight = hasFree ? free.height : canvas.height;
    const silhouette = silhouetteOf(layout);
    this.orbitY = silhouette.orbitY;
    this.cosYaw = Math.cos(pose.yaw);
    this.sinYaw = Math.sin(pose.yaw);
    this.cosPitch = Math.cos(pose.pitch);
    this.sinPitch = Math.sin(pose.pitch);
    this.distance = silhouette.distance;
    this.zoom = pose.zoom;
    const widthUnit = silhouette.halfWidth > 0 ? rectWidth / (2 * silhouette.halfWidth) : Infinity;
    const heightUnit = silhouette.height > 0 ? rectHeight / silhouette.height : Infinity;
    const fitUnit = Math.min(widthUnit, heightUnit);
    this.unit = Number.isFinite(fitUnit) ? Math.max(0, fitUnit) * TREE_FIT_FILL : 1;
    this.near = silhouette.distance - silhouette.radius;
    this.far = silhouette.distance + silhouette.radius;
    this.originX = rectX + rectWidth / 2 + pose.panX;
    this.originY = rectY + rectHeight / 2 + pose.panY + middleUpAt(silhouette, pose.pitch) * this.unit * pose.zoom;
  }

  project(x: number, y: number, z: number, out: TreeScreenPoint): void {
    const dx = x;
    const dy = y - this.orbitY;
    const dz = z;
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

/** An empty free area makes the projector centre on the whole canvas instead. */
function hasArea(free: TreeRect): boolean {
  return free.width > 0 && free.height > 0;
}

export function createTreeProjector(): TreeProjector {
  return new OrbitTreeProjector();
}

/**
 * `zoom = 1` fits the tree's silhouette swept over every yaw in `free`, its box centred, with one
 * scale for the whole settled pitch range; `canvas` stands in when `free` is empty.
 */
export function aimTreeProjector(
  p: TreeProjector,
  layout: TreeLayout,
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
  out.yaw = pose.yaw;
  out.pitch = pose.pitch;
  out.zoom = zoom;
  // Without a free area the canvas centre is unknown here, so zoom keeps the pan (no anchor shift).
  if (!hasArea(free)) {
    out.panX = pose.panX;
    out.panY = pose.panY;
    return;
  }
  const offsetX = x - (free.x + free.width / 2);
  const offsetY = y - (free.y + free.height / 2);
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
  const dx = layout.position[node * 3];
  const dz = layout.position[node * 3 + 2];
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
