import { planStubs, stubCandidates, type Stub, type StubPlan } from "./flow/stubs";
export { fanAngles } from "./flow/stubs";
import { flowHeadSize } from "./flow/arrow-size";
export { flowHeadSize } from "./flow/arrow-size";
import { quadAt, quadLength, trimmedPiece, overlaps, inside } from "./flow/geometry";
import { createBranchRouter, type BranchRouter } from "./branches/routes";
import { NUMERAL_FONT_PX, numeralFont, scaledLabelFont, scaledLabelFontSize, tabularWidth } from "../render/labels";
import { placeFarNumerals, type FarCount } from "./far-counts";
import { crossfadeInk, inkIndex, mixOver, type DialInks } from "./ink";
import type { DialResolution } from "./frame/disclosure";
import { crossesBox } from "./label-marks";
import { aggregateLinks, domainOfEnd, restBudget, type CrossingGuard, type DialLink } from "./links";
import type { Box, DialAttention, DialChordLight, DialMarks, DialModel, DialScene, DialTokens, Point, StripMark } from "./types";

export interface FlowMarksInput {
  model: DialModel;
  scene: DialScene;
  tokens: DialTokens;
  inks: DialInks;
  attention: DialAttention;
  inkAttention: DialAttention;
  previous: DialAttention | null;
  inkMix: number;
  chordPresence: number;
  scale: number;
  viewportWidth: number;
  viewportHeight: number;
  freeRect: Box;
  nodeScreen(id: string): Point | null;
  toScreen(x: number, y: number): Point;
  endRadiusPx(id: string): number;
  endBox?(id: string): Box | null;
  appearOf(id: string): number;
  measureText(text: string, font: string): number;
  occupied: Box[];
  avoidTexts?: readonly Box[];
  chords: DialChordLight[];
  resolution: DialResolution;
  named?: ReadonlySet<string>;
  nameBoxes?: ReadonlyMap<string, Box>;
  connectionCount?(count: number): string;
}

export interface FlowMarksResult {
  links: DialLink[];
  drawn: string[];
  entered: string | null;
  resolved: boolean;
  budget: { shown: number; total: number; perEndCap: number };
  stubs: { flowKey: string; text: string; box: Box }[];
}

type FlowMarks = Pick<DialMarks, "inks" | "strips" | "numerals" | "texts">;

const REST_SLOTS = [0.5, 0.42, 0.58, 0.34, 0.66, 0.27, 0.73];
const PRESENCE_FLOOR = 0.02;
const OFFSCREEN_PX = 40;
const FREE_SLACK_PX = 6;
const HUB_CLEAR_PX = 66;
const CHORD_SAMPLES = 12;

export function restFlowWidth(tokens: DialTokens, count: number): number {
  return Math.min(tokens.flowRestMax, tokens.flowRestBase + tokens.flowRestGain * Math.log2(1 + count));
}

export function focusFlowWidth(tokens: DialTokens, count: number): number {
  return Math.min(tokens.flowFocusMax, tokens.flowFocusBase + tokens.flowFocusGain * Math.log2(1 + count));
}

function logShare(count: number, maxTotal: number): number {
  return Math.log2(1 + count) / Math.log2(1 + Math.max(count, maxTotal, 1));
}

export function rampedRestWidth(tokens: DialTokens, count: number, maxTotal: number): number {
  return Math.min(restFlowWidth(tokens, count), tokens.flowRestBase + (tokens.flowRestMax - tokens.flowRestBase) * logShare(count, maxTotal));
}

export function rampedFocusWidth(tokens: DialTokens, count: number, maxTotal: number): number {
  return Math.min(focusFlowWidth(tokens, count), tokens.flowFocusBase + (tokens.flowFocusMax - tokens.flowFocusBase) * logShare(count, maxTotal));
}
function routeControl(a: Point, b: Point, hub: Point, pivot: Point | null, sameRing: boolean): Point {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  const anchor = pivot ?? hub;
  if ((mid.x - anchor.x) * nx + (mid.y - anchor.y) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  if (!pivot && sameRing) {
    nx = -nx;
    ny = -ny;
  }
  if (pivot) return { x: mid.x + nx * 0.22 * len, y: mid.y + ny * 0.22 * len };
  const t = Math.max(0, Math.min(1, ((hub.x - a.x) * dx + (hub.y - a.y) * dy) / (len * len)));
  const clearance = Math.hypot(a.x + dx * t - hub.x, a.y + dy * t - hub.y);
  let bow = (sameRing ? 0.16 : 0.08) * len;
  if (clearance < HUB_CLEAR_PX + bow) {
    if ((mid.x - hub.x) * nx + (mid.y - hub.y) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    bow = Math.max(0.08 * len, (HUB_CLEAR_PX - clearance) * 2.1);
  }
  return { x: mid.x + nx * bow, y: mid.y + ny * bow };
}

interface Stroke {
  piece?: readonly [Point, Point, Point];
  key: string;
  role: StripMark["role"];
  p0: Point;
  c: Point;
  p1: Point;
  w0: number;
  w1: number;
  ink: string;
  headStart: boolean;
  headEnd: boolean;
  trimStart: number;
  trimEnd: number;
  dashed: boolean;
  numeral: string | null;
  numeralInk: string;
  slots: readonly number[];
}


function emit(input: FlowMarksInput, out: FlowMarks, s: Stroke): { a: Point; c: Point; b: Point } | null {
  const piece = s.piece ?? trimmedPiece(s.p0, s.c, s.p1, s.trimStart, s.trimEnd);
  if (!piece) return null;
  const [a, c, b] = piece;
  const trimmed = quadLength(a, c, b);
  let gapT0 = 0;
  let gapT1 = 0;
  if (s.numeral !== null) {
    const font = numeralFont();
    const textW = tabularWidth(s.numeral, font, input.measureText);
    const textH = NUMERAL_FONT_PX;
    const boxAt = (x: number, y: number) => ({ minX: x - textW / 2 - 3, maxX: x + textW / 2 + 3, minY: y - textH / 2 - 2, maxY: y + textH / 2 + 2 });
    for (const t of s.slots) {
      const q = quadAt(a, c, b, t);
      const box = boxAt(q.x, q.y);
      if (!inside(box, input.freeRect) || input.occupied.some((o) => overlaps(o, box))) continue;
      const half = (textW / 2 + input.tokens.numeralGapPx) / Math.max(1, trimmed);
      gapT0 = Math.max(0, t - half);
      gapT1 = Math.min(1, t + half);
      input.occupied.push(box);
      out.numerals.push({ flowKey: s.key, text: s.numeral, x: q.x, y: q.y + 0.5, ink: inkIndex(out, s.numeralInk), halo: false, font, box });
      break;
    }
  }
  out.strips.push({
    flowKey: s.key, role: s.role, ink: inkIndex(out, s.ink),
    ax: a.x, ay: a.y, cx: c.x, cy: c.y, bx: b.x, by: b.y, w0: s.w0, w1: s.w1, gapT0, gapT1,
    dashed: s.dashed, headStart: s.headStart, headEnd: s.headEnd, headSize: s.dashed ? 0 : flowHeadSize(input.tokens, s.w0, s.w1, input.scene.branches),
  });
  return { a, c, b };
}

function mineOf(model: DialModel, attn: DialAttention): (id: string) => boolean {
  return (id) => (attn.capabilityId ? id === attn.capabilityId : domainOfEnd(model, id) === attn.domainId);
}

function attendedUnder(model: DialModel, attn: DialAttention | null, l: DialLink): boolean {
  if (!attn?.domainId) return false;
  if (l.relatesOnly) return l.u === attn.domainId || l.v === attn.domainId;
  const mine = mineOf(model, attn);
  return mine(l.u) !== mine(l.v);
}

function strokeInk(inks: DialInks, model: DialModel, attn: DialAttention | null, l: DialLink, from: string, numeral: boolean): string {
  if (!attn?.domainId) return l.relatesOnly ? inks.relates : numeral ? inks.numeral : inks.flow;
  if (!attendedUnder(model, attn, l)) return inks.flowReceded;
  if (l.relatesOnly) return inks.usedBy;
  return mineOf(model, attn)(from) ? inks.needs : inks.usedBy;
}

interface End {
  p: Point;
  r: number;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function segmentHitsBox(x0: number, y0: number, x1: number, y1: number, b: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, x0 - b.minX) && clip(dx, b.maxX - x0) && clip(-dy, y0 - b.minY) && clip(dy, b.maxY - y0);
}

function mergeAttendedStubs(model: DialModel, attn: DialAttention, stubs: readonly Stub[], chip: End | null): Stub[] {
  if (!attn.domainId || !chip) return [...stubs];
  const mine = mineOf(model, attn);
  const byFar = new Map<string, Stub[]>();
  const out: Stub[] = [];
  for (const st of stubs) {
    if (!st.link.attended || !mine(st.nearId)) {
      out.push(st);
      continue;
    }
    const list = byFar.get(st.farId);
    if (list) list.push(st);
    else byFar.set(st.farId, [st]);
  }
  for (const [farId, list] of byFar) {
    if (list.length === 1) {
      out.push(list[0]!);
      continue;
    }
    const counts = { needs: 0, used: 0 };
    for (const st of list) {
      const nearIsU = st.nearId === st.link.u;
      counts.needs += nearIsU ? st.link.uv : st.link.vu;
      counts.used += nearIsU ? st.link.vu : st.link.uv;
    }
    const lead = list.reduce((a, b) => (b.link.total > a.link.total || (b.link.total === a.link.total && b.link.key < a.link.key) ? b : a));
    const farP = lead.farP;
    out.push({
      link: lead.link, near: chip, nearId: attn.domainId, farId, farP, presence: Math.max(...list.map((st) => st.presence)), counts,
      angle: Math.atan2(farP.y - chip.p.y, farP.x - chip.p.x),
    });
  }
  return out;
}

const STUB_LINE_PAD_PX = 3;
const STUB_END_CLEAR_PX = 16;

function segmentsMeet(a: Point, b: Point, c: Point, d: Point): Point | null {
  const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
  const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
  return t > 0 && t < 1 && u > 0 && u < 1 ? { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) } : null;
}

function stubCrossesLine(plan: StubPlan, line: readonly Point[]): boolean {
  for (let k = 0; k < line.length - 1; k += 1) {
    const at = segmentsMeet(plan.start, plan.end, line[k]!, line[k + 1]!);
    if (at && Math.hypot(at.x - plan.start.x, at.y - plan.start.y) >= STUB_END_CLEAR_PX) return true;
  }
  return false;
}

function grown(box: Box, pad: number): Box {
  return { minX: box.minX - pad, maxX: box.maxX + pad, minY: box.minY - pad, maxY: box.maxY + pad };
}

function paintStubs(input: FlowMarksInput, out: FlowMarks, stubs: Stub[], result: FlowMarksResult, chordLines: readonly (readonly Point[])[], accepted: StubPlan[]): void {
  const { tokens, inks, model } = input;
  const nameFont = scaledLabelFont("capability", tokens.labelScale);
  const nameFontPx = scaledLabelFontSize("capability", tokens.labelScale);
  const hits = (plan: StubPlan, box: Box) => segmentHitsBox(plan.start.x, plan.start.y, plan.end.x, plan.end.y, grown(box, STUB_LINE_PAD_PX));
  const clear = (plan: StubPlan) => {
    const { st, box } = plan;
    return inside(box, input.freeRect) && !input.occupied.some((o) => overlaps(o, box))
      && !crossesBox(chordLines, grown(box, STUB_LINE_PAD_PX))
      && (st.link.attended || (!chordLines.some((line) => stubCrossesLine(plan, line)) && !accepted.some((other) => stubCrossesLine(plan, [other.start, other.end]))))
      && !accepted.some((other) => hits(other, box) || hits(plan, other.box))
      && !input.avoidTexts?.some((text) => hits(plan, text));
  };
  for (const original of planStubs(input, stubs, nameFont, nameFontPx)) {
    let plan: StubPlan | undefined;
    for (const candidate of stubCandidates(input, original)) if (clear(candidate)) { plan = candidate; break; }
    if (!plan) continue;
    const { st, start, end, cos, sin, needs, used, box } = plan;
    accepted.push(plan);
    input.occupied.push(box);
    const needsInk = mixOver(strokeInk(inks, model, input.inkAttention, st.link, st.nearId, false), inks.bg, st.presence);
    const usedInk = mixOver(strokeInk(inks, model, input.inkAttention, st.link, st.farId, false), inks.bg, st.presence);
    const nameInk = mixOver(st.link.attended ? inks.domainLabelAttended : inks.domainLabel, inks.bg, st.presence);
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const off = needs > 0 && used > 0 ? tokens.flowSplitPx * 0.5 : 0;
    const shift = (p: Point, sign: number) => ({ x: p.x - sign * sin * off, y: p.y + sign * cos * off });
    const lit = st.link.attended && input.attention.domainId !== null;
    const stroke = (p0: Point, c: Point, p1: Point, count: number, ink: string, from: string, to: string) => {
      const w0 = focusFlowWidth(tokens, count);
      const drawn = emit(input, out, {
        key: st.link.key, role: "stub", p0, c, p1, w0, w1: w0 * tokens.flowTaper, ink, headStart: false, headEnd: true,
        trimStart: 0, trimEnd: 0, dashed: false, numeral: null, numeralInk: ink, slots: [],
      });
      if (drawn && lit) input.chords.push({ key: `${from}\0${to}`, sourceDomain: from, targetDomain: to, a: drawn.a, c: drawn.c, b: drawn.b, widthPx: w0, chipRadiusPx: 0 });
    };
    if (needs > 0) stroke(shift(start, 1), shift(mid, 1), shift(end, 1), needs, needsInk, st.nearId, st.farId);
    if (used > 0) stroke(shift(end, -1), shift(mid, -1), shift(start, -1), used, usedInk, st.farId, st.nearId);
    const name = model.capabilityById.get(st.farId)?.label ?? model.domainById.get(st.farId)?.label ?? st.farId;
    const parts: { text: string; ink: number }[] = [{ text: name, ink: inkIndex(out, nameInk) }];
    if (needs > 0) parts.push({ text: ` →${needs}`, ink: inkIndex(out, needsInk) });
    if (used > 0) parts.push({ text: ` ←${used}`, ink: inkIndex(out, usedInk) });
    out.texts.push({ id: st.farId, role: "stub", text: plan.text, x: plan.startX, y: plan.ty, align: "left", font: nameFont, ink: inkIndex(out, nameInk), box, parts });
    result.stubs.push({ flowKey: st.link.key, text: plan.text, box });
  }
}

export function buildFlowMarks(input: FlowMarksInput, out: FlowMarks): FlowMarksResult {
  const { tokens, model, scene, attention: attn, freeRect: free } = input;
  const result: FlowMarksResult = { links: [], drawn: [], entered: null, resolved: false, budget: { shown: 0, total: 0, perEndCap: Infinity }, stubs: [] };
  const W = input.viewportWidth;
  const H = input.viewportHeight;
  const hub = (model.projectId ? input.nodeScreen(model.projectId) : null) ?? input.toScreen(0, 0);

  const chips = new Map<string, Point>();
  let onScreen = 0;
  for (const c of scene.clusters) {
    const p = input.nodeScreen(c.domainId) ?? input.toScreen(c.chip.x, c.chip.y);
    chips.set(c.domainId, p);
    const fr = c.footprint * input.scale;
    if (p.x + fr >= 0 && p.x - fr <= W && p.y + fr >= 0 && p.y - fr <= H) onScreen += 1;
  }
  const resolution = input.resolution;
  result.entered = resolution.entered;
  result.resolved = resolution.resolved;
  const resolved = new Set(resolution.resolved && resolution.entered ? [resolution.entered] : []);
  const links = aggregateLinks(model, resolved, attn, input.named ?? null);
  result.links = links;

  const endOf = (id: string): End | null => {
    const r = input.endRadiusPx(id);
    const chip = chips.get(id);
    if (chip) return { p: chip, r };
    const item = scene.itemById.get(id);
    const domain = model.capabilityById.get(id)?.domainId;
    if (!item || !domain) return null;
    const own = input.nodeScreen(id) ?? input.toScreen(item.x, item.y);
    const from = chips.get(domain);
    const slide = resolved.has(domain) && id !== attn.capabilityId ? resolution.endpointSlide : 1;
    if (!from || slide >= 1) return { p: own, r };
    return { p: { x: from.x + (own.x - from.x) * slide, y: from.y + (own.y - from.y) * slide }, r };
  };
  const arrival = tokens.chordArrival;
  const presenceOf = (l: DialLink) => {
    const later = Math.min(input.appearOf(domainOfEnd(model, l.u)), input.appearOf(domainOfEnd(model, l.v)));
    return Math.max(0, Math.min(1, input.chordPresence)) * smoothstep(arrival, 1, later);
  };

  const drawable: { l: DialLink; a: End; b: End }[] = [];
  for (const l of links) {
    const a = endOf(l.u);
    const b = endOf(l.v);
    if (!a || !b) continue;
    if (Math.max(a.p.x, b.p.x) < -OFFSCREEN_PX || Math.min(a.p.x, b.p.x) > W + OFFSCREEN_PX) continue;
    if (Math.max(a.p.y, b.p.y) < -OFFSCREEN_PX || Math.min(a.p.y, b.p.y) > H + OFFSCREEN_PX) continue;
    drawable.push({ l, a, b });
  }
  const ends = new Set<string>();
  for (const { l } of drawable) {
    ends.add(l.u);
    ends.add(l.v);
  }
  const within = (p: Point) => p.x >= free.minX - FREE_SLACK_PX && p.x <= free.maxX + FREE_SLACK_PX && p.y >= free.minY - FREE_SLACK_PX && p.y <= free.maxY + FREE_SLACK_PX;
  const branchRoutes = createBranchRouter(input, (l, a, b) => controlOf(input, l, a, b, hub));
  const restLine = ({ l, a, b }: { l: DialLink; a: End; b: End }) => {
    if (!within(a.p) || !within(b.p)) return null;
    if (scene.branches) return branchRoutes(l, a, b).map((curve) => curve.line);
    const s = restStroke(tokens, l, a, b);
    const line = sampledPiece(trimmedPiece(s.p0, controlOf(input, l, a, b, hub), s.p1, s.trimStart, s.trimEnd));
    return line ? [line] : [];
  };
  const drawableByKey = new Map(drawable.map((d) => [d.l.key, d] as const));
  const guard = restCrossingGuard(
    (l) => {
      const d = drawableByKey.get(l.key);
      return d ? restLine(d) : null;
    },
    drawable.filter((d) => d.l.relatesOnly).flatMap((d) => restLine(d) ?? []),
    W,
    H,
  );
  const counted = drawable.filter((d) => !d.l.relatesOnly).map((d) => d.l);
  const budget = restBudget(counted, ends.size, tokens, scene.branches ? {
    crosses: (link) => branchRoutes(link, drawableByKey.get(link.key)!.a, drawableByKey.get(link.key)!.b).some((curve) => input.avoidTexts?.some((box) => crossesBox([curve.line], box))) || guard.crosses(link),
    add: (link) => guard.add(link),
  } : guard, !!scene.branches);
  result.budget = { shown: 0, total: budget.total, perEndCap: budget.perEndCap };
  const maxTotal = Math.max(1, ...counted.filter((l) => budget.keep.has(l.key) || l.attended).map((l) => l.total));
  const numberLimit = Math.max(tokens.restNumbersMin, Math.min(tokens.restNumbersMax, Math.round(tokens.restNumbersShare * onScreen)));
  const numberKeep = new Set(counted.filter((l) => budget.keep.has(l.key) && l.total >= tokens.restNumberMinCount).slice(0, numberLimit).map((l) => l.key));

  const stubs: Stub[] = [];
  const reverseRecovery: Stub[] = [];
  const toDraw: { l: DialLink; a: End; b: End; presence: number }[] = [];
  for (const { l, a, b } of drawable) {
    if (!l.attended && !l.relatesOnly && !budget.keep.has(l.key)) continue;
    if (attn.domainId && !l.attended && l.relatesOnly) continue;
    const presence = presenceOf(l);
    if (presence <= PRESENCE_FLOOR) continue;
    if (scene.branches && within(a.p) && within(b.p) && branchRoutes(l, a, b).length === 0) {
      if (l.attended) {
        const nearIsU = mineOf(model, attn)(l.u);
        const near = nearIsU ? a : b;
        const far = nearIsU ? b : a;
        stubs.push({ link: l, near, nearId: nearIsU ? l.u : l.v, farId: nearIsU ? l.v : l.u, farP: far.p,
          angle: Math.atan2(far.p.y - near.p.y, far.p.x - near.p.x), presence });
        reverseRecovery.push({ link: l, near: far, nearId: nearIsU ? l.v : l.u, farId: nearIsU ? l.u : l.v, farP: near.p,
          angle: Math.atan2(near.p.y - far.p.y, near.p.x - far.p.x), presence });
      }
      continue;
    }
    const ina = within(a.p);
    const inb = within(b.p);
    if (!ina && !inb) continue;
    if (ina !== inb) {
      if (l.relatesOnly) continue;
      const near = ina ? a : b;
      const far = ina ? b : a;
      stubs.push({ link: l, near, nearId: ina ? l.u : l.v, farId: ina ? l.v : l.u, farP: far.p, angle: Math.atan2(far.p.y - near.p.y, far.p.x - near.p.x), presence });
      continue;
    }
    toDraw.push({ l, a, b, presence });
  }

  const chordLines = toDraw.flatMap(({ l, a, b }) => {
    if (scene.branches) return branchRoutes(l, a, b).map((curve) => curve.line);
    const c = controlOf(input, l, a, b, hub);
    return [Array.from({ length: CHORD_SAMPLES + 1 }, (_, k) => quadAt(a.p, c, b.p, k / CHORD_SAMPLES))];
  });
  toDraw.sort((x, y) => Number(x.l.attended) - Number(y.l.attended) || x.l.total - y.l.total || (x.l.key < y.l.key ? -1 : 1));
  if (!scene.branches) placeFarNumerals(input, out, farCounts(input, toDraw));
  const focusChip = attn.domainId ? endOf(attn.domainId) : null;
  const acceptedStubs: StubPlan[] = [];
  paintStubs(input, out, mergeAttendedStubs(model, attn, stubs, focusChip && within(focusChip.p) ? focusChip : null), result, chordLines, acceptedStubs);
  const recovered = new Set(result.stubs.map(stub => stub.flowKey));
  paintStubs(input, out, reverseRecovery.filter(stub => !recovered.has(stub.link.key)), result, chordLines, acceptedStubs);
  for (const { l, a, b, presence } of toDraw) {
    drawLink(input, out, l, a, b, presence, hub, maxTotal, numberKeep.has(l.key), branchRoutes);
    result.drawn.push(l.key);
  }
  for (const st of result.stubs) if (!result.drawn.includes(st.flowKey)) result.drawn.push(st.flowKey);
  const fan = (fanAttn: DialAttention | null, share: number) => {
    if (!fanAttn?.domainId || fanAttn.key === attn.key || share <= PRESENCE_FLOOR) return;
    const shown = new Set(result.drawn);
    for (const l of aggregateLinks(model, resolved, fanAttn)) {
      if (!l.attended || l.relatesOnly || shown.has(l.key)) continue;
      const a = endOf(l.u);
      const b = endOf(l.v);
      if (a && b && within(a.p) && within(b.p)) {
        if (scene.branches) drawBranchLink(input, out, l, a, b, share * presenceOf(l), branchRoutes);
        else drawFanLink(input, out, fanAttn, l, a, b, share * presenceOf(l), hub);
      }
    }
  };
  fan(input.inkAttention, input.inkMix);
  if (input.previous?.key !== input.inkAttention.key) fan(input.previous, 1 - input.inkMix);
  result.budget.shown = result.drawn.filter((k) => budget.keep.has(k)).length;
  return result;
}

function controlOf(input: FlowMarksInput, l: DialLink, a: End, b: End, hub: Point): Point {
  if (input.scene.branches) {
    const ca = input.scene.clusterByDomain.get(domainOfEnd(input.model, l.u));
    const cb = input.scene.clusterByDomain.get(domainOfEnd(input.model, l.v));
    if (ca && cb && ca.branchPair !== cb.branchPair) {
      const cx = ((ca.branchCorridorX ?? ca.chip.x) + (cb.branchCorridorX ?? cb.chip.x)) / 2;
      return {
        x: input.toScreen(cx, 0).x,
        y: Math.min(a.p.y, b.p.y) - Math.max(input.tokens.nameMaxPx, Math.abs(a.p.x - b.p.x) * 0.35 + Math.abs(a.p.y - b.p.y) * 0.25),
      };
    }
    if (ca && cb && ca.branchSide === cb.branchSide) {
      const side = ca.branchSide ?? 1;
      const inner = side > 0 ? Math.min(a.p.x, b.p.x) : Math.max(a.p.x, b.p.x);
      return { x: inner - side * input.tokens.nameMaxPx, y: (a.p.y + b.p.y) / 2 };
    }
    if (ca && cb && input.scene.clusters.length > 4 && ca.branchCorridorX !== undefined) {
      return { x: input.toScreen(ca.branchCorridorX, 0).x, y: (a.p.y + b.p.y) / 2 };
    }
    const dx = b.p.x - a.p.x;
    const dy = b.p.y - a.p.y;
    return { x: (a.p.x + b.p.x) / 2 - dy * 0.08, y: (a.p.y + b.p.y) / 2 + dx * 0.08 };
  }
  const { model, scene } = input;
  const du = domainOfEnd(model, l.u);
  const dv = domainOfEnd(model, l.v);
  const pivotCluster = du === dv ? scene.clusterByDomain.get(du) : undefined;
  const pivot = pivotCluster ? input.nodeScreen(du) ?? input.toScreen(pivotCluster.chip.x, pivotCluster.chip.y) : null;
  const sameRing = du !== dv && scene.clusterByDomain.get(du)?.step === scene.clusterByDomain.get(dv)?.step;
  return routeControl(a.p, b.p, hub, pivot, sameRing);
}

function linkInk(input: FlowMarksInput, l: DialLink, from: string, numeral: boolean, presence: number): string {
  const { model, inks } = input;
  if (input.scene.branches) {
    const read = (a: DialAttention | null) => a?.domainId
      ? attendedUnder(model, a, l) ? numeral ? inks.domainLabelAttended : inks.domainRim : inks.flowReceded
      : numeral ? inks.numeral : inks.flow;
    return mixOver(crossfadeInk(read(input.previous ?? input.inkAttention), read(input.inkAttention), input.inkMix), inks.bg, presence);
  }
  const now = strokeInk(inks, model, input.inkAttention, l, from, numeral);
  const was = input.previous ? strokeInk(inks, model, input.previous, l, from, numeral) : now;
  return mixOver(crossfadeInk(was, now, input.inkMix), inks.bg, presence);
}

function farCounts(input: FlowMarksInput, toDraw: readonly { l: DialLink; a: End; b: End; presence: number }[]): Map<string, FarCount> {
  const { model, attention: attn } = input;
  const far = new Map<string, FarCount>();
  if (!attn.domainId) return far;
  const mine = mineOf(model, attn);
  for (const { l, a, b, presence } of toDraw) {
    if (!l.attended || l.relatesOnly) continue;
    const mineIsU = mine(l.u);
    const meId = mineIsU ? l.u : l.v;
    const themId = mineIsU ? l.v : l.u;
    if (!model.domainById.has(themId)) continue;
    const count = far.get(themId) ?? {
      needs: 0, used: 0, needsInk: linkInk(input, l, meId, true, presence), usedInk: linkInk(input, l, themId, true, presence),
      chip: mineIsU ? b : a, toward: (mineIsU ? a : b).p,
    };
    count.needs += mineIsU ? l.uv : l.vu;
    count.used += mineIsU ? l.vu : l.uv;
    far.set(themId, count);
  }
  return far;
}

function drawLink(input: FlowMarksInput, out: FlowMarks, l: DialLink, a: End, b: End, presence: number, hub: Point, maxTotal: number, numberAtRest: boolean, routes: BranchRouter): void {
  if (input.scene.branches) {
    drawBranchLink(input, out, l, a, b, presence, routes);
    return;
  }
  const { tokens, model, attention: attn, inks } = input;
  const C = controlOf(input, l, a, b, hub);
  const ink = (from: string, numeral: boolean) => linkInk(input, l, from, numeral, presence);
  if (l.relatesOnly) {
    const rest = restStroke(tokens, l, a, b);
    emit(input, out, {
      key: l.key, role: "relates", p0: rest.p0, c: C, p1: rest.p1, w0: 1, w1: 1, ink: ink(l.u, false), headStart: false, headEnd: false,
      trimStart: rest.trimStart, trimEnd: rest.trimEnd, dashed: true, numeral: null, numeralInk: inks.numeral, slots: [],
    });
    return;
  }
  if (l.attended && attn.domainId) {
    const mineIsU = mineOf(model, attn)(l.u);
    const needs = mineIsU ? l.uv : l.vu;
    const used = mineIsU ? l.vu : l.uv;
    const me = mineIsU ? a : b;
    const them = mineIsU ? b : a;
    const meId = mineIsU ? l.u : l.v;
    const themId = mineIsU ? l.v : l.u;
    const nx = -(them.p.y - me.p.y);
    const ny = them.p.x - me.p.x;
    const nl = Math.hypot(nx, ny) || 1;
    const offset = needs > 0 && used > 0 ? tokens.flowSplitPx : 0;
    const toName = model.capabilityById.has(meId) || model.capabilityById.has(themId);
    const run = (from: string, to: string, p0: End, p1: End, count: number, sign: number) => {
      const o = { x: (sign * nx * offset) / nl, y: (sign * ny * offset) / nl };
      const w0 = toName ? tokens.flowFocusBase : rampedFocusWidth(tokens, count, maxTotal);
      const drawn = emit(input, out, {
        key: l.key, role: "chord", p0: { x: p0.p.x + o.x, y: p0.p.y + o.y }, c: { x: C.x + o.x, y: C.y + o.y }, p1: { x: p1.p.x + o.x, y: p1.p.y + o.y },
        w0, w1: w0 * tokens.flowTaper, ink: ink(from, false), headStart: false, headEnd: true,
        trimStart: p0.r + tokens.flowTrimStartPx, trimEnd: p1.r + tokens.flowTrimEndPx,
        dashed: false, numeral: null, numeralInk: inks.numeral, slots: [],
      });
      if (drawn) input.chords.push({ key: `${from}\0${to}`, sourceDomain: from, targetDomain: to, a: drawn.a, c: drawn.c, b: drawn.b, widthPx: w0, chipRadiusPx: p1.r });
    };
    if (needs > 0) run(meId, themId, me, them, needs, 1);
    if (used > 0) run(themId, meId, them, me, used, -1);
    return;
  }
  const rest = restStroke(tokens, l, a, b);
  const w = rampedRestWidth(tokens, l.total, maxTotal);
  emit(input, out, {
    key: l.key, role: "chord", p0: rest.p0, c: C, p1: rest.p1, w0: w, w1: rest.twoWay ? w : w * tokens.flowTaper, ink: ink(rest.from, false),
    headStart: rest.twoWay, headEnd: true, trimStart: rest.trimStart, trimEnd: rest.trimEnd,
    dashed: false, numeral: !attn.domainId && numberAtRest ? String(l.total) : null, numeralInk: ink(rest.from, true), slots: REST_SLOTS,
  });
}


function drawBranchLink(input: FlowMarksInput, out: FlowMarks, l: DialLink, a: End, b: End, presence: number, routes: BranchRouter): void {
  for (const { from, to, count, p0, c, p1, piece } of routes(l, a, b)) {
    const width = l.attended ? input.tokens.flowFocusBase + 0.3 : input.tokens.flowRestBase;
    const curve = emit(input, out, {
      key: l.key, role: l.relatesOnly ? "relates" : "chord", p0, c, p1, piece, w0: width, w1: width,
      ink: linkInk(input, l, from, false, presence), headStart: false, headEnd: !l.relatesOnly,
      trimStart: input.tokens.flowTrimStartPx, trimEnd: input.tokens.flowTrimEndPx,
      dashed: l.relatesOnly, numeral: l.attended && count > 1 ? input.connectionCount?.(count) ?? null : null,
      numeralInk: linkInk(input, l, from, true, presence), slots: REST_SLOTS,
    });
    if (curve && l.attended) input.chords.push({ key: `${from}\0${to}`, sourceDomain: from, targetDomain: to, ...curve, widthPx: width, chipRadiusPx: 0, arrivalBloom: false });
  }
}

function drawFanLink(input: FlowMarksInput, out: FlowMarks, attn: DialAttention, l: DialLink, a: End, b: End, share: number, hub: Point): void {
  const { tokens, inks, model } = input;
  const rest = restStroke(tokens, l, a, b);
  const w = tokens.flowFocusBase;
  emit(input, out, {
    key: l.key, role: "chord", p0: rest.p0, c: controlOf(input, l, a, b, hub), p1: rest.p1, w0: w, w1: rest.twoWay ? w : w * tokens.flowTaper,
    ink: mixOver(strokeInk(inks, model, attn, l, rest.from, false), inks.bg, share), headStart: rest.twoWay, headEnd: true,
    trimStart: rest.trimStart, trimEnd: rest.trimEnd, dashed: false, numeral: null, numeralInk: inks.numeral, slots: [],
  });
}

function restStroke(tokens: DialTokens, l: DialLink, a: End, b: End): { p0: Point; p1: Point; from: string; twoWay: boolean; trimStart: number; trimEnd: number } {
  if (l.relatesOnly) return { p0: a.p, p1: b.p, from: l.u, twoWay: false, trimStart: a.r + tokens.flowTrimStartPx, trimEnd: b.r + tokens.flowTrimStartPx };
  const twoWay = l.uv > 0 && l.vu > 0;
  const forward = l.uv >= l.vu;
  const p0 = forward ? a : b;
  const p1 = forward ? b : a;
  return {
    p0: p0.p, p1: p1.p, from: forward ? l.u : l.v, twoWay,
    trimStart: p0.r + (twoWay ? tokens.flowTrimEndPx : tokens.flowTrimStartPx), trimEnd: p1.r + tokens.flowTrimEndPx,
  };
}

const GUARD_SAMPLES = 16;
const GUARD_END_CLEAR_PX = 16;
const GUARD_CELL_PX = 48;

function restCrossingGuard(lineOf: (l: DialLink) => readonly (readonly Point[])[] | null, obstacles: readonly (readonly Point[])[], width: number, height: number): CrossingGuard {
  const lines: (readonly Point[])[] = [];
  const segs: { line: number; k: number }[] = [];
  const grid = new Map<number, number[]>();
  const cells = (a: Point, b: Point, visit: (key: number) => void) => {
    for (let gx = Math.floor(Math.min(a.x, b.x) / GUARD_CELL_PX); gx <= Math.floor(Math.max(a.x, b.x) / GUARD_CELL_PX); gx += 1) {
      for (let gy = Math.floor(Math.min(a.y, b.y) / GUARD_CELL_PX); gy <= Math.floor(Math.max(a.y, b.y) / GUARD_CELL_PX); gy += 1) visit(gx * 100003 + gy);
    }
  };
  const insert = (pts: readonly Point[]) => {
    const line = lines.length;
    lines.push(pts);
    for (let k = 0; k < pts.length - 1; k += 1) {
      const si = segs.length;
      segs.push({ line, k });
      cells(pts[k]!, pts[k + 1]!, (key) => {
        const list = grid.get(key);
        if (list) list.push(si);
        else grid.set(key, [si]);
      });
    }
  };
  const nearEnd = (p: Point, pts: readonly Point[]) =>
    Math.hypot(p.x - pts[0]!.x, p.y - pts[0]!.y) < GUARD_END_CLEAR_PX || Math.hypot(p.x - pts[pts.length - 1]!.x, p.y - pts[pts.length - 1]!.y) < GUARD_END_CLEAR_PX;
  const memo = new Map<string, readonly (readonly Point[])[] | null>();
  const lineFor = (link: DialLink): readonly (readonly Point[])[] | null => {
    const hit = memo.get(link.key);
    if (hit !== undefined) return hit;
    const pts = lineOf(link);
    memo.set(link.key, pts);
    return pts;
  };
  for (const o of obstacles) insert(o);
  return {
    crosses(link) {
      const candidates = lineFor(link);
      if (!candidates) return false;
      for (const pts of candidates) for (let k = 0; k < pts.length - 1; k += 1) {
        let hit = false;
        cells(pts[k]!, pts[k + 1]!, (key) => {
          if (hit) return;
          for (const si of grid.get(key) ?? []) {
            const s = segs[si]!;
            const other = lines[s.line]!;
            const at = segmentsMeet(pts[k]!, pts[k + 1]!, other[s.k]!, other[s.k + 1]!);
            if (!at || at.x < 0 || at.x > width || at.y < 0 || at.y > height || nearEnd(at, pts) || nearEnd(at, other)) continue;
            hit = true;
            return;
          }
        });
        if (hit) return true;
      }
      return false;
    },
    add(link) {
      for (const pts of lineFor(link) ?? []) insert(pts);
    },
  };
}

function sampledPiece(piece: readonly [Point, Point, Point] | null): Point[] | null {
  if (!piece) return null;
  const [a, c, b] = piece;
  return Array.from({ length: GUARD_SAMPLES + 1 }, (_, k) => quadAt(a, c, b, k / GUARD_SAMPLES));
}
