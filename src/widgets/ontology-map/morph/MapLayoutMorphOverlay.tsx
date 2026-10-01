"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import {
  copyCanvasAtCssSize,
  isMapLayoutMorphArmed,
  mapLayoutPublishCount,
  publishMapLayoutSnapshot,
  takeMapLayoutMorph,
  type MapLayoutMark,
  type MapLayoutMarkShape,
} from "@/shared/lib/map-layout-morph-store";
import { cubicBezierAt } from "@/shared/motion/ease";
import { EXIT_TRANSITION, MOTION, OVERLAY_SPRING_REDUCED } from "@/shared/motion/tokens";
import { layoutMorphEase, planLayoutMorph, sampleLayoutMorph, type LayoutMorphPlan } from "./layout-morph";

export interface MapLayoutTarget {
  marks: MapLayoutMark[];
  ground: string;
  paint?: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
}

export interface MapLayoutMorphJob {
  mode: "ghost" | "fade";
  reducedMotion: boolean;
  parentOf: () => ReadonlyMap<string, string>;
  target: ((host: HTMLCanvasElement) => MapLayoutTarget | null) | null;
  source: (() => HTMLCanvasElement | null) | null;
}

type Phase = "travel" | "hold" | "fade" | "done";

interface MorphRecord {
  mode: "ghost" | "fade";
  count: number;
  plannedMs: number;
  travelStartMs: number;
  travelEndMs: number | null;
  fadeStartMs: number | null;
  doneMs: number | null;
  settledBy: string | null;
}

interface MorphRun {
  mode: "ghost" | "fade";
  phase: Phase;
  plan: LayoutMorphPlan | null;
  source: HTMLCanvasElement | null;
  target: HTMLCanvasElement | null;
  ground: string;
  startMs: number;
  progress: number;
  fadeStartMs: number;
  holdFrames: number;
  record: MorphRecord;
}

const TARGET_BUDGET_MS = MOTION.fast.duration * 1000;
const GHOST_LIFT = 0.2;
const CROSSFADE_FROM = 0.35;
const GHOST_HANDOFF_FROM = 0.8;
const HOLD_FRAME_LIMIT = 600;
const RECORD_LIMIT = 8;
const HEX_UNIT = Array.from({ length: 6 }, (_, k) => [Math.cos((k * Math.PI) / 3), Math.sin((k * Math.PI) / 3)] as const);

const records: MorphRecord[] = [];
let liveRun: MorphRun | null = null;

export function installMapLayoutMorphProbe(): void {
  if (typeof window === "undefined" || !new URLSearchParams(window.location.search).has("e2e")) return;
  (window as unknown as { __atlasMapMorph?: unknown }).__atlasMapMorph = {
    records: () => records.map((record) => ({ ...record })),
    live: () => (liveRun ? { mode: liveRun.mode, phase: liveRun.phase, progress: liveRun.progress } : null),
    marks: (progress?: number) =>
      liveRun?.plan ? sampleLayoutMorph(liveRun.plan, progress ?? liveRun.progress).map(({ id, x, y }) => ({ id, x, y })) : [],
    publishes: () => mapLayoutPublishCount(),
  };
}

const window01 = (from: number, to: number, p: number) => Math.min(1, Math.max(0, (p - from) / (to - from)));

function traceShape(path: Path2D, shape: MapLayoutMarkShape, x: number, y: number, r: number): void {
  if (!(r > 0)) return;
  if (shape === "disc") {
    path.moveTo(x + r, y);
    path.arc(x, y, r, 0, Math.PI * 2);
  } else if (shape === "square") {
    path.rect(x - r, y - r, 2 * r, 2 * r);
  } else {
    path.moveTo(x + r, y);
    for (const [cx, cy] of HEX_UNIT) path.lineTo(x + r * cx, y + r * cy);
    path.closePath();
  }
}

function colorMixer(ctx: CanvasRenderingContext2D) {
  const parsed = new Map<string, [number, number, number] | null>();
  const rgb = (color: string) => {
    if (parsed.has(color)) return parsed.get(color)!;
    ctx.fillStyle = "#000";
    ctx.fillStyle = color;
    const normal = String(ctx.fillStyle);
    const hex = /^#([0-9a-f]{6})$/i.exec(normal);
    const fn = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(normal);
    const value: [number, number, number] | null = hex
      ? [parseInt(hex[1]!.slice(0, 2), 16), parseInt(hex[1]!.slice(2, 4), 16), parseInt(hex[1]!.slice(4, 6), 16)]
      : fn
        ? [Number(fn[1]), Number(fn[2]), Number(fn[3])]
        : null;
    parsed.set(color, value);
    return value;
  };
  return (from: string, to: string, e: number): string => {
    if (from === to) return from;
    const a = rgb(from);
    const b = rgb(to);
    if (!a || !b) return e < 0.5 ? from : to;
    return `rgb(${Math.round(a[0] + (b[0] - a[0]) * e)} ${Math.round(a[1] + (b[1] - a[1]) * e)} ${Math.round(a[2] + (b[2] - a[2]) * e)})`;
  };
}

function drawGhosts(ctx: CanvasRenderingContext2D, plan: LayoutMorphPlan, e: number, visibility: number, mix: ReturnType<typeof colorMixer>) {
  ctx.lineWidth = 1;
  for (const group of plan.groups) {
    const alpha = (group.alphaFrom + (group.alphaTo - group.alphaFrom) * e) * visibility;
    if (alpha <= 0.01) continue;
    const shape = e < 0.5 ? group.from.shape : group.to.shape;
    const path = new Path2D();
    for (const i of group.members) {
      traceShape(
        path,
        shape,
        plan.x0[i]! + (plan.x1[i]! - plan.x0[i]!) * e,
        plan.y0[i]! + (plan.y1[i]! - plan.y0[i]!) * e,
        plan.s0[i]! + (plan.s1[i]! - plan.s0[i]!) * e,
      );
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = mix(group.from.fill, group.to.fill, e);
    ctx.fill(path);
    ctx.strokeStyle = mix(group.from.stroke, group.to.stroke, e);
    ctx.stroke(path);
  }
}

function drawTravel(ctx: CanvasRenderingContext2D, run: MorphRun, width: number, height: number, mix: ReturnType<typeof colorMixer>) {
  const p = run.progress;
  const e = layoutMorphEase(p);
  const lift = Math.min(1, p / GHOST_LIFT);
  const reveal = run.target ? window01(CROSSFADE_FROM, 1, p) : 0;
  ctx.globalAlpha = 1;
  ctx.fillStyle = run.ground;
  ctx.fillRect(0, 0, width, height);
  if (run.source && reveal < 1) {
    ctx.globalAlpha = 1 - reveal;
    ctx.drawImage(run.source, 0, 0, width, height);
  }
  if (run.target && reveal > 0) {
    ctx.globalAlpha = reveal;
    ctx.drawImage(run.target, 0, 0, width, height);
  }
  const handoff = run.target ? 1 - window01(GHOST_HANDOFF_FROM, 1, p) : 1;
  drawGhosts(ctx, run.plan!, e, lift * handoff, mix);
  ctx.globalAlpha = 1;
}

function bitmapAt(canvas: HTMLCanvasElement, paint: (ctx: CanvasRenderingContext2D, width: number, height: number) => void) {
  const box = canvas.getBoundingClientRect();
  const bitmap = canvas.ownerDocument.createElement("canvas");
  bitmap.width = Math.max(1, Math.round(box.width));
  bitmap.height = Math.max(1, Math.round(box.height));
  const ctx = bitmap.getContext("2d");
  if (!ctx) return null;
  paint(ctx, bitmap.width, bitmap.height);
  return bitmap;
}

function beginRun(canvas: HTMLCanvasElement, job: MapLayoutMorphJob, now: number): MorphRun {
  const snapshot = takeMapLayoutMorph();
  const record: MorphRecord = { mode: job.mode, count: 0, plannedMs: 0, travelStartMs: now, travelEndMs: null, fadeStartMs: null, doneMs: null, settledBy: null };
  const run: MorphRun = {
    mode: "fade",
    phase: "hold",
    plan: null,
    source: snapshot?.bitmap ?? copyCanvasAtCssSize(job.source?.() ?? null),
    target: null,
    ground: snapshot?.ground ?? "transparent",
    startMs: now,
    progress: 1,
    fadeStartMs: now,
    holdFrames: 0,
    record,
  };
  if (job.mode === "ghost" && job.target && snapshot) {
    const target = job.target(canvas);
    const bitmap = target?.paint ? bitmapAt(canvas, target.paint) : null;
    if (target && performance.now() - now <= TARGET_BUDGET_MS) {
      run.mode = "ghost";
      run.phase = "travel";
      run.plan = planLayoutMorph(snapshot.marks, target.marks, job.parentOf());
      run.target = bitmap;
      run.progress = 0;
      run.startMs = performance.now();
      record.count = run.plan.ids.length;
      record.plannedMs = run.plan.durationMs;
      record.travelStartMs = run.startMs;
    } else if (bitmap) {
      bitmap.width = 0;
    }
  }
  record.mode = run.mode;
  records.push(record);
  if (records.length > RECORD_LIMIT) records.shift();
  return run;
}

function release(run: MorphRun): void {
  for (const bitmap of [run.source, run.target]) if (bitmap) bitmap.width = 0;
  run.source = null;
  run.target = null;
}

function snapshotOf(run: MorphRun, canvas: HTMLCanvasElement): void {
  publishMapLayoutSnapshot({
    marks: run.plan ? sampleLayoutMorph(run.plan, run.progress) : [],
    bitmap: bitmapAt(canvas, (ctx, width, height) => ctx.drawImage(canvas, 0, 0, width, height)),
    ground: run.ground,
  });
}

export function MapLayoutMorphOverlay({
  job,
  holding,
  onTravelEnd,
  onDone,
}: {
  job: MapLayoutMorphJob;
  holding: boolean;
  onTravelEnd: () => void;
  onDone: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runRef = useRef<MorphRun | null>(null);
  const rafRef = useRef<number | null>(null);
  const holdingRef = useRef(holding);
  const callbacksRef = useRef({ onTravelEnd, onDone });
  const stepRef = useRef<(now: number) => void>(() => {});
  useLayoutEffect(() => {
    holdingRef.current = holding;
    callbacksRef.current = { onTravelEnd, onDone };
  });

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const run = (runRef.current ??= beginRun(canvas, job, performance.now()));
    liveRun = run;
    const mix = colorMixer(ctx);
    const paint = () => {
      const box = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(box.width * dpr));
      const h = Math.max(1, Math.round(box.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (run.plan) {
        drawTravel(ctx, run, box.width, box.height, mix);
      } else {
        ctx.clearRect(0, 0, box.width, box.height);
        if (run.source) ctx.drawImage(run.source, 0, 0, box.width, box.height);
      }
    };
    const finish = (by: string | null, at = performance.now()) => {
      if (run.phase === "done") return;
      run.phase = "done";
      run.record.doneMs = at;
      run.record.settledBy ??= by;
      release(run);
      callbacksRef.current.onDone();
    };
    const endTravel = (by: string | null, at = performance.now()) => {
      run.progress = 1;
      run.phase = "hold";
      run.record.travelEndMs = at;
      run.record.settledBy ??= by;
      paint();
      callbacksRef.current.onTravelEnd();
    };
    const settle = (by: string) => {
      if (run.phase === "travel") endTravel(by);
      else if (run.phase !== "done") finish(by);
    };
    const fadeMs = (job.reducedMotion ? OVERLAY_SPRING_REDUCED.duration : EXIT_TRANSITION.duration) * 1000;
    const startDpr = window.devicePixelRatio || 1;
    const step = (time: number) => {
      rafRef.current = null;
      if ((window.devicePixelRatio || 1) !== startDpr) settle("dpr");
      if (run.phase === "done") return;
      if (run.phase === "travel") {
        run.progress = Math.min(1, Math.max(0, (time - run.startMs) / run.plan!.durationMs));
        if (run.progress >= 1) endTravel(null, time);
        else paint();
      }
      if (run.phase === "hold") {
        run.holdFrames += 1;
        if (holdingRef.current && run.holdFrames < HOLD_FRAME_LIMIT) {
          rafRef.current = requestAnimationFrame(step);
          return;
        }
        run.phase = "fade";
        run.fadeStartMs = performance.now();
        run.record.fadeStartMs = run.fadeStartMs;
      }
      if (run.phase === "fade") {
        const t = Math.min(1, Math.max(0, (time - run.fadeStartMs) / fadeMs));
        canvas.style.opacity = String(1 - (job.reducedMotion ? t : cubicBezierAt(EXIT_TRANSITION.ease, t)));
        if (t >= 1) {
          finish(null, time);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    stepRef.current = step;
    if (run.phase !== "done") {
      paint();
      if (run.mode === "fade") callbacksRef.current.onTravelEnd();
      rafRef.current ??= requestAnimationFrame(step);
    }

    const onInput = (event: Event) => {
      if (event.target instanceof Element && event.target.closest("[data-map-layout-pick]")) return;
      settle(event.type);
    };
    const onResize = () => settle("resize");
    const onHidden = () => {
      if (document.hidden) settle("hidden");
    };
    window.addEventListener("pointerdown", onInput, true);
    window.addEventListener("wheel", onInput, { capture: true, passive: true });
    window.addEventListener("keydown", onInput, true);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      window.removeEventListener("pointerdown", onInput, true);
      window.removeEventListener("wheel", onInput, true);
      window.removeEventListener("keydown", onInput, true);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onHidden);
      if (isMapLayoutMorphArmed() && (run.phase === "travel" || run.phase === "hold")) snapshotOf(run, canvas);
      if (liveRun === run) liveRun = null;
    };
  }, [job]);

  useEffect(() => {
    if (!holding && runRef.current?.phase === "hold" && rafRef.current == null) {
      rafRef.current = requestAnimationFrame((time) => stepRef.current(time));
    }
  }, [holding]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
      <canvas ref={canvasRef} data-testid="map-layout-morph" className="block h-full w-full" />
    </div>
  );
}
