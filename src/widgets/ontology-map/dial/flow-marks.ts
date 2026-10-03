import { scaledLabelFont, scaledLabelFontSize } from "../render/labels";
import { FONT_WEIGHT } from "@/shared/ui/font-weight";
import { crossfadeInk, inkIndex, mixOver, type DialInks } from "./ink";
import type { DialResolution } from "./frame/disclosure";
import { aggregateLinks, domainOfEnd, restBudget, type DialLink } from "./links";
import type { Box, DialAttention, DialChordLight, DialMarks, DialModel, DialScene, DialTokens, Point, StripMark } from "./types";

export interface FlowMarksInput {
  model: DialModel;
  scene: DialScene;
  tokens: DialTokens;
  inks: DialInks;
  attention: DialAttention;
  previous: DialAttention | null;
  inkMix: number;
  chordPresence: number;
  scale: number;
  labelScale: number;
  viewportWidth: number;
  viewportHeight: number;
  freeRect: Box;
  nodeScreen(id: string): Point | null;
  toScreen(x: number, y: number): Point;
  endRadiusPx(id: string): number;
  appearOf(id: string): number;
  measureText(text: string, font: string): number;
  occupied: Box[];
  chords: DialChordLight[];
  resolution: DialResolution;
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
const NEAR_END = [0.8, 0.72, 0.88, 0.64, 0.56];
const NEAR_START = [0.2, 0.28, 0.12, 0.36, 0.44];
const PRESENCE_FLOOR = 0.02;
const OFFSCREEN_PX = 40;
const FREE_SLACK_PX = 6;
const HUB_CLEAR_PX = 66;
const STUB_SHORT = 0.74;

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

export function flowHeadSize(tokens: DialTokens, w0: number, w1: number): number {
  return tokens.flowHeadBasePx + tokens.flowHeadGain * Math.max(w0, w1);
}

function dialNumeralFont(tokens: DialTokens, labelScale: number): string {
  return `${FONT_WEIGHT.strong} ${Math.round(tokens.numeralSize * labelScale * 2) / 2}px ui-monospace, SFMono-Regular, Menlo, monospace`;
}

function overlaps(a: Box, b: Box): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

function inside(box: Box, rect: Box): boolean {
  return box.minX >= rect.minX && box.maxX <= rect.maxX && box.minY >= rect.minY && box.maxY <= rect.maxY;
}

function quadAt(p0: Point, c: Point, p1: Point, t: number): Point {
  const u = 1 - t;
  return { x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y };
}

function quadPiece(p0: Point, c: Point, p1: Point, t0: number, t1: number): [Point, Point, Point] {
  return [
    quadAt(p0, c, p1, t0),
    {
      x: (1 - t0) * (1 - t1) * p0.x + ((1 - t0) * t1 + t0 * (1 - t1)) * c.x + t0 * t1 * p1.x,
      y: (1 - t0) * (1 - t1) * p0.y + ((1 - t0) * t1 + t0 * (1 - t1)) * c.y + t0 * t1 * p1.y,
    },
    quadAt(p0, c, p1, t1),
  ];
}

function quadLength(p0: Point, c: Point, p1: Point): number {
  let len = 0;
  let prev = p0;
  for (let i = 1; i <= 16; i += 1) {
    const q = quadAt(p0, c, p1, i / 16);
    len += Math.hypot(q.x - prev.x, q.y - prev.y);
    prev = q;
  }
  return len;
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
  halo: boolean;
}

function emit(input: FlowMarksInput, out: FlowMarks, s: Stroke): { a: Point; c: Point; b: Point } | null {
  const length = quadLength(s.p0, s.c, s.p1);
  if (length < 1) return null;
  const tStart = Math.min(0.45, s.trimStart / length);
  const tEnd = Math.max(0.55, 1 - s.trimEnd / length);
  const [a, c, b] = quadPiece(s.p0, s.c, s.p1, tStart, tEnd);
  const trimmed = quadLength(a, c, b);
  let gapT0 = 0;
  let gapT1 = 0;
  if (s.numeral !== null) {
    const font = dialNumeralFont(input.tokens, input.labelScale);
    const textW = input.measureText(s.numeral, font);
    const textH = Math.max(9, input.tokens.numeralSize * input.labelScale);
    for (const t of s.slots) {
      const q = quadAt(a, c, b, t);
      const box = { minX: q.x - textW / 2 - 3, maxX: q.x + textW / 2 + 3, minY: q.y - textH / 2 - 2, maxY: q.y + textH / 2 + 2 };
      if (input.occupied.some((o) => overlaps(o, box))) continue;
      const half = (textW / 2 + input.tokens.numeralGapPx) / Math.max(1, trimmed);
      gapT0 = Math.max(0, t - half);
      gapT1 = Math.min(1, t + half);
      input.occupied.push(box);
      out.numerals.push({ flowKey: s.key, text: s.numeral, x: q.x, y: q.y + 0.5, ink: inkIndex(out, s.numeralInk), halo: s.halo, font, box });
      break;
    }
  }
  out.strips.push({
    flowKey: s.key, role: s.role, ink: inkIndex(out, s.ink),
    ax: a.x, ay: a.y, cx: c.x, cy: c.y, bx: b.x, by: b.y, w0: s.w0, w1: s.w1, gapT0, gapT1,
    dashed: s.dashed, headStart: s.headStart, headEnd: s.headEnd, headSize: s.dashed ? 0 : flowHeadSize(input.tokens, s.w0, s.w1),
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

function stubLength(tokens: DialTokens, free: Box): number {
  return Math.max(tokens.stubMinPx, Math.min(tokens.stubMaxPx, tokens.stubFreeShare * Math.min(free.maxX - free.minX, free.maxY - free.minY)));
}

export function stubText(name: string, needs: number, used: number): string {
  return [name, needs > 0 ? `→${needs}` : null, used > 0 ? `←${used}` : null].filter((p) => p !== null).join(" ");
}

interface Stub {
  link: DialLink;
  near: End;
  nearId: string;
  farId: string;
  angle: number;
  presence: number;
}

export function fanAngles(angles: readonly number[], gapDeg: number): number[] {
  const order = angles.map((a, i) => ({ a, i })).sort((x, y) => x.a - y.a || x.i - y.i);
  const minGap = (gapDeg * Math.PI) / 180;
  for (let k = 1; k < order.length; k += 1) if (order[k]!.a - order[k - 1]!.a < minGap) order[k]!.a = order[k - 1]!.a + minGap;
  const out = new Array<number>(angles.length);
  for (const o of order) out[o.i] = o.a;
  return out;
}

function paintStubs(input: FlowMarksInput, out: FlowMarks, stubs: Stub[], result: FlowMarksResult): void {
  const { tokens, inks, model } = input;
  const ls = Math.min(1.3, input.labelScale);
  const nameFont = scaledLabelFont("capability", ls);
  const nameFontPx = scaledLabelFontSize("capability", ls);
  const length = stubLength(tokens, input.freeRect);
  const byNear = new Map<string, Stub[]>();
  for (const st of stubs) {
    const list = byNear.get(st.nearId);
    if (list) list.push(st);
    else byNear.set(st.nearId, [st]);
  }
  for (const list of byNear.values()) {
    list.sort((x, y) => x.angle - y.angle || (x.farId < y.farId ? -1 : 1));
    const angles = fanAngles(list.map((s) => s.angle), tokens.stubGapDeg);
    const segments = list.map((st, k) => {
      const reach = length * (k % 2 === 0 ? 1 : STUB_SHORT);
      const cos = Math.cos(angles[k]!);
      const sin = Math.sin(angles[k]!);
      return {
        start: { x: st.near.p.x + cos * (st.near.r + 4), y: st.near.p.y + sin * (st.near.r + 4) },
        end: { x: st.near.p.x + cos * reach, y: st.near.p.y + sin * reach },
        cos,
        sin,
      };
    });
    list.forEach((st, k) => {
      const { start, end, cos, sin } = segments[k]!;
      const nearIsU = st.nearId === st.link.u;
      const needs = nearIsU ? st.link.uv : st.link.vu;
      const used = nearIsU ? st.link.vu : st.link.uv;
      const needsInk = mixOver(strokeInk(inks, model, input.attention, st.link, st.nearId, false), inks.bg, st.presence);
      const usedInk = mixOver(strokeInk(inks, model, input.attention, st.link, st.farId, false), inks.bg, st.presence);
      const nameInk = mixOver(st.link.attended ? inks.domainLabelAttended : inks.domainLabel, inks.bg, st.presence);
      const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      const off = needs > 0 && used > 0 ? tokens.flowSplitPx * 0.5 : 0;
      const shift = (p: Point, sign: number) => ({ x: p.x - sign * sin * off, y: p.y + sign * cos * off });
      const lit = st.link.attended && input.attention.domainId !== null;
      const stroke = (p0: Point, c: Point, p1: Point, count: number, ink: string, from: string, to: string) => {
        const w0 = focusFlowWidth(tokens, count);
        const drawn = emit(input, out, {
          key: st.link.key, role: "stub", p0, c, p1, w0, w1: w0 * tokens.flowTaper, ink, headStart: false, headEnd: true,
          trimStart: 0, trimEnd: 0, dashed: false, numeral: null, numeralInk: ink, slots: [], halo: false,
        });
        if (drawn && lit) input.chords.push({ key: `${from}\0${to}`, sourceDomain: from, targetDomain: to, a: drawn.a, c: drawn.c, b: drawn.b, widthPx: w0, chipRadiusPx: 0 });
      };
      if (needs > 0) stroke(shift(start, 1), shift(mid, 1), shift(end, 1), needs, needsInk, st.nearId, st.farId);
      if (used > 0) stroke(shift(end, -1), shift(mid, -1), shift(start, -1), used, usedInk, st.farId, st.nearId);
      const name = model.capabilityById.get(st.farId)?.label ?? model.domainById.get(st.farId)?.label ?? st.farId;
      const parts: { text: string; ink: number }[] = [{ text: name, ink: inkIndex(out, nameInk) }];
      if (needs > 0) parts.push({ text: ` →${needs}`, ink: inkIndex(out, needsInk) });
      if (used > 0) parts.push({ text: ` ←${used}`, ink: inkIndex(out, usedInk) });
      const text = stubText(name, needs, used);
      const align: CanvasTextAlign = cos > 0.25 ? "left" : cos < -0.25 ? "right" : "center";
      const tx = end.x + cos * 8;
      const ty = end.y + sin * 10;
      const width = input.measureText(text, nameFont);
      const startX = align === "left" ? tx : align === "right" ? tx - width : tx - width / 2;
      const box = { minX: startX - 2, maxX: startX + width + 2, minY: ty - nameFontPx * 0.7, maxY: ty + nameFontPx * 0.7 };
      if (!inside(box, input.freeRect) || input.occupied.some((o) => overlaps(o, box))) return;
      if (segments.some((s, j) => j !== k && segmentHitsBox(s.start.x, s.start.y, s.end.x, s.end.y, box))) return;
      input.occupied.push(box);
      out.texts.push({ id: st.farId, role: "stub", text, x: startX, y: ty, align: "left", font: nameFont, ink: inkIndex(out, nameInk), box, parts });
      result.stubs.push({ flowKey: st.link.key, text, box });
    });
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
  const links = aggregateLinks(model, resolved, attn);
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
  const counted = drawable.filter((d) => !d.l.relatesOnly).map((d) => d.l);
  const budget = restBudget(counted, ends.size, tokens);
  result.budget = { shown: 0, total: budget.total, perEndCap: budget.perEndCap };
  const maxTotal = Math.max(1, ...counted.filter((l) => budget.keep.has(l.key) || l.attended).map((l) => l.total));
  const numberLimit = Math.max(tokens.restNumbersMin, Math.min(tokens.restNumbersMax, Math.round(tokens.restNumbersShare * onScreen)));
  const numberKeep = new Set(counted.filter((l) => budget.keep.has(l.key) && l.total >= tokens.restNumberMinCount).slice(0, numberLimit).map((l) => l.key));

  const within = (p: Point) => p.x >= free.minX - FREE_SLACK_PX && p.x <= free.maxX + FREE_SLACK_PX && p.y >= free.minY - FREE_SLACK_PX && p.y <= free.maxY + FREE_SLACK_PX;
  const stubs: Stub[] = [];
  const toDraw: { l: DialLink; a: End; b: End; presence: number }[] = [];
  for (const { l, a, b } of drawable) {
    if (!l.attended && !l.relatesOnly && !budget.keep.has(l.key)) continue;
    if (attn.domainId && !l.attended && l.relatesOnly) continue;
    const presence = presenceOf(l);
    if (presence <= PRESENCE_FLOOR) continue;
    const ina = within(a.p);
    const inb = within(b.p);
    if (!ina && !inb) continue;
    if (ina !== inb) {
      if (l.relatesOnly) continue;
      const near = ina ? a : b;
      const far = ina ? b : a;
      stubs.push({ link: l, near, nearId: ina ? l.u : l.v, farId: ina ? l.v : l.u, angle: Math.atan2(far.p.y - near.p.y, far.p.x - near.p.x), presence });
      continue;
    }
    toDraw.push({ l, a, b, presence });
  }

  paintStubs(input, out, stubs, result);
  toDraw.sort((x, y) => Number(x.l.attended) - Number(y.l.attended) || x.l.total - y.l.total || (x.l.key < y.l.key ? -1 : 1));
  for (const { l, a, b, presence } of toDraw) {
    drawLink(input, out, l, a, b, presence, hub, maxTotal, numberKeep.has(l.key));
    result.drawn.push(l.key);
  }
  for (const st of stubs) if (!result.drawn.includes(st.link.key)) result.drawn.push(st.link.key);
  result.budget.shown = result.drawn.filter((k) => budget.keep.has(k)).length;
  return result;
}

function drawLink(input: FlowMarksInput, out: FlowMarks, l: DialLink, a: End, b: End, presence: number, hub: Point, maxTotal: number, numberAtRest: boolean): void {
  const { tokens, model, scene, attention: attn, inks } = input;
  const du = domainOfEnd(model, l.u);
  const dv = domainOfEnd(model, l.v);
  const pivotCluster = du === dv ? scene.clusterByDomain.get(du) : undefined;
  const pivot = pivotCluster ? input.nodeScreen(du) ?? input.toScreen(pivotCluster.chip.x, pivotCluster.chip.y) : null;
  const sameRing = du !== dv && scene.clusterByDomain.get(du)?.step === scene.clusterByDomain.get(dv)?.step;
  const C = routeControl(a.p, b.p, hub, pivot, sameRing);
  const ink = (from: string, numeral: boolean) => {
    const now = strokeInk(inks, model, attn, l, from, numeral);
    const was = input.previous ? strokeInk(inks, model, input.previous, l, from, numeral) : now;
    return mixOver(crossfadeInk(was, now, input.inkMix), inks.bg, presence);
  };
  if (l.relatesOnly) {
    emit(input, out, {
      key: l.key, role: "relates", p0: a.p, c: C, p1: b.p, w0: 1, w1: 1, ink: ink(l.u, false), headStart: false, headEnd: false,
      trimStart: a.r + tokens.flowTrimStartPx, trimEnd: b.r + tokens.flowTrimStartPx, dashed: true, numeral: null, numeralInk: inks.numeral, slots: [], halo: false,
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
    const run = (from: string, to: string, p0: End, p1: End, count: number, sign: number, slots: readonly number[]) => {
      const o = { x: (sign * nx * offset) / nl, y: (sign * ny * offset) / nl };
      const w0 = rampedFocusWidth(tokens, count, maxTotal);
      const drawn = emit(input, out, {
        key: l.key, role: "chord", p0: { x: p0.p.x + o.x, y: p0.p.y + o.y }, c: { x: C.x + o.x, y: C.y + o.y }, p1: { x: p1.p.x + o.x, y: p1.p.y + o.y },
        w0, w1: w0 * tokens.flowTaper, ink: ink(from, false), headStart: false, headEnd: true,
        trimStart: p0.r + tokens.flowTrimStartPx, trimEnd: p1.r + tokens.flowTrimEndPx,
        dashed: false, numeral: String(count), numeralInk: ink(from, true), slots, halo: true,
      });
      if (drawn) input.chords.push({ key: `${from}\0${to}`, sourceDomain: from, targetDomain: to, a: drawn.a, c: drawn.c, b: drawn.b, widthPx: w0, chipRadiusPx: p1.r });
    };
    if (needs > 0) run(meId, themId, me, them, needs, 1, NEAR_END);
    if (used > 0) run(themId, meId, them, me, used, -1, NEAR_START);
    return;
  }
  const twoWay = l.uv > 0 && l.vu > 0;
  const forward = l.uv >= l.vu;
  const w = rampedRestWidth(tokens, l.total, maxTotal);
  const from = forward ? l.u : l.v;
  const p0 = forward ? a : b;
  const p1 = forward ? b : a;
  emit(input, out, {
    key: l.key, role: "chord", p0: p0.p, c: C, p1: p1.p, w0: w, w1: twoWay ? w : w * tokens.flowTaper, ink: ink(from, false),
    headStart: twoWay, headEnd: true, trimStart: p0.r + (twoWay ? tokens.flowTrimEndPx : tokens.flowTrimStartPx), trimEnd: p1.r + tokens.flowTrimEndPx,
    dashed: false, numeral: !attn.domainId && numberAtRest ? String(l.total) : null, numeralInk: ink(from, true), slots: REST_SLOTS, halo: false,
  });
}
