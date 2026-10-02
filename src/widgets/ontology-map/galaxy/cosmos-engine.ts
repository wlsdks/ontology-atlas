import { computeWheelZoomFactor, normalizeWheelDeltaY, shouldIgnoreWheelGlide } from "../interaction/wheel";
import { readHexRoom } from "../morph/hex-marks";
import { MIN_STAR_SPACING, type CosmosLayout } from "./cosmos-layout";
import { hash01 } from "./cosmos-morphology";
import {
  drawCosmosFrame,
  galaxyMatrix,
  liveBandRadius,
  registerCosmosLabels,
  worldToScreen,
  type CosmosCamera,
  type CosmosFrameCache,
  type CosmosFrameStats,
  type CosmosRoom,
  type GalaxyPose,
} from "./cosmos-frame";
import { buildDeepField, type CosmosInks } from "./cosmos-paint";

export type CosmosAmbient = "off" | "haze" | "sway";

export interface CosmosEngineOptions {
  onSelect?: (id: string) => void;
  onPaneClick?: () => void;
  onDrawn?: (count: number) => void;
  reducedMotion: boolean;
  ambient: CosmosAmbient;
  arrive: boolean;
}

const ACTIVE_MS = 12_000;
const ARRIVAL_MS = 1_700;
const CAMERA_GLIDE_MS = 650;

const SWAY_RIM_PX = 6;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const progressSince = (start: number, frameTime: number, ms: number) => Math.min(1, Math.max(0, (frameTime - start) / ms));

interface FrameRecord {
  t: number;
  ms: number;
  builds: number;
  why: number;
  sinceInput: number;
}

export class CosmosEngine {
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private width = 0;
  private height = 0;
  private room: CosmosRoom = { x: 0, y: 0, width: 1, height: 1 };
  private camera: CosmosCamera = { x: 0, y: 0, scale: 1 };
  private overviewScale = 1;
  private userCamera = false;
  private layout: CosmosLayout | null = null;
  private inks: CosmosInks | null = null;
  private poses: GalaxyPose[] = [];
  private cache: CosmosFrameCache = { glows: new Map(), impostors: new Map(), coreImpostor: new Map(), textWidth: new Map() };
  private deepField: HTMLCanvasElement | null = null;
  private raf = 0;
  private lastNow = 0;
  private zoom: { target: number; sx: number; sy: number; wx: number; wy: number } | null = null;
  private tween: { from: CosmosCamera; to: CosmosCamera; start: number; ms: number } | null = null;
  private arrival: { start: number } | null = null;
  private tau = 0;
  private lastInput = 0;
  private drag: { id: number; x: number; y: number; camX: number; camY: number; moved: boolean } | null = null;
  private hoverId: string | null = null;
  private hoverGalaxy = -1;
  private selectedId: string | null = null;
  private dependencies = new Map<string, string[]>();
  private grids = new Map<number, Map<number, number[]>>();
  private lastStats: CosmosFrameStats | null = null;
  private frames = 0;
  private frameLog: FrameRecord[] = [];
  private drawnReported = false;

  private buildBudget = 4;
  private lastPointer: { x: number; y: number } | null = null;
  private stillMoves = 0;

  private ignoreStillMoves = true;
  private readonly cleanups: (() => void)[] = [];
  private options: CosmosEngineOptions;

  constructor(private readonly canvas: HTMLCanvasElement, options: CosmosEngineOptions) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("cosmos: no 2d context");
    this.ctx = ctx;
    this.options = options;
    const listen = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      canvas.addEventListener(type, fn as EventListener, opts);
      this.cleanups.push(() => canvas.removeEventListener(type, fn as EventListener, opts));
    };
    listen("pointerdown", (e) => this.onPointerDown(e));
    listen("pointermove", (e) => this.onPointerMove(e));
    listen("pointerup", (e) => this.onPointerUp(e));
    listen("pointercancel", () => (this.drag = null));
    listen("pointerleave", () => {
      if (this.hoverId !== null || this.hoverGalaxy !== -1) {
        this.hoverId = null;
        this.hoverGalaxy = -1;
        this.requestFrame();
      }
    });
    listen("wheel", (e) => this.onWheel(e), { passive: false });
    listen("keydown", (e) => this.onKey(e));
    const resize = new ResizeObserver(() => this.resize());
    resize.observe(canvas);
    this.cleanups.push(() => resize.disconnect());
    for (const ms of [250, 1000]) {
      const timer = window.setTimeout(() => this.resize(), ms);
      this.cleanups.push(() => window.clearTimeout(timer));
    }
    this.resize();
    this.installProbe();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    for (const fn of this.cleanups) fn();
    const w = window as unknown as { __atlasCosmos?: unknown };
    if (w.__atlasCosmos && (w.__atlasCosmos as { engine?: unknown }).engine === this) delete w.__atlasCosmos;
  }

  setOptions(options: Partial<CosmosEngineOptions>): void {
    this.options = { ...this.options, ...options };
    this.requestFrame();
  }

  setInks(inks: CosmosInks): void {
    this.inks = inks;
    this.deepField = buildDeepField(inks);
    this.cache = { glows: new Map(), impostors: new Map(), coreImpostor: new Map(), textWidth: new Map() };
    this.requestFrame();
  }

  setLayout(layout: CosmosLayout, labels: ReadonlyMap<string, string>, dependencies: ReadonlyMap<string, string[]>): void {
    this.layout = layout;
    registerCosmosLabels(layout, labels);
    this.dependencies = new Map(dependencies);
    this.cache = { glows: new Map(), impostors: new Map(), coreImpostor: new Map(), textWidth: this.cache.textWidth };
    this.grids.clear();
    this.poses = layout.galaxies.map((g) => ({ x: g.x, y: g.y, theta: 0, wispTheta: 0, wispLight: 1, presence: 1, condense: 1 }));
    this.userCamera = false;
    this.fit(false);
    this.arrival = this.options.arrive && !this.options.reducedMotion && layout.settle.keyframes.length > 1 ? { start: performance.now() } : null;
    this.drawnReported = false;
    this.requestFrame();
  }

  setSelected(id: string | null): void {
    this.selectedId = id;
    this.requestFrame();
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (width !== this.width || height !== this.height || dpr !== this.dpr) {
      this.width = width;
      this.height = height;
      this.dpr = dpr;
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
    }
    this.room = readHexRoom(this.canvas, width, height);
    if (!this.userCamera) this.fit(false);
    this.requestFrame();
  }

  private fit(glide: boolean): void {
    const layout = this.layout;
    if (!layout) return;
    const b = layout.bounds;
    const scale = Math.min(this.room.width / (b.maxX - b.minX), (this.room.height - 36) / (b.maxY - b.minY)) * 0.97;
    const to = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 + 14 / Math.max(1e-6, scale), scale };
    this.overviewScale = scale;
    if (glide && !this.options.reducedMotion) this.tween = { from: { ...this.camera }, to, start: performance.now(), ms: CAMERA_GLIDE_MS };
    else this.camera = to;
  }

  private flyToGalaxy(index: number): void {
    const g = this.layout?.galaxies[index];
    if (!g) return;
    const scale = Math.min(this.room.width, this.room.height) / (g.extent * 2 * 1.12);
    const to = { x: this.poses[index]!.x, y: this.poses[index]!.y, scale };
    this.userCamera = true;
    this.zoom = null;
    if (this.options.reducedMotion) this.camera = to;
    else this.tween = { from: { ...this.camera }, to, start: performance.now(), ms: CAMERA_GLIDE_MS };
    this.requestFrame();
  }

  private touch(): void {
    this.lastInput = performance.now();
  }

  requestFrame(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame((now) => this.frame(now));
  }

  private frame(now: number): void {
    this.raf = 0;
    const layout = this.layout;
    const inks = this.inks;
    if (!layout || !inks || this.width <= 1) return;
    const started = performance.now();
    const dt = this.lastNow ? Math.min(64, Math.max(0, now - this.lastNow)) : 16;
    this.lastNow = now;
    let moving = false;
    let why = 0;

    if (this.tween) {
      const t = progressSince(this.tween.start, now, this.tween.ms);
      const e = easeInOut(t);
      const { from, to } = this.tween;
      this.camera = {
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e,
        scale: from.scale * (to.scale / from.scale) ** e,
      };
      if (t >= 1) this.tween = null;
      else {
        moving = true;
        why |= 1;
      }
    }
    if (this.zoom) {
      const k = 1 - Math.exp(-dt / 70);
      const next = this.camera.scale + (this.zoom.target - this.camera.scale) * k;
      const done = Math.abs(this.zoom.target - next) / this.zoom.target < 0.002;
      const scale = done ? this.zoom.target : next;
      this.camera = {
        scale,
        x: this.zoom.wx - (this.zoom.sx - this.room.x - this.room.width / 2) / scale,
        y: this.zoom.wy - (this.zoom.sy - this.room.y - this.room.height / 2) / scale,
      };
      if (done) this.zoom = null;
      else {
        moving = true;
        why |= 2;
      }
    }

    const ambientOn = this.options.ambient !== "off" && !this.options.reducedMotion;
    const active = ambientOn && now - this.lastInput < ACTIVE_MS && document.visibilityState === "visible";
    if (active) {
      this.tau += dt;
      moving = true;
      why |= 4;
    }
    this.updatePoses(now, layout);
    if (this.arrival) {
      moving = true;
      why |= 8;
    }

    const stats = drawCosmosFrame({
      ctx: this.ctx,
      width: this.width,
      height: this.height,
      dpr: this.dpr,
      room: this.room,
      camera: this.camera,
      overviewScale: this.overviewScale,
      layout,
      inks,
      poses: this.poses,
      hoverId: this.hoverId,
      hoverGalaxy: this.hoverGalaxy,
      selectedId: this.selectedId,
      selectedLinks: this.selectedLinks(layout),
      cache: this.cache,
      deepField: this.deepField,
      buildBudget: this.buildBudget,
    });
    if (stats.pendingBuilds > 0) {
      moving = true;
      why |= 16;
    }
    this.lastStats = stats;
    this.frames += 1;
    const ms = performance.now() - started;
    this.frameLog.push({ t: now, ms, builds: stats.buildsStarted, why, sinceInput: now - this.lastInput });
    if (this.frameLog.length > 600) this.frameLog.splice(0, this.frameLog.length - 600);
    if (!this.drawnReported) {
      this.drawnReported = true;
      this.options.onDrawn?.(layout.points.size);
    }
    if (moving) this.requestFrame();
  }

  private updatePoses(now: number, layout: CosmosLayout): void {
    const sway = this.options.ambient === "sway" && !this.options.reducedMotion;
    const haze = this.options.ambient === "haze" && !this.options.reducedMotion;
    let arrivalT = 1;
    let frameA = 0;
    let frameB = 0;
    let frameMix = 0;
    const keyframes = layout.settle.keyframes;
    if (this.arrival) {
      arrivalT = progressSince(this.arrival.start, now, ARRIVAL_MS);
      const f = arrivalT * (keyframes.length - 1);
      frameA = Math.floor(f);
      frameB = Math.min(keyframes.length - 1, frameA + 1);
      frameMix = f - frameA;
      if (arrivalT >= 1) this.arrival = null;
    }
    const reach = Math.max(1, layout.settle.targetRadius);
    layout.galaxies.forEach((g, i) => {
      const pose = this.poses[i]!;
      if (arrivalT < 1) {
        const a = keyframes[frameA]!;
        const b = keyframes[frameB]!;
        pose.x = a[i * 2]! + (b[i * 2]! - a[i * 2]!) * frameMix;
        pose.y = a[i * 2 + 1]! + (b[i * 2 + 1]! - a[i * 2 + 1]!) * frameMix;
        const delay = 0.4 * Math.min(1, Math.hypot(g.x, g.y) / reach);
        const local = Math.min(1, Math.max(0, (arrivalT - delay) / 0.55));
        pose.presence = easeOut(Math.min(1, local * 1.6));
        pose.condense = 0.25 + 0.75 * easeOut(local);
      } else {
        pose.x = g.x;
        pose.y = g.y;
        pose.presence = 1;
        pose.condense = 1;
      }
      const rho = g.radius * this.camera.scale;
      const phase = hash01(g.id, "ambient-phase") * Math.PI * 2;
      const period = 40_000 + 30_000 * hash01(g.id, "ambient-period");
      pose.theta = sway ? g.spin * Math.min(0.1, SWAY_RIM_PX / Math.max(1, rho)) * Math.sin((this.tau / period) * Math.PI * 2 + phase) : 0;
      pose.wispTheta = haze ? g.spin * 0.12 * Math.sin((this.tau / 18_000) * Math.PI * 2 + phase) : 0;
      pose.wispLight = haze ? 0.94 + 0.06 * Math.sin((this.tau / 8_400) * Math.PI * 2 + phase) : 1;
    });
  }

  private selectedLinks(layout: CosmosLayout): { x: number; y: number }[] {
    if (!this.selectedId) return [];
    const out: { x: number; y: number }[] = [];
    for (const id of this.dependencies.get(this.selectedId) ?? []) {
      const p = this.currentPoint(layout, id);
      if (p) out.push(p);
      if (out.length >= 80) break;
    }
    return out;
  }

  private currentPoint(layout: CosmosLayout, id: string): { x: number; y: number } | null {
    const gi = layout.galaxyOf.get(id);
    if (gi === undefined) return null;
    if (gi < 0) return layout.points.get(id) ?? null;
    const g = layout.galaxies[gi]!;
    const pose = this.poses[gi]!;
    const si = g.starIds.indexOf(id);
    if (si < 0) return null;
    const m = galaxyMatrix(g, pose, { x: 0, y: 0, scale: 1 }, { x: 0, y: 0, width: 0, height: 0 });
    const u = g.starU[si]! * pose.condense;
    const v = g.starV[si]! * pose.condense;
    return { x: m.a * u + m.c * v + pose.x, y: m.b * u + m.d * v + pose.y };
  }

  private local(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const dy = normalizeWheelDeltaY(e.deltaY, e.deltaMode, this.height);
    if (shouldIgnoreWheelGlide(dy, e.ctrlKey)) return;
    this.touch();
    const p = this.local(e);
    const base = this.zoom?.target ?? this.camera.scale;
    const target = Math.min(48 / MIN_STAR_SPACING, Math.max(this.overviewScale * 0.5, base * computeWheelZoomFactor(dy * (e.ctrlKey ? 3 : 1))));
    const wx = this.camera.x + (p.x - this.room.x - this.room.width / 2) / this.camera.scale;
    const wy = this.camera.y + (p.y - this.room.y - this.room.height / 2) / this.camera.scale;
    this.zoom = { target, sx: p.x, sy: p.y, wx, wy };
    this.tween = null;
    this.userCamera = true;
    this.requestFrame();
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.touch();
    this.canvas.focus({ preventScroll: true });
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.drag = { id: e.pointerId, x: p.x, y: p.y, camX: this.camera.x, camY: this.camera.y, moved: false };
    this.tween = null;
    this.zoom = null;
  }

  private onPointerMove(e: PointerEvent): void {
    const motionless = this.lastPointer !== null && e.clientX === this.lastPointer.x && e.clientY === this.lastPointer.y;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    if (motionless) this.stillMoves += 1;
    if (!motionless || !this.ignoreStillMoves) this.touch();
    const p = this.local(e);
    if (this.drag && this.drag.id === e.pointerId) {
      const dx = p.x - this.drag.x;
      const dy = p.y - this.drag.y;
      if (!this.drag.moved && Math.hypot(dx, dy) > 4) this.drag.moved = true;
      if (this.drag.moved) {
        this.camera = { ...this.camera, x: this.drag.camX - dx / this.camera.scale, y: this.drag.camY - dy / this.camera.scale };
        this.userCamera = true;
        this.requestFrame();
      }
      return;
    }
    const hit = this.hitTest(p.x, p.y);
    if (hit.id !== this.hoverId || hit.galaxy !== this.hoverGalaxy) {
      this.hoverId = hit.id;
      this.hoverGalaxy = hit.galaxy;
      this.canvas.style.cursor = hit.id || hit.galaxy >= 0 ? "pointer" : "grab";
      this.requestFrame();
    } else if (this.options.ambient !== "off") {
      this.requestFrame();
    }
  }

  private onPointerUp(e: PointerEvent): void {
    const drag = this.drag;
    this.drag = null;
    if (!drag || drag.id !== e.pointerId) return;
    if (drag.moved) return;
    const p = this.local(e);
    const hit = this.hitTest(p.x, p.y);
    if (hit.id) this.options.onSelect?.(hit.id);
    else if (hit.galaxy >= 0) this.flyToGalaxy(hit.galaxy);
    else this.options.onPaneClick?.();
  }

  private onKey(e: KeyboardEvent): void {
    this.touch();
    if (e.key === "Escape" || e.key === "0") {
      this.userCamera = false;
      this.fit(true);
      this.requestFrame();
    }
  }

  hitTest(sx: number, sy: number): { id: string | null; galaxy: number } {
    const layout = this.layout;
    if (!layout) return { id: null, galaxy: -1 };
    const live = liveBandRadius(this.dpr);
    let bestGalaxy = -1;
    let bestStar: string | null = null;
    let bestD = Infinity;
    layout.galaxies.forEach((g, index) => {
      const pose = this.poses[index]!;
      const m = galaxyMatrix(g, pose, this.camera, this.room);
      const det = m.a * m.d - m.b * m.c;
      if (Math.abs(det) < 1e-12) return;
      const X = sx - m.e;
      const Y = sy - m.f;
      const u = (m.d * X - m.c * Y) / det / pose.condense;
      const v = (-m.b * X + m.a * Y) / det / pose.condense;
      if (u * u + v * v > (g.radius * 1.08) ** 2) return;
      const rho = g.radius * this.camera.scale;
      if (rho <= live) {
        bestGalaxy = index;
        return;
      }
      const grid = this.gridFor(index);
      const cell = 12;
      const reachPx = 10;
      const reach = Math.ceil(reachPx / (this.camera.scale * g.tilt * cell)) + 1;
      const cx = Math.floor(u / cell);
      const cy = Math.floor(v / cell);
      for (let ox = -reach; ox <= reach; ox += 1) {
        for (let oy = -reach; oy <= reach; oy += 1) {
          for (const i of grid.get((cx + ox) * 92821 + (cy + oy)) ?? []) {
            const su = g.starU[i]! * pose.condense;
            const svv = g.starV[i]! * pose.condense;
            const x = m.a * su + m.c * svv + m.e;
            const y = m.b * su + m.d * svv + m.f;
            const d = Math.hypot(x - sx, y - sy);
            if (d < reachPx && d < bestD) {
              bestD = d;
              bestStar = g.starIds[i]!;
            }
          }
        }
      }
      if (!bestStar) bestGalaxy = index;
    });
    if (bestStar) return { id: bestStar, galaxy: -1 };
    if (bestGalaxy >= 0) return { id: null, galaxy: bestGalaxy };
    const core = layout.core;
    for (let i = 0; i < core.starIds.length; i += 1) {
      const p = worldToScreen(this.camera, this.room, core.starX[i]!, core.starY[i]!);
      const d = Math.hypot(p.x - sx, p.y - sy);
      const reach = i === 0 && core.id ? 18 : 7;
      if (d < reach && d < bestD) {
        bestD = d;
        bestStar = core.starIds[i]!;
      }
    }
    if (bestStar) return { id: bestStar, galaxy: -1 };
    return { id: null, galaxy: -1 };
  }

  private gridFor(index: number): Map<number, number[]> {
    const hit = this.grids.get(index);
    if (hit) return hit;
    const g = this.layout!.galaxies[index]!;
    const grid = new Map<number, number[]>();
    for (let i = 0; i < g.starIds.length; i += 1) {
      const key = Math.floor(g.starU[i]! / 12) * 92821 + Math.floor(g.starV[i]! / 12);
      const list = grid.get(key);
      if (list) list.push(i);
      else grid.set(key, [i]);
    }
    this.grids.set(index, grid);
    return grid;
  }

  private installProbe(): void {
    const w = window as unknown as Record<string, unknown>;
    w.__atlasCosmos = {
      engine: this,
      camera: () => ({ ...this.camera, width: this.width, height: this.height, overviewScale: this.overviewScale, zoomRatio: this.camera.scale / this.overviewScale }),
      room: () => ({ ...this.room }),
      awake: () => this.raf !== 0,
      frames: () => this.frames,
      frameLog: () => this.frameLog.slice(),
      stats: () => this.lastStats && { ...this.lastStats, labels: this.lastStats.labels.map((l) => ({ ...l })) },
      layout: () =>
        this.layout && {
          timings: this.layout.timings,
          galaxies: this.layout.galaxies.map((g, i) => {
            const s = worldToScreen(this.camera, this.room, this.poses[i]?.x ?? g.x, this.poses[i]?.y ?? g.y);
            return { id: g.id, label: g.label, shape: g.shape, arms: g.arms, members: g.members, clusters: g.clusters.length, sx: s.x, sy: s.y, rho: g.radius * this.camera.scale };
          }),
          filaments: this.layout.filaments.length,
          concepts: this.layout.points.size,
        },
      flyTo: (id: string) => {
        const i = this.layout?.galaxies.findIndex((g) => g.id === id) ?? -1;
        if (i >= 0) this.flyToGalaxy(i);
      },
      overview: () => {
        this.userCamera = false;
        this.fit(true);
        this.requestFrame();
      },
      hit: (x: number, y: number) => this.hitTest(x, y),
      point: (id: string) => {
        const p = this.layout && this.currentPoint(this.layout, id);
        return p ? worldToScreen(this.camera, this.room, p.x, p.y) : null;
      },
      setAmbient: (ambient: CosmosAmbient) => this.setOptions({ ambient }),
      stillMoves: () => this.stillMoves,
      setIgnoreStillMoves: (on: boolean) => {
        this.ignoreStillMoves = on;
      },
      setBuildBudget: (n: number) => {
        this.buildBudget = Math.max(1, Math.floor(n));
      },

      dropBitmaps: () => {
        this.cache = { glows: new Map(), impostors: new Map(), coreImpostor: new Map(), textWidth: this.cache.textWidth };
        this.requestFrame();
      },
      poke: () => {
        this.touch();
        this.requestFrame();
      },
    };
  }
}
