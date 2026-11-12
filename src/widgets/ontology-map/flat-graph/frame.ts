import { dialEvidenceView } from "../dial/dial-model";
import { createMeasureText } from "../dial/fit";
import { emptyDialFrameMarks, type DialFrameMarks } from "../dial/frame/marks";
import { dialChordPresence, recordDialFrame } from "../dial/frame/frame";
import { dialPlacementLine, dialPlacementOf } from "../dial/placement";
import type { Box, DialFrameInput, DialFrameResult, DialPick, DialRowPick, Point, StripMark, TextMark } from "../dial/types";
import { labelFontFamily } from "../render/labels";
import { FONT_WEIGHT } from "@/shared/ui/tokens/font-weight";
import { cachedGraphAttention, graphInkMix, inkUnder, type GraphAttention } from "./attention";
import {
  arcPath, glowSprite, graphDiscRadiusPx, inkLevel, LIGHT_STOPS, restArcs, rgbaOf, smoothstep, sunk, zoomGrowth, type ArcPath,
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
const PIP_SHARE = 0.3;
const PIP_MIN_PX = 2;
const UNKNOWN_DASH = [2, 2];
const ELEMENT_PICK_PX = 4;

const measureText = createMeasureText();
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Disc { id: string; x: number; y: number; r: number; hue: string; ink: number; focus: boolean; state: "current" | "stale" | "unknown" }
interface Dot { x: number; y: number; r: number; hue: string; ink: number; alpha: number }
interface Segment { x0: number; y0: number; x1: number; y1: number; ink: string; width: number; alpha: number }
interface Arc { path: ArcPath; width: number; alpha: number; head: boolean; glow: number }
interface Glow { x: number; y: number; r: number; ink: string; alpha: number }
interface Light { x: number; y: number; r: number; ink: string; alpha: number }
interface Name { name: PlacedName; x: number; y: number; ink: number; color: string; halo: number }

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

function buildPlan(input: DialFrameInput, tokens: FlatGraphTokens, attention: GraphAttention, previous: GraphAttention, mix: number) {
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
  const focusness = lerp(previous.lit ? 1 : 0, attention.lit ? 1 : 0, mix);
  const evidence = input.evidence ? dialEvidenceView(model, input.evidence) : null;
  const measured = evidence?.measured === true;
  const elementSpacingPx = scene.medianElementPitch * input.scale;
  const dotAlpha = smoothstep(P.dotSpacingFromPx, P.dotSpacingFullPx, elementSpacingPx);

  const inkOf = (id: string): number => {
    const focus = lerp(inkUnder(previous, id, P.sinkInk), inkUnder(attention, id, P.sinkInk), mix);
    const brightened = attention.selected && id === input.hoveredNodeId ? 1 : focus;
    const lens = contextMode ? input.contextInkAlphas?.get(id) ?? 1 : 1;
    return brightened * lens * input.appearOf(id);
  };
  const screenOf = (id: string): Point => input.nodeScreen(id) ?? (() => {
    const home = layout.positions.get(id) ?? layout.itemAt.get(id) ?? { x: 0, y: 0 };
    return input.toScreen(home.x, home.y);
  })();
  const orphans = new Set(layout.orphanIds);
  const capElements = (id: string) => model.capabilityById.get(id)?.elementIds.length ?? 0;
  const radiusAt = (id: string, g: number): number => {
    if (id === model.projectId) return graphDiscRadiusPx("project", 0, P, g);
    if (model.domainById.has(id)) return graphDiscRadiusPx("domain", 0, P, g);
    if (model.capabilityById.has(id) || orphans.has(id)) return graphDiscRadiusPx("capability", capElements(id), P, g);
    return graphDiscRadiusPx("element", 0, P, g);
  };

  const plan: FramePlan = { lights: [], segments: [], arcs: [], focusArcs: [], dots: [], glows: [], discs: [], domains: [], project: null, selection: null, names: [] };
  const alphas = new Map<string, number>();
  const picks: DialPick[] = [];
  const screen = new Map<string, Point>();
  const required = input.requiredBranchIds ?? new Set<string>();

  for (const c of layout.clusters) {
    const ink = inkOf(c.domainId);
    const at = input.toScreen(c.centre.x, c.centre.y);
    const r = c.footprint * input.scale * P.lightReach;
    const alpha = P.lightAlpha * Math.min(1, ink * LIGHT_SINK_GAIN) * (contextMode ? P.sinkInk : 1);
    if (alpha > 0.002 && at.x + r > 0 && at.y + r > 0 && at.x - r < W && at.y - r < H) plan.lights.push({ x: at.x, y: at.y, r, ink: hueOf(layout, tokens, c.domainId), alpha });
  }

  const project = model.projectId !== null && layout.positions.has(model.projectId) ? model.projectId : null;
  const projectAt = project ? screenOf(project) : null;
  if (project && projectAt) {
    screen.set(project, projectAt);
    alphas.set(project, 1);
    const ink = inkOf(project);
    plan.project = { id: project, ...projectAt, r: radiusAt(project, growth), hue: inks.project, ink, focus: false, state: "current" };
  }

  for (const c of layout.clusters) {
    const hue = hueOf(layout, tokens, c.domainId);
    const at = screenOf(c.domainId);
    screen.set(c.domainId, at);
    alphas.set(c.domainId, 1);
    const ink = inkOf(c.domainId);
    const r = radiusAt(c.domainId, growth);
    if (projectAt && !contextMode) plan.segments.push({ x0: projectAt.x, y0: projectAt.y, x1: at.x, y1: at.y, ink: inks.project, width: P.linkCapWidthPx, alpha: P.linkDomainAlpha * Math.min(ink, inkOf(project!)) });
    if (onScreen(at, W, H, CULL_PX + r)) plan.domains.push({ id: c.domainId, ...at, r, hue, ink, focus: c.domainId === attention.focusId, state: "current" });
    for (const it of c.items) {
      const itemAt = it.direct ? at : screenOf(it.id);
      const itemInk = it.direct ? ink : inkOf(it.id);
      if (!it.direct) {
        screen.set(it.id, itemAt);
        alphas.set(it.id, 1);
        if (!contextMode) plan.segments.push({ x0: at.x, y0: at.y, x1: itemAt.x, y1: itemAt.y, ink: hue, width: P.linkCapWidthPx, alpha: P.linkCapAlpha * Math.min(ink, itemInk) });
        const rr = radiusAt(it.id, growth);
        if (onScreen(itemAt, W, H, CULL_PX + rr)) {
          const state = measured ? evidence!.stateOf(it.id) : "current";
          plan.discs.push({ id: it.id, ...itemAt, r: rr, hue, ink: itemInk, focus: it.id === attention.focusId, state });
        }
      }
      for (const el of it.elementIds) {
        const lit = attention.lit?.has(el) === true;
        const shown = Math.max(dotAlpha, lit ? focusness : 0, required.has(el) ? 1 : 0);
        alphas.set(el, shown > DRAWN_INK ? 1 : 0);
        if (shown <= DRAWN_INK) continue;
        const elAt = screenOf(el);
        screen.set(el, elAt);
        const elInk = inkOf(el);
        if (!contextMode) plan.segments.push({ x0: itemAt.x, y0: itemAt.y, x1: elAt.x, y1: elAt.y, ink: hue, width: P.linkElementWidthPx, alpha: P.linkElementAlpha * Math.min(itemInk, elInk) * shown });
        if (onScreen(elAt, W, H, CULL_PX)) plan.dots.push({ ...elAt, r: radiusAt(el, growth) * (lit ? LIT_DOT_SHARE : 1), hue, ink: elInk, alpha: DOT_ALPHA * shown });
      }
    }
  }
  for (const id of layout.orphanIds) {
    const at = screenOf(id);
    screen.set(id, at);
    alphas.set(id, 1);
    const r = radiusAt(id, growth);
    if (onScreen(at, W, H, CULL_PX)) plan.discs.push({ id, ...at, r, hue: inks.name, ink: inkOf(id), focus: id === attention.focusId, state: "current" });
  }

  const presence = dialChordPresence(input.dialTokens, input.domainAppear);
  const restAlpha = (1 - focusness) * presence;
  const arcs = restArcs(model, P.restBudget);
  const drawnFlows = new Set<string>();
  if (!contextMode && restAlpha > DRAWN_INK) {
    for (const arc of arcs) {
      const a = screen.get(arc.from);
      const b = screen.get(arc.to);
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
        const a = screen.get(from);
        const b = screen.get(to);
        if (!a || !b) continue;
        const path = arcPath(a, b, FOCUS_BOW, radiusAt(from, growth), radiusAt(to, growth) + P.arcTrimPx / 2);
        if (path) plan.focusArcs.push({ path, width: FOCUS_LINK_WIDTH_PX, alpha: FOCUS_LINK_ALPHA * share, head: false, glow: FOCUS_LINK_GLOW_ALPHA * share });
      }
    };
    if (previous !== attention) links(previous, 1 - mix);
    links(attention, mix);
  }

  for (const d of [...plan.domains, ...plan.discs, ...(plan.project ? [plan.project] : [])]) {
    const isDomain = model.domainById.has(d.id);
    const isProject = d.id === project;
    const halo = isProject ? P.projectGlowPx * growth : isDomain ? P.domainGlowPx * growth : d.r + P.capGlowPx * growth;
    const focusGain = d.focus ? FOCUS_GLOW_ALPHA / P.glowAlpha : 1;
    plan.glows.push({ x: d.x, y: d.y, r: halo, ink: d.hue, alpha: Math.min(1, P.glowAlpha * focusGain) * d.ink * d.ink });
  }

  const selectedId = input.focusedNodeId;
  if (selectedId && !contextMode) {
    const at = screen.get(selectedId);
    if (at) {
      const pulse = input.selectionPulse?.nodeId === selectedId ? input.selectionPulse.scaleFactor : 1;
      plan.selection = { ...at, r: (radiusAt(selectedId, growth) + SELECTION_GAP_PX) * pulse, alpha: mix };
    }
  }

  const fontFamily = labelFontFamily();
  const admission = admittedNames({
    model, layout, tokens: P, labels: input.labels, measureText, fontFamily, scale: input.scale, growth: stepGrowth,
    elementLabel: input.elementLabel, staleByDomain: measured ? evidence!.staleByDomain : null,
    lit: contextMode ? null : attention.lit, focusId: attention.focusId, attentionKey: attention.key,
    discRadius: (id) => radiusAt(id, stepGrowth), elementSpacingPx,
  });
  const nameInk = (n: PlacedName): number => {
    if (n.role === "project" || n.role === "domain" || n.role === "units") return inkOf(n.id);
    const focus = lerp(nameInkUnder(previous, n.id), nameInkUnder(attention, n.id), mix);
    const brightened = attention.selected && n.id === input.hoveredNodeId ? 1 : focus;
    const lens = contextMode ? input.contextInkAlphas?.get(n.id) ?? 1 : 1;
    const elementShare = n.role === "element" && attention.lit?.has(n.id) !== true ? dotAlpha : 1;
    return brightened * lens * elementShare * input.appearOf(n.id);
  };
  for (const n of admission.names) {
    const at = screen.get(n.id);
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
        name: { id: project!, role: "units", text, font, dx: 0, dy, align: "center", box: { minX: -w / 2, maxX: w / 2, minY: dy - P.captionPx / 2, maxY: dy + P.captionPx / 2 } },
        x: plan.project!.x, y: plan.project!.y + dy, ink: inkOf(project!), color: inks.name, halo: P.nameHaloPx,
      });
    });
  }

  const dotPicks = plan.dots.length > 0;
  for (const c of layout.clusters) for (const it of c.items) for (const el of it.elementIds) {
    const at = screen.get(el);
    if (at && dotPicks && alphas.get(el) === 1) picks.push({ id: el, x: at.x, y: at.y, r: Math.max(ELEMENT_PICK_PX, radiusAt(el, growth)) });
  }
  for (const d of plan.discs) picks.push({ id: d.id, x: d.x, y: d.y, r: d.r });
  for (const d of plan.domains) picks.push({ id: d.id, x: d.x, y: d.y, r: d.r });
  if (plan.project) picks.push({ id: plan.project.id, x: plan.project.x, y: plan.project.y, r: plan.project.r });
  const rows: DialRowPick[] = [];
  const labelBoxes: DialFrameResult["labelBoxes"] = [];
  for (const n of plan.names) {
    const box: Box = { minX: n.x - n.name.dx + n.name.box.minX, maxX: n.x - n.name.dx + n.name.box.maxX, minY: n.y - n.name.dy + n.name.box.minY, maxY: n.y - n.name.dy + n.name.box.maxY };
    labelBoxes.push({ nodeId: n.name.id, text: n.name.text, ...box });
    if (n.ink > P.sinkInk && n.name.role !== "units") rows.push({ id: n.name.id, box });
  }
  for (const [id] of model.domainOf) if (!alphas.has(id)) alphas.set(id, 0);

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

function group<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}

function paintDiscs(ctx: CanvasRenderingContext2D, discs: readonly Disc[], tokens: FlatGraphTokens, ground: string, warning: string, kind: "domain" | "capability" | "project", growth: number): void {
  const P = tokens.paint;
  const rimPx = kind === "project" ? PROJECT_RIM_PX : kind === "domain" ? P.domainRimPx : P.capRimPx;
  for (const list of group(discs, (d) => `${d.hue}|${inkLevel(d.ink)}|${d.focus ? 1 : 0}|${d.state === "unknown" ? 1 : 0}`).values()) {
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
    ctx.setLineDash(first.state === "unknown" ? UNKNOWN_DASH : []);
    ctx.stroke();
    ctx.setLineDash([]);
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
  const stale = discs.filter((d) => d.state === "stale");
  for (const d of stale) {
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
    const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
    for (const [at, share] of LIGHT_STOPS) g.addColorStop(at, rgbaOf(l.ink, l.alpha * share));
    ctx.fillStyle = g;
    ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
  }
  ctx.lineCap = "round";
  for (const list of group(plan.segments.filter((s) => s.alpha > 0.004), (s) => `${s.ink}|${s.width}|${inkLevel(s.alpha * 8)}`).values()) {
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
  for (const list of group(plan.dots, (d) => `${d.hue}|${inkLevel(d.ink)}|${inkLevel(d.alpha)}`).values()) {
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

function fillProbeMarks(marks: DialFrameMarks, plan: FramePlan, tokens: FlatGraphTokens): void {
  for (const key of ["inks", "strips", "discs", "squares", "ticks", "rails", "glyphs", "texts", "numerals", "leaders", "plates", "extraTexts"] as const) marks[key].length = 0;
  const inkIndex = (ink: string) => {
    const at = marks.inks.indexOf(ink);
    if (at >= 0) return at;
    marks.inks.push(ink);
    return marks.inks.length - 1;
  };
  const fill = inkIndex(tokens.inks.discFill);
  for (const d of [...plan.discs, ...plan.domains]) marks.discs.push({ id: d.id, x: d.x, y: d.y, r: d.r, fill, rim: inkIndex(d.hue), dashed: d.state === "unknown", lineWidth: tokens.paint.capRimPx });
  const arcInk = inkIndex(tokens.inks.arc);
  plan.arcs.forEach((arc, i) => {
    const strip: StripMark = {
      flowKey: `arc:${i}`, role: "chord", ink: arcInk, ax: arc.path.a.x, ay: arc.path.a.y, cx: arc.path.c.x, cy: arc.path.c.y, bx: arc.path.b.x, by: arc.path.b.y,
      w0: arc.width, w1: arc.width, gapT0: 0, gapT1: 0, dashed: false, headStart: false, headEnd: true, headSize: tokens.paint.arcHeadPx,
    };
    marks.strips.push(strip);
  });
  for (const n of plan.names) {
    const ox = n.x - n.name.dx;
    const oy = n.y - n.name.dy;
    const text: TextMark = {
      id: n.name.id, role: n.name.role, text: n.name.text, x: n.x, y: n.y, align: n.name.align, font: n.name.font, ink: inkIndex(n.color),
      box: { minX: ox + n.name.box.minX, maxX: ox + n.name.box.maxX, minY: oy + n.name.box.minY, maxY: oy + n.name.box.maxY }, parts: null,
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
  const { mix, previous } = graphInkMix(input.worldKey, attention, input.now, input.reducedMotion);
  const built = buildPlan(input, tokens, attention, previous, mix);
  const ground = input.mapTokens.canvasBgNear;
  const warning = tokens.inks.warning;
  if (input.deferPaint) deferred = { plan: built.plan, tokens, ground, warning };
  else paintPlan(input.ctx, built.plan, tokens, ground, warning, zoomGrowth(input.zoomRatio, tokens.paint));
  fillProbeMarks(pool, built.plan, tokens);
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

