import { MOTION } from "@/shared/motion/tokens";
import { easeOutCubic } from "../../model/camera-easing";
import { dialEvidenceView, resolveDialAttention } from "../dial-model";
import { resolveDialDisclosure, smoothstep, type DialDisclosure } from "./disclosure";
import { createMeasureText } from "../fit";
import { inkIndex, resolveDialInks, type DialInks } from "../ink";
import { dialPlacementLine, dialPlacementOf } from "../placement";
import { scaledLabelFont, scaledLabelFontSize } from "../../render/labels";
import { buildDialMarks, emptyDialFrameMarks, type DialFrameMarks, type DialMarksResult } from "./marks";
import { paintDialMarks } from "./paint";
import type {
  Box,
  DialAttention,
  DialEvidence,
  DialEvidenceView,
  DialFrameInput,
  DialFrameResult,
  DialLightFrame,
  DialModel,
  DialOwnershipInput,
  DialProbe,
  DialTokens,
  Point,
} from "../types";

const FOCUS_MS = MOTION.fast.duration * 1000;
const CURVE_STEPS = 16;
const END_CLEAR_PX = 16;
const CELL = 48;
const NAME_INSET_PX = 2;
const LABELLED_ROLES = new Set(["project", "domain", "capability", "ledger"]);

export function dialOwnsFlatPaint(input: DialOwnershipInput): boolean {
  return input.hasDial
    && !input.galaxyOn
    && !input.realmActive
    && !input.edgeSelected
    && !input.edgePreviewed
    && !input.trailLensOpen
    && !input.spotlightActive
    && !input.pathLensActive
    && !input.impactLensActive
    && !input.focusedIsElement;
}

interface FocusClock { key: string; changedAt: number; current: DialAttention; previous: DialAttention | null }

const clocks = new WeakMap<object, FocusClock>();

export function focusInkMix(worldKey: object, attention: DialAttention, now: number, reducedMotion: boolean): { inkMix: number; previous: DialAttention | null } {
  let clock = clocks.get(worldKey);
  if (!clock) {
    clock = { key: attention.key, changedAt: -Infinity, current: attention, previous: null };
    clocks.set(worldKey, clock);
  } else if (clock.key !== attention.key) {
    clock.previous = clock.current;
    clock.key = attention.key;
    clock.changedAt = now;
  }
  clock.current = attention;
  const inkMix = reducedMotion ? 1 : easeOutCubic(Math.min(1, Math.max(0, (now - clock.changedAt) / FOCUS_MS)));
  return { inkMix, previous: inkMix >= 1 ? null : clock.previous };
}

export function dialChordPresence(tokens: Pick<DialTokens, "chordArrival">, domainAppear: number): number {
  return smoothstep(tokens.chordArrival, 1, domainAppear);
}

interface LastFrame {
  input: DialFrameInput;
  result: DialFrameResult;
  marks: DialFrameMarks;
  built: DialMarksResult;
  disclosure: DialDisclosure;
}

let last: LastFrame | null = null;
const pool = emptyDialFrameMarks();
const measureText = createMeasureText();
const inksCache = new WeakMap<object, { tokens: DialTokens; inks: DialInks }>();
const evidenceCache = new WeakMap<DialModel, { evidence: ReadonlyMap<string, DialEvidence> | null; view: DialEvidenceView }>();

function resetMarks(m: DialFrameMarks): void {
  m.inks.length = 0;
  m.strips.length = 0;
  m.discs.length = 0;
  m.squares.length = 0;
  m.ticks.length = 0;
  m.rails.length = 0;
  m.glyphs.length = 0;
  m.texts.length = 0;
  m.numerals.length = 0;
  m.leaders.length = 0;
  m.plates.length = 0;
  m.extraTexts.length = 0;
}

function inksOf(input: DialFrameInput): DialInks {
  const hit = inksCache.get(input.mapTokens);
  if (hit && hit.tokens === input.dialTokens) return hit.inks;
  const inks = resolveDialInks(input.mapTokens, input.dialTokens);
  inksCache.set(input.mapTokens, { tokens: input.dialTokens, inks });
  return inks;
}

function evidenceOf(model: DialModel, evidence: ReadonlyMap<string, DialEvidence> | null): DialEvidenceView | null {
  if (evidence === null) return null;
  const hit = evidenceCache.get(model);
  if (hit && hit.evidence === evidence) return hit.view;
  const view = dialEvidenceView(model, evidence);
  evidenceCache.set(model, { evidence, view });
  return view;
}

export function paintDialFrame(input: DialFrameInput): DialFrameResult {
  const { model, scene } = input.dial;
  const attention = resolveDialAttention(model, input.hoveredNodeId, input.focusedNodeId);
  const { inkMix, previous } = focusInkMix(input.worldKey, attention, input.now, input.reducedMotion);
  const chordPresence = dialChordPresence(input.dialTokens, input.domainAppear);
  const camera = { scale: input.scale, viewportWidth: input.viewportWidth, viewportHeight: input.viewportHeight, toScreen: input.toScreen };
  const disclosure = resolveDialDisclosure(model, scene, camera, input.freeRect, attention, input.dialTokens);
  resetMarks(pool);
  const built = buildDialMarks({
    model, scene, tokens: input.dialTokens, mapTokens: input.mapTokens, inks: inksOf(input), labels: input.labels,
    evidence: evidenceOf(model, input.evidence), attention, previous, inkMix, chordPresence,
    scale: input.scale, labelScale: input.labelScale, viewportWidth: input.viewportWidth, viewportHeight: input.viewportHeight,
    freeRect: input.freeRect, nodeScreen: input.nodeScreen, toScreen: input.toScreen, appearOf: input.appearOf, measureText,
    elementLabel: input.elementLabel, hoveredNodeId: input.hoveredNodeId, agentFocusNodeId: input.agentFocusNodeId,
    selectionPulse: input.selectionPulse, hubCount: input.hubCount, disclosure,
  }, pool);
  pushPlacementLine(input, inksOf(input));
  paintDialMarks(input.ctx, pool, input.mapTokens, { now: input.now, reducedMotion: input.reducedMotion, numeralHaloPx: input.dialTokens.numeralHaloPx });

  const labelBoxes: DialFrameResult["labelBoxes"] = [];
  for (const t of pool.texts) if (t.id !== null && LABELLED_ROLES.has(t.role)) labelBoxes.push({ nodeId: t.id, text: t.text, ...t.box });
  const light: DialLightFrame = { attentionKey: attention.key, focused: attention.selected, inkMix, chords: built.chords };
  const result: DialFrameResult = {
    drawnCount: built.drawnCount, tier: built.tier, alphas: built.alphas, picks: built.picks, rows: built.rows,
    labelBoxes, light, inkMix, chordPresence, marks: pool,
  };
  last = { input, result, marks: pool, built, disclosure };
  return result;
}

const LINE_GAP_PX = 6;

function pushPlacementLine(input: DialFrameInput, inks: DialInks): void {
  const view = dialPlacementOf(input.dial);
  const text = dialPlacementLine(view.state, view.progress, input.labels);
  const projectId = input.dial.model.projectId;
  if (text === null || projectId === null) return;
  const hub = input.nodeScreen(projectId) ?? input.toScreen(0, 0);
  let top = hub.y;
  for (const glyph of pool.glyphs) if (glyph.id === projectId) top = Math.max(top, glyph.y + glyph.r);
  for (const t of pool.texts) if (t.role === "project") top = Math.max(top, t.box.maxY);
  const font = scaledLabelFont("element", input.dialTokens.labelScale);
  const size = scaledLabelFontSize("element", input.dialTokens.labelScale);
  const width = measureText(text, font);
  const y = top + LINE_GAP_PX + size / 2;
  pool.texts.push({
    id: null, role: "units", text, x: hub.x, y, align: "center", font, ink: inkIndex(pool, inks.units),
    box: { minX: hub.x - width / 2, maxX: hub.x + width / 2, minY: y - size / 2, maxY: y + size / 2 }, parts: null,
  });
}

export function lastDialFrame(): DialFrameResult | null {
  return last?.result ?? null;
}

export function clearDialFrame(): void {
  last = null;
}

export function dialLightFrame(): DialLightFrame | null {
  return last?.result.light ?? null;
}

function quadAt(ax: number, ay: number, cx: number, cy: number, bx: number, by: number, t: number): Point {
  const u = 1 - t;
  return { x: u * u * ax + 2 * u * t * cx + t * t * bx, y: u * u * ay + 2 * u * t * cy + t * t * by };
}

export function sampleStrips(strips: readonly { ax: number; ay: number; cx: number; cy: number; bx: number; by: number }[]): Point[][] {
  return strips.map((s) => Array.from({ length: CURVE_STEPS + 1 }, (_, k) => quadAt(s.ax, s.ay, s.cx, s.cy, s.bx, s.by, k / CURVE_STEPS)));
}

function segmentCross(a: Point, b: Point, c: Point, d: Point): Point | null {
  const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
  const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
  return t > 0 && t < 1 && u > 0 && u < 1 ? { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) } : null;
}

interface Segment { line: number; a: Point; b: Point }

function bucket(lines: readonly (readonly Point[])[]): { segs: Segment[]; grid: Map<number, number[]> } {
  const segs: Segment[] = [];
  const grid = new Map<number, number[]>();
  lines.forEach((pts, line) => {
    for (let k = 0; k < pts.length - 1; k += 1) {
      const a = pts[k]!;
      const b = pts[k + 1]!;
      const si = segs.length;
      segs.push({ line, a, b });
      for (let gx = Math.floor(Math.min(a.x, b.x) / CELL); gx <= Math.floor(Math.max(a.x, b.x) / CELL); gx += 1) {
        for (let gy = Math.floor(Math.min(a.y, b.y) / CELL); gy <= Math.floor(Math.max(a.y, b.y) / CELL); gy += 1) {
          const key = gx * 100003 + gy;
          const list = grid.get(key);
          if (list) list.push(si);
          else grid.set(key, [si]);
        }
      }
    }
  });
  return { segs, grid };
}

export function countCrossings(lines: readonly (readonly Point[])[], viewportWidth: number, viewportHeight: number): number {
  const { segs, grid } = bucket(lines);
  const ends = lines.map((pts) => [pts[0]!, pts[pts.length - 1]!]);
  const nearEnd = (q: Point, line: number) => ends[line]!.some((e) => Math.hypot(q.x - e.x, q.y - e.y) < END_CLEAR_PX);
  const seen = new Set<string>();
  let crossings = 0;
  for (const list of grid.values()) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const p = segs[list[i]!]!;
        const q = segs[list[j]!]!;
        if (p.line === q.line) continue;
        const pair = list[i]! < list[j]! ? `${list[i]}:${list[j]}` : `${list[j]}:${list[i]}`;
        if (seen.has(pair)) continue;
        seen.add(pair);
        const x = segmentCross(p.a, p.b, q.a, q.b);
        if (!x || x.x < 0 || x.x > viewportWidth || x.y < 0 || x.y > viewportHeight) continue;
        if (nearEnd(x, p.line) || nearEnd(x, q.line)) continue;
        crossings += 1;
      }
    }
  }
  return crossings;
}

function segmentEntersBox(a: Point, b: Point, box: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [pp, qq] of [[-dx, a.x - box.minX], [dx, box.maxX - a.x], [-dy, a.y - box.minY], [dy, box.maxY - a.y]] as const) {
    if (pp === 0) {
      if (qq < 0) return false;
      continue;
    }
    const r = qq / pp;
    if (pp < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return true;
}

export function namesCrossed(lines: readonly (readonly Point[])[], texts: readonly { text: string; box: Box }[]): { count: number; names: string[] } {
  const { segs, grid } = bucket(lines);
  const crossed = new Set<string>();
  for (const t of texts) {
    const box = { minX: t.box.minX + NAME_INSET_PX, maxX: t.box.maxX - NAME_INSET_PX, minY: t.box.minY + NAME_INSET_PX, maxY: t.box.maxY - NAME_INSET_PX };
    const cand = new Set<number>();
    for (let gx = Math.floor(box.minX / CELL); gx <= Math.floor(box.maxX / CELL); gx += 1) {
      for (let gy = Math.floor(box.minY / CELL); gy <= Math.floor(box.maxY / CELL); gy += 1) for (const si of grid.get(gx * 100003 + gy) ?? []) cand.add(si);
    }
    for (const si of cand) {
      const { a, b } = segs[si]!;
      if (segmentEntersBox(a, b, box)) {
        crossed.add(t.text);
        break;
      }
    }
  }
  return { count: crossed.size, names: [...crossed] };
}

function countTextOverlaps(texts: readonly { id: string | null; text: string; box: Box }[]): number {
  const pairs = new Set<string>();
  for (let i = 0; i < texts.length; i += 1) {
    for (let j = i + 1; j < texts.length; j += 1) {
      const a = texts[i]!;
      const b = texts[j]!;
      if (a.text === b.text || (a.id !== null && a.id === b.id)) continue;
      if (a.box.minX < b.box.maxX && a.box.maxX > b.box.minX && a.box.minY < b.box.maxY && a.box.maxY > b.box.minY) pairs.add([a.text, b.text].sort().join("\0"));
    }
  }
  return pairs.size;
}

export function describeLastDialFrame(viewportWidth: number, viewportHeight: number): DialProbe | null {
  if (!last) return null;
  const { input, result, marks, built, disclosure } = last;
  const { scene } = input.dial;
  const widthByKey = new Map<string, number>();
  for (const s of marks.strips) widthByKey.set(s.flowKey, Math.max(widthByKey.get(s.flowKey) ?? 0, s.w0, s.w1));
  const numeralByKey = new Map<string, string>();
  for (const n of marks.numerals) if (!numeralByKey.has(n.flowKey)) numeralByKey.set(n.flowKey, n.text);
  const drawn = new Set(built.flows.drawn);
  const lines = sampleStrips(marks.strips);
  const allTexts = [...marks.texts, ...marks.extraTexts];
  const ledger = built.ledger
    ? { domainId: built.ledger.plan.domainId, shown: built.ledger.plan.rows.length, total: built.ledger.plan.total, more: built.ledger.plan.more?.count ?? 0, leaderCrossings: built.ledger.leaderCrossings }
    : null;
  return {
    owns: true,
    zoomRatio: input.zoomRatio,
    tier: result.tier,
    inkMix: result.inkMix,
    domainAppear: input.domainAppear,
    freeRect: input.freeRect,
    flows: built.flows.links.map((l) => ({
      key: l.key, a: l.u, b: l.v, ab: l.uv, ba: l.vu, total: l.total, relatesOnly: l.relatesOnly,
      drawn: drawn.has(l.key), widthPx: widthByKey.get(l.key) ?? 0, numeral: numeralByKey.get(l.key) ?? null,
    })),
    clusters: scene.clusters.map((c) => ({ domainId: c.domainId, step: c.step, chip: input.toScreen(c.chip.x, c.chip.y), capabilityIds: c.items.filter((it) => !it.direct).map((it) => it.id) })),
    rings: scene.rings,
    disclosure: { capAlpha: disclosure.capAlpha, elementsAlpha: disclosure.elementsAlpha, enteredDomain: disclosure.entered, resolved: disclosure.resolved },
    budget: built.flows.budget,
    stubs: built.flows.stubs,
    placement: { state: dialPlacementOf(input.dial).state, held: dialPlacementOf(input.dial).held },
    texts: allTexts.map((t) => ({ id: t.id, role: t.role, text: t.text, box: t.box })),
    numerals: marks.numerals.map((n) => ({ flowKey: n.flowKey, text: n.text, box: n.box })),
    discs: marks.discs.map((d) => ({ id: d.id, x: d.x, y: d.y, r: d.r })),
    strips: marks.strips.map((s) => ({ flowKey: s.flowKey, role: s.role, ink: marks.inks[s.ink] ?? "" })),
    ledger,
    crossings: countCrossings(lines, viewportWidth, viewportHeight),
    namesCrossed: namesCrossed(lines, allTexts).count,
    textOverlaps: countTextOverlaps(allTexts),
  };
}
