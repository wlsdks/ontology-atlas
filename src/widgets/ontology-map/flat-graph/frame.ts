import { dialEvidenceView } from "../dial/dial-model";
import { createMeasureText } from "../dial/fit";
import { emptyDialFrameMarks, type DialFrameMarks } from "../dial/frame/marks";
import { dialChordPresence, recordDialFrame } from "../dial/frame/frame";
import { dialPlacementLine, dialPlacementOf } from "../dial/placement";
import type { Box, DialFrameInput, DialFrameResult, DialPick, DialRowPick, Point, StripMark, TextMark } from "../dial/types";
import { HITTABLE_MIN_TIER_ALPHA } from "../model/visibility/tier-visibility";
import { labelFontFamily } from "../render/labels";
import { AGENT_FOCUS_RING_OFFSET } from "../render/node-shapes";
import { FONT_WEIGHT } from "@/shared/ui/tokens/font-weight";
import { cachedGraphAttention, graphInkMix, inkUnder, transitionShare, type GraphAttention, type GraphTransition } from "./attention";
import {
  arcPath, glowSprite, graphDiscRadiusPx, lightSprite, restArcs, smoothstep, sunk, zoomGrowth, type ArcPath,
} from "./marks";
import { admittedNames, stepScale, zoomStep, type PlacedName } from "./names";
import type { FlatGraphLayout, FlatGraphTokens } from "./types";

const CULL_PX = 80;
const DRAWN_INK = 0.02;
const FOCUS_BOW = 0.16;
const FOCUS_LINK_ALPHA = 0.55;
const FOCUS_LINK_WIDTH_PX = 1.2;
const FOCUS_LINK_GLOW_ALPHA = 0.16;
const FOCUS_GLOW_ALPHA = 0.4;
const FOCUS_RIM_PX = 2.4;
const PROJECT_RIM_PX = 2.2;
const ARROW_SPREAD = 0.5;
const ARROW_WIDTH_PX = 1.3;
const DOT_ALPHA = 0.7;
const LIT_DOT_SHARE = 1.5;
const LIGHT_SINK_GAIN = 1.4;
const SELECTION_GAP_PX = 5;
const SELECTION_RING_PX = 1.5;
const AGENT_RING_WIDTH_PX = 1;
const PIP_SHARE = 0.3;
const PIP_MIN_PX = 2;
const UNKNOWN_DASH = [2, 2];
const ELEMENT_PICK_PX = 4;

const measureText = createMeasureText();

interface Disc { id: string; x: number; y: number; r: number; hue: string; ink: number; focus: boolean; state: "current" | "stale" | "unknown" }
interface Dot { x: number; y: number; r: number; hue: string; ink: number; alpha: number }
interface Segment { x0: number; y0: number; x1: number; y1: number; ink: string; width: number; alpha: number }
interface Arc { path: ArcPath; width: number; alpha: number; head: boolean; glow: number }
interface Glow { x: number; y: number; r: number; ink: string; alpha: number }
interface Light { x: number; y: number; r: number; ink: string; alpha: number }
interface Name { name: PlacedName; x: number; y: number; ink: number; color: string; halo: number }

/** A frame reuses last frame's mark objects, so per-concept work allocates nothing. */
function markPool<T>(make: () => T): { take(): T; reset(): void } {
  const items: T[] = [];
  let used = 0;
  return { take: () => (items[used++] ??= make()), reset: () => { used = 0; } };
}

const segments = markPool<Segment>(() => ({ x0: 0, y0: 0, x1: 0, y1: 0, ink: "", width: 0, alpha: 0 }));
const dots = markPool<Dot>(() => ({ x: 0, y: 0, r: 0, hue: "", ink: 0, alpha: 0 }));
const discs = markPool<Disc>(() => ({ id: "", x: 0, y: 0, r: 0, hue: "", ink: 0, focus: false, state: "current" }));
const glows = markPool<Glow>(() => ({ x: 0, y: 0, r: 0, ink: "", alpha: 0 }));
const framePlan: FramePlan = { lights: [], segments: [], arcs: [], focusArcs: [], dots: [], glows: [], discs: [], domains: [], project: null, selection: null, agentRing: null, names: [] };
const pickPool = markPool<DialPick>(() => ({ id: "", x: 0, y: 0, r: 0 }));

function segment(x0: number, y0: number, x1: number, y1: number, ink: string, width: number, alpha: number): Segment {
  const s = segments.take();
  s.x0 = x0; s.y0 = y0; s.x1 = x1; s.y1 = y1; s.ink = ink; s.width = width; s.alpha = alpha;
  return s;
}

function dot(at: Point, r: number, hue: string, ink: number, alpha: number): Dot {
  const d = dots.take();
  d.x = at.x; d.y = at.y; d.r = r; d.hue = hue; d.ink = ink; d.alpha = alpha;
  return d;
}

function disc(id: string, at: Point, r: number, hue: string, ink: number, focus: boolean, state: Disc["state"]): Disc {
  const d = discs.take();
  d.id = id; d.x = at.x; d.y = at.y; d.r = r; d.hue = hue; d.ink = ink; d.focus = focus; d.state = state;
  return d;
}

function glow(x: number, y: number, r: number, ink: string, alpha: number): Glow {
  const g = glows.take();
  g.x = x; g.y = y; g.r = r; g.ink = ink; g.alpha = alpha;
  return g;
}

function pick(id: string, x: number, y: number, r: number): DialPick {
  const p = pickPool.take();
  p.id = id; p.x = x; p.y = y; p.r = r;
  return p;
}

interface StampedPoint extends Point { stamp: number }
const ORIGIN: Point = { x: 0, y: 0 };
const screenCache = new WeakMap<FlatGraphLayout, Map<string, StampedPoint>>();
const alphaCache = new WeakMap<FlatGraphLayout, Map<string, number>>();
let stamp = 0;
const radiusCaches = new WeakMap<FlatGraphLayout, { growth: number; radii: Map<string, number> }>();

/** Disc radii at one growth, kept until the zoom changes it. */
function radiusCacheFor(layout: FlatGraphLayout, growth: number): Map<string, number> {
  const hit = radiusCaches.get(layout);
  if (hit && hit.growth === growth) return hit.radii;
  const radii = new Map<string, number>();
  radiusCaches.set(layout, { growth, radii });
  return radii;
}
const framePicks: DialPick[] = [];

/** One map per layout, overwritten every frame: every id is written each frame or read through its stamp. */
function cacheFor<V>(cache: WeakMap<FlatGraphLayout, Map<string, V>>, layout: FlatGraphLayout): Map<string, V> {
  let map = cache.get(layout);
  if (!map) {
    map = new Map();
    cache.set(layout, map);
  }
  return map;
}

interface FramePlan {
  lights: Light[];
  segments: Segment[];
  arcs: Arc[];
  focusArcs: Arc[];
  dots: Dot[];
  glows: Glow[];
  discs: Disc[];
  domains: Disc[];
  project: Disc | null;
  selection: { x: number; y: number; r: number; alpha: number } | null;
  agentRing: { x: number; y: number; r: number; ink: string } | null;
  names: Name[];
}

let deferred: { plan: FramePlan; tokens: FlatGraphTokens; ground: string; warning: string } | null = null;

function hueOf(layout: FlatGraphLayout, tokens: FlatGraphTokens, domainId: string | null | undefined): string {
  const index = domainId ? layout.hueByDomain.get(domainId) : undefined;
  return index === undefined ? tokens.inks.name : tokens.inks.hues[index] ?? tokens.inks.name;
}

function nameInkUnder(attention: GraphAttention, id: string): number {
  return attention.lit === null || attention.lit.has(id) ? 1 : 0;
}

function onScreen(p: Point, w: number, h: number, pad: number): boolean {
  return p.x > -pad && p.y > -pad && p.x < w + pad && p.y < h + pad;
}

function buildPlan(input: DialFrameInput, tokens: FlatGraphTokens, transition: GraphTransition) {
  const { current: attention, previous, mix } = transition;
  const { model, scene } = input.dial;
  const layout = scene.graph!;
  const P = tokens.paint;
  const inks = tokens.inks;
  const contextMode = input.contextAlphas !== undefined;
  const W = input.viewportWidth;
  const H = input.viewportHeight;
  const growth = zoomGrowth(input.zoomRatio, P);
  const step = zoomStep(input.scale, P.zoomStepsPerOctave);
  const stepGrowth = zoomGrowth((input.zoomRatio * stepScale(step, P.zoomStepsPerOctave)) / input.scale, P);
  const focusness = transitionShare(transition, (a) => (a.lit ? 1 : 0));
  const evidence = input.evidence ? dialEvidenceView(model, input.evidence) : null;
  const measured = evidence?.measured === true;
  const elementSpacingPx = scene.medianElementPitch * input.scale;
  const dotAlpha = smoothstep(P.dotSpacingFromPx, P.dotSpacingFullPx, elementSpacingPx);

  const settled = mix >= 1 || (previous === attention && transition.older === attention);
  const inkOf = (id: string): number => {
    const focus = settled ? inkUnder(attention, id, P.sinkInk) : transitionShare(transition, (a) => inkUnder(a, id, P.sinkInk));
    const brightened = attention.selected && id === input.hoveredNodeId ? 1 : focus;
    const lens = contextMode ? input.contextInkAlphas?.get(id) ?? 1 : 1;
    return brightened * lens * input.appearOf(id);
  };
  stamp += 1;
  const frameStamp = stamp;
  const origin = input.toScreen(0, 0);
  const screen = cacheFor(screenCache, layout);
  const screenOf = (id: string): Point => {
    const home = input.nodeAt?.(id) ?? layout.positions.get(id) ?? layout.itemAt.get(id) ?? ORIGIN;
    let at = screen.get(id);
    if (!at) {
      at = { x: 0, y: 0, stamp: 0 };
      screen.set(id, at);
    }
    at.x = home.x * input.scale + origin.x;
    at.y = home.y * input.scale + origin.y;
    at.stamp = frameStamp;
    return at;
  };
  const screenAt = (id: string): Point | undefined => {
    const at = screen.get(id);
    return at && at.stamp === frameStamp ? at : undefined;
  };
  const segmentOnScreen = (a: Point, b: Point): boolean =>
    !(Math.max(a.x, b.x) < -CULL_PX || Math.min(a.x, b.x) > W + CULL_PX || Math.max(a.y, b.y) < -CULL_PX || Math.min(a.y, b.y) > H + CULL_PX);
  const lensHidden = (id: string): boolean => contextMode && (input.contextAlphas!.get(id) ?? 0) < HITTABLE_MIN_TIER_ALPHA;
  const orphans = new Set(layout.orphanIds);
  const capElements = (id: string) => model.capabilityById.get(id)?.elementIds.length ?? 0;
  const radii = radiusCacheFor(layout, growth);
  const radiusAt = (id: string, g: number): number => {
    if (g === growth) {
      const known = radii.get(id);
      if (known !== undefined) return known;
      const r = radiusOf(id, g);
      radii.set(id, r);
      return r;
    }
    return radiusOf(id, g);
  };
  const radiusOf = (id: string, g: number): number => {
    if (id === model.projectId) return graphDiscRadiusPx("project", 0, P, g);
    if (model.domainById.has(id)) return graphDiscRadiusPx("domain", 0, P, g);
    if (model.capabilityById.has(id) || orphans.has(id)) return graphDiscRadiusPx("capability", capElements(id), P, g);
    return graphDiscRadiusPx("element", 0, P, g);
  };

  for (const p of [segments, dots, discs, glows, pickPool]) p.reset();
  const plan = framePlan;
  for (const list of [plan.lights, plan.segments, plan.arcs, plan.focusArcs, plan.dots, plan.glows, plan.discs, plan.domains, plan.names]) list.length = 0;
  plan.project = null;
  plan.selection = null;
  plan.agentRing = null;
  const alphas = cacheFor(alphaCache, layout);
  if (alphas.size === 0) for (const id of model.domainOf.keys()) alphas.set(id, 0);
  const picks = framePicks;
  picks.length = 0;
  const required = input.requiredBranchIds ?? new Set<string>();

  for (const c of layout.clusters) {
    const ink = inkOf(c.domainId);
    const at = input.toScreen(c.centre.x, c.centre.y);
    const r = c.footprint * input.scale * P.lightReach;
    const alpha = P.lightAlpha * Math.min(1, ink * LIGHT_SINK_GAIN) * (contextMode ? P.sinkInk : 1);
    if (!lensHidden(c.domainId) && alpha > 0.002 && at.x + r > 0 && at.y + r > 0 && at.x - r < W && at.y - r < H) plan.lights.push({ x: at.x, y: at.y, r, ink: hueOf(layout, tokens, c.domainId), alpha });
  }

  const project = model.projectId !== null && layout.positions.has(model.projectId) ? model.projectId : null;
  const projectAt = project ? screenOf(project) : null;
  if (project && projectAt) {
    alphas.set(project, 1);
    const ink = inkOf(project);
    plan.project = disc(project, projectAt, radiusAt(project, growth), inks.project, ink, false, "current");
  }

  for (const c of layout.clusters) {
    const hue = hueOf(layout, tokens, c.domainId);
    const at = screenOf(c.domainId);
    const domainHidden = lensHidden(c.domainId);
    alphas.set(c.domainId, domainHidden ? 0 : 1);
    const ink = inkOf(c.domainId);
    const r = radiusAt(c.domainId, growth);
    if (projectAt && !contextMode && segmentOnScreen(projectAt, at)) plan.segments.push(segment(projectAt.x, projectAt.y, at.x, at.y, inks.project, P.linkCapWidthPx, P.linkDomainAlpha * Math.min(ink, inkOf(project!))));
    if (!domainHidden && onScreen(at, W, H, CULL_PX + r)) plan.domains.push(disc(c.domainId, at, r, hue, ink, c.domainId === attention.focusId, "current"));
    for (const it of c.items) {
      const itemAt = it.direct ? at : screenOf(it.id);
      const itemInk = it.direct ? ink : inkOf(it.id);
      if (!it.direct) {
        const itemHidden = lensHidden(it.id);
        alphas.set(it.id, itemHidden ? 0 : 1);
        if (!contextMode && segmentOnScreen(at, itemAt)) plan.segments.push(segment(at.x, at.y, itemAt.x, itemAt.y, hue, P.linkCapWidthPx, P.linkCapAlpha * Math.min(ink, itemInk)));
        const rr = radiusAt(it.id, growth);
        if (!itemHidden && onScreen(itemAt, W, H, CULL_PX + rr)) {
          const state = measured ? evidence!.stateOf(it.id) : "current";
          plan.discs.push(disc(it.id, itemAt, rr, hue, itemInk, it.id === attention.focusId, state));
        }
      }
      for (const el of it.elementIds) {
        const lit = attention.lit?.has(el) === true;
        const shown = lensHidden(el) ? 0 : Math.max(dotAlpha, lit ? focusness : 0, required.has(el) || el === input.agentFocusNodeId ? 1 : 0);
        alphas.set(el, shown > DRAWN_INK ? 1 : 0);
        if (shown <= DRAWN_INK) continue;
        const elAt = screenOf(el);
        const elInk = inkOf(el);
        if (!contextMode && segmentOnScreen(itemAt, elAt)) plan.segments.push(segment(itemAt.x, itemAt.y, elAt.x, elAt.y, hue, P.linkElementWidthPx, P.linkElementAlpha * Math.min(itemInk, elInk) * shown));
        if (onScreen(elAt, W, H, CULL_PX)) plan.dots.push(dot(elAt, radiusAt(el, growth) * (lit ? LIT_DOT_SHARE : 1), hue, elInk, DOT_ALPHA * shown));
      }
    }
  }
  for (const id of layout.orphanIds) {
    const at = screenOf(id);
    const hidden = lensHidden(id);
    alphas.set(id, hidden ? 0 : 1);
    const r = radiusAt(id, growth);
    if (!hidden && onScreen(at, W, H, CULL_PX)) plan.discs.push(disc(id, at, r, inks.name, inkOf(id), id === attention.focusId, "current"));
  }

  const presence = dialChordPresence(input.dialTokens, input.domainAppear);
  const restAlpha = (1 - focusness) * presence;
  const arcs = restArcs(model, P.restBudget);
  const drawnFlows = new Set<string>();
  if (!contextMode && restAlpha > DRAWN_INK) {
    for (const arc of arcs) {
      const a = screenAt(arc.from);
      const b = screenAt(arc.to);
      if (!a || !b) continue;
      const trim = radiusAt(arc.to, growth) + P.arcTrimPx;
      const path = arcPath(a, b, P.arcBow, radiusAt(arc.from, growth), trim);
      if (!path) continue;
      const width = Math.min(P.arcWidthMaxPx, P.arcWidthBasePx + P.arcWidthGain * arc.count);
      const alpha = Math.min(P.arcAlphaMax, P.arcAlphaBase + P.arcAlphaGain * arc.count) * restAlpha * Math.min(inkOf(arc.from), inkOf(arc.to));
      plan.arcs.push({ path, width, alpha, head: true, glow: P.arcGlowAlpha * restAlpha });
      drawnFlows.add(arc.from < arc.to ? `${arc.from}\u0000${arc.to}` : `${arc.to}\u0000${arc.from}`);
    }
  }
  if (!contextMode) {
    const links = (att: GraphAttention, share: number) => {
      if (share <= DRAWN_INK) return;
      for (const [from, to] of att.links) {
        const a = screenAt(from);
        const b = screenAt(to);
        if (!a || !b) continue;
        const path = arcPath(a, b, FOCUS_BOW, radiusAt(from, growth), radiusAt(to, growth) + P.arcTrimPx / 2);
        if (path) plan.focusArcs.push({ path, width: FOCUS_LINK_WIDTH_PX, alpha: FOCUS_LINK_ALPHA * share, head: false, glow: FOCUS_LINK_GLOW_ALPHA * share });
      }
    };
    if (previous !== attention) links(previous, 1 - mix);
    links(attention, mix);
  }

  const glowing = (d: Disc) => {
    const isDomain = model.domainById.has(d.id);
    const isProject = d.id === project;
    const halo = isProject ? P.projectGlowPx * growth : isDomain ? P.domainGlowPx * growth : d.r + P.capGlowPx * growth;
    const focusGain = d.focus ? FOCUS_GLOW_ALPHA / P.glowAlpha : 1;
    plan.glows.push(glow(d.x, d.y, halo, d.hue, Math.min(1, P.glowAlpha * focusGain) * d.ink * d.ink));
  };
  for (const d of plan.domains) glowing(d);
  for (const d of plan.discs) glowing(d);
  if (plan.project) glowing(plan.project);

  const selectedId = input.focusedNodeId;
  if (selectedId && !contextMode) {
    const at = screenAt(selectedId);
    if (at) {
      const pulse = input.selectionPulse?.nodeId === selectedId ? input.selectionPulse.scaleFactor : 1;
      plan.selection = { ...at, r: (radiusAt(selectedId, growth) + SELECTION_GAP_PX) * pulse, alpha: mix };
    }
  }

  const agentId = contextMode ? null : input.agentFocusNodeId;
  const agentAt = agentId ? screenAt(agentId) : undefined;
  if (agentId && agentAt && alphas.get(agentId) !== 0) {
    plan.agentRing = { x: agentAt.x, y: agentAt.y, r: radiusAt(agentId, growth) + AGENT_FOCUS_RING_OFFSET, ink: input.mapTokens.amberHub };
  }

  const fontFamily = labelFontFamily();
  const admission = admittedNames({
    model, layout, tokens: P, labels: input.labels, measureText, fontFamily, scale: input.scale, growth: stepGrowth,
    elementLabel: input.elementLabel, staleByDomain: measured ? evidence!.staleByDomain : null,
    lit: contextMode ? null : attention.lit, focusId: attention.focusId, attentionKey: attention.key, agentFocusId: contextMode ? null : input.agentFocusNodeId,
    discRadius: (id) => radiusAt(id, stepGrowth), elementSpacingPx,
  });
  const nameInk = (n: PlacedName): number => {
    if (n.role === "project" || n.role === "domain" || n.role === "units") return inkOf(n.id);
    const focus = transitionShare(transition, (a) => nameInkUnder(a, n.id));
    const brightened = attention.selected && n.id === input.hoveredNodeId ? 1 : focus;
    const lens = contextMode ? input.contextInkAlphas?.get(n.id) ?? 1 : 1;
    const elementShare = n.role === "element" && attention.lit?.has(n.id) !== true ? dotAlpha : 1;
    return brightened * lens * elementShare * input.appearOf(n.id);
  };
  for (const n of admission.names) {
    const at = screenAt(n.id);
    if (!at || alphas.get(n.id) === 0) continue;
    const x = at.x + n.dx;
    const y = at.y + n.dy;
    if (x + n.box.maxX - n.dx < 0 || x + n.box.minX - n.dx > W || y + n.box.maxY - n.dy < 0 || y + n.box.minY - n.dy > H) continue;
    const ink = nameInk(n);
    if (ink <= DRAWN_INK) continue;
    const domainId = n.role === "domain" || n.role === "units" ? n.id : model.domainOf.get(n.id) ?? null;
    const strong = n.role === "domain" || n.role === "project" || n.id === attention.focusId;
    const color = n.role === "units" ? hueOf(layout, tokens, domainId) : strong ? inks.nameStrong : inks.name;
    plan.names.push({ name: n, x, y, ink, color, halo: n.role === "domain" ? P.domainNameHaloPx : P.nameHaloPx });
  }
  const hubLines = [dialPlacementLine(dialPlacementOf(input.dial).state, dialPlacementOf(input.dial).progress, input.labels),
    evidence !== null && !evidence.measured ? input.labels?.evidenceUnmeasured?.() ?? null : null].filter((t): t is string => !!t);
  if (plan.project && hubLines.length > 0) {
    const font = `${FONT_WEIGHT.signature} ${P.captionPx}px ${fontFamily}`;
    hubLines.forEach((text, i) => {
      const w = measureText(text, font);
      const dy = plan.project!.r + P.nameGapPx + P.captionPx / 2 + i * (P.captionPx + P.captionGapPx);
      plan.names.push({
        name: { id: project!, role: "units", text, font, dx: 0, dy, align: "center", box: { minX: -w / 2 - P.namePadPx, maxX: w / 2 + P.namePadPx, minY: dy - P.captionPx / 2 - P.namePadPx, maxY: dy + P.captionPx / 2 + P.namePadPx } },
        x: plan.project!.x, y: plan.project!.y + dy, ink: inkOf(project!), color: inks.name, halo: P.nameHaloPx,
      });
    });
  }

  const dotPicks = plan.dots.length > 0;
  if (dotPicks) for (const c of layout.clusters) for (const it of c.items) for (const el of it.elementIds) {
    const at = screenAt(el);
    if (at && alphas.get(el) === 1 && onScreen(at, W, H, ELEMENT_PICK_PX)) picks.push(pick(el, at.x, at.y, Math.max(ELEMENT_PICK_PX, radiusAt(el, growth))));
  }
  for (const d of plan.discs) picks.push(pick(d.id, d.x, d.y, d.r));
  for (const d of plan.domains) picks.push(pick(d.id, d.x, d.y, d.r));
  if (plan.project) picks.push(pick(plan.project.id, plan.project.x, plan.project.y, plan.project.r));
  const rows: DialRowPick[] = [];
  const labelBoxes: DialFrameResult["labelBoxes"] = [];
  for (const n of plan.names) {
    const box: Box = { minX: n.x - n.name.dx + n.name.box.minX, maxX: n.x - n.name.dx + n.name.box.maxX, minY: n.y - n.name.dy + n.name.box.minY, maxY: n.y - n.name.dy + n.name.box.maxY };
    const pad = P.namePadPx;
    labelBoxes.push({ nodeId: n.name.id, text: n.name.text, minX: box.minX + pad, maxX: box.maxX - pad, minY: box.minY + pad, maxY: box.maxY - pad });
    if (n.ink > P.sinkInk && n.name.role !== "units") rows.push({ id: n.name.id, box });
  }

  return { plan, alphas, picks, rows, labelBoxes, drawnFlows, presence, tier: (dotAlpha > 0.5 ? "element" : "circuit") as DialFrameResult["tier"] };
}

function strokeArcs(ctx: CanvasRenderingContext2D, arcs: readonly Arc[], ink: string, headPx: number): void {
  for (const arc of arcs) {
    const { a, c, b } = arc.path;
    if (arc.glow > 0.002) {
      ctx.globalAlpha = arc.glow * Math.min(1, arc.alpha * 4);
      ctx.lineWidth = arc.width + 4;
      ctx.strokeStyle = ink;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = arc.alpha;
    ctx.lineWidth = arc.width;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
    ctx.stroke();
    if (arc.head) {
      ctx.lineWidth = ARROW_WIDTH_PX;
      ctx.beginPath();
      ctx.moveTo(b.x - Math.cos(arc.path.angle - ARROW_SPREAD) * headPx, b.y - Math.sin(arc.path.angle - ARROW_SPREAD) * headPx);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(b.x - Math.cos(arc.path.angle + ARROW_SPREAD) * headPx, b.y - Math.sin(arc.path.angle + ARROW_SPREAD) * headPx);
      ctx.stroke();
    }
  }
}

const inkCodes = new Map<string, number>();
const inkCode = (ink: string): number => {
  let code = inkCodes.get(ink);
  if (code === undefined) inkCodes.set(ink, (code = inkCodes.size));
  return code;
};
const widthCodes = new Map<number, number>();
const widthCode = (width: number): number => {
  let code = widthCodes.get(width);
  if (code === undefined) widthCodes.set(width, (code = widthCodes.size));
  return code;
};
const GROUP_LEVELS = 64;
const groupLevel = (share: number): number => Math.round(Math.min(1, Math.max(0, share)) * (GROUP_LEVELS - 1));

/** Buckets marks by a numeric paint key; the buckets and their arrays are reused across frames. */
function group<T>(buckets: Map<number, T[]>, items: readonly T[], key: (item: T) => number, keep?: (item: T) => boolean): T[][] {
  for (const list of buckets.values()) list.length = 0;
  for (const item of items) {
    if (keep && !keep(item)) continue;
    const k = key(item);
    const list = buckets.get(k);
    if (list) list.push(item);
    else buckets.set(k, [item]);
  }
  const out = groupedLists as T[][];
  out.length = 0;
  for (const list of buckets.values()) if (list.length > 0) out.push(list);
  return out;
}

const groupedLists: unknown[][] = [];
const NO_DASH: number[] = [];
const discBuckets = new Map<number, Disc[]>();
const segmentBuckets = new Map<number, Segment[]>();
const dotBuckets = new Map<number, Dot[]>();

function paintDiscs(ctx: CanvasRenderingContext2D, marks: readonly Disc[], tokens: FlatGraphTokens, ground: string, warning: string, kind: "domain" | "capability" | "project", growth: number): void {
  const P = tokens.paint;
  const rimPx = kind === "project" ? PROJECT_RIM_PX : kind === "domain" ? P.domainRimPx : P.capRimPx;
  for (const list of group(discBuckets, marks, (d) => ((inkCode(d.hue) * GROUP_LEVELS + groupLevel(d.ink)) * 2 + (d.focus ? 1 : 0)) * 2 + (d.state === "unknown" ? 1 : 0))) {
    const first = list[0]!;
    ctx.beginPath();
    for (const d of list) {
      ctx.moveTo(d.x + d.r, d.y);
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    }
    ctx.fillStyle = tokens.inks.discFill;
    ctx.globalAlpha = Math.min(1, first.ink * 4);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = first.focus ? FOCUS_RIM_PX : rimPx;
    ctx.strokeStyle = sunk(first.hue, ground, first.ink);
    ctx.setLineDash(first.state === "unknown" ? UNKNOWN_DASH : NO_DASH);
    ctx.stroke();
    ctx.setLineDash(NO_DASH);
    if (first.state === "unknown") continue;
    ctx.beginPath();
    for (const d of list) {
      const core = kind === "project" ? P.projectCorePx * growth : kind === "domain" ? P.domainCorePx * growth : Math.max(P.capCoreMinPx, d.r - P.capCoreInsetPx);
      ctx.moveTo(d.x + core, d.y);
      ctx.arc(d.x, d.y, core, 0, Math.PI * 2);
    }
    ctx.fillStyle = sunk(first.hue, ground, first.ink * (first.focus ? 1 : P.coreAlpha));
    ctx.fill();
  }
  for (const d of marks) {
    if (d.state !== "stale") continue;
    ctx.beginPath();
    ctx.arc(d.x + d.r * 0.75, d.y - d.r * 0.75, Math.max(PIP_MIN_PX, d.r * PIP_SHARE), 0, Math.PI * 2);
    ctx.fillStyle = sunk(warning, ground, d.ink);
    ctx.fill();
  }
}

function paintPlan(ctx: CanvasRenderingContext2D, plan: FramePlan, tokens: FlatGraphTokens, ground: string, warning: string, growth: number): void {
  const P = tokens.paint;
  ctx.save();
  for (const l of plan.lights) {
    const sprite = lightSprite(l.ink);
    if (!sprite) continue;
    ctx.globalAlpha = l.alpha;
    ctx.drawImage(sprite, l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = "round";
  for (const list of group(segmentBuckets, plan.segments, (s) => (inkCode(s.ink) * GROUP_LEVELS + widthCode(s.width)) * GROUP_LEVELS + groupLevel(s.alpha * 8), (s) => s.alpha > 0.004)) {
    const first = list[0]!;
    ctx.globalAlpha = first.alpha;
    ctx.strokeStyle = first.ink;
    ctx.lineWidth = first.width;
    ctx.beginPath();
    for (const s of list) {
      ctx.moveTo(s.x0, s.y0);
      ctx.lineTo(s.x1, s.y1);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = tokens.inks.arc;
  ctx.lineJoin = "round";
  strokeArcs(ctx, plan.arcs, tokens.inks.arc, P.arcHeadPx);
  strokeArcs(ctx, plan.focusArcs, tokens.inks.arc, P.arcHeadPx);
  for (const list of group(dotBuckets, plan.dots, (d) => (inkCode(d.hue) * GROUP_LEVELS + groupLevel(d.ink)) * GROUP_LEVELS + groupLevel(d.alpha))) {
    const first = list[0]!;
    ctx.globalAlpha = first.alpha;
    ctx.fillStyle = sunk(first.hue, ground, first.ink);
    ctx.beginPath();
    for (const d of list) {
      ctx.moveTo(d.x + d.r, d.y);
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  for (const glow of plan.glows) {
    if (glow.alpha <= 0.004) continue;
    const sprite = glowSprite(glow.ink);
    if (!sprite) continue;
    ctx.globalAlpha = glow.alpha;
    ctx.drawImage(sprite, glow.x - glow.r, glow.y - glow.r, glow.r * 2, glow.r * 2);
  }
  ctx.globalAlpha = 1;
  paintDiscs(ctx, plan.discs, tokens, ground, warning, "capability", growth);
  paintDiscs(ctx, plan.domains, tokens, ground, warning, "domain", growth);
  if (plan.project) paintDiscs(ctx, [plan.project], tokens, ground, warning, "project", growth);
  if (plan.agentRing) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = plan.agentRing.ink;
    ctx.lineWidth = AGENT_RING_WIDTH_PX;
    ctx.beginPath();
    ctx.arc(plan.agentRing.x, plan.agentRing.y, plan.agentRing.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (plan.selection && plan.selection.alpha > DRAWN_INK) {
    ctx.globalAlpha = plan.selection.alpha;
    ctx.strokeStyle = tokens.inks.project;
    ctx.lineWidth = SELECTION_RING_PX;
    ctx.beginPath();
    ctx.arc(plan.selection.x, plan.selection.y, plan.selection.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  for (const n of plan.names) {
    ctx.font = n.name.font;
    ctx.textAlign = n.name.align;
    ctx.globalAlpha = n.ink;
    ctx.lineWidth = n.halo;
    ctx.strokeStyle = tokens.inks.halo;
    ctx.strokeText(n.name.text, n.x, n.y);
    ctx.globalAlpha = 1;
    ctx.fillStyle = sunk(n.color, ground, n.ink);
    ctx.fillText(n.name.text, n.x, n.y);
  }
  ctx.restore();
}

const pool = emptyDialFrameMarks();

/** Records the painted inks, sinking included, so the probe sees what the eye sees. */
function fillProbeMarks(marks: DialFrameMarks, plan: FramePlan, tokens: FlatGraphTokens, ground: string): void {
  const reusedDiscs = marks.discs.splice(0);
  for (const key of ["inks", "strips", "squares", "ticks", "rails", "glyphs", "texts", "numerals", "leaders", "plates", "extraTexts"] as const) marks[key].length = 0;
  const inkIndex = (ink: string) => {
    const at = marks.inks.indexOf(ink);
    if (at >= 0) return at;
    marks.inks.push(ink);
    return marks.inks.length - 1;
  };
  const fill = inkIndex(tokens.inks.discFill);
  for (const list of [plan.discs, plan.domains]) {
    for (const d of list) {
      const mark = reusedDiscs[marks.discs.length] ?? { id: "", x: 0, y: 0, r: 0, fill, rim: 0, dashed: false, lineWidth: 0 };
      mark.id = d.id; mark.x = d.x; mark.y = d.y; mark.r = d.r; mark.fill = fill;
      mark.rim = inkIndex(sunk(d.hue, ground, d.ink)); mark.dashed = d.state === "unknown"; mark.lineWidth = tokens.paint.capRimPx;
      marks.discs.push(mark);
    }
  }
  const arcInk = inkIndex(tokens.inks.arc);
  plan.arcs.forEach((arc, i) => {
    const strip: StripMark = {
      flowKey: `arc:${i}`, role: "chord", ink: arcInk, ax: arc.path.a.x, ay: arc.path.a.y, cx: arc.path.c.x, cy: arc.path.c.y, bx: arc.path.b.x, by: arc.path.b.y,
      w0: arc.width, w1: arc.width, gapT0: 0, gapT1: 0, dashed: false, headStart: false, headEnd: true, headSize: tokens.paint.arcHeadPx,
    };
    marks.strips.push(strip);
  });
  const pad = tokens.paint.namePadPx;
  for (const n of plan.names) {
    const ox = n.x - n.name.dx;
    const oy = n.y - n.name.dy;
    const text: TextMark = {
      id: n.name.id, role: n.name.role, text: n.name.text, x: n.x, y: n.y, align: n.name.align, font: n.name.font, ink: inkIndex(sunk(n.color, ground, n.ink)),
      box: { minX: ox + n.name.box.minX + pad, maxX: ox + n.name.box.maxX - pad, minY: oy + n.name.box.minY + pad, maxY: oy + n.name.box.maxY - pad }, parts: null,
    };
    marks.texts.push(text);
  }
}

/** Paints the deferred lens-context frame once the classic edges are down. */
export function paintDeferredFlatGraph(ctx: CanvasRenderingContext2D, zoomRatio: number): void {
  if (!deferred) return;
  paintPlan(ctx, deferred.plan, deferred.tokens, deferred.ground, deferred.warning, zoomGrowth(zoomRatio, deferred.tokens.paint));
  deferred = null;
}

/** Flat as a hue-lit graph: same input and result contract as the dial frame it replaces. */
export function paintFlatGraphFrame(input: DialFrameInput, tokens: FlatGraphTokens): DialFrameResult {
  const { model } = input.dial;
  const contextMode = input.contextAlphas !== undefined;
  const focusId = contextMode ? null : input.focusedNodeId ?? input.hoveredNodeId;
  const attention = cachedGraphAttention(model, focusId, !contextMode && input.focusedNodeId !== null);
  const transition = graphInkMix(input.worldKey, attention, input.now, input.reducedMotion);
  const mix = transition.mix;
  const built = buildPlan(input, tokens, transition);
  const ground = input.mapTokens.canvasBgNear;
  const warning = tokens.inks.warning;
  if (input.deferPaint) deferred = { plan: built.plan, tokens, ground, warning };
  else paintPlan(input.ctx, built.plan, tokens, ground, warning, zoomGrowth(input.zoomRatio, tokens.paint));
  fillProbeMarks(pool, built.plan, tokens, ground);
  const directed = restArcs(model, Number.POSITIVE_INFINITY).length;
  const result: DialFrameResult = {
    branchScene: undefined,
    branchMembersAnimating: mix < 1,
    contextOnly: contextMode,
    drawnCount: built.plan.discs.length + built.plan.domains.length + built.plan.dots.length + (built.plan.project ? 1 : 0),
    tier: built.tier, alphas: built.alphas, picks: built.picks, rows: built.rows, labelBoxes: built.labelBoxes,
    light: { attentionKey: attention.key, focused: attention.selected, inkMix: mix, chords: [] },
    inkMix: mix, chordPresence: built.presence, marks: pool,
  };
  recordDialFrame(input, result, {
    links: model.flows.map((f) => ({ key: f.key, u: f.a, v: f.b, uv: f.ab, vu: f.ba, total: f.total, relatesOnly: f.relatesOnly, attended: false })),
    drawn: model.flows.filter((f) => built.drawnFlows.has(f.a < f.b ? `${f.a}\u0000${f.b}` : `${f.b}\u0000${f.a}`)).map((f) => f.key),
    entered: null, resolved: true,
    budget: { shown: built.plan.arcs.length, total: directed, perEndCap: 0 },
    stubs: [],
  });
  return result;
}

