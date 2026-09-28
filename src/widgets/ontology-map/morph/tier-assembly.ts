
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

const REDUCED_FADE_MS = MOTION.fast.duration * 1000;

export function tierProgress(clockMs: number, kind: TierKind): number {
  const t = (clockMs - TIER_DELAY_MS[kind]) / TIER_RISE_MS;
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

export function easeOutCubic(t: number): number {
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return 1 - Math.pow(1 - c, 3);
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
}

interface AssemblySchedule {
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

export function armTierAssembly(world: AssemblyWorld, sourceKey: string | null, reducedMotion: boolean): boolean {
  if (sourceKey !== null) {
    if (assembledSources.has(sourceKey)) return false;
    assembledSources.add(sourceKey);
  }
  armSchedule(world, sourceKey, reducedMotion);
  return true;
}

function armSchedule(world: AssemblyWorld, sourceKey: string | null, reducedMotion: boolean): void {
  const entries: AssemblyEntry[] = [];
  for (const kind of KIND_ORDER) {
    for (const node of world.nodes) {
      if (node.kind !== kind) continue;
      const parent = node.parentId === null ? null : world.nodeById.get(node.parentId) ?? null;
      entries.push({ node, parent, fx: node.x, fy: node.y });
    }
  }
  schedules.set(world, {
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
  armSchedule(to, previous.sourceKey, previous.reducedMotion);
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

export function isTierAssembling(world: object): boolean {
  return schedules.has(world);
}

export function tierAssemblyAppear(world: object, kind: TierKind, nowMs: number): number | null {
  const schedule = schedules.get(world);
  if (!schedule) return null;
  if (schedule.settled || kind === "project") return 1;
  if (schedule.startMs === null) return 0;
  const elapsed = nowMs - schedule.startMs;
  if (schedule.reducedMotion) return Math.min(1, elapsed / REDUCED_FADE_MS);
  return easeOutCubic(tierProgress(elapsed, kind));
}

export function stepTierAssembly(world: AssemblyWorld, nowMs: number): boolean {
  const schedule = schedules.get(world);
  if (!schedule) return false;
  if (schedule.startMs === null) schedule.startMs = nowMs;
  const elapsed = nowMs - schedule.startMs;
  const total = schedule.reducedMotion ? REDUCED_FADE_MS : TIER_ASSEMBLE_TOTAL_MS;
  const done = schedule.settled || schedule.reducedMotion || elapsed >= total;
  for (const entry of schedule.entries) {
    const { node, parent } = entry;
    if (done || parent === null || node.kind === "project") {
      node.x = entry.fx;
      node.y = entry.fy;
      continue;
    }
    const e = easeOutCubic(tierProgress(elapsed, node.kind));
    node.x = parent.x + (entry.fx - parent.x) * e;
    node.y = parent.y + (entry.fy - parent.y) * e;
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
