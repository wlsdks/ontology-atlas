import { revealEnd, type Point, type RevealEnd } from "../expressive/edge-reveal";

export interface LightKinematics {
  speed: number;
  hopMinMs: number;
  hopMaxMs: number;
  pathMaxMs: number;
  tail: number;
  intensity: number;
  bloomTauMs: number;
}

export const SIGNAL_CAP = 48;
const PATH_HOP_CAP = 30;
export const BLOOM_RISE_MS = 60;
const ARRIVAL_WAIT_MAX_MS = 1500;
export const LIGHT_FLOOR = 1 / 255;
const MAX_DEPART = 0.4;
const MIN_ARRIVE = 0.6;

export interface SignalEdge<E> {
  key: string;
  edge: E;
  sourceId: string;
  targetId: string;
  directional: boolean;
  evidenceCount: number;
  lengthPx: number;
  sourceRadiusPx: number;
  targetRadiusPx: number;
}

export interface PathHop<E> extends SignalEdge<E> {
  fromId: string;
  toId: string;
}

export interface LightSignal<E> {
  key: string;
  edge: E;
  from: RevealEnd;
  fromId: string;
  toId: string;
  startMs: number;
  durationMs: number;
  departAt: number;
  arriveAt: number;
  revealBound: boolean;
  blooms: boolean;
  arrivedMs: number;
}

export interface LightPlan<E> {
  kind: "focus" | "path";
  anchorId: string;
  createdMs: number;
  signals: LightSignal<E>[];
}

export interface SignalFrame {
  started: boolean;
  arrived: boolean;
  done: boolean;
  head: number;
  tailStart: number;
  drawnEnd: number;
  ignite: number;
}

export function hopDurationMs(travelPx: number, kinematics: LightKinematics): number {
  const ms = (Math.max(0, travelPx) / kinematics.speed) * 1000;
  return Math.min(kinematics.hopMaxMs, Math.max(kinematics.hopMinMs, ms));
}

function travelSpan(lengthPx: number, departRadiusPx: number, arriveRadiusPx: number): { departAt: number; arriveAt: number } {
  if (!(lengthPx > 0)) return { departAt: 0, arriveAt: 1 };
  const departAt = Math.min(MAX_DEPART, Math.max(0, departRadiusPx / lengthPx));
  const arriveAt = Math.max(MIN_ARRIVE, Math.min(1, 1 - arriveRadiusPx / lengthPx));
  return { departAt, arriveAt };
}

function compareFocusPriority<E>(left: SignalEdge<E>, right: SignalEdge<E>): number {
  if (left.directional !== right.directional) return left.directional ? -1 : 1;
  if (left.evidenceCount !== right.evidenceCount) return right.evidenceCount - left.evidenceCount;
  return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
}

function signalFor<E>(
  candidate: SignalEdge<E>,
  from: RevealEnd,
  startMs: number,
  kinematics: LightKinematics,
  options: { revealBound: boolean; blooms: (toId: string) => boolean },
): LightSignal<E> {
  const fromA = from === "a";
  const fromId = fromA ? candidate.sourceId : candidate.targetId;
  const toId = fromA ? candidate.targetId : candidate.sourceId;
  const { departAt, arriveAt } = travelSpan(
    candidate.lengthPx,
    fromA ? candidate.sourceRadiusPx : candidate.targetRadiusPx,
    fromA ? candidate.targetRadiusPx : candidate.sourceRadiusPx,
  );
  return {
    key: candidate.key,
    edge: candidate.edge,
    from,
    fromId,
    toId,
    startMs,
    durationMs: hopDurationMs((arriveAt - departAt) * candidate.lengthPx, kinematics),
    departAt,
    arriveAt,
    revealBound: options.revealBound,
    blooms: options.blooms(toId),
    arrivedMs: Number.NaN,
  };
}

export function planFocusSignal<E>(
  focusId: string,
  candidates: readonly SignalEdge<E>[],
  nowMs: number,
  kinematics: LightKinematics,
  reducedMotion: boolean,
): LightPlan<E> {
  const signals: LightSignal<E>[] = [];
  if (!reducedMotion) {
    const ranked = [...candidates].sort(compareFocusPriority).slice(0, SIGNAL_CAP);
    for (const candidate of ranked) {
      signals.push(
        signalFor(candidate, revealEnd(candidate.directional, candidate.sourceId, focusId), nowMs, kinematics, {
          revealBound: true,
          blooms: (toId) => toId !== focusId,
        }),
      );
    }
  }
  return { kind: "focus", anchorId: focusId, createdMs: nowMs, signals };
}

export function planPathSignal<E>(
  anchorId: string,
  hops: readonly PathHop<E>[],
  nowMs: number,
  kinematics: LightKinematics,
  reducedMotion: boolean,
): LightPlan<E> {
  const signals: LightSignal<E>[] = [];
  if (!reducedMotion) {
    for (const hop of hops.slice(0, PATH_HOP_CAP)) {
      signals.push(
        signalFor(hop, hop.fromId === hop.sourceId ? "a" : "b", nowMs, kinematics, { revealBound: false, blooms: () => true }),
      );
    }
    const total = signals.reduce((sum, signal) => sum + signal.durationMs, 0);
    const scale = total > kinematics.pathMaxMs ? kinematics.pathMaxMs / total : 1;
    let startMs = nowMs;
    for (const signal of signals) {
      signal.durationMs *= scale;
      signal.startMs = startMs;
      startMs += signal.durationMs;
    }
  }
  return { kind: "path", anchorId, createdMs: nowMs, signals };
}

export function headAt<E>(signal: LightSignal<E>, nowMs: number, revealProgress: number): number {
  const progress = (nowMs - signal.startMs) / signal.durationMs;
  if (!(progress > 0)) return signal.departAt;
  const scheduled = signal.departAt + Math.min(1, progress) * (signal.arriveAt - signal.departAt);
  if (!signal.revealBound) return scheduled;
  return Math.max(signal.departAt, Math.min(scheduled, revealProgress));
}

export function stepPlan<E>(plan: LightPlan<E>, nowMs: number, revealProgress: number): void {
  for (const signal of plan.signals) {
    if (!Number.isNaN(signal.arrivedMs) || nowMs < signal.startMs) continue;
    const deadline = signal.startMs + signal.durationMs + ARRIVAL_WAIT_MAX_MS;
    if (headAt(signal, nowMs, revealProgress) >= signal.arriveAt - 1e-9 || nowMs >= deadline) signal.arrivedMs = nowMs;
  }
}

export function signalFrame<E>(signal: LightSignal<E>, nowMs: number, revealProgress: number, kinematics: LightKinematics): SignalFrame {
  const started = nowMs >= signal.startMs;
  const ignite = started ? Math.min(1, (nowMs - signal.startMs) / BLOOM_RISE_MS) : 0;
  if (Number.isNaN(signal.arrivedMs)) {
    const head = started ? headAt(signal, nowMs, revealProgress) : signal.departAt;
    return { started, arrived: false, done: false, head, tailStart: Math.max(signal.departAt, head - kinematics.tail), drawnEnd: head, ignite };
  }
  const span = signal.arriveAt - signal.departAt;
  const head = signal.arriveAt + ((nowMs - signal.arrivedMs) / signal.durationMs) * span;
  const tailStart = Math.max(signal.departAt, head - kinematics.tail);
  return { started, arrived: true, done: tailStart >= signal.arriveAt, head, tailStart, drawnEnd: signal.arriveAt, ignite };
}

export function bloomAt(sinceArrivalMs: number, kinematics: LightKinematics): number {
  if (!(sinceArrivalMs >= 0)) return 0;
  if (sinceArrivalMs < BLOOM_RISE_MS) return kinematics.intensity * (sinceArrivalMs / BLOOM_RISE_MS);
  return kinematics.intensity * Math.exp(-(sinceArrivalMs - BLOOM_RISE_MS) / kinematics.bloomTauMs);
}

export function headFadeAt(sinceArrivalMs: number): number {
  return sinceArrivalMs >= 0 ? Math.max(0, 1 - sinceArrivalMs / BLOOM_RISE_MS) : 1;
}

export function isPlanAlive<E>(plan: LightPlan<E> | null, nowMs: number, revealProgress: number, kinematics: LightKinematics): boolean {
  if (plan === null) return false;
  for (const signal of plan.signals) {
    if (!signalFrame(signal, nowMs, revealProgress, kinematics).done) return true;
    if (signal.blooms && bloomAt(nowMs - signal.arrivedMs, kinematics) > LIGHT_FLOOR) return true;
  }
  return false;
}

export function curvePoint(a: Point, c: Point, b: Point, t: number, out: Point): Point {
  const u = 1 - t;
  out.x = u * u * a.x + 2 * u * t * c.x + t * t * b.x;
  out.y = u * u * a.y + 2 * u * t * c.y + t * t * b.y;
  return out;
}

const ARC_STEPS = 16;
const arcScratch: Point = { x: 0, y: 0 };

export function curveLength(a: Point, c: Point, b: Point): number {
  let length = 0;
  let px = a.x;
  let py = a.y;
  for (let i = 1; i <= ARC_STEPS; i += 1) {
    curvePoint(a, c, b, i / ARC_STEPS, arcScratch);
    length += Math.hypot(arcScratch.x - px, arcScratch.y - py);
    px = arcScratch.x;
    py = arcScratch.y;
  }
  return length;
}

const SIGNALLED_STRIDE = 6;
let signalled = new Float64Array(SIGNALLED_STRIDE * 64);
let signalledCount = 0;
let standDowns = 0;

export function clearSignalledLines(): void {
  signalledCount = 0;
  standDowns = 0;
}

export function signalledStandDowns(): number {
  return standDowns;
}

export function markSignalledLine(a: Point, c: Point, b: Point): void {
  if ((signalledCount + 1) * SIGNALLED_STRIDE > signalled.length) {
    const grown = new Float64Array(signalled.length * 2);
    grown.set(signalled);
    signalled = grown;
  }
  const at = signalledCount * SIGNALLED_STRIDE;
  signalled[at] = a.x;
  signalled[at + 1] = a.y;
  signalled[at + 2] = c.x;
  signalled[at + 3] = c.y;
  signalled[at + 4] = b.x;
  signalled[at + 5] = b.y;
  signalledCount += 1;
}

export function isEdgeSignalled(a: Point, c: Point, b: Point): boolean {
  for (let i = 0; i < signalledCount; i += 1) {
    const at = i * SIGNALLED_STRIDE;
    if (
      signalled[at] === a.x &&
      signalled[at + 1] === a.y &&
      signalled[at + 2] === c.x &&
      signalled[at + 3] === c.y &&
      signalled[at + 4] === b.x &&
      signalled[at + 5] === b.y
    ) {
      standDowns += 1;
      return true;
    }
  }
  return false;
}
