import { MOTION } from "@/shared/motion/tokens";
import type { DialRowAction, DialScene } from "../types";
import { branchPreviewRows } from "./layout";

interface Disclosure { target: number; from: readonly number[]; started: number }
const totals = new WeakMap<DialScene, Map<string, number>>();
const disclosed = new WeakMap<DialScene, Map<string, Disclosure>>();
const DURATION_MS = MOTION.base.duration * 1000;
const previewOf = (scene: DialScene) => scene.branchPreviewRows ?? branchPreviewRows(scene.clusters.length);
function totalOf(scene: DialScene, id: string): number {
  let counts = totals.get(scene);
  if (!counts) {
    counts = new Map(scene.clusters.map((cluster) => [cluster.domainId, cluster.items.filter((item) => !item.direct).length]));
    totals.set(scene, counts);
  }
  return counts.get(id) ?? 0;
}

export function branchMemberCount(scene: DialScene, domainId: string): number {
  return disclosed.get(scene)?.get(domainId)?.target ?? Math.min(previewOf(scene), totalOf(scene, domainId));
}

export function branchMemberAlpha(scene: DialScene, domainId: string, index: number, now: number, reducedMotion = false): number {
  const state = disclosed.get(scene)?.get(domainId);
  const count = state?.target ?? Math.min(previewOf(scene), totalOf(scene, domainId));
  const target = index < count ? 1 : 0;
  if (!state || reducedMotion) return target;
  const t = Math.min(1, Math.max(0, (now - state.started) / DURATION_MS));
  const ease = t * t * (3 - 2 * t);
  const from = state.from[index] ?? (index < previewOf(scene) ? 1 : 0);
  return from + (target - from) * ease;
}

export function branchMembersAnimating(scene: DialScene, now: number): boolean {
  return [...(disclosed.get(scene)?.values() ?? [])].some((state) => now < state.started + DURATION_MS);
}

export function applyBranchMemberAction(scene: DialScene, action: DialRowAction, now = performance.now()): boolean {
  const total = totalOf(scene, action.domainId);
  const preview = Math.min(previewOf(scene), total);
  const before = branchMemberCount(scene, action.domainId);
  const target = action.direction === "less" ? preview : Math.min(total, before + preview);
  if (!preview || before === target) return false;
  const prior = disclosed.get(scene)?.get(action.domainId);
  const from = Array.from({ length: Math.max(before, target, prior?.from.length ?? 0) }, (_, index) => branchMemberAlpha(scene, action.domainId, index, now));
  const states = disclosed.get(scene) ?? new Map<string, Disclosure>();
  states.set(action.domainId, { target, from, started: now });
  disclosed.set(scene, states);
  return true;
}
