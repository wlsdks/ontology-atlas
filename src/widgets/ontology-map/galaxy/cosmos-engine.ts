import type { MapNavigationSpeed } from "@/shared/lib/appearance-preferences";
import { isImeComposing } from "@/shared/lib/ime-composition";
import { listenForGesturePinch } from "../interaction/gesture-pinch";
import { keyboardZoomIntent } from "../interaction/keyboard-zoom";
import { readHexRoom } from "../morph/hex-marks";
import type { OntologyMapEdge } from "../ui/OntologyMap";
import { readOntologyMapTokensOrNull } from "../ui/topology-read-tokens";
import { applyHaze, createHazeState, stepHaze } from "./cosmos-ambient";
import { applyArrival, ARRIVAL_MS } from "./cosmos-arrival";
import { CosmosCameraRig, CosmosHitIndex, cosmosMarks, framingCamera, galaxyFitScale, memberBounds, posedPoint } from "./cosmos-camera";
import { CosmosCameraRestWatch, CosmosRevealClock, galaxyCentreOn, relationsByConcept } from "./cosmos-engine-watch";
import { installCosmosProbe, writeProbeFrame } from "./cosmos-probe";
import type { CosmosArrivalMode, CosmosBand, CosmosFrameStats, CosmosInks, CosmosLens, CosmosPaintRecord, CosmosRelation, CosmosTrail, GalaxyPose } from "./cosmos-types";
import { walkCandidates, walkTarget } from "./cosmos-walk";
import { CosmosBitmapCache } from "./draw/cosmos-bitmap-cache";
import { drawCosmosFrame } from "./draw/cosmos-frame";
import { registerCosmosLabels } from "./draw/cosmos-labels";
import { buildDeepField } from "./draw/cosmos-paint";
import { RELATION_REVEAL_MS } from "./draw/cosmos-relations";
import type { CosmosLayout } from "./layout/cosmos-layout";

interface CosmosEngineOptions {
  onSelect?: (id: string) => void;
  onPaneClick?: () => void;
  onDrawn?: (count: number) => void;
  onBand?: (band: CosmosBand) => void;
  onRest?: () => void;
  onCameraRest?: () => void;
  onWalkDeadEnd?: () => void;
  onContextMenuNode?: (id: string, position: { x: number; y: number }) => void;
  onContextMenuPane?: (position: { x: number; y: number }) => void;
  reducedMotion: boolean;
  navigationSpeed: MapNavigationSpeed;
}

const WALK_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const CHROME_SETTLE_MS = 450;
const APPROACH_READS_MS = [60, 420];

export class CosmosEngine {
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  width = 0;
  height = 0;
  readonly rig = new CosmosCameraRig();
  private readonly hits = new CosmosHitIndex();
  layout: CosmosLayout | null = null;
  private inks: CosmosInks | null = null;
  poses: GalaxyPose[] = [];
  cache = new CosmosBitmapCache();
  private deepField: HTMLCanvasElement | null = null;
  raf = 0;
  private lastNow = 0;
  arrival: { start: number; mode: CosmosArrivalMode } | null = null;
  arrivalMode: CosmosArrivalMode = "none";
  arrivalClock = 0;
  private arrivalEnd = 0;
  readonly haze = createHazeState();
  hazeAwake = false;
  private band: CosmosBand | null = null;
  private lens: CosmosLens | null = null;
  private trail: CosmosTrail | null = null;
  paintLog: CosmosPaintRecord[] | null = null;
  private readonly probed = new URLSearchParams(window.location.search).has("e2e");
  private lastInput = 0;
  private lastPointer: { x: number; y: number } | null = null;
  private hoverId: string | null = null;
  private hoverGalaxy = -1;
  selectedId: string | null = null;
  private relations = new Map<string, CosmosRelation[]>();
  lastStats: CosmosFrameStats | null = null;
  frames = 0;
  frameLog: { t: number; ms: number; builds: number; firstDraws: number; why: number; sinceInput: number }[] = [];
  private drawnReported = false;
  private roomHeld = false;
  private readonly reveal = new CosmosRevealClock();
  private readonly cameraRest = new CosmosCameraRestWatch();
  private approachTimers: number[] = [];
  private settleTimer = 0;
  private readonly cleanups: (() => void)[] = [];

  constructor(private readonly canvas: HTMLCanvasElement, private options: CosmosEngineOptions) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("cosmos: no 2d context");
    this.ctx = ctx;
    this.rig.reducedMotion = options.reducedMotion;
    const listen = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      canvas.addEventListener(type, fn as EventListener, opts);
      this.cleanups.push(() => canvas.removeEventListener(type, fn as EventListener, opts));
    };
    listen("pointerdown", (e) => this.onPointerDown(e));
    listen("pointermove", (e) => this.onPointerMove(e));
    listen("pointerup", (e) => this.onPointerUp(e));
    listen("pointercancel", () => this.rig.cancelDrag());
    listen("pointerleave", () => this.setHover(null, -1));
    listen("wheel", (e) => this.onWheel(e), { passive: false });
    listen("keydown", (e) => this.onKey(e));
    listen("contextmenu", (e) => this.onContextMenu(e));
    this.cleanups.push(listenForGesturePinch(canvas, (ratio, x, y) => this.zoomAt(this.local(x, y), ratio ** this.options.navigationSpeed.zoom, false)));
    const resize = new ResizeObserver(() => this.resize());
    resize.observe(canvas);
    const chrome = new MutationObserver(() => this.readWhenSettled());
    chrome.observe(document.documentElement, { attributes: true, attributeFilter: ["data-topology-index"] });
    this.cleanups.push(() => {
      resize.disconnect();
      chrome.disconnect();
      window.clearTimeout(this.settleTimer);
      this.clearApproach();
    });
    this.resize();
    if (this.probed) this.cleanups.push(installCosmosProbe(this));
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    for (const fn of this.cleanups) fn();
  }

  setOptions(options: Partial<CosmosEngineOptions>): void {
    this.options = { ...this.options, ...options };
    this.rig.reducedMotion = this.options.reducedMotion;
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
    this.hits.clear();
    this.poses = layout.galaxies.map((g) => ({ x: g.x, y: g.y, theta: 0, wispTheta: 0, wispLight: 1, presence: 1, condense: 1 }));
    this.rig.setBounds(layout.bounds);
    this.arrival = arrival !== "none" && !this.options.reducedMotion && layout.settle.keyframes.length > 0 ? { start: -1, mode: arrival } : null;
    this.arrivalMode = this.arrival ? arrival : "none";
    [this.arrivalClock, this.arrivalEnd] = [0, performance.now() + (this.arrival ? ARRIVAL_MS : 0)];
    this.drawnReported = false;
    this.requestFrame();
  }

  setSelected(id: string | null): void {
    const previous = this.selectedId;
    this.selectedId = id;
    this.clearApproach();
    if (id === null) {
      if (previous !== null) this.rig.releaseReturn(performance.now());
      this.readWhenSettled();
    } else if (id !== previous) {
      if (previous === null) this.rig.holdReturn();
      this.approachTimers = APPROACH_READS_MS.map((ms) => window.setTimeout(() => this.approach(id), ms));
    }
    this.requestFrame();
  }

  setLens(lens: CosmosLens | null, trail: CosmosTrail | null): void {
    [this.lens, this.trail] = [lens, trail];
    this.requestFrame();
  }

  requestFit(): void {
    if (!this.lens?.memberIds.size) this.overview();
    else this.requestLensFit();
  }

  requestLensFit(): void {
    const b = this.layout && this.lens && memberBounds(this.layout, this.poses, this.lens.memberIds);
    if (!b) return;
    this.rig.frame(framingCamera(b, this.rig.room, this.rig.overviewScale), performance.now());
    this.requestFrame();
  }

  marks() {
    return this.layout ? cosmosMarks(this.layout, this.poses, this.rig.camera, this.rig.room) : [];
  }

  requestFrame(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame((now) => this.frame(now));
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (width !== this.width || height !== this.height || dpr !== this.dpr) {
      [this.width, this.height, this.dpr] = [width, height, dpr];
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
    }
    if ((this.roomHeld = this.arrival !== null)) return this.requestFrame();
    if (this.selectedId === null) this.rig.readRoom(readHexRoom(this.canvas, width, height));
    if (!this.rig.user) this.rig.fit(false, performance.now());
    this.requestFrame();
  }

  private readWhenSettled(): void {
    window.clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(() => this.resize(), CHROME_SETTLE_MS);
  }

  overview(): void {
    this.rig.overview(performance.now());
    this.requestFrame();
  }

  flyToGalaxy(index: number): void {
    const g = this.layout?.galaxies[index];
    if (!g) return;
    this.rig.frame({ x: this.poses[index]!.x, y: this.poses[index]!.y, scale: galaxyFitScale(g, this.rig.room) }, performance.now());
    this.requestFrame();
  }

  private approach(id: string): void {
    const { layout } = this;
    const point = layout && this.selectedId === id && posedPoint(layout, this.poses, id);
    if (!point) return;
    this.rig.approach(point, layout.galaxies[layout.galaxyOf.get(id) ?? -1] ?? null, readHexRoom(this.canvas, this.width, this.height), performance.now());
    this.requestFrame();
  }

  private clearApproach(): void {
    for (const t of this.approachTimers) window.clearTimeout(t);
    this.approachTimers = [];
  }

  private frame(now: number): void {
    this.raf = 0;
    let again = true;
    try {
      again = this.draw(now);
    } finally {
      if (again) this.requestFrame();
    }
  }

  private draw(now: number): boolean {
    const { layout, inks, rig } = this;
    if (!layout || !inks || this.width <= 1) return false;
    const started = performance.now();
    const dt = this.lastNow ? Math.min(64, Math.max(0, now - this.lastNow)) : 16;
    this.lastNow = now;
    let why = rig.step(now) ? 1 : 0;
    this.hazeAwake = stepHaze(this.haze, { now, dt, windowStart: Math.max(this.lastInput, this.arrivalEnd), reducedMotion: this.options.reducedMotion, visible: document.visibilityState === "visible" });
    if (this.hazeAwake) why |= 4;
    if (this.arrival && this.arrival.start < 0) [this.arrival.start, this.arrivalEnd] = [now, now + ARRIVAL_MS];
    if (this.arrival) this.arrivalClock = Math.max(0, now - this.arrival.start);
    if (this.arrival && !applyArrival(layout, this.arrivalClock, this.arrival.mode, this.poses)) this.arrival = null;
    else if (!this.arrival) applyArrival(layout, 0, "none", this.poses);
    if (!this.arrival && this.roomHeld) this.resize();
    applyHaze(layout, this.haze, this.poses, rig.camera.scale, this.options.reducedMotion);
    if (this.arrival) why |= 8;
    const attended = this.selectedId ?? this.hoverId;
    const revealMs = this.reveal.revealMs(attended, now);
    if (attended && !this.options.reducedMotion && revealMs < RELATION_REVEAL_MS) why |= 32;
    const paintLog: CosmosPaintRecord[] | null = this.paintLog ? (this.paintLog = []) : null;
    const stats = drawCosmosFrame({
      ctx: this.ctx, width: this.width, height: this.height, dpr: this.dpr, room: rig.room, camera: rig.camera, overviewScale: rig.overviewScale,
      layout, inks, poses: this.poses, lens: this.lens, trail: this.trail, reducedMotion: this.options.reducedMotion,
      attention: { selectedId: this.selectedId, hoverId: this.hoverId, hoverGalaxy: this.hoverGalaxy, focusGalaxy: -1, revealMs },
      relationsOf: (id) => this.relations.get(id) ?? [],
      pointOf: (id) => posedPoint(layout, this.poses, id),
      record: paintLog ? (id, x, y, r) => paintLog.push({ id, x, y, r }) : null,
      cache: this.cache, deepField: this.deepField, buildBudget: 4, frame: this.frames,
    });
    if (stats.pendingBuilds > 0) why |= 16;
    const rest = this.cameraRest.step(rig.camera, rig.room, rig.held() || this.arrival !== null || stats.pendingBuilds > 0);
    if (rest === "moving") why |= 64;
    else if (rest === "rest") this.options.onCameraRest?.();
    this.lastStats = stats;
    this.frames += 1;
    this.frameLog.push({ t: now, ms: performance.now() - started, builds: stats.buildsStarted, firstDraws: stats.firstDraws, why, sinceInput: now - this.lastInput });
    if (this.frameLog.length > 600) this.frameLog.splice(0, this.frameLog.length - 600);
    if (!this.drawnReported && stats.pendingBuilds === 0) {
      this.drawnReported = true;
      this.options.onDrawn?.(layout.points.size);
    }
    if (this.probed) writeProbeFrame(this.canvas, this);
    if (stats.band !== this.band) this.options.onBand?.((this.band = stats.band));
    if (why === 0) {
      this.options.onBand?.(stats.band);
      this.options.onRest?.();
    }
    return why !== 0;
  }

  private local(clientX: number, clientY: number): { x: number; y: number } {
    const { left, top } = this.canvas.getBoundingClientRect();
    return { x: clientX - left, y: clientY - top };
  }

  hit(sx: number, sy: number): { id: string | null; galaxy: number } {
    if (!this.layout) return { id: null, galaxy: -1 };
    return this.hits.hit(this.layout, this.poses, this.rig.camera, this.rig.room, this.dpr, sx, sy);
  }

  private gesture(): void {
    this.lastInput = performance.now();
    this.clearApproach();
  }

  private zoomAt(screen: { x: number; y: number }, factor: number, animate: boolean): void {
    this.gesture();
    this.rig.zoomAt(screen, factor, animate, performance.now());
    this.requestFrame();
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (!this.rig.wheel(e, this.local(e.clientX, e.clientY), this.height, this.options.navigationSpeed.zoom, performance.now())) return;
    this.gesture();
    this.requestFrame();
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.lastInput = performance.now();
    this.canvas.focus({ preventScroll: true });
    this.canvas.setPointerCapture?.(e.pointerId);
    this.rig.dragStart(e.pointerId, this.local(e.clientX, e.clientY), e.timeStamp);
  }

  private onPointerMove(e: PointerEvent): void {
    const motionless = this.lastPointer !== null && e.clientX === this.lastPointer.x && e.clientY === this.lastPointer.y;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    if (motionless) return;
    this.lastInput = performance.now();
    const p = this.local(e.clientX, e.clientY);
    const step = this.rig.dragMove(e.pointerId, p, e.timeStamp, this.options.navigationSpeed.drag);
    if (step) {
      if (step === "started") this.gesture();
      if (step !== "held") this.requestFrame();
      return;
    }
    const hit = this.hit(p.x, p.y);
    if (!this.setHover(hit.id, hit.galaxy) && this.haze.mode !== "off") this.requestFrame();
  }

  private setHover(id: string | null, galaxy: number): boolean {
    if (id === this.hoverId && galaxy === this.hoverGalaxy) return false;
    this.hoverId = id;
    this.hoverGalaxy = galaxy;
    this.canvas.style.cursor = id || galaxy >= 0 ? "pointer" : "grab";
    this.requestFrame();
    return true;
  }

  private onPointerUp(e: PointerEvent): void {
    const t = readOntologyMapTokensOrNull();
    const end = this.rig.dragEnd(e.pointerId, e.timeStamp, this.options.navigationSpeed.drag, t && { windowMs: t.cameraReleaseVelocityWindowMs, minSpeed: t.cameraFlickMinSpeed });
    this.requestFrame();
    if (end !== "click") return;
    const p = this.local(e.clientX, e.clientY);
    const hit = this.hit(p.x, p.y);
    if (hit.id) this.options.onSelect?.(hit.id);
    else if (hit.galaxy >= 0) this.flyToGalaxy(hit.galaxy);
    else this.options.onPaneClick?.();
  }

  private onKey(e: KeyboardEvent): void {
    this.lastInput = performance.now();
    const { layout, rig } = this;
    if (!layout || isImeComposing(e)) return;
    const centre = { x: rig.room.x + rig.room.width / 2, y: rig.room.y + rig.room.height / 2 };
    const intent = keyboardZoomIntent(e, this.options.navigationSpeed.zoom);
    if (intent) {
      e.preventDefault();
      if (intent.kind === "zoom") return this.zoomAt(centre, intent.factor, true);
      this.gesture();
      rig.gesture();
      return this.overview();
    }
    if (e.key === "Escape") return this.selectedId !== null ? this.options.onPaneClick?.() : this.overview();
    if (e.key === "Enter") {
      const gi = layout.galaxies.findIndex((g) => g.id === this.selectedId);
      if (gi >= 0) e.preventDefault();
      return this.flyToGalaxy(gi);
    }
    if (!WALK_KEYS.has(e.key)) return;
    const candidates = walkCandidates({ layout, poses: this.poses, camera: rig.camera, room: rig.room, dpr: this.dpr });
    const galaxyCentreOf = (id: string) => galaxyCentreOn(layout, this.poses, rig.camera, rig.room, id);
    const step = walkTarget({ key: e.key, selectedId: this.selectedId, candidates, roomCentre: centre, galaxyCentreOf });
    if (step.id) this.options.onSelect?.(step.id);
    else if (step.deadEnd) this.options.onWalkDeadEnd?.();
  }

  private onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    const p = this.local(e.clientX, e.clientY);
    const [id, position] = [this.hit(p.x, p.y).id, { x: e.clientX, y: e.clientY }];
    if (id) this.options.onContextMenuNode?.(id, position);
    else this.options.onContextMenuPane?.(position);
  }
}
