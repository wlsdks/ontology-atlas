import type { DirectedDomainFlow } from "../model/containment-tree";
import { scaledLabelFont, scaledLabelFontSize } from "../render/labels";
import { FONT_WEIGHT } from "@/shared/ui/font-weight";
import { crossfadeInk, inkIndex, mixOver, type DialInks } from "./ink";
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
  domainProgress: number;
  zoomRatio: number;
  scale: number;
  labelScale: number;
  viewportWidth: number;
  viewportHeight: number;
  chipRadiusPx: number;
  nodeScreen(id: string): Point | null;
  toScreen(x: number, y: number): Point;
  measureText(text: string, font: string): number;
  restNumberKeys: ReadonlySet<string>;
  restStrongKeys: ReadonlySet<string>;
  occupied: Box[];
  chords: DialChordLight[];
}

type FlowMarks = Pick<DialMarks, "inks" | "strips" | "numerals" | "texts">;

const NUMERAL_SLOTS = [0.5, 0.42, 0.58, 0.34, 0.66, 0.27, 0.73];
const PRESENCE_FLOOR = 0.02;
const STUB_FULL = 0.98;

export function restFlowWidth(tokens: DialTokens, count: number): number {
  return Math.min(tokens.flowRestMax, tokens.flowRestBase + tokens.flowRestGain * Math.log2(1 + count));
}

export function focusFlowWidth(tokens: DialTokens, count: number): number {
  return Math.min(tokens.flowFocusMax, tokens.flowFocusBase + tokens.flowFocusGain * Math.log2(1 + count));
}

export function flowHeadSize(tokens: DialTokens, w0: number, w1: number): number {
  return tokens.flowHeadBasePx + tokens.flowHeadGain * Math.max(w0, w1);
}

export function dialNumeralFont(tokens: DialTokens, labelScale: number): string {
  return `${FONT_WEIGHT.strong} ${Math.round(tokens.numeralSize * labelScale * 2) / 2}px ui-monospace, SFMono-Regular, Menlo, monospace`;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}

function overlaps(a: Box, b: Box): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
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

function attendedOf(attn: DialAttention | null, f: DirectedDomainFlow): string | null {
  if (!attn?.domainId) return null;
  return f.a === attn.domainId || f.b === attn.domainId ? attn.domainId : null;
}

function directionInk(inks: DialInks, attn: DialAttention | null, f: DirectedDomainFlow, from: string): string {
  if (!attn?.domainId) return f.relatesOnly ? inks.relates : inks.flow;
  const mine = attendedOf(attn, f);
  if (!mine) return inks.flowReceded;
  if (f.relatesOnly) return inks.usedBy;
  return from === mine ? inks.needs : inks.usedBy;
}

function numeralInk(inks: DialInks, attn: DialAttention | null, f: DirectedDomainFlow, from: string): string {
  if (!attn?.domainId) return inks.numeral;
  return attendedOf(attn, f) ? directionInk(inks, attn, f, from) : inks.flowReceded;
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
  force: boolean;
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
    for (const t of NUMERAL_SLOTS) {
      const q = quadAt(a, c, b, t);
      const box = { minX: q.x - textW / 2 - 3, maxX: q.x + textW / 2 + 3, minY: q.y - textH / 2 - 2, maxY: q.y + textH / 2 + 2 };
      if (!s.force && input.occupied.some((o) => overlaps(o, box))) continue;
      const half = (textW / 2 + input.tokens.numeralGapPx) / Math.max(1, trimmed);
      gapT0 = Math.max(0, t - half);
      gapT1 = Math.min(1, t + half);
      input.occupied.push(box);
      out.numerals.push({ flowKey: s.key, text: s.numeral, x: q.x, y: q.y + 0.5, ink: inkIndex(out, s.numeralInk), halo: s.force, font, box });
      break;
    }
  }
  out.strips.push({
    flowKey: s.key,
    role: s.role,
    ink: inkIndex(out, s.ink),
    ax: a.x,
    ay: a.y,
    cx: c.x,
    cy: c.y,
    bx: b.x,
    by: b.y,
    w0: s.w0,
    w1: s.w1,
    gapT0,
    gapT1,
    dashed: s.dashed,
    headStart: s.headStart,
    headEnd: s.headEnd,
    headSize: s.dashed ? 0 : flowHeadSize(input.tokens, s.w0, s.w1),
  });
  return { a, c, b };
}

function inkFor(input: FlowMarksInput, f: DirectedDomainFlow, from: string, presence: number, numeral: boolean): string {
  const pick = numeral ? numeralInk : directionInk;
  const now = pick(input.inks, input.attention, f, from);
  const was = input.previous ? pick(input.inks, input.previous, f, from) : now;
  return mixOver(crossfadeInk(was, now, input.inkMix), input.inks.bg, presence);
}

function chord(input: FlowMarksInput, out: FlowMarks, f: DirectedDomainFlow, presence: number): void {
  const { tokens, attention: attn } = input;
  const A = input.nodeScreen(f.a);
  const B = input.nodeScreen(f.b);
  const control = input.scene.controls.get(f.key);
  if (!A || !B || !control) return;
  const hub = (input.model.projectId ? input.nodeScreen(input.model.projectId) : null) ?? input.toScreen(0, 0);
  const full = input.toScreen(control.x, control.y);
  const ride = easeOutCubic(input.domainProgress);
  const C = { x: hub.x + (full.x - hub.x) * ride, y: hub.y + (full.y - hub.y) * ride };
  const chipR = input.chipRadiusPx;
  const mine = attendedOf(attn, f);
  if (f.relatesOnly) {
    if (attn.domainId && !mine) return;
    emit(input, out, {
      key: f.key, role: "relates", p0: A, c: C, p1: B, w0: 1, w1: 1, ink: inkFor(input, f, f.a, presence, false),
      headStart: false, headEnd: false, trimStart: chipR + tokens.flowTrimStartPx, trimEnd: chipR + tokens.flowTrimStartPx,
      dashed: true, numeral: null, numeralInk: input.inks.numeral, force: false,
    });
    return;
  }
  if (mine) {
    const other = mine === f.a ? f.b : f.a;
    const needs = mine === f.a ? f.ab : f.ba;
    const used = mine === f.a ? f.ba : f.ab;
    const me = mine === f.a ? A : B;
    const them = mine === f.a ? B : A;
    const nx = -(them.y - me.y);
    const ny = them.x - me.x;
    const nl = Math.hypot(nx, ny) || 1;
    const offset = needs > 0 && used > 0 ? tokens.flowSplitPx : 0;
    const run = (from: string, to: string, p0: Point, p1: Point, count: number, sign: number) => {
      const o = { x: (sign * nx * offset) / nl, y: (sign * ny * offset) / nl };
      const w0 = focusFlowWidth(tokens, count);
      const ink = inkFor(input, f, from, presence, false);
      const drawn = emit(input, out, {
        key: f.key, role: "chord", p0: { x: p0.x + o.x, y: p0.y + o.y }, c: { x: C.x + o.x, y: C.y + o.y }, p1: { x: p1.x + o.x, y: p1.y + o.y },
        w0, w1: w0 * tokens.flowTaper, ink, headStart: false, headEnd: true,
        trimStart: chipR + tokens.flowTrimStartPx, trimEnd: chipR + tokens.flowTrimEndPx,
        dashed: false, numeral: String(count), numeralInk: inkFor(input, f, from, presence, true), force: true,
      });
      if (drawn) input.chords.push({ key: `${from}\0${to}`, sourceDomain: from, targetDomain: to, a: drawn.a, c: drawn.c, b: drawn.b, widthPx: w0, chipRadiusPx: chipR });
    };
    if (needs > 0) run(mine, other, me, them, needs, 1);
    if (used > 0) run(other, mine, them, me, used, -1);
    return;
  }
  const twoWay = f.ab > 0 && f.ba > 0;
  const forward = f.ab >= f.ba;
  const strong = input.restStrongKeys.has(f.key);
  const w = restFlowWidth(tokens, Math.max(1, f.total)) * (strong ? 1 : tokens.flowQuietRatio);
  const from = forward ? f.a : f.b;
  emit(input, out, {
    key: f.key, role: "chord", p0: forward ? A : B, c: C, p1: forward ? B : A,
    w0: w, w1: twoWay ? w : w * tokens.flowTaper, ink: inkFor(input, f, from, presence, false),
    headStart: twoWay, headEnd: true,
    trimStart: chipR + (twoWay ? tokens.flowTrimEndPx : tokens.flowTrimStartPx), trimEnd: chipR + tokens.flowTrimEndPx,
    dashed: false,
    numeral: !attn.domainId && input.restNumberKeys.has(f.key) ? String(f.total) : null,
    numeralInk: inkFor(input, f, from, presence, true), force: false,
  });
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

export interface StubItem {
  flow: DirectedDomainFlow;
  other: string;
  needs: number;
  used: number;
  dir: number;
}

export function fanStubs(model: DialModel, scene: DialScene, domainId: string, gapDeg: number): StubItem[] {
  const sector = scene.sectorByDomain.get(domainId);
  if (!sector) return [];
  const me = { x: Math.cos(sector.angle) * scene.ringRadius, y: Math.sin(sector.angle) * scene.ringRadius };
  const items: StubItem[] = [];
  for (const flow of model.flows) {
    if (flow.relatesOnly || (flow.a !== domainId && flow.b !== domainId)) continue;
    const other = flow.a === domainId ? flow.b : flow.a;
    const far = scene.sectorByDomain.get(other);
    if (!far) continue;
    const fx = Math.cos(far.angle) * scene.ringRadius;
    const fy = Math.sin(far.angle) * scene.ringRadius;
    items.push({ flow, other, needs: flow.a === domainId ? flow.ab : flow.ba, used: flow.a === domainId ? flow.ba : flow.ab, dir: Math.atan2(fy - me.y, fx - me.x) });
  }
  items.sort((x, y) => x.dir - y.dir || (x.other < y.other ? -1 : 1));
  const minGap = (gapDeg * Math.PI) / 180;
  for (let k = 1; k < items.length; k += 1) {
    if (items[k]!.dir - items[k - 1]!.dir < minGap) items[k]!.dir = items[k - 1]!.dir + minGap;
  }
  if (items.length > 1) {
    const mean = items.reduce((sum, it) => sum + it.dir, 0) / items.length;
    const inward = Math.atan2(-Math.sin(sector.angle), -Math.cos(sector.angle));
    const shift = inward - mean;
    if (Math.abs(shift) < 0.6) for (const it of items) it.dir += shift * 0.5;
  }
  return items;
}

function stubs(input: FlowMarksInput, out: FlowMarks, presence: number): void {
  const { tokens, attention: attn, inks } = input;
  const ls = Math.min(1.3, input.labelScale);
  const nameFont = scaledLabelFont("capability", ls);
  const nameFontPx = scaledLabelFontSize("capability", ls);
  const chipR = input.chipRadiusPx;
  const length = Math.max(tokens.stubMinPx, Math.min(tokens.stubMaxPx, input.scene.ringRadius * input.scale * tokens.stubRingShare));
  const needsInk = mixOver(inks.needs, inks.bg, presence);
  const usedInk = mixOver(inks.usedBy, inks.bg, presence);
  const nameInk = mixOver(inks.domainLabel, inks.bg, presence);
  for (const sector of input.scene.sectors) {
    const chip = input.nodeScreen(sector.domainId);
    if (!chip) continue;
    if (chip.x < -40 || chip.x > input.viewportWidth + 40 || chip.y < -40 || chip.y > input.viewportHeight + 40) continue;
    if (attn.domainId && attn.domainId !== sector.domainId) continue;
    const items = fanStubs(input.model, input.scene, sector.domainId, tokens.stubGapDeg);
    const segments: { k: number; x0: number; y0: number; x1: number; y1: number }[] = [];
    const ends = items.map((item, k) => {
      const reach = length * (k % 2 === 0 ? 1 : tokens.stubShortShare);
      const start = { x: chip.x + Math.cos(item.dir) * (chipR + 4), y: chip.y + Math.sin(item.dir) * (chipR + 4) };
      const end = { x: chip.x + Math.cos(item.dir) * reach, y: chip.y + Math.sin(item.dir) * reach };
      segments.push({ k, x0: start.x, y0: start.y, x1: end.x, y1: end.y });
      return { start, end };
    });
    items.forEach((item, k) => {
      const { start, end } = ends[k]!;
      const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      const nx = -Math.sin(item.dir);
      const ny = Math.cos(item.dir);
      const off = item.needs > 0 && item.used > 0 ? tokens.flowSplitPx * 0.78 : 0;
      const shift = (p: Point, sign: number) => ({ x: p.x + sign * nx * off, y: p.y + sign * ny * off });
      const stroke = (p0: Point, c: Point, p1: Point, count: number, ink: string) => {
        const w0 = focusFlowWidth(tokens, count);
        emit(input, out, {
          key: item.flow.key, role: "stub", p0, c, p1, w0, w1: w0 * tokens.flowTaper, ink, headStart: false, headEnd: true,
          trimStart: 0, trimEnd: 0, dashed: false, numeral: null, numeralInk: ink, force: false,
        });
      };
      if (item.needs > 0) stroke(shift(start, 1), shift(mid, 1), shift(end, 1), item.needs, needsInk);
      if (item.used > 0) stroke(shift(end, -1), shift(mid, -1), shift(start, -1), item.used, usedInk);
      const name = input.model.domainById.get(item.other)?.label ?? item.other;
      const parts: { text: string; ink: number }[] = [{ text: `${name} `, ink: inkIndex(out, nameInk) }];
      if (item.needs > 0) parts.push({ text: `→${item.needs}`, ink: inkIndex(out, needsInk) });
      if (item.needs > 0 && item.used > 0) parts.push({ text: " ", ink: inkIndex(out, nameInk) });
      if (item.used > 0) parts.push({ text: `←${item.used}`, ink: inkIndex(out, usedInk) });
      const text = parts.map((p) => p.text).join("");
      const cos = Math.cos(item.dir);
      const align: CanvasTextAlign = cos > 0.25 ? "left" : cos < -0.25 ? "right" : "center";
      const tx = end.x + cos * 8;
      const ty = end.y + Math.sin(item.dir) * 10;
      const width = input.measureText(text, nameFont);
      const startX = align === "left" ? tx : align === "right" ? tx - width : tx - width / 2;
      const box = { minX: startX - 2, maxX: startX + width + 2, minY: ty - nameFontPx * 0.7, maxY: ty + nameFontPx * 0.7 };
      if (input.occupied.some((o) => overlaps(o, box))) return;
      if (segments.some((s) => s.k !== k && segmentHitsBox(s.x0, s.y0, s.x1, s.y1, box))) return;
      input.occupied.push(box);
      out.texts.push({ id: item.other, role: "stub", text, x: startX, y: ty, align: "left", font: nameFont, ink: inkIndex(out, nameInk), box, parts });
    });
  }
}

export function buildFlowMarks(input: FlowMarksInput, out: FlowMarks): void {
  const { tokens } = input;
  const zoomChord = 1 - smoothstep(tokens.stubEnterRatio, tokens.stubFullRatio, input.zoomRatio);
  const arrival = Math.min(1, Math.max(0, input.chordPresence));
  const chordInk = zoomChord * arrival;
  if (chordInk > PRESENCE_FLOOR) {
    const byWeight = [...input.model.flows].sort((x, y) => x.total - y.total || (x.key < y.key ? -1 : 1));
    const attended: DirectedDomainFlow[] = [];
    for (const f of byWeight) {
      if (attendedOf(input.attention, f)) attended.push(f);
      else chord(input, out, f, chordInk);
    }
    for (const f of attended) chord(input, out, f, chordInk);
  }
  const stubInk = (1 - zoomChord) * arrival;
  if (zoomChord < STUB_FULL && stubInk > PRESENCE_FLOOR) stubs(input, out, stubInk);
}
