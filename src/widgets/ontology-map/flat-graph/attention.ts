import { easeOutCubic } from "../model/camera/camera-easing";
import { MOTION } from "@/shared/motion/tokens";
import type { DialModel } from "../dial/types";

export interface GraphAttention {
  key: string;
  focusId: string | null;
  selected: boolean;
  /** Concepts drawn at full ink; null means the rest picture, where everything is. */
  lit: ReadonlySet<string> | null;
  /** Capability dependencies the focus draws, as `[from, to]`. */
  links: readonly (readonly [string, string])[];
}

const REST: GraphAttention = { key: "rest", focusId: null, selected: false, lit: null, links: [] };

function domainMembers(model: DialModel, domainId: string, into: Set<string>): void {
  const d = model.domainById.get(domainId);
  if (!d) return;
  into.add(domainId);
  for (const id of d.capabilityIds) {
    into.add(id);
    for (const el of model.capabilityById.get(id)?.elementIds ?? []) into.add(el);
  }
  for (const el of d.directElementIds) into.add(el);
}

function capabilityReach(model: DialModel, capabilityId: string, into: Set<string>, links: [string, string][]): void {
  const cap = model.capabilityById.get(capabilityId);
  if (!cap) return;
  into.add(capabilityId);
  into.add(cap.domainId);
  for (const el of cap.elementIds) into.add(el);
  for (const dep of model.capabilityDependencies) {
    if (dep.from === capabilityId) {
      into.add(dep.to);
      links.push([dep.from, dep.to]);
    } else if (dep.to === capabilityId) {
      into.add(dep.from);
      links.push([dep.from, dep.to]);
    }
  }
  for (const r of model.capabilityRelates) {
    if (r.a === capabilityId) into.add(r.b);
    else if (r.b === capabilityId) into.add(r.a);
  }
}

/**
 * The lit set: a domain lights itself and its members, a capability its domain, elements and every
 * capability it depends on or is used by, an element its capability's set. The project stays lit.
 * O(dependencies) per call; the frame caches by key.
 */
export function resolveGraphAttention(model: DialModel, focusId: string | null, selected: boolean): GraphAttention {
  if (focusId === null || focusId === model.projectId) return selected && focusId !== null ? { ...REST, key: `project|1`, focusId, selected } : REST;
  const lit = new Set<string>();
  const links: [string, string][] = [];
  if (model.projectId !== null) lit.add(model.projectId);
  if (model.domainById.has(focusId)) domainMembers(model, focusId, lit);
  else if (model.capabilityById.has(focusId)) capabilityReach(model, focusId, lit, links);
  else {
    const owner = model.capabilityOf.get(focusId);
    if (owner) capabilityReach(model, owner, lit, links);
    else {
      const domain = model.domainOf.get(focusId);
      if (domain) lit.add(domain);
    }
    lit.add(focusId);
  }
  return { key: `${focusId}|${selected ? 1 : 0}`, focusId, selected, lit, links };
}

const attentionCache = new WeakMap<DialModel, Map<string, GraphAttention>>();
const ATTENTION_CACHE_MAX = 64;

export function cachedGraphAttention(model: DialModel, focusId: string | null, selected: boolean): GraphAttention {
  let cache = attentionCache.get(model);
  if (!cache) {
    cache = new Map();
    attentionCache.set(model, cache);
  }
  const key = `${focusId ?? ""}|${selected ? 1 : 0}`;
  let hit = cache.get(key);
  if (!hit) {
    if (cache.size >= ATTENTION_CACHE_MAX) cache.clear();
    hit = resolveGraphAttention(model, focusId, selected);
    cache.set(key, hit);
  }
  return hit;
}

/** Ink of one concept under an attention: full when lit or at rest, the sink token otherwise. */
export function inkUnder(attention: GraphAttention, id: string, sink: number): number {
  return attention.lit === null || attention.lit.has(id) ? 1 : sink;
}

const FOCUS_MS = MOTION.fast.duration * 1000;

/**
 * A crossfade toward `current`. It starts from the picture that was showing: `previous` reached
 * `carried` of the way from `older`, so a retarget mid-fade continues from there instead of
 * snapping to the fully lit or fully sunk previous attention.
 */
export interface GraphTransition { mix: number; current: GraphAttention; previous: GraphAttention; older: GraphAttention; carried: number }
interface InkClock extends GraphTransition { key: string; changedAt: number }
const clocks = new WeakMap<object, InkClock>();

const mixAt = (changedAt: number, now: number, reducedMotion: boolean): number =>
  reducedMotion ? 1 : easeOutCubic(Math.min(1, Math.max(0, (now - changedAt) / FOCUS_MS)));

/** Advances the crossfade for one world; reduced motion lands at once on the same picture. */
export function graphInkMix(worldKey: object, attention: GraphAttention, now: number, reducedMotion: boolean): GraphTransition {
  let clock = clocks.get(worldKey);
  if (!clock) {
    clock = { key: attention.key, changedAt: -Infinity, mix: 1, current: attention, previous: attention, older: attention, carried: 1 };
    clocks.set(worldKey, clock);
  } else if (clock.key !== attention.key) {
    clock.carried = mixAt(clock.changedAt, now, reducedMotion);
    clock.older = clock.previous;
    clock.previous = clock.current;
    clock.key = attention.key;
    clock.changedAt = now;
  }
  clock.current = attention;
  clock.mix = mixAt(clock.changedAt, now, reducedMotion);
  return clock;
}

/** `transitionShare` of `inkUnder` without a closure, for the per-concept paths of a frame. */
export function transitionInk(t: GraphTransition, id: string, sink: number): number {
  const previous = inkUnder(t.previous, id, sink);
  const from = t.carried >= 1 || t.older === t.previous ? previous : inkUnder(t.older, id, sink) + (previous - inkUnder(t.older, id, sink)) * t.carried;
  const current = inkUnder(t.current, id, sink);
  return t.mix >= 1 ? current : from + (current - from) * t.mix;
}

/** The share a transition shows of `of(attention)` for each attention it blends. */
export function transitionShare(t: GraphTransition, of: (attention: GraphAttention) => number): number {
  const from = t.carried >= 1 || t.older === t.previous ? of(t.previous) : of(t.older) + (of(t.previous) - of(t.older)) * t.carried;
  return t.mix >= 1 ? of(t.current) : from + (of(t.current) - from) * t.mix;
}
