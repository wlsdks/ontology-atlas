import { isDirectionalRelation } from "@/entities/knowledge-graph";
import { computeWheelZoomFactor, normalizeWheelDeltaY, shouldIgnoreWheelGlide } from "../interaction/wheel";
import { readHexRoom } from "../morph/hex-marks";
import type { OntologyMapEdge } from "../ui/OntologyMap";
import { applyArrival } from "./cosmos-arrival";
import { applyHaze, createHazeState, stepHaze, type CosmosAmbient } from "./cosmos-ambient";
import { galaxyFitScale, galaxyMatrix, liveBandRadius, overviewCamera, worldToScreen } from "./cosmos-camera";
import type { CosmosArrivalMode, CosmosCamera, CosmosFrameStats, CosmosInks, CosmosRelation, CosmosRoom, GalaxyPose } from "./cosmos-types";
import { walkCandidates, walkTarget } from "./cosmos-walk";
import { CosmosBitmapCache } from "./draw/cosmos-bitmap-cache";
import { drawCosmosFrame } from "./draw/cosmos-frame";
import { registerCosmosLabels } from "./draw/cosmos-labels";
import { buildDeepField } from "./draw/cosmos-paint";
import { MIN_STAR_SPACING, type CosmosLayout } from "./layout/cosmos-layout";

interface CosmosEngineOptions {
  onSelect?: (id: string) => void;
  onPaneClick?: () => void;
  onDrawn?: (count: number) => void;
  reducedMotion: boolean;
  ambient: CosmosAmbient;
}

const CAMERA_GLIDE_MS = 650;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const progressSince = (start: number, frameTime: number, ms: number) => Math.min(1, Math.max(0, (frameTime - start) / ms));

interface FrameRecord {
  t: number;
  ms: number;
  builds: number;
  why: number;
  sinceInput: number;
}

const WALK_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

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
  private cache = new CosmosBitmapCache();
  private deepField: HTMLCanvasElement | null = null;
  private raf = 0;
  private lastNow = 0;
  private zoom: { target: number; sx: number; sy: number; wx: number; wy: number } | null = null;
  private tween: { from: CosmosCamera; to: CosmosCamera; start: number; ms: number } | null = null;
  private arrival: { start: number; mode: CosmosArrivalMode } | null = null;
  private readonly haze = createHazeState("off");
  private lastInput = 0;
  private drag: { id: number; x: number; y: number; camX: number; camY: number; moved: boolean } | null = null;
  private hoverId: string | null = null;
  private hoverGalaxy = -1;
  private selectedId: string | null = null;
  private relations = new Map<string, CosmosRelation[]>();
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
    this.haze.mode = options.ambient;
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
    this.haze.mode = this.options.ambient;
    this.requestFrame();
  }

  setInks(inks: CosmosInks): void {
    this.inks = inks;
    this.deepField = buildDeepField(inks);
    this.cache = new CosmosBitmapCache();
    this.requestFrame();
  }

  setLayout(layout: CosmosLayout, labels: ReadonlyMap<string, string>, edges: readonly OntologyMapEdge[], arrival: CosmosArrivalMode): void {
    this.layout = layout;
    registerCosmosLabels(layout, labels);
    this.relations = relationsByConcept(edges);
    this.cache.clear();
    this.grids.clear();
    this.poses = layout.galaxies.map((g) => ({ x: g.x, y: g.y, theta: 0, wispTheta: 0, wispLight: 1, presence: 1, condense: 1 }));
    this.userCamera = false;
    this.fit(false);
    this.arrival = arrival === "replay" && !this.options.reducedMotion && layout.settle.keyframes.length > 1 ? { start: performance.now(), mode: arrival } : null;
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
    const { camera: to, overviewScale } = overviewCamera(layout.bounds, this.room);
    this.overviewScale = overviewScale;
    if (glide && !this.options.reducedMotion) this.tween = { from: { ...this.camera }, to, start: performance.now(), ms: CAMERA_GLIDE_MS };
    else this.camera = to;
  }

  private flyToGalaxy(index: number): void {
    const g = this.layout?.galaxies[index];
    if (!g) return;
    const to = { x: this.poses[index]!.x, y: this.poses[index]!.y, scale: galaxyFitScale(g, this.room) };
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

    const active = stepHaze(this.haze, {
      now,
      dt,
      windowStart: this.lastInput,
      reducedMotion: this.options.reducedMotion,
      visible: document.visibilityState === "visible",
    });
    if (active) {
      moving = true;
      why |= 4;
    }
    if (this.arrival && !applyArrival(layout, now - this.arrival.start, this.arrival.mode, this.poses)) this.arrival = null;
    else if (!this.arrival) applyArrival(layout, 0, "none", this.poses);
    applyHaze(layout, this.haze, this.poses, this.camera.scale, this.options.reducedMotion);
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
      attention: { selectedId: this.selectedId, hoverId: this.hoverId, hoverGalaxy: this.hoverGalaxy, focusGalaxy: -1, revealMs: 0 },
      relationsOf: (id) => this.relations.get(id) ?? [],
      pointOf: (id) => this.currentPoint(layout, id),
      lens: null,
      trail: null,
      record: null,
      reducedMotion: this.options.reducedMotion,
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
    } else if (this.haze.mode !== "off") {
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
      return;
    }
    if (WALK_KEYS.has(e.key) && this.layout) {
      const step = walkTarget({
        key: e.key,
        selectedId: this.selectedId,
        candidates: walkCandidates({ layout: this.layout, poses: this.poses, camera: this.camera, room: this.room, dpr: this.dpr }),
        roomCentre: { x: this.room.x + this.room.width / 2, y: this.room.y + this.room.height / 2 },
      });
      if (step.id) this.options.onSelect?.(step.id);
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
        this.cache.clear();
        this.requestFrame();
      },
      poke: () => {
        this.touch();
        this.requestFrame();
      },
    };
  }
}

function relationsByConcept(edges: readonly OntologyMapEdge[]): Map<string, CosmosRelation[]> {
  const out = new Map<string, CosmosRelation[]>();
  edges.forEach((e, i) => {
    if (e.kind !== "depends") return;
    const relation: CosmosRelation = {
      id: e.id ?? `${e.source}->${e.target}:${i}`,
      source: e.source,
      target: e.target,
      relationType: e.relationType,
      directional: isDirectionalRelation(e.relationType),
    };
    for (const id of [e.source, e.target]) {
      const list = out.get(id);
      if (list) list.push(relation);
      else out.set(id, [relation]);
    }
  });
  return out;
}
