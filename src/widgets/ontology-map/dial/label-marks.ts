import { scaledLabelFont, scaledLabelFontSize } from "../render/labels";
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
}

const SIDE_COS = 0.4;
const NAME_GAP_PX = 5;
const DISC_GAP_PX = 4;
const HUB_CLEAR_PX = 14;
const NAME_STEPS_PX = [0, 9, 18];
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

function receded(attn: DialAttention, domainId: string): boolean {
  return attn.domainId !== null && attn.domainId !== domainId && !attn.partnerDomains.has(domainId);
}

interface Ctx {
  input: LabelMarksInput;
  out: LabelMarksOut;
  texts: Box[];
  marks: Box[];
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
  const hub = input.hub;
  if (!model.projectId || !model.projectLabel || !hub) return;
  const ls = input.tokens.labelScale * 0.9;
  const font = scaledLabelFont("project", ls);
  const fontPx = scaledLabelFontSize("project", ls);
  const width = input.measureText(model.projectLabel, font);
  const gap = fontPx * 0.95;
  const tries: [number, number, CanvasTextAlign][] = NAME_STEPS_PX.flatMap((step): [number, number, CanvasTextAlign][] => [
    [hub.x, hub.y + hub.r + gap + step, "center"],
    [hub.x, hub.y - hub.r - gap - step, "center"],
    [hub.x + hub.r + 6 + step, hub.y, "left"],
    [hub.x - hub.r - 6 - step, hub.y, "right"],
  ]);
  const boxes = tries.map(([x, y, align]) => textBox(width, x, y, align, fontPx, 3));
  const pick = boxes.findIndex((box) => free(ctx, box) && !crossesBox(input.lines, box));
  if (pick < 0) return;
  const [x, y, align] = tries[pick]!;
  const box = boxes[pick]!;
  ctx.out.texts.push({ id: model.projectId, role: "project", text: model.projectLabel, x, y, align, font, ink: input.ink(input.inks.project), box, parts: null });
  claim(ctx, box);
}

function clusterOrder(input: LabelMarksInput): DialCluster[] {
  const attended = input.attention.domainId;
  return input.scene.clusters
    .filter((c) => input.chips.has(c.domainId))
    .sort((x, y) => Number(y.domainId === attended) - Number(x.domainId === attended) || x.step - y.step || y.items.length - x.items.length || (x.domainId < y.domainId ? -1 : 1));
}

function nameReach(input: LabelMarksInput, cluster: DialCluster, chip: Circle): number {
  let reach = chip.r + NAME_GAP_PX;
  if (input.capAlpha <= 0.3) return reach;
  for (const item of cluster.items) {
    const d = input.discs.get(item.id);
    if (d) reach = Math.max(reach, Math.hypot(d.x - chip.x, d.y - chip.y) + d.r + DISC_GAP_PX);
  }
  return reach;
}

function domainNames(ctx: Ctx): void {
  const { input } = ctx;
  const { attention: attn, inks } = input;
  const centre = input.hub ?? input.toScreen(0, 0);
  for (const cluster of clusterOrder(input)) {
    const chip = input.chips.get(cluster.domainId)!;
    const block = domainLabelBlock(cluster.domainId, input.model, input.labels, input.evidence, input.measureText, input.tokens);
    const reach = nameReach(input, cluster, chip);
    const angles = nameCandidates(Math.atan2(chip.y - centre.y, chip.x - centre.x));
    const plans = NAME_STEPS_PX.flatMap((step) => angles.map((a) => placeBlock(block, a, chip.x + Math.cos(a) * (reach + step), chip.y + Math.sin(a) * (reach + step))));
    let chosen: PlacedBlock | null = null;
    let withUnits = false;
    for (let pass = 0; pass < 3 && !chosen; pass += 1) {
      for (const plan of plans) {
        if (pass === 0 && plan.unitsBox && free(ctx, plan.box) && !crossesBox(input.lines, plan.box)) {
          chosen = plan;
          withUnits = true;
        } else if (pass === 1 && free(ctx, plan.nameBox) && !crossesBox(input.lines, plan.nameBox)) chosen = plan;
        else if (pass === 2 && free(ctx, plan.nameBox)) chosen = plan;
        if (chosen) break;
      }
    }
    if (!chosen) continue;
    const id = cluster.domainId;
    const dim = receded(attn, id);
    const nameInk = input.ink(dim ? inks.domainReceded : attn.domainId === id ? inks.domainAttended : inks.domain);
    const plan = chosen;
    plan.block.lines.forEach((line, i) => {
      ctx.out.texts.push({ id, role: "domain", text: line, x: plan.x, y: plan.lineYs[i]!, align: plan.align, font: plan.block.nameFont, ink: nameInk, box: plan.lineBoxes[i]!, parts: null });
    });
    claim(ctx, plan.nameBox);
    if (!withUnits || !plan.unitsBox || plan.block.units === null) continue;
    const unitsInk = input.ink(dim ? inks.domainReceded : inks.units);
    const parts = plan.block.stale
      ? [{ text: plan.block.units, ink: unitsInk }, { text: plan.block.stale, ink: input.ink(dim ? inks.domainReceded : inks.stale) }]
      : null;
    ctx.out.texts.push({ id, role: "units", text: plan.block.units + (plan.block.stale ?? ""), x: plan.x, y: plan.unitsY, align: plan.align, font: plan.block.unitsFont, ink: unitsInk, box: plan.unitsBox, parts });
    claim(ctx, plan.unitsBox);
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
    for (const da of RING_TRIES) {
      const a = scene.axisAngle + da;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const align: CanvasTextAlign = ca < -0.3 ? "right" : ca > 0.3 ? "left" : "center";
      const x = centre.x + ca * ring.radius * input.scale + (align === "right" ? -4 : align === "left" ? 4 : 0);
      const y = centre.y + sa * ring.radius * input.scale - fontPx * 0.9;
      const box = textBox(width, x, y, align, fontPx, 2);
      if (!free(ctx, box) || crossesBox(input.lines, box)) continue;
      ctx.out.extraTexts.push({ id: null, role: "ring", text, x, y, align, font, ink: input.ink(input.inks.ring), box, parts: null, halo: input.ink(input.inks.halo) });
      claim(ctx, box);
      break;
    }
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
  for (const [x, y, align] of tries) {
    const box = textBox(width, x, y, align, fontPx, 2);
    if (!free(ctx, box)) continue;
    ctx.out.texts.push({ id: null, role: "orphans", text, x, y, align, font, ink: input.ink(input.inks.orphans), box, parts: null });
    claim(ctx, box);
    return;
  }
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
    if (!input.chips.has(cluster.domainId)) continue;
    const own = attn.domainId === cluster.domainId && attn.capabilityId === null;
    for (const item of cluster.items) {
      if (item.direct || input.ledgerIds.has(item.id)) continue;
      const disc = input.discs.get(item.id);
      if (!disc || !model.capabilityById.has(item.id)) continue;
      const lit = attn.capabilityId === item.id || attn.needsCaps.has(item.id) || attn.usedByCaps.has(item.id) || attn.relatesCaps.has(item.id);
      if ((attn.domainId && !own && !lit) || (egoOnly && !lit)) continue;
      items.push({ id: item.id, disc, prio: (lit ? 1000 : 0) + (own ? 500 : 0) + item.elementIds.length });
    }
  }
  items.sort((x, y) => y.prio - x.prio || (x.id < y.id ? -1 : 1));
  for (const { id, disc: d } of items) {
    const label = model.capabilityById.get(id)!.label;
    const pick = capabilityNameTries(d, input.measureText(label, font), fontPx).find((t) => free(ctx, t.box) && !crossesBox(input.lines, t.box));
    if (!pick) continue;
    const ink = input.ink(attn.needsCaps.has(id) ? inks.needs : attn.usedByCaps.has(id) ? inks.usedBy : inks.capability);
    ctx.out.texts.push({ id, role: "capability", text: label, x: pick.x, y: pick.y, align: pick.align, font, ink, box: pick.box, parts: null });
    claim(ctx, pick.box);
  }
}

function elementNames(ctx: Ctx): void {
  const { input } = ctx;
  if (input.capAlpha <= 0.5) return;
  const ls = input.tokens.labelScale;
  const font = scaledLabelFont("element", ls);
  const fontPx = scaledLabelFontSize("element", ls);
  for (const cluster of input.scene.clusters) {
    if (!input.chips.has(cluster.domainId)) continue;
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
  const marks: Box[] = [...input.occupied];
  if (input.hub) marks.push(circleBox(input.hub, 1));
  for (const c of input.chips.values()) marks.push(circleBox(c, 1));
  for (const d of input.discs.values()) marks.push(circleBox(d, 1));
  const ctx: Ctx = { input, out, texts: [], marks };
  projectName(ctx);
  if (input.hub) marks.push(circleBox(input.hub, HUB_CLEAR_PX));
  domainNames(ctx);
  ringLabels(ctx);
  orphanCaption(ctx);
  capabilityNames(ctx);
  elementNames(ctx);
}
