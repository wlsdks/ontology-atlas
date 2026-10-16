import { tierNameAlpha } from "../morph/tier-assembly";
import { scaledLabelFont, scaledLabelFontSize } from "../render/labels";
import { mixOver } from "./ink";
import { dialChipRadiusPx, dialDiscRadiusPx } from "./tokens";
import type { Box, DialAttention, DialCluster, DialEvidenceView, DialLabels, DialMarks, DialModel, DialScene, DialTokens, Point, TextMark } from "./types";

export type MeasureText = (text: string, font: string) => number;

export interface LabelInks {
  project: string;
  domain: string;
  domainReceded: string;
  domainAttended: string;
  units: string;
  stale: string;
  capability: string;
  needs: string;
  usedBy: string;
  orphans: string;
  ring: string;
  element: string;
  halo: string;
}

export interface Circle { x: number; y: number; r: number }

export interface ExtraTextMark extends Omit<TextMark, "role"> { role: "ring" | "element"; halo: number | null }

export interface LabelMarksOut extends Pick<DialMarks, "texts"> { extraTexts: ExtraTextMark[] }

export interface DomainLabelBlock {
  domainId: string;
  lines: string[];
  units: string | null;
  stale: string | null;
  nameFont: string;
  nameFontPx: number;
  unitsFont: string;
  unitsFontPx: number;
  lineGap: number;
  lineWidths: number[];
  unitsWidth: number;
  width: number;
  height: number;
}

export interface LabelMarksInput {
  model: DialModel;
  scene: DialScene;
  labels: DialLabels | null;
  evidence: DialEvidenceView | null;
  attention: DialAttention;
  tokens: DialTokens;
  inks: LabelInks;
  ink(color: string): number;
  measureText: MeasureText;
  scale: number;
  toScreen(x: number, y: number): Point;
  hub: Circle | null;
  chips: ReadonlyMap<string, Circle>;
  discs: ReadonlyMap<string, Circle>;
  capAlpha: number;
  lines: readonly (readonly Point[])[];
  occupied: Box[];
  freeRect: Box;
  ledgerIds: ReadonlySet<string>;
  elementLabel(id: string): string | null;
  hubRest?: Circle | null;
  hubLines?: readonly (string | null)[];
}

const SIDE_COS = 0.4;
const SHOWN_ALPHA = 0.02;
const CAPS_DRAWN_ALPHA = 0.02;
const NAME_GAP_PX = 5;
const DISC_GAP_PX = 4;
const HUB_CLEAR_PX = 14;
const NAME_STEPS_PX = [0, 9, 18];
const HUB_NAME_STEPS_PX = [...NAME_STEPS_PX, 27, 36];
const REST_REACH_PX = 48;
const RING_OFFSETS = [0, 0.18, -0.18, 0.36, -0.36, 0.6, -0.6, 0.9, -0.9];
const CIRCLE_SLOTS = 36;
const RING_TRIES = [
  ...RING_OFFSETS,
  ...Array.from({ length: CIRCLE_SLOTS }, (_, i) => ((i + 1) * 2 * Math.PI) / CIRCLE_SLOTS - Math.PI).sort((a, b) => Math.abs(a) - Math.abs(b) || a - b),
];

export function overlaps(a: Box, b: Box): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

function inside(box: Box, rect: Box): boolean {
  return box.minX >= rect.minX && box.maxX <= rect.maxX && box.minY >= rect.minY && box.maxY <= rect.maxY;
}

function union(boxes: readonly Box[]): Box {
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
}

function circleBox(c: Circle, pad: number): Box {
  return { minX: c.x - c.r - pad, maxX: c.x + c.r + pad, minY: c.y - c.r - pad, maxY: c.y + c.r + pad };
}

function textBox(width: number, x: number, y: number, align: CanvasTextAlign, fontPx: number, pad: number): Box {
  const minX = align === "center" ? x - width / 2 : align === "right" || align === "end" ? x - width : x;
  return { minX: minX - pad, maxX: minX + width + pad, minY: y - fontPx * 0.62 - pad, maxY: y + fontPx * 0.62 + pad };
}

export function sideOf(angle: number): CanvasTextAlign {
  const cos = Math.cos(angle);
  return cos > SIDE_COS ? "left" : cos < -SIDE_COS ? "right" : "center";
}

export function crossesBox(lines: readonly (readonly Point[])[], box: Box): boolean {
  const b = { minX: box.minX + 1, maxX: box.maxX - 1, minY: box.minY + 1, maxY: box.maxY - 1 };
  for (const pts of lines) {
    for (let k = 0; k < pts.length - 1; k += 1) {
      const p = pts[k]!;
      const q = pts[k + 1]!;
      if (Math.max(p.x, q.x) < b.minX || Math.min(p.x, q.x) > b.maxX || Math.max(p.y, q.y) < b.minY || Math.min(p.y, q.y) > b.maxY) continue;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      let t0 = 0;
      let t1 = 1;
      let hit = true;
      for (const [pp, qq] of [[-dx, p.x - b.minX], [dx, b.maxX - p.x], [-dy, p.y - b.minY], [dy, b.maxY - p.y]] as const) {
        if (pp === 0) {
          if (qq < 0) hit = false;
          continue;
        }
        const r = qq / pp;
        if (pp < 0) {
          if (r > t1) hit = false;
          else if (r > t0) t0 = r;
        } else if (r < t0) hit = false;
        else if (r < t1) t1 = r;
      }
      if (hit) return true;
    }
  }
  return false;
}

export function wrapDialName(text: string, maxPx: number, font: string, measure: MeasureText): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1 || measure(text.trim(), font) <= maxPx) return [words.join(" ")];
  let first = words[0]!;
  let k = 1;
  while (k < words.length - 1 && measure(`${first} ${words[k]}`, font) <= maxPx) {
    first = `${first} ${words[k]}`;
    k += 1;
  }
  return [first, words.slice(k).join(" ")];
}

export function domainLabelBlock(
  domainId: string,
  model: DialModel,
  labels: DialLabels | null,
  evidence: DialEvidenceView | null,
  measure: MeasureText,
  tokens: DialTokens,
): DomainLabelBlock {
  const domain = model.domainById.get(domainId);
  const ls = tokens.labelScale;
  const nameFont = scaledLabelFont("domain", ls);
  const nameFontPx = scaledLabelFontSize("domain", ls);
  const unitsFont = scaledLabelFont("element", ls);
  const unitsFontPx = scaledLabelFontSize("element", ls);
  const lines = wrapDialName(domain?.label ?? domainId, tokens.nameMaxPx, nameFont, measure);
  const units = labels && domain ? labels.units(domain.capabilityIds.length, domain.elementCount) : null;
  const staleCount = evidence?.measured ? evidence.staleByDomain.get(domainId) ?? 0 : 0;
  const stale = labels && units !== null && staleCount > 0 ? ` · ${labels.stale(staleCount)}` : null;
  const lineWidths = lines.map((line) => measure(line, nameFont));
  const unitsWidth = units === null ? 0 : measure(units + (stale ?? ""), unitsFont);
  const lineGap = nameFontPx * 1.25;
  return {
    domainId,
    lines,
    units,
    stale,
    nameFont,
    nameFontPx,
    unitsFont,
    unitsFontPx,
    lineGap,
    lineWidths,
    unitsWidth,
    width: Math.max(unitsWidth, ...lineWidths),
    height: lineGap * (lines.length + (units === null ? 0 : 1)),
  };
}

interface PlacedBlock {
  block: DomainLabelBlock;
  align: CanvasTextAlign;
  x: number;
  lineYs: number[];
  lineBoxes: Box[];
  unitsY: number;
  unitsBox: Box | null;
  nameBox: Box;
  box: Box;
}

function placeBlock(block: DomainLabelBlock, angle: number, ax: number, ay: number): PlacedBlock {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const align: CanvasTextAlign = cos > SIDE_COS ? "left" : cos < -SIDE_COS ? "right" : "center";
  const h = block.height;
  const top = sin > SIDE_COS ? ay : sin < -SIDE_COS ? ay - h : ay - h / 2;
  const lineYs = block.lines.map((_, i) => top + block.lineGap * (i + 0.5));
  const lineBoxes = block.lines.map((_, i) => textBox(block.lineWidths[i]!, ax, lineYs[i]!, align, block.nameFontPx, 2));
  const unitsY = top + block.lineGap * (block.lines.length + 0.5);
  const unitsBox = block.units === null ? null : textBox(block.unitsWidth, ax, unitsY, align, block.unitsFontPx, 2);
  const nameBox = union(lineBoxes);
  return { block, align, x: ax, lineYs, lineBoxes, unitsY, unitsBox, nameBox, box: unitsBox ? union([nameBox, unitsBox]) : nameBox };
}

function nameCandidates(outward: number): number[] {
  return [outward, Math.PI / 2, 0, Math.PI, -Math.PI / 2, outward + Math.PI / 4, outward - Math.PI / 4];
}

const BETWEEN_STRANDS = Array.from({ length: 16 }, (_, i) => ((i + 1) * Math.PI) / 8);

function receded(attn: DialAttention, domainId: string): boolean {
  return attn.domainId !== null && attn.domainId !== domainId && !attn.partnerDomains.has(domainId);
}

interface Rest {
  chips: Map<string, Circle>;
  discs: Map<string, Circle>;
  alpha: Map<string, number>;
  away: Set<string>;
}

function travelled(cur: Point, from: Point, end: Point, endFrom: Point): number {
  const dx = end.x - endFrom.x;
  const dy = end.y - endFrom.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return 1;
  const t = ((cur.x - from.x) * dx + (cur.y - from.y) * dy) / len2;
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

function nameAlpha(grown: number, moved: number): number {
  return tierNameAlpha(Math.min(grown, moved));
}

function restOf(input: LabelMarksInput): Rest {
  const { scene, tokens } = input;
  const centre = input.hub ?? input.toScreen(0, 0);
  const maxItems = Math.max(1, ...scene.clusters.map((c) => c.items.length));
  const capsDrawn = input.capAlpha > CAPS_DRAWN_ALPHA;
  const f = input.freeRect;
  const rest: Rest = { chips: new Map(), discs: new Map(), alpha: new Map(), away: new Set() };
  for (const c of scene.clusters) {
    const end = input.toScreen(c.chip.x, c.chip.y);
    const r = dialChipRadiusPx(tokens, c.items.length, maxItems);
    rest.chips.set(c.domainId, { x: end.x, y: end.y, r });
    const cur = input.chips.get(c.domainId);
    const grown = cur ? Math.min(1, cur.r / Math.max(1e-6, r)) : 0;
    const moved = cur ? travelled(cur, centre, end, centre) : 0;
    rest.alpha.set(c.domainId, nameAlpha(grown, moved));
    const reach = c.footprint * input.scale + REST_REACH_PX;
    if (end.x + reach < f.minX || end.x - reach > f.maxX || end.y + reach < f.minY || end.y - reach > f.maxY) rest.away.add(c.domainId);
    if (!capsDrawn || rest.away.has(c.domainId)) continue;
    for (const it of c.items) {
      const p = input.toScreen(it.x, it.y);
      const d = input.discs.get(it.id);
      if (!d && grown > 0) continue;
      rest.discs.set(it.id, { x: p.x, y: p.y, r: d && grown > 0 ? d.r / grown : dialDiscRadiusPx(tokens, input.scale, it.elementIds.length) });
      rest.alpha.set(it.id, d && cur ? nameAlpha(grown, Math.min(moved, travelled(d, cur, p, end))) : 0);
    }
  }
  return rest;
}

const holds = new WeakMap<DialScene, { key: string; picks: Map<string, number> }>();

function holdOf(input: LabelMarksInput): Map<string, number> {
  const o = input.toScreen(0, 0);
  const f = input.freeRect;
  const caps = input.capAlpha > 0.5 ? 2 : input.capAlpha > 0.3 ? 1 : 0;
  const key = `${[o.x, o.y, input.scale * 1000, f.minX, f.minY, f.maxX, f.maxY].map(Math.round).join(",")}|${input.attention.key}|${caps}|${input.ledgerIds.size}|${input.labels ? 1 : 0}`;
  let hold = holds.get(input.scene);
  if (!hold || hold.key !== key) {
    hold = { key, picks: new Map() };
    holds.set(input.scene, hold);
  }
  return hold.picks;
}

interface Ctx {
  input: LabelMarksInput;
  out: LabelMarksOut;
  texts: Box[];
  marks: Box[];
  rest: Rest;
  held: Map<string, number>;
}

function fade(ctx: Ctx, color: string, alpha: number): number {
  return ctx.input.ink(alpha >= 1 ? color : mixOver(color, ctx.input.inks.halo, alpha));
}

function pickOnce<T>(ctx: Ctx, key: string, tries: readonly T[], ok: (t: T) => boolean): number {
  const kept = ctx.held.get(key);
  if (kept !== undefined && kept < tries.length && ok(tries[kept]!)) return kept;
  return tries.findIndex(ok);
}

function free(ctx: Ctx, box: Box): boolean {
  return inside(box, ctx.input.freeRect) && !ctx.texts.some((o) => overlaps(o, box)) && !ctx.marks.some((o) => overlaps(o, box));
}

function claim(ctx: Ctx, box: Box): void {
  ctx.texts.push(box);
  ctx.input.occupied.push(box);
}

function projectName(ctx: Ctx): void {
  const { input } = ctx;
  const { model } = input;
  const hub = input.hubRest ?? input.hub;
  if (!hub) return;
  if (!model.projectId || !model.projectLabel) return hubCaptions(ctx, hub, null);
  const ls = input.tokens.labelScale;
  const font = scaledLabelFont("project", ls);
  const fontPx = scaledLabelFontSize("project", ls);
  const width = input.measureText(model.projectLabel, font);
  const gap = fontPx * 0.95;
  const around: [number, number, CanvasTextAlign][] = [
    ...NAME_STEPS_PX.flatMap((step): [number, number, CanvasTextAlign][] => [
      [hub.x, hub.y + hub.r + gap + step, "center"],
      [hub.x, hub.y - hub.r - gap - step, "center"],
      [hub.x + hub.r + 6 + step, hub.y, "left"],
      [hub.x - hub.r - 6 - step, hub.y, "right"],
    ]),
    ...HUB_NAME_STEPS_PX.flatMap((step) => BETWEEN_STRANDS.map((a): [number, number, CanvasTextAlign] => {
      const c = Math.cos(a);
      const r = hub.r + step + (Math.abs(c) > SIDE_COS ? 6 : gap);
      return [hub.x + c * r, hub.y + Math.sin(a) * (hub.r + gap + step), c > SIDE_COS ? "left" : c < -SIDE_COS ? "right" : "center"];
    })),
  ];
  const atRest = [circleBox(hub, 3), ...[...ctx.rest.chips.values()].map((c) => circleBox(c, 2)), ...[...ctx.rest.discs.values()].map((d) => circleBox(d, 1))];
  const clear = (box: Box) => inside(box, input.freeRect) && !ctx.texts.some((o) => overlaps(o, box)) && !atRest.some((o) => overlaps(o, box));
  const under = around.findIndex(([x, y, align]) => align === "center" && y > hub.y && clear(textBox(width, x, y, align, fontPx, 3)));
  const tries = under < 0 ? around : [around[under]!, ...around.filter((_, i) => i !== under)];
  const boxes = tries.map(([x, y, align]) => textBox(width, x, y, align, fontPx, 3));
  hubCaptions(ctx, hub, under < 0 ? null : boxes[0]!);
  const pick = pickOnce(ctx, "project", boxes, (box) => clear(box) && !crossesBox(input.lines, box));
  if (pick < 0) return;
  const [x, y, align] = tries[pick]!;
  const box = boxes[pick]!;
  claim(ctx, box);
  const alpha = Math.min(1, ...[...ctx.rest.chips].filter(([, c]) => inside(circleBox(c, 0), input.freeRect)).map(([id]) => ctx.rest.alpha.get(id) ?? 0));
  if (!(alpha > SHOWN_ALPHA)) return;
  ctx.out.texts.push({ id: model.projectId, role: "project", text: model.projectLabel, x, y, align, font, ink: fade(ctx, input.inks.project, alpha), box, parts: null });
  ctx.held.set("project", pick);
}

const HUB_LINE_GAP_PX = 6;

function hubCaptions(ctx: Ctx, hub: Circle, name: Box | null): void {
  const texts = ctx.input.hubLines ?? [];
  const ls = ctx.input.tokens.labelScale;
  const font = scaledLabelFont("element", ls);
  const size = scaledLabelFontSize("element", ls);
  let top = Math.max(hub.y + hub.r, name?.maxY ?? -Infinity);
  for (const text of texts) {
    if (text === null) continue;
    const half = ctx.input.measureText(text, font) / 2;
    let y = top + HUB_LINE_GAP_PX + size / 2;
    let box = { minX: hub.x - half, maxX: hub.x + half, minY: y - size / 2, maxY: y + size / 2 };
    for (let k = 0; k < 4 && ctx.texts.some((o) => overlaps(o, box)); k += 1) {
      y += size + HUB_LINE_GAP_PX;
      box = { ...box, minY: y - size / 2, maxY: y + size / 2 };
    }
    ctx.out.texts.push({ id: null, role: "units", text, x: hub.x, y, align: "center", font, ink: ctx.input.ink(ctx.input.inks.units), box, parts: null });
    claim(ctx, box);
    top = box.maxY;
  }
}

function clusterOrder(input: LabelMarksInput): DialCluster[] {
  const attended = input.attention.domainId;
  return [...input.scene.clusters]
    .sort((x, y) => Number(y.domainId === attended) - Number(x.domainId === attended) || x.step - y.step || y.items.length - x.items.length || (x.domainId < y.domainId ? -1 : 1));
}

function nameReach(ctx: Ctx, cluster: DialCluster, chip: Circle): number {
  let reach = chip.r + NAME_GAP_PX;
  if (ctx.input.capAlpha <= 0.3) return reach;
  for (const item of cluster.items) {
    const d = ctx.rest.discs.get(item.id);
    if (d) reach = Math.max(reach, Math.hypot(d.x - chip.x, d.y - chip.y) + d.r + DISC_GAP_PX);
  }
  return reach;
}

function domainNames(ctx: Ctx): void {
  const { input } = ctx;
  const { attention: attn, inks } = input;
  const centre = input.hub ?? input.toScreen(0, 0);
  for (const cluster of clusterOrder(input)) {
    const id = cluster.domainId;
    if (ctx.rest.away.has(id)) continue;
    const chip = ctx.rest.chips.get(id)!;
    const block = domainLabelBlock(id, input.model, input.labels, input.evidence, input.measureText, input.tokens);
    const reach = nameReach(ctx, cluster, chip);
    const angles = nameCandidates(Math.atan2(chip.y - centre.y, chip.x - centre.x));
    const chipInside = inside({ minX: chip.x - chip.r, minY: chip.y - chip.r, maxX: chip.x + chip.r, maxY: chip.y + chip.r }, input.freeRect);
    const around = (as: readonly number[]) => NAME_STEPS_PX.flatMap((step) => as.map((a) => placeBlock(block, a, chip.x + Math.cos(a) * (reach + step), chip.y + Math.sin(a) * (reach + step))));
    const tries = [
      ...around(angles).flatMap((plan) => [{ plan, units: true, between: false }, { plan, units: false, between: false }]),
      ...around(BETWEEN_STRANDS.map((a) => angles[0]! + a)).map((plan) => ({ plan, units: false, between: true })),
    ];
    let pick = -1;
    for (let pass = 0; pass < (chipInside ? 3 : 2) && pick < 0; pass += 1) {
      pick = pickOnce(ctx, `domain:${id}`, tries, (t) =>
        pass === 0 ? t.units && t.plan.unitsBox !== null && free(ctx, t.plan.box) && !crossesBox(input.lines, t.plan.box)
        : !t.units && (pass === 1 || !t.between) && free(ctx, t.plan.nameBox) && (pass === 2 || !crossesBox(input.lines, t.plan.nameBox)));
    }
    if (pick < 0) continue;
    const { plan, units } = tries[pick]!;
    const withUnits = units && plan.unitsBox !== null && plan.block.units !== null;
    const alpha = ctx.rest.alpha.get(id) ?? 0;
    const shown = alpha > SHOWN_ALPHA && input.chips.has(id);
    claim(ctx, plan.nameBox);
    if (withUnits) claim(ctx, plan.unitsBox!);
    if (!shown) continue;
    ctx.held.set(`domain:${id}`, pick);
    const dim = receded(attn, id);
    const nameInk = fade(ctx, dim ? inks.domainReceded : attn.domainId === id ? inks.domainAttended : inks.domain, alpha);
    plan.block.lines.forEach((line, i) => {
      ctx.out.texts.push({ id, role: "domain", text: line, x: plan.x, y: plan.lineYs[i]!, align: plan.align, font: plan.block.nameFont, ink: nameInk, box: plan.lineBoxes[i]!, parts: null });
    });
    if (!withUnits) continue;
    const unitsInk = fade(ctx, dim ? inks.domainReceded : inks.units, alpha);
    const parts = plan.block.stale
      ? [{ text: plan.block.units!, ink: unitsInk }, { text: plan.block.stale, ink: fade(ctx, dim ? inks.domainReceded : inks.stale, alpha) }]
      : null;
    ctx.out.texts.push({ id, role: "units", text: plan.block.units + (plan.block.stale ?? ""), x: plan.x, y: plan.unitsY, align: plan.align, font: plan.block.unitsFont, ink: unitsInk, box: plan.unitsBox!, parts });
  }
}

function ringLabels(ctx: Ctx): void {
  const { input } = ctx;
  const { labels, scene } = input;
  if (!labels || scene.rings.length === 0) return;
  const ls = input.tokens.labelScale;
  const font = scaledLabelFont("element", ls);
  const fontPx = scaledLabelFontSize("element", ls);
  const centre = input.toScreen(0, 0);
  for (const ring of scene.rings) {
    const text = labels.ring(ring.min, ring.max);
    const width = input.measureText(text, font);
    const tries = RING_TRIES.map((da) => {
      const a = scene.axisAngle + da;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const align: CanvasTextAlign = ca < -0.3 ? "right" : ca > 0.3 ? "left" : "center";
      const x = centre.x + ca * ring.radius * input.scale + (align === "right" ? -4 : align === "left" ? 4 : 0);
      const y = centre.y + sa * ring.radius * input.scale - fontPx * 0.9;
      return { x, y, align, box: textBox(width, x, y, align, fontPx, 2) };
    });
    const key = `ring:${ring.step}`;
    const pick = pickOnce(ctx, key, tries, (t) => free(ctx, t.box) && !crossesBox(input.lines, t.box));
    if (pick < 0) continue;
    const { x, y, align, box } = tries[pick]!;
    ctx.out.extraTexts.push({ id: null, role: "ring", text, x, y, align, font, ink: input.ink(input.inks.ring), box, parts: null, halo: input.ink(input.inks.halo) });
    ctx.held.set(key, pick);
    claim(ctx, box);
  }
}

function orphanCaption(ctx: Ctx): void {
  const { input } = ctx;
  const { scene, labels } = input;
  if (!labels || scene.orphans.ids.length === 0) return;
  const ls = input.tokens.labelScale;
  const font = scaledLabelFont("element", ls);
  const fontPx = scaledLabelFontSize("element", ls);
  const c = input.toScreen(scene.orphans.centre.x, scene.orphans.centre.y);
  const rr = Math.max(4, scene.orphans.radius * input.scale);
  const text = labels.orphans(scene.orphans.ids.length);
  const width = input.measureText(text, font);
  const tries: [number, number, CanvasTextAlign][] = [[c.x + rr + 8, c.y, "left"], [c.x - rr - 8, c.y, "right"], [c.x, c.y + rr + fontPx, "center"], [c.x, c.y - rr - fontPx, "center"]];
  const boxes = tries.map(([x, y, align]) => textBox(width, x, y, align, fontPx, 2));
  const pick = pickOnce(ctx, "orphans", boxes, (box) => free(ctx, box));
  if (pick < 0) return;
  const [x, y, align] = tries[pick]!;
  ctx.out.texts.push({ id: null, role: "orphans", text, x, y, align, font, ink: input.ink(input.inks.orphans), box: boxes[pick]!, parts: null });
  ctx.held.set("orphans", pick);
  claim(ctx, boxes[pick]!);
}

export interface NameTry { x: number; y: number; align: CanvasTextAlign; box: Box }

export function capabilityNameTries(d: Circle, width: number, fontPx: number): NameTry[] {
  const tries: [number, number, CanvasTextAlign][] = [
    [d.x + d.r + 4, d.y, "left"],
    [d.x - d.r - 4, d.y, "right"],
    [d.x, d.y + d.r + fontPx * 0.75, "center"],
    [d.x, d.y - d.r - fontPx * 0.75, "center"],
  ];
  return tries.map(([x, y, align]) => ({ x, y, align, box: textBox(width, x, y, align, fontPx, 1.5) }));
}

function capabilityNames(ctx: Ctx): void {
  const { input } = ctx;
  const { attention: attn, inks, model } = input;
  if (input.capAlpha <= 0.5) return;
  const egoOnly = input.tokens.pitch * input.scale < input.tokens.capName;
  if (egoOnly && attn.capabilityId === null) return;
  const ls = input.tokens.labelScale;
  const font = scaledLabelFont("capability", ls);
  const fontPx = scaledLabelFontSize("capability", ls);
  const items: { id: string; disc: Circle; prio: number }[] = [];
  for (const cluster of input.scene.clusters) {
    const own = attn.domainId === cluster.domainId && attn.capabilityId === null;
    for (const item of cluster.items) {
      if (item.direct || input.ledgerIds.has(item.id)) continue;
      const disc = ctx.rest.discs.get(item.id);
      if (!disc || !model.capabilityById.has(item.id)) continue;
      const lit = attn.capabilityId === item.id || attn.needsCaps.has(item.id) || attn.usedByCaps.has(item.id) || attn.relatesCaps.has(item.id);
      if ((attn.domainId && !own && !lit) || (egoOnly && !lit)) continue;
      items.push({ id: item.id, disc, prio: (lit ? 1000 : 0) + (own ? 500 : 0) + item.elementIds.length });
    }
  }
  items.sort((x, y) => y.prio - x.prio || (x.id < y.id ? -1 : 1));
  for (const { id, disc: d } of items) {
    const label = model.capabilityById.get(id)!.label;
    const tries = capabilityNameTries(d, input.measureText(label, font), fontPx);
    const index = pickOnce(ctx, `cap:${id}`, tries, (t) => free(ctx, t.box) && !crossesBox(input.lines, t.box));
    if (index < 0) continue;
    const pick = tries[index]!;
    claim(ctx, pick.box);
    const alpha = ctx.rest.alpha.get(id) ?? 0;
    if (!(alpha > SHOWN_ALPHA) || !input.discs.has(id)) continue;
    ctx.held.set(`cap:${id}`, index);
    const ink = fade(ctx, attn.needsCaps.has(id) ? inks.needs : attn.usedByCaps.has(id) ? inks.usedBy : inks.capability, alpha);
    ctx.out.texts.push({ id, role: "capability", text: label, x: pick.x, y: pick.y, align: pick.align, font, ink, box: pick.box, parts: null });
  }
}

function elementNames(ctx: Ctx): void {
  const { input } = ctx;
  if (input.capAlpha <= 0.5) return;
  const ls = input.tokens.labelScale;
  const font = scaledLabelFont("element", ls);
  const fontPx = scaledLabelFontSize("element", ls);
  for (const cluster of input.scene.clusters) {
    if (!input.chips.has(cluster.domainId) || (ctx.rest.alpha.get(cluster.domainId) ?? 0) < 1) continue;
    if (input.attention.domainId && input.attention.domainId !== cluster.domainId) continue;
    for (const item of cluster.items) {
      if (item.elementPitch * input.scale < input.tokens.elementName) continue;
      for (const id of item.elementIds) {
        const p = input.scene.positions.get(id);
        const label = input.elementLabel(id);
        if (!p || !label) continue;
        const sp = input.toScreen(p.x, p.y);
        const box = textBox(input.measureText(label, font), sp.x + 5, sp.y, "left", fontPx, 1.5);
        if (!free(ctx, box)) continue;
        ctx.out.extraTexts.push({ id, role: "element", text: label, x: sp.x + 5, y: sp.y, align: "left", font, ink: input.ink(input.inks.element), box, parts: null, halo: null });
        claim(ctx, box);
      }
    }
  }
}

export function buildLabelMarks(input: LabelMarksInput, out: LabelMarksOut): void {
  const rest = restOf(input);
  const marks: Box[] = [...input.occupied];
  if (input.hub) marks.push(circleBox(input.hub, 3));
  for (const c of rest.chips.values()) marks.push(circleBox(c, 2));
  for (const d of rest.discs.values()) marks.push(circleBox(d, 1));
  const ctx: Ctx = { input, out, texts: [], marks, rest, held: holdOf(input) };
  projectName(ctx);
  if (input.hub) marks.push(circleBox(input.hub, HUB_CLEAR_PX));
  domainNames(ctx);
  ringLabels(ctx);
  orphanCaption(ctx);
  capabilityNames(ctx);
  elementNames(ctx);
}
