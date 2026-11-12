
import { MOTION } from "@/shared/motion/tokens";

export type TierKind = "project" | "domain" | "capability" | "element";

export const TIER_DELAY_MS: Readonly<Record<TierKind, number>> = {
  project: 0,
  domain: 180,
  capability: 380,
  element: 600,
};
export const TIER_RISE_MS = 520;
export const TIER_ASSEMBLE_TOTAL_MS = TIER_DELAY_MS.element + TIER_RISE_MS;

/** When each tier leaves its parent and how long it rises; `staggerMs` spreads capabilities by distance from their domain. */
export interface TierTiming {
  delayMs: Readonly<Record<TierKind, number>>;
  riseMs: number;
  staggerMs: number;
  totalMs: number;
}

const DOME_TIMING: TierTiming = { delayMs: TIER_DELAY_MS, riseMs: TIER_RISE_MS, staggerMs: 0, totalMs: TIER_ASSEMBLE_TOTAL_MS };

const FAST_MS = MOTION.fast.duration * 1000;
const BASE_MS = MOTION.base.duration * 1000;
const FLAT_RISE_MS = MOTION.slow.duration * 1000;
const FLAT_ELEMENT_DELAY_MS = FAST_MS + BASE_MS;

/**
 * The Flat graph's first open as one moment: domains leave the project at once, capabilities grow
 * out of their domain nearest first, and element dots leave with the farthest capability. Capabilities
 * wait `--motion-base`, so even a runner drawing every 180 ms shows domains leave first.
 */
export const FLAT_TIER_TIMING: TierTiming = {
  delayMs: { project: 0, domain: 0, capability: BASE_MS, element: FLAT_ELEMENT_DELAY_MS },
  riseMs: FLAT_RISE_MS,
  staggerMs: FAST_MS,
  totalMs: FLAT_ELEMENT_DELAY_MS + FLAT_RISE_MS,
};

const REDUCED_FADE_MS = MOTION.fast.duration * 1000;

export function tierProgress(clockMs: number, kind: TierKind): number {
  const t = (clockMs - TIER_DELAY_MS[kind]) / TIER_RISE_MS;
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

export function easeOutCubic(t: number): number {
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return 1 - Math.pow(1 - c, 3);
}

const NAME_FROM_APPEAR = 0.9;

function riseMsAt(appear: number, riseMs: number): number {
  return (1 - Math.cbrt(1 - appear)) * riseMs;
}

/** A name fades in over `--motion-fast` once its mark has nearly landed. */
export function tierNameAlpha(appear: number, riseMs = TIER_RISE_MS): number {
  if (!(appear < 1)) return 1;
  if (!(appear > NAME_FROM_APPEAR)) return 0;
  return Math.min(1, (riseMsAt(appear, riseMs) - riseMsAt(NAME_FROM_APPEAR, riseMs)) / FAST_MS);
}

interface AssemblyNode {
  id: string;
  kind: TierKind;
  parentId: string | null;
  x: number;
  y: number;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface AssemblyWorld {
  nodes: readonly AssemblyNode[];
  nodeById: ReadonlyMap<string, AssemblyNode>;
  bounds: Bounds;
  spineBounds: Bounds;
}

interface AssemblyEntry {
  node: AssemblyNode;
  parent: AssemblyNode | null;
  fx: number;
  fy: number;
  dx: number;
  dy: number;
}

interface AssemblySchedule {
  timing: TierTiming;
  delayById: Map<string, number>;
  sourceKey: string | null;
  reducedMotion: boolean;
  startMs: number | null;
  settled: boolean;
  entries: AssemblyEntry[];
  bounds: Bounds;
  spineBounds: Bounds;
}

const KIND_ORDER: readonly TierKind[] = ["project", "domain", "capability", "element"];

const schedules = new WeakMap<object, AssemblySchedule>();
const assembledSources = new Set<string>();

export function armTierAssembly(world: AssemblyWorld, sourceKey: string | null, reducedMotion: boolean, timing: TierTiming = DOME_TIMING): boolean {
  if (sourceKey !== null) {
    if (assembledSources.has(sourceKey)) return false;
    assembledSources.add(sourceKey);
  }
  armSchedule(world, sourceKey, reducedMotion, timing);
  return true;
}

/** A capability leaves later the farther it lands from its domain, the farthest `staggerMs` after the nearest. O(nodes). */
function capabilityDelays(entries: readonly AssemblyEntry[], timing: TierTiming): Map<string, number> {
  const delays = new Map<string, number>();
  if (timing.staggerMs <= 0) return delays;
  let far = 0;
  for (const e of entries) if (e.node.kind === "capability") far = Math.max(far, Math.hypot(e.dx, e.dy));
  if (far <= 0) return delays;
  for (const e of entries) {
    if (e.node.kind === "capability") delays.set(e.node.id, timing.delayMs.capability + (Math.hypot(e.dx, e.dy) / far) * timing.staggerMs);
  }
  return delays;
}

function armSchedule(world: AssemblyWorld, sourceKey: string | null, reducedMotion: boolean, timing: TierTiming): void {
  const entries: AssemblyEntry[] = [];
  for (const kind of KIND_ORDER) {
    for (const node of world.nodes) {
      if (node.kind !== kind) continue;
      const parent = node.parentId === null ? null : world.nodeById.get(node.parentId) ?? null;
      entries.push({ node, parent, fx: node.x, fy: node.y, dx: node.x - (parent?.x ?? node.x), dy: node.y - (parent?.y ?? node.y) });
    }
  }
  schedules.set(world, {
    timing,
    delayById: capabilityDelays(entries, timing),
    sourceKey,
    reducedMotion,
    startMs: null,
    settled: false,
    entries,
    bounds: { ...world.bounds },
    spineBounds: { ...world.spineBounds },
  });
}

export function carryTierAssembly(from: object | null, to: AssemblyWorld): void {
  const previous = from === null ? undefined : schedules.get(from);
  if (!previous || previous.settled) return;
  armSchedule(to, previous.sourceKey, previous.reducedMotion, previous.timing);
  schedules.get(to)!.startMs = previous.startMs;
}

export function claimTierAssembly(world: object, sourceKey: string): void {
  const schedule = schedules.get(world);
  if (!schedule || schedule.sourceKey !== null) return;
  schedule.sourceKey = sourceKey;
  if (assembledSources.has(sourceKey)) schedule.settled = true;
  else assembledSources.add(sourceKey);
}

export function settleTierAssembly(world: object): void {
  const schedule = schedules.get(world);
  if (schedule) schedule.settled = true;
}

export function landTierAssembly(world: object): void {
  const schedule = schedules.get(world);
  if (!schedule) return;
  schedule.settled = true;
  for (const { node, fx, fy } of schedule.entries) {
    node.x = fx;
    node.y = fy;
  }
}

export function isTierAssembling(world: object): boolean {
  return schedules.has(world);
}

function riseOf(schedule: AssemblySchedule, elapsedMs: number, kind: TierKind, id: string | undefined): number {
  const { timing } = schedule;
  const delay = (id === undefined ? undefined : schedule.delayById.get(id)) ?? timing.delayMs[kind];
  return easeOutCubic((elapsedMs - delay) / timing.riseMs);
}

/** How far one concept has risen, or its tier when `id` is omitted; null with no assembly. */
export function tierAssemblyAppear(world: object, kind: TierKind, nowMs: number, id?: string): number | null {
  const schedule = schedules.get(world);
  if (!schedule) return null;
  if (schedule.settled || kind === "project") return 1;
  if (schedule.startMs === null) return 0;
  const elapsed = nowMs - schedule.startMs;
  if (schedule.reducedMotion) return Math.min(1, elapsed / REDUCED_FADE_MS);
  return riseOf(schedule, elapsed, kind, id);
}

export function stepTierAssembly(world: AssemblyWorld, nowMs: number): boolean {
  const schedule = schedules.get(world);
  if (!schedule) return false;
  if (schedule.startMs === null) schedule.startMs = nowMs;
  const elapsed = nowMs - schedule.startMs;
  const total = schedule.reducedMotion ? REDUCED_FADE_MS : schedule.timing.totalMs;
  const done = schedule.settled || schedule.reducedMotion || elapsed >= total;
  for (const entry of schedule.entries) {
    const { node, parent } = entry;
    if (done || parent === null || node.kind === "project") {
      node.x = entry.fx;
      node.y = entry.fy;
      continue;
    }
    const e = riseOf(schedule, elapsed, node.kind, node.id);
    node.x = parent.x + entry.dx * e;
    node.y = parent.y + entry.dy * e;
  }
  if (done && (schedule.settled || elapsed >= total)) {
    schedules.delete(world);
    return false;
  }
  return true;
}

export function holdTierAssemblyBounds(world: AssemblyWorld): void {
  const schedule = schedules.get(world);
  if (!schedule) return;
  Object.assign(world.bounds, schedule.bounds);
  Object.assign(world.spineBounds, schedule.spineBounds);
}
