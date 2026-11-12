import type { MeasureText } from "../dial/label-marks";
import type { Box, DialLabels, DialModel, Point } from "../dial/types";
import { FONT_WEIGHT } from "@/shared/ui/tokens/font-weight";
import { byId } from "./seed";
import type { FlatGraphLayout, FlatGraphPaintTokens } from "./types";

export type NameRole = "project" | "domain" | "units" | "capability" | "element";

/** A name in screen pixels relative to its concept's live position; `box` is relative too. */
export interface PlacedName {
  id: string;
  role: NameRole;
  text: string;
  font: string;
  dx: number;
  dy: number;
  align: CanvasTextAlign;
  box: Box;
}

export interface NameAdmission {
  step: number;
  names: readonly PlacedName[];
  ids: ReadonlySet<string>;
}

export interface NameInput {
  model: DialModel;
  layout: FlatGraphLayout;
  tokens: FlatGraphPaintTokens;
  labels: DialLabels | null;
  measureText: MeasureText;
  fontFamily: string;
  scale: number;
  growth: number;
  elementLabel(id: string): string | null;
  staleByDomain: ReadonlyMap<string, number> | null;
  lit: ReadonlySet<string> | null;
  focusId: string | null;
  /** The concept a connected agent is working on: always named, like the focus. */
  agentFocusId: string | null;
  attentionKey: string;
  discRadius(id: string): number;
  elementSpacingPx: number;
}

export function zoomStep(scale: number, stepsPerOctave: number): number {
  return Math.round(Math.log2(Math.max(1e-6, scale)) * stepsPerOctave);
}

export function stepScale(step: number, stepsPerOctave: number): number {
  return 2 ** (step / stepsPerOctave);
}

const CELL_PX = 96;

/** Uniform grid over world-space boxes: insert and overlap queries cost O(cells touched). */
class Occupancy {
  private readonly cells = new Map<string, Box[]>();
  constructor(private readonly cell: number) {}

  private keys(b: Box): string[] {
    const out: string[] = [];
    for (let gx = Math.floor(b.minX / this.cell); gx <= Math.floor(b.maxX / this.cell); gx += 1) {
      for (let gy = Math.floor(b.minY / this.cell); gy <= Math.floor(b.maxY / this.cell); gy += 1) out.push(`${gx},${gy}`);
    }
    return out;
  }

  hits(b: Box): boolean {
    for (const key of this.keys(b)) {
      for (const o of this.cells.get(key) ?? []) {
        if (b.minX < o.maxX && b.maxX > o.minX && b.minY < o.maxY && b.maxY > o.minY) return true;
      }
    }
    return false;
  }

  add(b: Box): void {
    for (const key of this.keys(b)) {
      const list = this.cells.get(key);
      if (list) list.push(b);
      else this.cells.set(key, [b]);
    }
  }
}

function worldBox(at: Point, rel: Box, scale: number): Box {
  return { minX: at.x + rel.minX / scale, maxX: at.x + rel.maxX / scale, minY: at.y + rel.minY / scale, maxY: at.y + rel.maxY / scale };
}

function font(weight: number, px: number, family: string): string {
  return `${weight} ${px}px ${family}`;
}

function domainBlock(input: NameInput, domainId: string): PlacedName[] {
  const { model, tokens: t, labels, measureText, fontFamily } = input;
  const d = model.domainById.get(domainId)!;
  const r = input.discRadius(domainId);
  const nameFont = font(FONT_WEIGHT.strong, t.domainNamePx, fontFamily);
  const nameW = measureText(d.label, nameFont);
  const nameY = r + t.nameGapPx + t.domainNamePx / 2;
  const out: PlacedName[] = [{
    id: domainId, role: "domain", text: d.label, font: nameFont, dx: 0, dy: nameY, align: "center",
    box: { minX: -nameW / 2 - t.namePadPx, maxX: nameW / 2 + t.namePadPx, minY: nameY - t.domainNamePx / 2 - t.namePadPx, maxY: nameY + t.domainNamePx / 2 + t.namePadPx },
  }];
  if (labels) {
    const stale = input.staleByDomain?.get(domainId) ?? 0;
    const units = labels.units(d.capabilityIds.length, d.elementCount);
    const text = stale > 0 ? `${units} · ${labels.stale(stale)}` : units;
    const captionFont = font(400, t.captionPx, fontFamily);
    const w = measureText(text, captionFont);
    const y = nameY + t.domainNamePx / 2 + t.captionGapPx + t.captionPx / 2;
    out.push({
      id: domainId, role: "units", text, font: captionFont, dx: 0, dy: y, align: "center",
      box: { minX: -w / 2 - t.namePadPx, maxX: w / 2 + t.namePadPx, minY: y - t.captionPx / 2 - t.namePadPx, maxY: y + t.captionPx / 2 + t.namePadPx },
    });
  }
  return out;
}

function projectName(input: NameInput): PlacedName | null {
  const { model, tokens: t, measureText, fontFamily } = input;
  if (model.projectId === null || !model.projectLabel) return null;
  const f = font(FONT_WEIGHT.strong, t.projectNamePx, fontFamily);
  const w = measureText(model.projectLabel, f);
  const y = -input.discRadius(model.projectId) - t.nameGapPx - t.projectNamePx / 2;
  return {
    id: model.projectId, role: "project", text: model.projectLabel, font: f, dx: 0, dy: y, align: "center",
    box: { minX: -w / 2 - t.namePadPx, maxX: w / 2 + t.namePadPx, minY: y - t.projectNamePx / 2 - t.namePadPx, maxY: y + t.projectNamePx / 2 + t.namePadPx },
  };
}

function sideNames(input: NameInput, id: string, role: "capability" | "element", text: string): PlacedName[] {
  const { tokens: t, measureText, fontFamily } = input;
  const px = role === "capability" ? t.capNamePx : t.elementNamePx;
  const f = font(input.lit?.has(id) ? FONT_WEIGHT.signature : 400, px, fontFamily);
  const w = measureText(text, f);
  const r = role === "capability" ? input.discRadius(id) : t.elementDotPx * input.growth;
  const x = r + t.nameGapPx;
  const half = px / 2 + t.namePadPx;
  return [
    { id, role, text, font: f, dx: x, dy: 0, align: "left", box: { minX: x - t.namePadPx, maxX: x + w + t.namePadPx, minY: -half, maxY: half } },
    { id, role, text, font: f, dx: -x, dy: 0, align: "right", box: { minX: -x - w - t.namePadPx, maxX: -x + t.namePadPx, minY: -half, maxY: half } },
  ];
}

interface Candidate { id: string; tries: () => PlacedName[] }

function candidates(input: NameInput, degree: ReadonlyMap<string, number>): Candidate[] {
  const { model, layout } = input;
  const lit = input.lit;
  const caps = [...model.capabilityById.values()].filter((c) => layout.positions.has(c.id));
  const rank = (a: { id: string }, b: { id: string }) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || byId(a.id, b.id);
  const capCandidate = (c: { id: string; label: string }): Candidate => ({ id: c.id, tries: () => sideNames(input, c.id, "capability", c.label) });
  const showElements = input.elementSpacingPx >= input.tokens.elementNameSpacingPx;
  const elementIds = showElements ? [...model.capabilityOf.keys(), ...model.domains.flatMap((d) => d.directElementIds)].filter((id) => layout.positions.has(id)).sort(byId) : [];
  const elementCandidate = (id: string): Candidate => ({ id, tries: () => { const label = input.elementLabel(id); return label ? sideNames(input, id, "element", label) : []; } });
  const focusFirst = (a: { id: string }, b: { id: string }) => (a.id === input.focusId ? -1 : b.id === input.focusId ? 1 : rank(a, b));
  const litCaps = lit ? caps.filter((c) => lit.has(c.id)).sort(focusFirst) : [];
  const namesElements = lit !== null && input.focusId !== null && !model.domainById.has(input.focusId);
  const litElements = namesElements ? [...lit!].filter((id) => model.capabilityOf.has(id) || (model.domainOf.has(id) && !model.domainById.has(id) && !model.capabilityById.has(id))).filter((id) => layout.positions.has(id)).sort((a, b) => (a === input.focusId ? -1 : b === input.focusId ? 1 : byId(a, b))) : [];
  const rest = caps.filter((c) => !lit?.has(c.id)).sort(rank);
  const orphans = layout.orphanIds.filter((id) => !lit || lit.has(id)).map((id): Candidate => ({
    id, tries: () => { const label = input.elementLabel(id); return label ? sideNames(input, id, "capability", label) : []; },
  }));
  const agent = input.agentFocusId;
  const agentCandidate: Candidate[] = agent === null || !layout.positions.has(agent) || model.domainById.has(agent) || agent === model.projectId ? []
    : model.capabilityById.has(agent) ? [capCandidate({ id: agent, label: model.capabilityById.get(agent)!.label })]
      : layout.orphanIds.includes(agent) ? orphans.filter((o) => o.id === agent) : [elementCandidate(agent)];
  return [
    ...agentCandidate,
    ...litCaps.map(capCandidate),
    ...litElements.map(elementCandidate),
    ...rest.map(capCandidate),
    ...orphans,
    ...elementIds.filter((id) => !lit?.has(id)).map(elementCandidate),
  ];
}

function admit(input: NameInput, step: number, seed: ReadonlySet<string> | null, ceiling: ReadonlySet<string> | null): NameAdmission {
  const { model, layout, tokens } = input;
  const scale = stepScale(step, tokens.zoomStepsPerOctave);
  const grid = new Occupancy(CELL_PX / scale);
  const names: PlacedName[] = [];
  const ids = new Set<string>();
  const discs: [string, number][] = [];
  if (model.projectId !== null && layout.positions.has(model.projectId)) discs.push([model.projectId, input.discRadius(model.projectId)]);
  for (const c of layout.clusters) {
    discs.push([c.domainId, input.discRadius(c.domainId)]);
    for (const it of c.items) if (!it.direct) discs.push([it.id, input.discRadius(it.id)]);
  }
  for (const id of layout.orphanIds) discs.push([id, input.discRadius(id)]);
  for (const [id, r] of discs) grid.add(worldBox(layout.positions.get(id)!, { minX: -r, maxX: r, minY: -r, maxY: r }, scale));
  const place = (n: PlacedName) => {
    grid.add(worldBox(layout.positions.get(n.id)!, n.box, scale));
    names.push(n);
    ids.add(n.id);
  };
  const project = projectName(input);
  if (project) place(project);
  for (const c of layout.clusters) for (const n of domainBlock(input, c.domainId)) place(n);
  const pending = candidates(input, degreeOf(model));
  // The overview fit pads the extent by the domain name size; a name past that pad would leave the
  // free map. Checked at the smallest scale this step stands for, so the whole step stays inside.
  const lowest = stepScale(step - 0.5, tokens.zoomStepsPerOctave);
  const reach = tokens.domainNamePx / lowest;
  const inside = (at: Point, rel: Box) => {
    const b = worldBox(at, rel, lowest);
    const e = layout.extent;
    return b.minX >= e.minX - reach && b.maxX <= e.maxX + reach && b.minY >= e.minY - reach && b.maxY <= e.maxY + reach;
  };
  const tryPlace = (cand: Candidate, force: boolean) => {
    const at = layout.positions.get(cand.id)!;
    const tries = cand.tries();
    const fit = tries.find((n) => inside(at, n.box) && !grid.hits(worldBox(at, n.box, scale))) ?? (force ? tries[0] : undefined);
    if (fit) place(fit);
  };
  if (seed) for (const cand of pending) if (seed.has(cand.id)) tryPlace(cand, true);
  for (const cand of pending) {
    if (ids.has(cand.id) || (ceiling && !ceiling.has(cand.id))) continue;
    tryPlace(cand, cand.id === input.focusId || cand.id === input.agentFocusId);
  }
  return { step, names, ids };
}

const degreeCache = new WeakMap<DialModel, Map<string, number>>();

function degreeOf(model: DialModel): Map<string, number> {
  let hit = degreeCache.get(model);
  if (!hit) {
    hit = new Map();
    for (const dep of model.capabilityDependencies) {
      hit.set(dep.from, (hit.get(dep.from) ?? 0) + 1);
      hit.set(dep.to, (hit.get(dep.to) ?? 0) + 1);
    }
    degreeCache.set(model, hit);
  }
  return hit;
}

interface NameCache {
  font: string;
  elementNames: boolean;
  stale: ReadonlyMap<string, number> | null;
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

/**
 * Names admitted at the camera's quantised zoom step, cached per step so pan and drag never
 * re-run admission. Without attention, a step's names include every name of the nearest admitted
 * step below and only names the nearest admitted step above also holds, so zooming in only adds.
 */
export function admittedNames(input: NameInput): NameAdmission {
  const step = zoomStep(input.scale, input.tokens.zoomStepsPerOctave);
  const elementNames = input.elementSpacingPx >= input.tokens.elementNameSpacingPx;
  let cache = caches.get(input.layout);
  if (!cache || cache.font !== input.fontFamily || cache.elementNames !== elementNames || cache.stale !== input.staleByDomain) {
    cache = { font: input.fontFamily, elementNames, stale: input.staleByDomain, rest: new Map(), focus: new Map() };
    caches.set(input.layout, cache);
  }
  if (input.lit !== null || input.agentFocusId !== null) {
    const focusKey = `${step}|${input.attentionKey}|${input.agentFocusId ?? ""}`;
    const hit = cache.focus.get(focusKey);
    if (hit) return hit;
    if (cache.focus.size >= FOCUS_CACHE_MAX) cache.focus.clear();
    const made = admit(input, step, null, null);
    cache.focus.set(focusKey, made);
    return made;
  }
  const hit = cache.rest.get(step);
  if (hit) return hit;
  const restInput = { ...input, lit: null, focusId: null, agentFocusId: null };
  const made = admit(restInput, step, nearest(cache.rest, step, true)?.ids ?? null, nearest(cache.rest, step, false)?.ids ?? null);
  cache.rest.set(step, made);
  return made;
}
