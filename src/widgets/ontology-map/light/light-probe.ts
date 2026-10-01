import type { LightLayer } from "./light-layer";
import type { LightHead } from "./light-sources";
import type { LightPlan } from "./signal-plan";

export interface LightProbeBloom {
  id: string;
  strength: number;
}

interface Camera {
  x: number;
  y: number;
  scale: number;
}

interface LightProbeFrame {
  now: number;
  lightMs: number;
  prepareMs: number;
  renderMs: number;
  focus: string | null;
  reveal: number;
  standDowns: number;
  drew: boolean;
  camera: Camera;
  width: number;
  height: number;
  pathOpen: boolean;
  heads: LightHead[];
  blooms: LightProbeBloom[];
  glue: {
    key: string;
    t: number;
    ambiguous: boolean;
    cameraShiftPx: number;
    offsetPx: number;
    lineContrast: number;
    lightPeak: number;
    headInk: number;
    aheadInk: number;
    lightProfile: number[];
    lineProfile: number[];
  }[];
}

export interface LightProbeSource {
  state(): string;
  active(): boolean;
  plans(): (LightPlan<unknown> | null)[];
  heads(): readonly LightHead[];
}

export interface LightProbe {
  readonly recording: boolean;
  afterFrame(frame: Omit<LightProbeFrame, "glue">, layer: LightLayer | null, mapCanvas: HTMLCanvasElement | null): void;
  dispose(): void;
}

const RECORD_LIMIT = 900;
const GLUE_ACROSS_PX = 6;
const GLUE_SLICES = 4;
const GLUE_SLICE_PX = 2;
const GLUE_RIM_PX = 16;
const GLUE_HEADS = 3;
const AHEAD_PX = 12;
const CURVE_STEPS = 16;

type Point = readonly [number, number];

interface Block {
  left: number;
  top: number;
  width: number;
  data: Uint8Array | Uint8ClampedArray;
}

function peakAt(values: readonly number[], offsets: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i += 1) if (values[i]! > values[best]!) best = i;
  let lo = best;
  let hi = best;
  while (lo > 0 && values[lo - 1] === values[best]) lo -= 1;
  while (hi < values.length - 1 && values[hi + 1] === values[best]) hi += 1;
  if (hi > lo) return (offsets[lo]! + offsets[hi]!) / 2;
  if (best === 0 || best === values.length - 1) return offsets[best]!;
  const left = values[best - 1]!;
  const right = values[best + 1]!;
  const curvature = left - 2 * values[best]! + right;
  return offsets[best]! + (curvature === 0 ? 0 : (0.5 * (left - right)) / curvature);
}

function isolated(values: readonly number[]): boolean {
  const half = 0.5 * Math.max(...values);
  return values[0]! < half && values[values.length - 1]! < half;
}

function singlePeak(values: readonly number[]): boolean {
  const floor = Math.min(...values);
  const threshold = floor + 0.5 * (Math.max(...values) - floor);
  let runs = 0;
  for (let i = 0; i < values.length; i += 1) if (values[i]! > threshold && (i === 0 || values[i - 1]! <= threshold)) runs += 1;
  return runs === 1;
}

function boundsOf(points: readonly Point[], scale: number) {
  const left = Math.floor(Math.min(...points.map((p) => p[0])) * scale) - 1;
  const top = Math.floor(Math.min(...points.map((p) => p[1])) * scale) - 1;
  const right = Math.ceil(Math.max(...points.map((p) => p[0])) * scale) + 1;
  const bottom = Math.ceil(Math.max(...points.map((p) => p[1])) * scale) + 1;
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

function texel(block: Block, x: number, y: number, scale: number): number {
  const height = block.data.length / 4 / block.width;
  const px = Math.min(block.width - 1, Math.max(0, Math.round(x * scale) - block.left));
  const py = Math.min(height - 1, Math.max(0, Math.round(y * scale) - block.top));
  return (py * block.width + px) * 4;
}

function curveAt(curve: LightHead["curve"], t: number): { x: number; y: number; tx: number; ty: number } {
  const [ax, ay, cx, cy, bx, by] = curve;
  const u = 1 - t;
  const dx = 2 * u * (cx - ax) + 2 * t * (bx - cx);
  const dy = 2 * u * (cy - ay) + 2 * t * (by - cy);
  const length = Math.hypot(dx, dy) || 1;
  return { x: u * u * ax + 2 * u * t * cx + t * t * bx, y: u * u * ay + 2 * u * t * cy + t * t * by, tx: dx / length, ty: dy / length };
}

function curveLength(curve: LightHead["curve"]): number {
  let length = 0;
  let previous = curveAt(curve, 0);
  for (let i = 1; i <= CURVE_STEPS; i += 1) {
    const next = curveAt(curve, i / CURVE_STEPS);
    length += Math.hypot(next.x - previous.x, next.y - previous.y);
    previous = next;
  }
  return length;
}

function cameraShiftAcross(
  point: { x: number; y: number; tx: number; ty: number },
  frame: Pick<LightProbeFrame, "camera" | "width" | "height">,
  previous: Camera | null,
): number {
  if (previous === null) return 0;
  const { camera, width, height } = frame;
  const worldX = (point.x - width / 2) / camera.scale + camera.x;
  const worldY = (point.y - height / 2) / camera.scale + camera.y;
  const shiftX = (worldX - previous.x) * previous.scale + width / 2 - point.x;
  const shiftY = (worldY - previous.y) * previous.scale + height / 2 - point.y;
  return Math.abs(shiftY * point.tx - shiftX * point.ty);
}

function measureGlue(
  frame: Omit<LightProbeFrame, "glue">,
  previous: Camera | null,
  layer: LightLayer,
  mapCanvas: HTMLCanvasElement,
): LightProbeFrame["glue"] {
  const { heads } = frame;
  const context = mapCanvas.getContext("2d");
  const box = mapCanvas.getBoundingClientRect();
  if (!context || box.width <= 0) return [];
  const scale = mapCanvas.width / box.width;
  const across: number[] = [];
  for (let d = -GLUE_ACROSS_PX; d <= GLUE_ACROSS_PX; d += 1) across.push(d);
  const result: LightProbeFrame["glue"] = [];
  const clear = heads.filter((h) => {
    if (h.arrived) return false;
    const length = curveLength(h.curve);
    return (h.t - h.departAt) * length >= GLUE_RIM_PX + GLUE_SLICES * GLUE_SLICE_PX && (h.arriveAt - h.t) * length >= GLUE_RIM_PX;
  });
  for (const head of clear.slice(0, GLUE_HEADS)) {
    const length = curveLength(head.curve);
    const slices = Array.from({ length: GLUE_SLICES }, (_, k) => curveAt(head.curve, head.t - ((k + 1) * GLUE_SLICE_PX) / length));
    const rows = across.map((d) => slices.map((slice): Point => [slice.x - slice.ty * d, slice.y + slice.tx * d]));
    const tip = curveAt(head.curve, head.t);
    const ahead: Point = [tip.x + tip.tx * AHEAD_PX, tip.y + tip.ty * AHEAD_PX];
    const around: Point[] = [];
    for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) around.push([tip.x + dx, tip.y + dy]);
    const points = rows.flat();
    const glBox = boundsOf([...points, ahead, ...around], 1);
    const glBlock: Block = { ...glBox, data: layer.read(glBox.left, glBox.top, glBox.width, glBox.height) };
    const ink = ([x, y]: Point) => {
      const at = texel(glBlock, x, y, 1);
      return Math.max(glBlock.data[at]!, glBlock.data[at + 1]!, glBlock.data[at + 2]!);
    };
    const mapBox = boundsOf(points, scale);
    const mapBlock: Block = { ...mapBox, data: context.getImageData(mapBox.left, mapBox.top, mapBox.width, mapBox.height).data };
    const light = rows.map((row) => Math.max(...row.map(([x, y]) => glBlock.data[texel(glBlock, x, y, 1) + 3]!)));
    const line = rows.map((row) =>
      Math.max(
        ...row.map(([x, y]) => {
          const at = texel(mapBlock, x, y, scale);
          return 0.2126 * mapBlock.data[at]! + 0.7152 * mapBlock.data[at + 1]! + 0.0722 * mapBlock.data[at + 2]!;
        }),
      ),
    );
    result.push({
      key: head.key,
      t: head.t,
      ambiguous: !singlePeak(line) || !isolated(light),
      cameraShiftPx: cameraShiftAcross(slices[0]!, frame, previous),
      offsetPx: Math.abs(peakAt(light, across) - peakAt(line, across)),
      lineContrast: Math.max(...line) - Math.min(...line),
      lightPeak: Math.max(...light),
      headInk: Math.max(...around.map(ink)),
      aheadInk: ink(ahead),
      lightProfile: light,
      lineProfile: line.map((value) => Math.round(value)),
    });
  }
  return result;
}

export function installLightProbe(source: LightProbeSource): LightProbe {
  const records: LightProbeFrame[] = [];
  const pending: { points: Point[]; resolve: (pixels: number[][]) => void }[] = [];
  let recording = false;
  let glue = false;
  let previousCamera: Camera | null = null;

  const hook = {
    state: () => source.state(),
    active: () => source.active(),
    plan: () =>
      source.plans().flatMap((plan) =>
        plan === null
          ? []
          : [{
              kind: plan.kind,
              anchorId: plan.anchorId,
              createdMs: plan.createdMs,
              signals: plan.signals.map((signal) => ({
                key: signal.key,
                directional: signal.directional,
                fromId: signal.fromId,
                toId: signal.toId,
                bloomId: signal.bloomId,
                from: signal.from,
                startMs: signal.startMs,
                durationMs: signal.durationMs,
                departAt: signal.departAt,
                arriveAt: signal.arriveAt,
                revealBound: signal.revealBound,
                arrivedMs: signal.arrivedMs,
              })),
            }],
      ),
    heads: () => source.heads().map((head) => ({ ...head })),
    record: (on: boolean, options: { glue?: boolean } = {}) => {
      recording = on;
      glue = on && options.glue === true;
      if (on) records.length = 0;
    },
    records: () => records.slice(),
    sample: (points: readonly Point[]) =>
      new Promise<number[][]>((resolve) => {
        if (!source.active()) {
          resolve(points.map(() => [0, 0, 0, 0]));
          return;
        }
        pending.push({ points: [...points], resolve });
      }),
  };
  (window as unknown as { __atlasMapLight?: typeof hook }).__atlasMapLight = hook;

  return {
    get recording() {
      return recording || pending.length > 0;
    },
    afterFrame(frame, layer, mapCanvas) {
      if (pending.length > 0) {
        for (const request of pending.splice(0)) {
          request.resolve(
            request.points.map(([x, y]) => (layer && frame.drew ? Array.from(layer.read(Math.round(x), Math.round(y), 1, 1)) : [0, 0, 0, 0])),
          );
        }
      }
      const previous = previousCamera;
      previousCamera = frame.camera;
      if (!recording) return;
      records.push({ ...frame, glue: glue && layer && mapCanvas && frame.drew ? measureGlue(frame, previous, layer, mapCanvas) : [] });
      if (records.length > RECORD_LIMIT) records.shift();
    },
    dispose() {
      for (const request of pending.splice(0)) request.resolve(request.points.map(() => [0, 0, 0, 0]));
      const w = window as unknown as { __atlasMapLight?: typeof hook };
      if (w.__atlasMapLight === hook) delete w.__atlasMapLight;
    },
  };
}
