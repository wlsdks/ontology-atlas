import { expect, type Page } from "@playwright/test";

export type MotionTrack = { name: string; selector: string };

export type MotionFrameValue = {
  opacity: number;
  translate: string;
  rotate: string;
  scale: string;
  transform: string;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeDashoffset: string;
  color: string;
  backgroundColor: string;
  boxShadow: string;
} | null;

export type MotionRecording = {
  frames: number[];
  inputs: { type: string; t: number }[];
  longTasks: { start: number; duration: number }[];
  layoutShifts: { t: number; value: number }[];
  tracks: Record<string, MotionFrameValue[]>;
  ink: number[];
  map: (unknown | null)[];
};

export type SampleOptions = { tracks: MotionTrack[]; inkSelector?: string; mapCamera?: boolean };

type SamplerWindow = Window & {
  __motionSampler?: { start(opts: SampleOptions): void; stop(): MotionRecording };
  __atlasMap?: { camera?: () => unknown };
};

function samplerSource() {
  const w = window as SamplerWindow;
  if (w.__motionSampler) return;
  let rec: MotionRecording | null = null;
  let opts: SampleOptions | null = null;
  let raf = 0;
  const observers: PerformanceObserver[] = [];
  const scratch = document.createElement("canvas");

  const read = (sel: string): MotionFrameValue => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      opacity: Number(cs.opacity),
      translate: cs.translate,
      rotate: cs.rotate,
      scale: cs.scale,
      transform: cs.transform,
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      strokeDashoffset: cs.strokeDashoffset,
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      boxShadow: cs.boxShadow,
    };
  };

  const ink = (sel: string): number => {
    const canvases = [...document.querySelectorAll<HTMLCanvasElement>(sel)];
    const first = canvases[0];
    if (!first) return 0;
    scratch.width = Math.max(1, Math.round(first.width / 8));
    scratch.height = Math.max(1, Math.round(first.height / 8));
    const ctx = scratch.getContext("2d", { willReadFrequently: true });
    if (!ctx) return 0;
    ctx.clearRect(0, 0, scratch.width, scratch.height);
    for (const c of canvases) {
      ctx.globalAlpha = Number(getComputedStyle(c).opacity);
      ctx.drawImage(c, 0, 0, scratch.width, scratch.height);
    }
    const data = ctx.getImageData(0, 0, scratch.width, scratch.height).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += ((0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) * data[i + 3]) / 255;
    }
    return sum;
  };

  const onInput = (e: Event) => rec?.inputs.push({ type: e.type, t: e.timeStamp });

  const tick = (t: number) => {
    if (!rec || !opts) return;
    rec.frames.push(t);
    for (const track of opts.tracks) rec.tracks[track.name].push(read(track.selector));
    if (opts.inkSelector) rec.ink.push(ink(opts.inkSelector));
    if (opts.mapCamera) rec.map.push(w.__atlasMap?.camera?.() ?? null);
    raf = requestAnimationFrame(tick);
  };

  w.__motionSampler = {
    start(next) {
      opts = next;
      rec = { frames: [], inputs: [], longTasks: [], layoutShifts: [], tracks: {}, ink: [], map: [] };
      for (const track of next.tracks) rec.tracks[track.name] = [];
      for (const type of ["pointerdown", "pointerup", "keydown", "keyup", "click"]) {
        window.addEventListener(type, onInput, { capture: true });
      }
      const current = rec;
      for (const [type, push] of [
        ["longtask", (e: PerformanceEntry) => current.longTasks.push({ start: e.startTime, duration: e.duration })],
        ["layout-shift", (e: PerformanceEntry) => current.layoutShifts.push({ t: e.startTime, value: (e as PerformanceEntry & { value: number }).value })],
      ] as const) {
        try {
          const o = new PerformanceObserver((list) => list.getEntries().forEach(push));
          o.observe({ type, buffered: false });
          observers.push(o);
        } catch {
          continue;
        }
      }
      raf = requestAnimationFrame(tick);
    },
    stop() {
      cancelAnimationFrame(raf);
      for (const o of observers.splice(0)) {
        for (const e of o.takeRecords()) {
          if (e.entryType === "longtask") rec!.longTasks.push({ start: e.startTime, duration: e.duration });
          else rec!.layoutShifts.push({ t: e.startTime, value: (e as PerformanceEntry & { value: number }).value });
        }
        o.disconnect();
      }
      for (const type of ["pointerdown", "pointerup", "keydown", "keyup", "click"]) {
        window.removeEventListener(type, onInput, { capture: true });
      }
      const out = rec!;
      rec = null;
      opts = null;
      return out;
    },
  };
}

export async function installMotionSampler(page: Page): Promise<void> {
  await page.addInitScript(samplerSource);
}

export async function startSampling(page: Page, opts: SampleOptions): Promise<void> {
  await page.evaluate(samplerSource);
  await page.evaluate((o) => (window as SamplerWindow).__motionSampler!.start(o), opts);
}

export async function stopSampling(page: Page): Promise<MotionRecording> {
  return page.evaluate(() => (window as SamplerWindow).__motionSampler!.stop());
}

export function translateY(value: string): number {
  if (!value || value === "none") return 0;
  const parts = value.split(/\s+/);
  return parts.length > 1 ? parseFloat(parts[1]) : 0;
}

export function rotationDegrees(v: NonNullable<MotionFrameValue>): number {
  if (v.rotate && v.rotate !== "none") return parseFloat(v.rotate);
  const m = /matrix\(([^)]+)\)/.exec(v.transform);
  if (!m) return 0;
  const [a, b] = m[1].split(",").map(Number);
  return (Math.atan2(b, a) * 180) / Math.PI;
}

export function colorDistance(a: string, b: string): number {
  const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).slice(0, 4).map(Number);
  const [p, q] = [rgb(a), rgb(b)];
  const alpha = (x: number[]) => (x.length > 3 ? x[3] : 1);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2], (alpha(p) - alpha(q)) * 255);
}

export type MotionShares = { ffs: number; mfs: number; settleMs: number; changed: boolean; intermediate: number };

export function motionShares(values: number[], frames: number[], fromTime: number): MotionShares {
  const start = frames.findIndex((t) => t >= fromTime);
  if (start < 1) return { ffs: 0, mfs: 0, settleMs: 0, changed: false, intermediate: 0 };
  const base = values[start - 1];
  const slice = values.slice(start);
  const peak = slice.reduce((best, v) => (Math.abs(v - base) > Math.abs(best - base) ? v : best), base);
  const total = Math.abs(peak - base);
  if (total === 0) return { ffs: 0, mfs: 0, settleMs: 0, changed: false, intermediate: 0 };
  let ffs = -1;
  let mfs = 0;
  let last = start;
  let intermediate = 0;
  for (let i = start; i < values.length; i += 1) {
    const step = Math.abs(values[i] - values[i - 1]);
    if (step === 0) continue;
    const share = (step / total) * Math.max(1, 16.7 / (frames[i] - frames[i - 1]));
    if (ffs < 0) ffs = share;
    mfs = Math.max(mfs, share);
    last = i;
    const progress = Math.abs(values[i] - base) / total;
    if (progress > 0.02 && progress < 0.98) intermediate += 1;
  }
  return { ffs: Math.max(ffs, 0), mfs, settleMs: frames[last] - fromTime, changed: true, intermediate };
}

export const FRAME_INTERVAL_BUDGET_MS = 50;
export const PERF_BARS = process.env.MAP_PERF_BARS === "1";

export type SmoothnessReport = {
  frames: number;
  maxIntervalMs: number;
  longTasks: number;
  layoutShifts: { value: number; recent: boolean }[];
  animated: { target: string; property: string; infinite: boolean }[];
};

type SmoothnessWindow = Window & {
  __smoothness?: { start(): void; stop(): SmoothnessReport };
};

function smoothnessSource() {
  const w = window as SmoothnessWindow;
  if (w.__smoothness) return;
  let report: SmoothnessReport | null = null;
  let raf = 0;
  let last = 0;
  const seenAnimations = new WeakSet<Animation>();
  const observers: PerformanceObserver[] = [];
  const IGNORED = new Set(["offset", "computedOffset", "easing", "composite"]);
  const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

  const inspect = () => {
    for (const animation of document.getAnimations()) {
      if (animation.playState !== "running" || seenAnimations.has(animation)) continue;
      seenAnimations.add(animation);
      const effect = animation.effect as KeyframeEffect | null;
      if (!effect) continue;
      if ((effect.pseudoElement ?? "").startsWith("::view-transition")) continue;
      const properties =
        animation instanceof CSSTransition
          ? [animation.transitionProperty]
          : Object.keys(effect.getKeyframes()[0] ?? {})
              .concat(...effect.getKeyframes().slice(1).map((frame) => Object.keys(frame)))
              .filter((key) => !IGNORED.has(key))
              .map(kebab);
      const element = effect.target as Element | null;
      const target = element ? `${element.tagName.toLowerCase()}${element.classList[0] ? `.${element.classList[0]}` : ""}` : "(none)";
      const infinite = effect.getTiming().iterations === Infinity;
      for (const property of new Set(properties)) report!.animated.push({ target, property, infinite });
    }
  };

  const tick = (t: number) => {
    if (!report) return;
    report.frames += 1;
    if (last) report.maxIntervalMs = Math.max(report.maxIntervalMs, t - last);
    last = t;
    inspect();
    raf = requestAnimationFrame(tick);
  };

  w.__smoothness = {
    start() {
      report = { frames: 0, maxIntervalMs: 0, longTasks: 0, layoutShifts: [], animated: [] };
      last = 0;
      const current = report;
      for (const type of ["longtask", "layout-shift"] as const) {
        try {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (type === "longtask") current.longTasks += 1;
              else {
                const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
                current.layoutShifts.push({ value: shift.value, recent: shift.hadRecentInput });
              }
            }
          });
          observer.observe({ type, buffered: false });
          observers.push(observer);
        } catch {
          continue;
        }
      }
      raf = requestAnimationFrame(tick);
    },
    stop() {
      cancelAnimationFrame(raf);
      inspect();
      for (const observer of observers.splice(0)) {
        for (const entry of observer.takeRecords()) {
          if (entry.entryType === "longtask") report!.longTasks += 1;
          else {
            const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
            report!.layoutShifts.push({ value: shift.value, recent: shift.hadRecentInput });
          }
        }
        observer.disconnect();
      }
      const out = report!;
      report = null;
      return out;
    },
  };
}

export async function startSmoothness(page: Page): Promise<void> {
  await page.evaluate(smoothnessSource);
  await page.evaluate(() => (window as SmoothnessWindow).__smoothness!.start());
}

export async function stopSmoothness(page: Page): Promise<SmoothnessReport> {
  return page.evaluate(() => (window as SmoothnessWindow).__smoothness!.stop());
}

const LAYOUT =
  /^(?:(?:min-|max-)?(?:width|height)|top|right|bottom|left|inset(?:-.+)?|margin(?:-.+)?|padding(?:-.+)?|border(?:-(?:top|right|bottom|left))?-width|font-size|line-height|letter-spacing|flex-basis|grid-template-(?:rows|columns)|(?:row-|column-)?gap)$/;

export function smoothnessViolations(report: SmoothnessReport, opts: { reflow?: readonly string[] } = {}): string[] {
  const reflow = opts.reflow ?? [];
  const out: string[] = [];
  for (const { target, property, infinite } of report.animated) {
    if (!LAYOUT.test(property)) continue;
    if (infinite) out.push(`${target}: ${property} animates in a loop`);
    else if (!reflow.includes(property)) out.push(`${target}: ${property} animates outside a declared reflow`);
  }
  if (reflow.length === 0) {
    for (const shift of report.layoutShifts) {
      if (!shift.recent) out.push(`layout shift ${shift.value} without recent input`);
    }
  }
  return out;
}

export function expectSmoothMotion(report: SmoothnessReport, opts: { reflow?: readonly string[] } = {}): void {
  console.log(
    `[smoothness] ${JSON.stringify({ frames: report.frames, maxIntervalMs: Math.round(report.maxIntervalMs), longTasks: report.longTasks })}`,
  );
  expect(report.frames, "the page drew no frames while the motion ran").toBeGreaterThan(5);
  expect(smoothnessViolations(report, opts)).toEqual([]);
  if (PERF_BARS) expect(report.maxIntervalMs).toBeLessThanOrEqual(FRAME_INTERVAL_BUDGET_MS);
}
