import type { MapLayoutMark, MapLayoutMarkShape, MapLayoutView } from "@/shared/lib/map-layout-morph-store";
import { easeMotion } from "@/shared/motion/ease";
import { cameraTransitionDurationMs } from "../model/camera-easing";
import { readTree, type TerritoryInputEdge, type TerritoryInputNode } from "../model/territories-layout";

export type LayoutSwitch = "none" | "cut" | "native" | "ghost" | "fade";

const OVERLAY_VIEWS: ReadonlySet<MapLayoutView> = new Set(["territories", "hex"]);

const GHOST_TARGET_CONCEPT_CEILING: Readonly<Record<MapLayoutView, number>> = {
  territories: Number.POSITIVE_INFINITY,
  hex: Number.POSITIVE_INFINITY,
  flat: 6500,
  galaxy: 6300,
  strata: 6100,
  coupling: 0,
};

export function chooseLayoutSwitch({
  from,
  to,
  armed,
  reducedMotion,
  conceptCount,
  fromOverlay = false,
}: {
  from: MapLayoutView;
  to: MapLayoutView;
  armed: boolean;
  reducedMotion: boolean;
  conceptCount: number;
  fromOverlay?: boolean;
}): LayoutSwitch {
  if (from === to && !fromOverlay) return "none";
  if (!armed) return "cut";
  if (reducedMotion) return "fade";
  if (!fromOverlay && !OVERLAY_VIEWS.has(from) && !OVERLAY_VIEWS.has(to)) return "native";
  if ((!fromOverlay && from === "coupling") || conceptCount > GHOST_TARGET_CONCEPT_CEILING[to]) return "fade";
  return "ghost";
}

export function containmentParents(
  nodes: readonly TerritoryInputNode[],
  edges: readonly TerritoryInputEdge[],
): ReadonlyMap<string, string> {
  const tree = readTree(nodes, edges);
  const project = tree.project?.id ?? null;
  const parents = new Map<string, string>();
  for (const domain of tree.domains) if (project !== null) parents.set(domain.id, project);
  for (const [capability, domain] of tree.capabilityDomain) if (domain !== null) parents.set(capability, domain);
  for (const [element, owner] of tree.elementParent) parents.set(element, owner);
  return parents;
}

interface GhostStyle {
  shape: MapLayoutMarkShape;
  fill: string;
  stroke: string;
}

interface GhostGroup {
  from: GhostStyle;
  to: GhostStyle;
  alphaFrom: number;
  alphaTo: number;
  members: readonly number[];
}

export interface LayoutMorphPlan {
  ids: readonly string[];
  x0: Float64Array;
  y0: Float64Array;
  s0: Float64Array;
  x1: Float64Array;
  y1: Float64Array;
  s1: Float64Array;
  groups: readonly GhostGroup[];
  durationMs: number;
}

const ANCESTOR_WALK_DEPTH = 16;
const ALPHA_STEPS = 8;

function drawnById(marks: readonly MapLayoutMark[]): Map<string, MapLayoutMark> {
  const byId = new Map<string, MapLayoutMark>();
  for (const mark of marks) {
    if (byId.has(mark.id)) continue;
    if (!Number.isFinite(mark.x) || !Number.isFinite(mark.y) || !Number.isFinite(mark.size) || !Number.isFinite(mark.alpha)) continue;
    if (mark.alpha <= 0) continue;
    byId.set(mark.id, mark);
  }
  return byId;
}

function nearestDrawnAncestor(
  id: string,
  drawn: ReadonlyMap<string, MapLayoutMark>,
  parentOf: ReadonlyMap<string, string>,
): MapLayoutMark | null {
  let current = parentOf.get(id);
  for (let depth = 0; current !== undefined && depth < ANCESTOR_WALK_DEPTH; depth += 1) {
    const hit = drawn.get(current);
    if (hit) return hit;
    current = parentOf.get(current);
  }
  return null;
}

const quantizeAlpha = (alpha: number) => Math.round(Math.min(1, Math.max(0, alpha)) * ALPHA_STEPS) / ALPHA_STEPS;

const styleOf = (mark: MapLayoutMark): GhostStyle => ({ shape: mark.shape, fill: mark.fill, stroke: mark.stroke });

interface Track {
  id: string;
  x0: number;
  y0: number;
  s0: number;
  x1: number;
  y1: number;
  s1: number;
  from: GhostStyle;
  to: GhostStyle;
  alphaFrom: number;
  alphaTo: number;
  shared: boolean;
}

function tracksBetween(
  from: ReadonlyMap<string, MapLayoutMark>,
  to: ReadonlyMap<string, MapLayoutMark>,
  parentOf: ReadonlyMap<string, string>,
): Track[] {
  const tracks: Track[] = [];
  for (const [id, a] of from) {
    const b = to.get(id);
    if (b) {
      tracks.push({ id, x0: a.x, y0: a.y, s0: a.size, x1: b.x, y1: b.y, s1: b.size, from: styleOf(a), to: styleOf(b), alphaFrom: a.alpha, alphaTo: b.alpha, shared: true });
      continue;
    }
    const anchor = nearestDrawnAncestor(id, to, parentOf);
    tracks.push({ id, x0: a.x, y0: a.y, s0: a.size, x1: anchor?.x ?? a.x, y1: anchor?.y ?? a.y, s1: a.size, from: styleOf(a), to: styleOf(a), alphaFrom: a.alpha, alphaTo: 0, shared: false });
  }
  for (const [id, b] of to) {
    if (from.has(id)) continue;
    const anchor = nearestDrawnAncestor(id, from, parentOf);
    tracks.push({ id, x0: anchor?.x ?? b.x, y0: anchor?.y ?? b.y, s0: b.size, x1: b.x, y1: b.y, s1: b.size, from: styleOf(b), to: styleOf(b), alphaFrom: 0, alphaTo: b.alpha, shared: false });
  }
  return tracks;
}

function travelDurationMs(tracks: readonly Track[]): number {
  const shared = tracks.filter((track) => track.shared);
  const measured = shared.length > 0 ? shared : tracks;
  let total = 0;
  for (const track of measured) total += Math.hypot(track.x1 - track.x0, track.y1 - track.y0);
  const meanPx = measured.length > 0 ? total / measured.length : 0;
  return cameraTransitionDurationMs({ x: 0, y: 0, scale: 1 }, { x: meanPx, y: 0, scale: 1 });
}

export function planLayoutMorph(
  source: readonly MapLayoutMark[],
  target: readonly MapLayoutMark[],
  parentOf: ReadonlyMap<string, string>,
): LayoutMorphPlan {
  const tracks = tracksBetween(drawnById(source), drawnById(target), parentOf);
  const n = tracks.length;
  const plan: LayoutMorphPlan = {
    ids: tracks.map((track) => track.id),
    x0: new Float64Array(n),
    y0: new Float64Array(n),
    s0: new Float64Array(n),
    x1: new Float64Array(n),
    y1: new Float64Array(n),
    s1: new Float64Array(n),
    groups: [],
    durationMs: travelDurationMs(tracks),
  };
  const groups = new Map<string, { from: GhostStyle; to: GhostStyle; alphaFrom: number; alphaTo: number; members: number[] }>();
  tracks.forEach((track, i) => {
    plan.x0[i] = track.x0;
    plan.y0[i] = track.y0;
    plan.s0[i] = track.s0;
    plan.x1[i] = track.x1;
    plan.y1[i] = track.y1;
    plan.s1[i] = track.s1;
    const alphaFrom = quantizeAlpha(track.alphaFrom);
    const alphaTo = quantizeAlpha(track.alphaTo);
    const key = [track.from.shape, track.from.fill, track.from.stroke, track.to.shape, track.to.fill, track.to.stroke, alphaFrom, alphaTo].join("|");
    const group = groups.get(key);
    if (group) group.members.push(i);
    else groups.set(key, { from: track.from, to: track.to, alphaFrom, alphaTo, members: [i] });
  });
  return { ...plan, groups: [...groups.values()] };
}

export function layoutMorphEase(progress: number): number {
  return easeMotion(Math.min(1, Math.max(0, progress)));
}

export function sampleLayoutMorph(plan: LayoutMorphPlan, progress: number): MapLayoutMark[] {
  const e = layoutMorphEase(progress);
  const marks: MapLayoutMark[] = [];
  for (const group of plan.groups) {
    const style = e < 0.5 ? group.from : group.to;
    const alpha = group.alphaFrom + (group.alphaTo - group.alphaFrom) * e;
    if (alpha <= 0) continue;
    for (const i of group.members) {
      marks.push({
        id: plan.ids[i]!,
        x: plan.x0[i]! + (plan.x1[i]! - plan.x0[i]!) * e,
        y: plan.y0[i]! + (plan.y1[i]! - plan.y0[i]!) * e,
        size: plan.s0[i]! + (plan.s1[i]! - plan.s0[i]!) * e,
        shape: style.shape,
        fill: style.fill,
        stroke: style.stroke,
        alpha,
      });
    }
  }
  return marks;
}
