import { projectFlickLanding, sampleReleaseVelocity } from "../engine/momentum";
import { computeWheelZoomFactor, createPinchWheelStream, normalizeWheelDeltaY, readPinchWheel, shouldIgnoreWheelGlide } from "../interaction/wheel";
import { roomMovesRest } from "../morph/hex-marks";
import { cameraTransitionDurationMs, easeInOutCubic, vanWijkCameraKeyframe } from "../model/camera-easing";
import { easeZoomScale, MOMENTUM_TAU_MS, zoomStepProgress } from "../model/motion-physics";
import { IMPOSTOR_EXTENT } from "./draw/cosmos-paint";
import { MIN_STAR_SPACING, type CosmosGalaxy, type CosmosLayout } from "./layout/cosmos-layout";
import type { CosmosCamera, CosmosRoom, GalaxyPose } from "./cosmos-types";

const MAX_COSMOS_SCALE = 48 / MIN_STAR_SPACING;
const FOCUS_SCALE_CAP = 16 / MIN_STAR_SPACING;
const FLICK_REST_PX = 0.25;

export function galaxyMatrix(g: CosmosGalaxy, pose: GalaxyPose, camera: CosmosCamera, room: CosmosRoom, theta = pose.theta) {
  const k = camera.scale;
  const ca = Math.cos(g.angle);
  const sa = Math.sin(g.angle);
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const t = g.tilt;
  return {
    a: k * (ca * ct - t * sa * st),
    b: k * (sa * ct + t * ca * st),
    c: k * (-ca * st - t * sa * ct),
    d: k * (-sa * st + t * ca * ct),
    e: room.x + room.width / 2 + (pose.x - camera.x) * k,
    f: room.y + room.height / 2 + (pose.y - camera.y) * k,
  };
}

export function worldToScreen(camera: CosmosCamera, room: CosmosRoom, x: number, y: number): { x: number; y: number } {
  return { x: room.x + room.width / 2 + (x - camera.x) * camera.scale, y: room.y + room.height / 2 + (y - camera.y) * camera.scale };
}

export function screenToWorld(camera: CosmosCamera, room: CosmosRoom, x: number, y: number): { x: number; y: number } {
  return { x: camera.x + (x - room.x - room.width / 2) / camera.scale, y: camera.y + (y - room.y - room.height / 2) / camera.scale };
}

export function liveBandRadius(dpr: number): number {
  return 512 / (2 * dpr * IMPOSTOR_EXTENT);
}

export function overviewCamera(bounds: CosmosLayout["bounds"], room: CosmosRoom): { camera: CosmosCamera; overviewScale: number } {
  const scale = Math.min(room.width / (bounds.maxX - bounds.minX), (room.height - 36) / (bounds.maxY - bounds.minY)) * 0.97;
  return {
    camera: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 + 14 / Math.max(1e-6, scale), scale },
    overviewScale: scale,
  };
}

export function galaxyFitScale(galaxy: Pick<CosmosGalaxy, "extent">, room: CosmosRoom): number {
  return Math.min(room.width, room.height) / (galaxy.extent * 2 * 1.12);
}

function clampCosmosScale(scale: number, overviewScale: number): number {
  return Math.min(MAX_COSMOS_SCALE, Math.max(overviewScale * 0.5, scale));
}

function anchoredCamera(room: CosmosRoom, scale: number, screen: { x: number; y: number }, world: { x: number; y: number }): CosmosCamera {
  return { scale, x: world.x - (screen.x - room.x - room.width / 2) / scale, y: world.y - (screen.y - room.y - room.height / 2) / scale };
}

export function focusScale(input: { current: number; galaxy: Pick<CosmosGalaxy, "extent"> | null; room: CosmosRoom; overviewScale: number }): number {
  const { current, galaxy, room, overviewScale } = input;
  if (!galaxy) return Math.max(current, overviewScale);
  return Math.max(current, Math.min(galaxyFitScale(galaxy, room), FOCUS_SCALE_CAP));
}

function approachCamera(point: { x: number; y: number }, scale: number, room: CosmosRoom, free: CosmosRoom): CosmosCamera {
  return anchoredCamera(room, scale, { x: free.x + free.width / 2, y: free.y + free.height / 2 }, point);
}

export function framingCamera(bounds: CosmosLayout["bounds"], room: CosmosRoom, overviewScale: number): CosmosCamera {
  const fill = Math.min(room.width / Math.max(bounds.maxX - bounds.minX, 1e-6), room.height / Math.max(bounds.maxY - bounds.minY, 1e-6)) * 0.8;
  return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2, scale: clampCosmosScale(Math.min(FOCUS_SCALE_CAP, fill), overviewScale) };
}

export function memberBounds(layout: CosmosLayout, poses: readonly GalaxyPose[], ids: Iterable<string>): CosmosLayout["bounds"] | null {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const id of ids) {
    const p = posedPoint(layout, poses, id);
    if (!p) continue;
    b.minX = Math.min(b.minX, p.x);
    b.minY = Math.min(b.minY, p.y);
    b.maxX = Math.max(b.maxX, p.x);
    b.maxY = Math.max(b.maxY, p.y);
  }
  return Number.isFinite(b.minX) ? b : null;
}

export function cosmosMarks(layout: CosmosLayout, poses: readonly GalaxyPose[], camera: CosmosCamera, room: CosmosRoom): CosmosMark[] {
  const out: CosmosMark[] = layout.core.id ? [{ id: layout.core.id, ...worldToScreen(camera, room, 0, 0), r: 14, kind: "project" }] : [];
  layout.galaxies.forEach((g, i) => {
    out.push({ id: g.id, ...worldToScreen(camera, room, poses[i]?.x ?? g.x, poses[i]?.y ?? g.y), r: g.radius * camera.scale, kind: "domain" });
  });
  return out;
}

interface CosmosMark { id: string; x: number; y: number; r: number; kind: "project" | "domain" | "capability" | "element" }

export function posedPoint(layout: CosmosLayout, poses: readonly GalaxyPose[], id: string): { x: number; y: number } | null {
  const gi = layout.galaxyOf.get(id);
  if (gi === undefined) return null;
  if (gi < 0) return layout.points.get(id) ?? null;
  const g = layout.galaxies[gi]!;
  const pose = poses[gi]!;
  const si = g.starIds.indexOf(id);
  if (si < 0) return null;
  const m = galaxyMatrix(g, pose, { x: 0, y: 0, scale: 1 }, { x: 0, y: 0, width: 0, height: 0 });
  const u = g.starU[si]! * pose.condense;
  const v = g.starV[si]! * pose.condense;
  return { x: m.a * u + m.c * v + pose.x, y: m.b * u + m.d * v + pose.y };
}

type CosmosMotion =
  | { kind: "camera"; from: CosmosCamera; to: CosmosCamera; start: number; ms: number; width: number }
  | { kind: "zoom"; from: number; to: number; start: number; screen: Point; world: Point }
  | { kind: "pan"; from: CosmosCamera; to: CosmosCamera; start: number };

type Point = { x: number; y: number };
export interface FlickTuning { windowMs: number; minSpeed: number }

export class CosmosCameraRig {
  camera: CosmosCamera = { x: 0, y: 0, scale: 1 };
  room: CosmosRoom = { x: 0, y: 0, width: 1, height: 1 };
  overviewScale = 1;
  user = false;
  reducedMotion = false;
  private bounds: CosmosLayout["bounds"] | null = null;
  private readonly pinchWheel = createPinchWheelStream();
  private motion: CosmosMotion | null = null;
  private saved: { camera: CosmosCamera; user: boolean } | null = null;
  private gestured = false;
  private drag: { id: number; x: number; y: number; camX: number; camY: number; moved: boolean; history: (Point & { t: number })[] } | null = null;

  interaction(): "pan" | "zoom" | "camera" | "none" {
    return this.drag?.moved ? "pan" : (this.motion?.kind ?? "none");
  }

  held(): boolean {
    return this.drag !== null || this.motion !== null;
  }

  readRoom(next: CosmosRoom, keepView = false): void {
    if (!roomMovesRest(this.room, next)) return;
    const { room, camera } = this;
    if (keepView) this.camera = { ...camera, x: camera.x + (next.x + next.width / 2 - room.x - room.width / 2) / camera.scale, y: camera.y + (next.y + next.height / 2 - room.y - room.height / 2) / camera.scale };
    this.room = next;
  }

  setBounds(bounds: CosmosLayout["bounds"], refit: boolean): void {
    this.bounds = bounds;
    if (refit) this.user = false;
    if (this.user) this.overviewScale = overviewCamera(bounds, this.room).overviewScale;
    else this.fit(false, 0);
  }

  fit(glide: boolean, now: number): void {
    if (!this.bounds) return;
    const { camera, overviewScale } = overviewCamera(this.bounds, this.room);
    this.overviewScale = overviewScale;
    if (glide) this.travel(camera, now);
    else this.camera = camera;
  }

  overview(now: number): void {
    this.user = false;
    this.fit(true, now);
  }

  frame(to: CosmosCamera, now: number): void {
    this.user = true;
    this.travel(to, now);
  }

  wheel(e: WheelEvent, screen: Point, height: number, speed: number, now: number): boolean {
    const dy = normalizeWheelDeltaY(e.deltaY, e.deltaMode, height);
    if (shouldIgnoreWheelGlide(dy, e.ctrlKey)) return false;
    const pinch = readPinchWheel(this.pinchWheel, e);
    this.zoomAt(screen, computeWheelZoomFactor(dy, { pinch, speed }), !pinch, now);
    return true;
  }

  travel(to: CosmosCamera, now: number): void {
    if (this.reducedMotion) {
      this.motion = null;
      this.camera = { ...to };
    } else this.motion = { kind: "camera", from: { ...this.camera }, to: { ...to }, start: now, ms: cameraTransitionDurationMs(this.camera, to), width: this.room.width };
  }

  gesture(): void {
    if (this.saved) this.gestured = true;
    this.user = true;
  }

  zoomAt(screen: Point, factor: number, animate: boolean, now: number): void {
    this.gesture();
    const base = this.motion?.kind === "zoom" ? this.motion.to : this.camera.scale;
    const to = clampCosmosScale(base * factor, this.overviewScale);
    const world = screenToWorld(this.camera, this.room, screen.x, screen.y);
    if (animate && !this.reducedMotion) this.motion = { kind: "zoom", from: this.camera.scale, to, start: now, screen, world };
    else {
      this.motion = null;
      this.camera = anchoredCamera(this.room, to, screen, world);
    }
  }

  holdReturn(): void {
    if (this.saved) return;
    const m = this.motion;
    this.saved = { camera: m && m.kind !== "zoom" ? { ...m.to } : { ...this.camera }, user: this.user };
    this.gestured = false;
  }

  releaseReturn(now: number): void {
    const back = this.gestured ? null : this.saved;
    this.saved = null;
    this.gestured = false;
    if (!back) return;
    this.travel(back.camera, now);
    this.user = back.user;
  }

  approach(point: Point, galaxy: Pick<CosmosGalaxy, "extent"> | null, free: CosmosRoom, now: number): void {
    const scale = focusScale({ current: this.camera.scale, galaxy, room: this.room, overviewScale: this.overviewScale });
    this.user = true;
    this.travel(approachCamera(point, scale, this.room, free), now);
  }

  dragStart(id: number, p: Point, t: number): void {
    this.motion = null;
    this.drag = { id, ...p, camX: this.camera.x, camY: this.camera.y, moved: false, history: [{ ...p, t }] };
  }

  dragMove(id: number, p: Point, t: number, gain: number): "started" | "moved" | "held" | null {
    const d = this.drag;
    if (!d || d.id !== id) return null;
    d.history.push({ ...p, t });
    if (d.history.length > 24) d.history.shift();
    const dx = p.x - d.x;
    const dy = p.y - d.y;
    const started = !d.moved && Math.hypot(dx, dy) > 4;
    if (started) {
      d.moved = true;
      this.gesture();
    }
    if (!d.moved) return "held";
    this.camera = { ...this.camera, x: d.camX - (dx * gain) / this.camera.scale, y: d.camY - (dy * gain) / this.camera.scale };
    return started ? "started" : "moved";
  }

  dragEnd(id: number, t: number, gain: number, flick: FlickTuning | null): "click" | "pan" | null {
    const d = this.drag;
    if (!d || d.id !== id) return null;
    this.drag = null;
    if (!d.moved) return "click";
    if (!flick || this.reducedMotion) return "pan";
    const release = sampleReleaseVelocity({ history: d.history, releaseTime: t, windowMs: flick.windowMs, minSpeedPxPerMs: flick.minSpeed });
    if (!release.isFlick) return "pan";
    const from = this.camera;
    const land = (v: number, p: number) => projectFlickLanding({ velocityPxPerMs: v * gain, cameraPosition: p, cameraScale: from.scale, timeConstantMs: MOMENTUM_TAU_MS }).landingTarget;
    this.motion = { kind: "pan", from: { ...from }, to: { x: land(release.vx, from.x), y: land(release.vy, from.y), scale: from.scale }, start: -1 };
    return "pan";
  }

  cancelDrag(): void {
    this.drag = null;
  }

  step(now: number): boolean {
    const m = this.motion;
    if (!m) return false;
    if (m.kind === "camera") {
      const t = Math.min(1, Math.max(0, (now - m.start) / m.ms));
      this.camera = t >= 1 ? { ...m.to } : vanWijkCameraKeyframe(m.from, m.to, easeInOutCubic(t), m.width);
      if (t >= 1) this.motion = null;
    } else if (m.kind === "zoom") {
      const p = zoomStepProgress(now - m.start);
      this.camera = anchoredCamera(this.room, p >= 1 ? m.to : easeZoomScale(m.from, m.to, p), m.screen, m.world);
      if (p >= 1) this.motion = null;
    } else {
      if (m.start < 0) m.start = now;
      const e = 1 - Math.exp(-(now - m.start) / MOMENTUM_TAU_MS);
      const rest = Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y) * (1 - e) * m.to.scale < FLICK_REST_PX;
      this.camera = rest ? { ...m.to } : { x: m.from.x + (m.to.x - m.from.x) * e, y: m.from.y + (m.to.y - m.from.y) * e, scale: m.to.scale };
      if (rest) this.motion = null;
    }
    return this.motion !== null;
  }
}
