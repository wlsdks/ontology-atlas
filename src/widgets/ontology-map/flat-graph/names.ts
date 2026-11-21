import type { Box } from "../dial/types";
import type { FlatGraphLayout, FlatGraphPaintTokens } from "./types";
import { admit } from "./names/admit";
import { zoomStep } from "./names/zoom-step";
import type { NameAdmission, NameInput, PlacedName } from "./names/placed-name";

/** Whether a screen box overlaps any of `obstacles`. O(obstacles). */
export function boxUnderAny(obstacles: readonly Box[], minX: number, maxX: number, minY: number, maxY: number): boolean {
  for (let i = 0; i < obstacles.length; i += 1) {
    const o = obstacles[i]!;
    if (minX < o.maxX && maxX > o.minX && minY < o.maxY && maxY > o.minY) return true;
  }
  return false;
}

/** The end of the run of names from `from` that one concept placed together: a name with its caption or reach line. */
export function nameBlockEnd(names: readonly PlacedName[], from: number): number {
  let end = from + 1;
  while (end < names.length && names[end]!.id === names[from]!.id) end += 1;
  return end;
}

/**
 * Whether the block `names[from, to)`, drawn about its concept's screen point (x, y), stays clear
 * of every chrome box; one line under chrome hides the block, since a caption alone names nothing.
 * Admission runs per zoom step in world space, so the chrome, which moves with the screen, is
 * judged at draw time. O(block × obstacles).
 */
export function nameBlockClear(names: readonly PlacedName[], from: number, to: number, x: number, y: number, obstacles: readonly Box[]): boolean {
  for (let i = from; i < to; i += 1) {
    const b = names[i]!.box;
    if (boxUnderAny(obstacles, x + b.minX, x + b.maxX, y + b.minY, y + b.maxY)) return false;
  }
  return true;
}

/** Whether a block draws: the selection's own name always does, since the camera framed it and it is what the reader chose. */
export function nameBlockDraws(names: readonly PlacedName[], from: number, to: number, x: number, y: number, obstacles: readonly Box[], selectedId: string | null): boolean {
  return names[from]!.id === selectedId || nameBlockClear(names, from, to, x, y, obstacles);
}

interface NameCache {
  font: string;
  elementNames: boolean;
  stale: ReadonlyMap<string, number> | null;
  hubCaption: string | null;
  rest: Map<number, NameAdmission>;
  focus: Map<string, NameAdmission>;
}
const FOCUS_CACHE_MAX = 32;
const caches = new WeakMap<FlatGraphLayout, NameCache>();

function nearest(map: ReadonlyMap<number, NameAdmission>, step: number, below: boolean): NameAdmission | null {
  let best: NameAdmission | null = null;
  for (const [s, a] of map) {
    if (below ? s < step && (!best || s > best.step) : s > step && (!best || s < best.step)) best = a;
  }
  return best;
}

const NO_NAMES: ReadonlySet<string> = new Set();

/** The disc a selected capability, element or orphan draws at, never smaller than its own. */
export function selectedDiscRadius(base: number, tokens: Pick<FlatGraphPaintTokens, "selectedDiscPx">, growth: number): number {
  return Math.max(base, tokens.selectedDiscPx * growth);
}

function withSelectedRadius(input: NameInput): NameInput {
  const focus = input.focusId;
  if (!input.selected || focus === null || input.model.domainById.has(focus) || focus === input.model.projectId) return input;
  const own = input.discRadius;
  return { ...input, discRadius: (id) => (id === focus ? selectedDiscRadius(own(id), input.tokens, input.growth) : own(id)) };
}

/** One admission at the input's zoom, outside the per-step cache: a camera weighing a zoom it has not shown yet. */
export function admitNamesAt(input: NameInput): NameAdmission {
  return admit(withSelectedRadius(input), zoomStep(input.scale, input.tokens.zoomStepsPerOctave), null, null);
}

/**
 * Names admitted at the camera's quantised zoom step, cached per step so pan and drag never
 * re-run admission. Without attention, a step's names include every name of the nearest admitted
 * step below that still has a side clear of other names, and only names the nearest admitted step
 * above also holds, so zooming in adds names and drops one only where another name takes its place.
 */
export function admittedNames(input: NameInput): NameAdmission {
  const step = zoomStep(input.scale, input.tokens.zoomStepsPerOctave);
  const elementNames = input.elementSpacingPx >= input.tokens.elementNameSpacingPx;
  let cache = caches.get(input.layout);
  if (!cache || cache.font !== input.fontFamily || cache.elementNames !== elementNames || cache.stale !== input.staleByDomain || cache.hubCaption !== input.hubCaption) {
    cache = { font: input.fontFamily, elementNames, stale: input.staleByDomain, hubCaption: input.hubCaption, rest: new Map(), focus: new Map() };
    caches.set(input.layout, cache);
  }
  if (input.lit !== null || input.agentFocusId !== null || (input.openStarId ?? null) !== null) {
    const focusKey = `${step}|${input.attentionKey}|${input.agentFocusId ?? ""}|${input.openStarId ?? ""}`;
    const hit = cache.focus.get(focusKey);
    if (hit) return hit;
    if (cache.focus.size >= FOCUS_CACHE_MAX) cache.focus.clear();
    const made = admit(withSelectedRadius(input), step, null, null);
    cache.focus.set(focusKey, made);
    return made;
  }
  const hit = cache.rest.get(step);
  if (hit) return hit;
  const restInput = { ...input, lit: null, focusId: null, agentFocusId: null, selected: false, named: NO_NAMES, reach: null, lines: [] };
  const made = admit(restInput, step, nearest(cache.rest, step, true), nearest(cache.rest, step, false)?.ids ?? null);
  cache.rest.set(step, made);
  return made;
}
