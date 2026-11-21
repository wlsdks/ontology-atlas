import { dialEvidenceView } from "../../dial/dial-model";
import { createMeasureText } from "../../dial/fit";
import type { MeasureText } from "../../dial/label-marks";
import { dialChordPresence } from "../../dial/frame/frame";
import { dialPlacementLine, dialPlacementOf } from "../../dial/placement";
import type { Box, DialFrameInput, DialFrameResult, DialModel, DialPick, DialRowPick, Point } from "../../dial/types";
import { labelFontFamily } from "../../render/labels";
import { AGENT_FOCUS_RING_OFFSET } from "../../render/node-shapes";
import { FONT_WEIGHT } from "@/shared/ui/tokens/font-weight";
import { FLAT_LINE_BITS, type GraphAttention } from "../attention";
import { graphDiscRadiusPx, restArcs, smoothstep, zoomGrowth } from "../marks";
import { MOTION_SHARE, type GraphMotion } from "../motion";
import { admittedNames, boxUnderAny, nameBlockEnd, selectedDiscRadius, stepScale, zoomStep, type PlacedName } from "../names";
import { openedElements } from "../open";
import { openRadiusPx } from "../open-star";
import type { FlatGraphLayout, FlatGraphTokens } from "../types";
import { planFanPushes } from "./fan-push";
import { planName, placeName, NAME_RANKS, nameRanks, plannedNames, nameRank, blockShows, memberBlockShows, planMemberFallbacks } from "./name-plan";
import { grownMarks, collectGrownMarks } from "./name-room";
import { hueOf, loadMarkInk, inkOf, screenOf, screenAt, onScreen, pickable, radiusNow, discRadius, grownIds, openedRadius, dotRadius, planOpenStars, lensHidden, radiusOf, radiusAt } from "./place";
import { disc, light, arcMark, addGlow, discAt, planCluster, markExpandedItems, focusLinks } from "./plan-marks";
import { DRAWN_INK, ELEMENT_PICK_PX, type Disc, REST_ARC, type Name, type Ring, type LabelBox, FrameList, names, hubNames, dotRows, nameRows, labelBoxPool, pickPool, POOLS, setBox, type StampedPoint, alphaCache, frameChords, shownElements, cacheFor, L, framePlan, PLAN_LISTS, type DrawnMarks, F as frameState, scratch } from "./state";

// A module-local name: see `F` in ./state.
const F = frameState;

const LIGHT_SINK_GAIN = 1.4;

/** One width memo per model, so a closed folder's names leave with its model. */
const measureByModel = new WeakMap<DialModel, MeasureText>();
function measureTextOf(model: DialModel): MeasureText {
  let measure = measureByModel.get(model);
  if (!measure) measureByModel.set(model, (measure = createMeasureText()));
  return measure;
}

const selectionRing: Ring = { x: 0, y: 0, r: 0, alpha: 0, ink: "" };
const agentRing: Ring = { x: 0, y: 0, r: 0, alpha: 1, ink: "" };

function ring(into: Ring, x: number, y: number, r: number, alpha: number, ink: string): Ring {
  if (into.x !== x) into.x = x;
  if (into.y !== y) into.y = y;
  if (into.r !== r) into.r = r;
  if (into.alpha !== alpha) into.alpha = alpha;
  into.ink = ink;
  return into;
}

/** A drawn dot answers before a name drawn over it: rows are hit last-first, so dots go last. */
function dotRow(p: DialPick): DialRowPick {
  const row = dotRows.take();
  row.id = p.id;
  const box = row.box;
  const minX = p.x - p.r;
  const maxX = p.x + p.r;
  const minY = p.y - p.r;
  const maxY = p.y + p.r;
  if (box.minX !== minX) box.minX = minX;
  if (box.maxX !== maxX) box.maxX = maxX;
  if (box.minY !== minY) box.minY = minY;
  if (box.maxY !== maxY) box.maxY = maxY;
  return row;
}

function elementPick(id: string, at: Point): DialPick {
  const p = pickPool.take();
  p.id = id;
  const r = Math.max(ELEMENT_PICK_PX, dotRadius(id));
  p.solid = false;
  if (p.x !== at.x) p.x = at.x;
  if (p.y !== at.y) p.y = at.y;
  if (p.r !== r) p.r = r;
  p.reachPx = Math.max(r, F.P.pickMinPx);
  return p;
}

function nameMark(name: PlacedName, x: number, y: number, ink: number, color: string, halo: number): Name {
  const n = names.take();
  n.name = name;
  if (n.x !== x) n.x = x;
  if (n.y !== y) n.y = y;
  if (n.ink !== ink) n.ink = ink;
  if (n.room !== 1) n.room = 1;
  n.fading = false;
  n.backed = name.backed === true;
  n.color = color;
  if (n.halo !== halo) n.halo = halo;
  return n;
}

const screenCache = new WeakMap<FlatGraphLayout, Map<string, StampedPoint>>();

const orphanCache = new WeakMap<FlatGraphLayout, ReadonlySet<string>>();
const radiusCaches = new WeakMap<FlatGraphLayout, { growth: number; scale: number; radii: Map<string, number> }>();
const flowKeyCache = new WeakMap<DialModel, Map<string, Map<string, string>>>();

const framePicks = new FrameList<DialPick>();
const frameRows = new FrameList<DialRowPick>();
const frameLabelBoxes = new FrameList<LabelBox>();
export const drawnFlowKeys = new FrameList<string>();

const NO_IDS: ReadonlySet<string> = new Set();
const NO_LINES: GraphAttention["lines"] = [];
const NO_BOXES: readonly Box[] = [];

/** Disc radii at one growth and scale, kept until the zoom changes either. */
function radiusCacheFor(layout: FlatGraphLayout, growth: number, scale: number): Map<string, number> {
  const hit = radiusCaches.get(layout);
  if (hit && hit.growth === growth && hit.scale === scale) return hit.radii;
  const radii = new Map<string, number>();
  radiusCaches.set(layout, { growth, scale, radii });
  return radii;
}

function orphansOf(layout: FlatGraphLayout): ReadonlySet<string> {
  let set = orphanCache.get(layout);
  if (!set) orphanCache.set(layout, (set = new Set(layout.orphanIds)));
  return set;
}

/** The flow a domain pair belongs to, either way round; built once per model. */
function flowKeyOf(model: DialModel, a: string, b: string): string | undefined {
  let byFrom = flowKeyCache.get(model);
  if (!byFrom) {
    byFrom = new Map();
    for (const f of model.flows) {
      for (const [u, v] of [[f.a, f.b], [f.b, f.a]] as const) {
        let to = byFrom.get(u);
        if (!to) byFrom.set(u, (to = new Map()));
        to.set(v, f.key);
      }
    }
    flowKeyCache.set(model, byFrom);
  }
  return byFrom.get(a)?.get(b);
}

const drawnRadii = new WeakMap<object, DrawnMarks>();

function pickOf(d: Disc): DialPick {
  const p = pickPool.take();
  p.id = d.id;
  p.solid = true;
  if (p.x !== d.x) p.x = d.x;
  if (p.y !== d.y) p.y = d.y;
  if (p.r !== d.r) p.r = d.r;
  p.reachPx = Math.max(d.r, F.P.pickMinPx);
  return p;
}

export function buildPlan(input: DialFrameInput, tokens: FlatGraphTokens, motion: GraphMotion) {
  const attention = motion.current;
  const mix = motion.baseMix;
  const { model, scene } = input.dial;
  const measureText = measureTextOf(model);
  const layout = scene.graph!;
  const P = tokens.paint;
  const inks = tokens.inks;
  const contextMode = input.contextAlphas !== undefined;
  const growth = zoomGrowth(input.zoomRatio, P);
  const origin = input.toScreen(0, 0);
  F.input = input; F.model = model; F.layout = layout; F.tokens = tokens; F.P = P;
  F.motion = motion; F.attention = attention;
  F.contextMode = contextMode; F.scale = input.scale; F.originX = origin.x; F.originY = origin.y;
  F.W = input.viewportWidth; F.H = input.viewportHeight; F.growth = growth; F.stamp += 1;
  F.screen = cacheFor(screenCache, layout); F.radii = radiusCacheFor(layout, growth, input.scale); F.orphans = orphansOf(layout);
  let drawn = drawnRadii.get(input.worldKey);
  if (!drawn) drawnRadii.set(input.worldKey, (drawn = { frame: 0, marks: new Map(), names: new Map(), namesBefore: [], namesNow: [] }));
  drawn.frame += 1;
  const before = drawn.namesBefore;
  drawn.namesBefore = drawn.namesNow;
  drawn.namesNow = before;
  drawn.namesNow.length = 0;
  F.names = drawn;
  F.drawn = drawn.marks; F.frame = drawn.frame; F.now = input.now; F.reducedMotion = input.reducedMotion; F.lagging = false;
  grownIds.clear();
  const step = zoomStep(input.scale, P.zoomStepsPerOctave);
  const stepGrowth = zoomGrowth((input.zoomRatio * stepScale(step, P.zoomStepsPerOctave)) / input.scale, P);
  stepGrowthNow[0] = stepGrowth;
  stepGrowthNow[1] = stepScale(step, P.zoomStepsPerOctave);
  const focusness = motion.share(MOTION_SHARE.focus, attention.lit ? 1 : 0);
  const evidence = input.evidence ? dialEvidenceView(model, input.evidence) : null;
  const measured = evidence?.measured === true;
  F.elementPitch = scene.medianElementPitch;
  const elementSpacingPx = scene.medianElementPitch * input.scale;
  const dotAlpha = smoothstep(P.dotSpacingFromPx, P.dotSpacingFullPx, elementSpacingPx);
  F.dotAlpha = dotAlpha;
  F.focusness = focusness;
  F.evidence = measured ? evidence : null;
  const selected = contextMode ? null : input.focusedNodeId;
  F.selectedId = selected !== null && selected !== model.projectId && !model.domainById.has(selected) ? selected : null;
  F.opened.length = 0;
  F.starCount = 0;
  const left = motion.previous.focusId;
  F.leavingId = !motion.settled && motion.previous.selected && left !== null && left !== F.selectedId && left !== model.projectId && !model.domainById.has(left) ? left : null;
  // The selection never stands in its own star, so its radius asks for the selected radius alone; its fan rings what it draws.
  if (F.selectedId !== null) {
    const r = selectedDiscRadius(radiusNow(F.selectedId), P, growth);
    if (F.selectedR !== r) F.selectedR = r;
    const share = attention.selected && attention.focusId === F.selectedId ? mix : 1;
    const elements = openedElements(model, layout, F.selectedId, P, discRadius(F.selectedId), input.scale, growth);
    if (elements !== null && share > 0) F.opened.push({ elements, share });
  }
  planOpenStars(input.focusedNodeId);
  if (F.leavingId !== null) {
    const r = openedRadius(F.leavingId, radiusNow(F.leavingId));
    if (F.leavingR !== r) F.leavingR = r;
    const elements = openedElements(model, layout, F.leavingId, P, discRadius(F.leavingId), input.scale, growth);
    if (elements !== null && mix < 1) F.opened.push({ elements, share: 1 - mix });
  }
  planFanPushes(input.focusedNodeId !== null && model.domainById.has(input.focusedNodeId) ? input.focusedNodeId : null);
  const projectShare = motion.share(MOTION_SHARE.project, attention.focusId !== null && attention.focusId === model.projectId ? 1 : 0);
  if (F.projectShare !== projectShare) F.projectShare = projectShare;
  F.lineKinds = 0;

  for (let pIndex = 0; pIndex < POOLS.length; pIndex += 1) {
    const p = POOLS[pIndex]!;
    p.reset();
  }
  const plan = framePlan;
  for (let listIndex = 0; listIndex < PLAN_LISTS.length; listIndex += 1) PLAN_LISTS[listIndex]!.restart();
  plan.selection = null;
  plan.agentRing = null;
  const alphas = cacheFor(alphaCache, layout);
  if (alphas.size === 0) for (const id of model.domainOf.keys()) alphas.set(id, 0);
  for (let elIndex = 0; elIndex < shownElements.size; elIndex += 1) alphas.set(shownElements.items[elIndex]!, 0);
  shownElements.restart();
  const picks = framePicks;
  picks.restart();
  const required = input.requiredBranchIds ?? NO_IDS;
  F.required = required;
  markExpandedItems(contextMode ? null : attention.lit, required, input.agentFocusNodeId);

  for (let cIndex = 0; cIndex < layout.clusters.length; cIndex += 1) {
    const c = layout.clusters[cIndex]!;
    const ink = inkOf(c.domainId);
    const home = layout.positions.get(c.domainId) ?? c.centre;
    const domainAt = screenOf(c.domainId);
    const x = domainAt.x + (c.centre.x - home.x) * input.scale;
    const y = domainAt.y + (c.centre.y - home.y) * input.scale;
    const r = c.footprint * input.scale * P.lightReach;
    const alpha = P.lightAlpha * Math.min(1, ink * LIGHT_SINK_GAIN) * (contextMode ? P.sinkInk : 1);
    if (!lensHidden(c.domainId) && alpha > 0.002 && x + r > 0 && y + r > 0 && x - r < F.W && y - r < F.H) L.lights.add(light(x, y, r, hueOf(c.domainId), alpha));
  }

  const project = model.projectId !== null && layout.positions.has(model.projectId) ? model.projectId : null;
  const projectAt = project ? screenOf(project) : null;
  if (project && projectAt) {
    alphas.set(project, 1);
    loadMarkInk(project);
    L.project.add(disc(project, projectAt, radiusAt(project, growth), inks.project, scratch[0]!, project === attention.focusId, "current"));
  }

  if (project) loadMarkInk(project);
  const projectInk = project ? scratch[0]! : 0;
  for (let cIndex = 0; cIndex < layout.clusters.length; cIndex += 1) planCluster(layout.clusters[cIndex]!, projectAt, projectInk);
  for (let idIndex = 0; idIndex < layout.orphanIds.length; idIndex += 1) {
    const id = layout.orphanIds[idIndex]!;
    const at = screenOf(id);
    const hidden = lensHidden(id);
    alphas.set(id, hidden ? 0 : 1);
    if (hidden || !onScreen(at)) continue;
    const d = discAt(id, at, inks.name, id === attention.focusId, "current");
    const r = discRadius(id);
    loadMarkInk(id);
    const ink = scratch[0]!;
    if (d.r !== r) d.r = r;
    if (d.ink !== ink) d.ink = ink;
    L.discs.add(d);
  }
  L.lights.seal(); L.project.seal(); L.segments.seal(); L.domains.seal(); L.discs.seal(); L.dots.seal();
  shownElements.seal();

  const presence = dialChordPresence(input.dialTokens, input.domainAppear);
  const restAlpha = (1 - focusness) * presence;
  drawnFlowKeys.restart();
  if (!contextMode && restAlpha > DRAWN_INK) {
    const rest = restArcs(model, P.restBudget);
    for (let arcIndex = 0; arcIndex < rest.length; arcIndex += 1) {
      const arc = rest[arcIndex]!;
      const a = screenAt(arc.from);
      const b = screenAt(arc.to);
      if (!a || !b) continue;
      const width = Math.min(P.arcWidthMaxPx, P.arcWidthBasePx + P.arcWidthGain * arc.count);
      const alpha = Math.min(P.arcAlphaMax, P.arcAlphaBase + P.arcAlphaGain * arc.count) * restAlpha * Math.min(inkOf(arc.from), inkOf(arc.to));
      const mark = arcMark(a, b, P.arcBow, radiusAt(arc.from, growth), radiusAt(arc.to, growth) + P.arcTrimPx, width, alpha, true, P.arcGlowAlpha * restAlpha, REST_ARC);
      if (!mark) continue;
      L.arcs.add(mark);
      F.lineKinds |= FLAT_LINE_BITS.rest;
      const key = flowKeyOf(model, arc.from, arc.to);
      if (key !== undefined && !drawnFlowKeys.has(key)) drawnFlowKeys.add(key);
    }
  }
  frameChords.restart();
  if (!contextMode) focusLinks(motion);
  L.arcs.seal(); L.focusArcs.seal(); drawnFlowKeys.seal(); frameChords.seal();

  for (let dIndex = 0; dIndex < plan.domains.length; dIndex += 1) {
    const d = plan.domains[dIndex]!;
    addGlow(d, false);
  }
  for (let dIndex = 0; dIndex < plan.discs.length; dIndex += 1) {
    const d = plan.discs[dIndex]!;
    addGlow(d, false);
  }
  for (let dIndex = 0; dIndex < plan.project.length; dIndex += 1) {
    const d = plan.project[dIndex]!;
    addGlow(d, true);
  }
  L.glows.seal();

  const selectedId = input.focusedNodeId;
  if (selectedId && !contextMode) {
    const at = screenAt(selectedId);
    if (at) {
      const pulse = input.selectionPulse?.nodeId === selectedId ? input.selectionPulse.scaleFactor : 1;
      plan.selection = ring(selectionRing, at.x, at.y, (discRadius(selectedId) + P.selectedRingGapPx) * pulse, mix, inks.project);
    }
  } else if (F.leavingId !== null && !contextMode) {
    const at = screenAt(F.leavingId);
    if (at) plan.selection = ring(selectionRing, at.x, at.y, discRadius(F.leavingId) + P.selectedRingGapPx, 1 - mix, inks.project);
  }

  const agentId = contextMode ? null : input.agentFocusNodeId;
  const agentAt = agentId ? screenAt(agentId) : undefined;
  if (agentId && agentAt && alphas.get(agentId) !== 0) {
    plan.agentRing = ring(agentRing, agentAt.x, agentAt.y, radiusAt(agentId, growth) + AGENT_FOCUS_RING_OFFSET, 1, input.mapTokens.amberHub);
  }

  const fontFamily = labelFontFamily();
  const unmeasuredLine = evidence !== null && !evidence.measured ? input.labels?.evidenceUnmeasured?.() ?? null : null;
  const admitUnder = (a: GraphAttention) => admittedNames({
    model, layout, tokens: P, labels: input.labels, measureText, fontFamily, scale: input.scale, growth: stepGrowth,
    elementLabel: input.elementLabel, staleByDomain: measured ? evidence!.staleByDomain : null,
    lit: contextMode ? null : a.lit, focusId: a.focusId, attentionKey: a.key, openStarId: F.starNow ? input.focusedNodeId : null, agentFocusId: contextMode ? null : input.agentFocusNodeId,
    selected: a.selected, named: a.named, reach: a.reach, lines: contextMode ? NO_LINES : a.lines,
    discRadius: stepRadius, elementSpacingPx, hubCaption: unmeasuredLine,
  });
  collectGrownMarks();
  const admission = admitUnder(attention);
  const leaving = F.leavingId;
  const chrome = input.nameObstacles ?? NO_BOXES;
  // A name gives way to the names drawn before it, so while names give way they are drawn in the
  // order they rank; with nothing grown no name gives way, and admission's order stands. O(names).
  const ranked = grownMarks.size > 0;
  const ranks = nameRanks;
  const planned = plannedNames;
  ranks.length = admission.names.length;
  planned.length = admission.names.length;
  const starId = F.starNow && input.focusedNodeId !== null && model.domainById.has(input.focusedNodeId) ? input.focusedNodeId : null;
  for (let nIndex = 0; nIndex < admission.names.length;) {
    const end = nameBlockEnd(admission.names, nIndex);
    const id = admission.names[nIndex]!.id;
    const member = starId !== null && model.capabilityById.has(id) && model.domainOf.get(id) === starId;
    let show = member ? memberBlockShows(admission.names, nIndex, end, chrome) : blockShows(admission.names, nIndex, end, chrome, contextMode ? null : selectedId);
    planned[nIndex] = admission.names[nIndex]!;
    // An open star's member whose side runs under chrome or out of the free map takes the best of its other sides that clears it.
    const alternates = show ? undefined : admission.alternates.get(id);
    if (alternates !== undefined && end === nIndex + 1) {
      for (let k = 0; k < alternates.length && !show; k += 1) {
        if (memberBlockShows(alternates, k, k + 1, chrome)) {
          planned[nIndex] = alternates[k]!;
          show = true;
        }
      }
    }
    for (let i = nIndex; i < end; i += 1) {
      const n = i === nIndex ? planned[i]! : (planned[i] = admission.names[i]!);
      if (!ranked && show) planName(n, alphas, n.id === leaving ? mix : 1, false);
      ranks[i] = ranked && show ? nameRank(n) : -1;
    }
    nIndex = end;
  }
  if (ranked) {
    for (let rank = 0; rank < NAME_RANKS; rank += 1) {
      for (let i = 0; i < planned.length; i += 1) {
        const n = planned[i]!;
        if (ranks[i] === rank) planName(n, alphas, n.id === leaving ? mix : 1, false);
      }
    }
  }
  if (starId !== null) planMemberFallbacks(admission.fallbacks, alphas, chrome);
  // A deselected name keeps its selected size and fades on the exit mix while its rest name fades in.
  if (leaving !== null) {
    const before = admitUnder(motion.previous);
    for (let nIndex = 0; nIndex < before.names.length;) {
      const end = nameBlockEnd(before.names, nIndex);
      if (before.names[nIndex]!.id === leaving && blockShows(before.names, nIndex, end, chrome, null)) {
        for (let i = nIndex; i < end; i += 1) planName(before.names[i]!, alphas, 1 - mix, true);
      }
      nIndex = end;
    }
  }
  // A name the frame before drew that is no longer admitted keeps its place while its ink runs out.
  const drewBefore = F.names.namesBefore;
  for (let i = 0; i < drewBefore.length; i += 1) {
    const row = drewBefore[i]!;
    if (row.frame !== F.frame && row.admitted !== F.frame) placeName(row, alphas, 1, true);
  }
  const hub = plan.project[0];
  if (hub) {
    const placement = dialPlacementOf(input.dial);
    let line = 0;
    const hubLine = (text: string | null | undefined) => {
      if (!text) return;
      const font = hubCaptionFont(P.captionPx, fontFamily);
      const w = measureText(text, font);
      const dy = hub.r + P.nameGapPx + P.captionPx / 2 + line * (P.captionPx + P.captionGapPx);
      line += 1;
      const name = hubNames.take();
      name.id = hub.id; name.text = text; name.font = font;
      if (name.dy !== dy) name.dy = dy;
      setBox(name.box, -w / 2 - P.namePadPx, w / 2 + P.namePadPx, dy - P.captionPx / 2 - P.namePadPx, dy + P.captionPx / 2 + P.namePadPx);
      if (boxUnderAny(chrome, hub.x + name.box.minX, hub.x + name.box.maxX, hub.y + name.box.minY, hub.y + name.box.maxY)) return;
      L.names.add(nameMark(name, hub.x, hub.y + dy, inkOf(hub.id), inks.name, P.nameHaloPx));
    };
    hubLine(dialPlacementLine(placement.state, placement.progress, input.labels));
    hubLine(unmeasuredLine);
  }

  L.names.seal();

  if (plan.dots.length > 0) for (let elIndex = 0; elIndex < shownElements.size; elIndex += 1) {
    const el = shownElements.items[elIndex]!;
    const at = screenAt(el);
    if (at && pickable(at)) picks.add(elementPick(el, at));
  }
  const elementPicks = picks.size;
  for (let dIndex = 0; dIndex < plan.discs.length; dIndex += 1) {
    const d = plan.discs[dIndex]!;
    picks.add(pickOf(d));
  }
  for (let dIndex = 0; dIndex < plan.domains.length; dIndex += 1) {
    const d = plan.domains[dIndex]!;
    picks.add(pickOf(d));
  }
  for (let dIndex = 0; dIndex < plan.project.length; dIndex += 1) {
    const d = plan.project[dIndex]!;
    picks.add(pickOf(d));
  }
  const rows = frameRows;
  rows.restart();
  const labelBoxes = frameLabelBoxes;
  labelBoxes.restart();
  const pad = P.namePadPx;
  for (let nIndex = 0; nIndex < plan.names.length; nIndex += 1) {
    const n = plan.names[nIndex]!;
    if (n.fading) continue;
    const ox = n.x - n.name.dx;
    const oy = n.y - n.name.dy;
    const label = labelBoxPool.take();
    label.nodeId = n.name.id;
    label.text = n.name.text;
    setBox(label, ox + n.name.box.minX + pad, ox + n.name.box.maxX - pad, oy + n.name.box.minY + pad, oy + n.name.box.maxY - pad);
    labelBoxes.add(label);
    if (n.ink > P.sinkInk && n.name.role !== "units" && n.name.role !== "orphans" && n.name.role !== "reach") {
      const row = nameRows.take();
      row.id = n.name.id;
      setBox(row.box, ox + n.name.box.minX, ox + n.name.box.maxX, oy + n.name.box.minY, oy + n.name.box.maxY);
      rows.add(row);
    }
  }
  for (let i = 0; i < elementPicks; i += 1) rows.add(dotRow(picks.items[i]!));

  return { plan, alphas, picks: picks.seal(), rows: rows.seal(), labelBoxes: labelBoxes.seal(), presence, tier: (dotAlpha > 0.5 ? "element" : "circuit") as DialFrameResult["tier"] };
}

const hubFonts = new Map<string, string>();

function hubCaptionFont(px: number, family: string): string {
  let font = hubFonts.get(family);
  if (font === undefined) hubFonts.set(family, (font = `${FONT_WEIGHT.signature} ${px}px ${family}`));
  return font;
}

/**
 * The name admission's disc radius at this frame's zoom step. A module function, not a closure: a
 * closure kept across frames would hold the frame that made it, and through it an unmounted canvas.
 */
const stepGrowthNow = new Float64Array(2);

function stepRadius(id: string): number {
  const own = radiusOf(id, stepGrowthNow[0]!, stepGrowthNow[1]!);
  const star = F.stars[0]!;
  const room = F.starNow ? star.rooms.get(id) : undefined;
  if (room === undefined) return own;
  // Names stand where the star has fully opened, so they never move as it opens.
  const nearestOwn = room.nearestId === null ? 0 : radiusOf(room.nearestId, stepGrowthNow[0]!, stepGrowthNow[1]!);
  const fixedPx = star.domain ? graphDiscRadiusPx("domain", 0, F.P, stepGrowthNow[0]!) : star.fixedPx;
  return openRadiusPx(own, room, star.world ? stepGrowthNow[1]! : 1, fixedPx, F.P, nearestOwn);
}
