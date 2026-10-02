import { scaledLabelFont, scaledLabelFontSize } from "../render/labels";
import type { Box, DialAttention, DialEvidenceView, DialLabels, DialMarks, DialModel, DialScene, DialSector, DialTokens, Point, TextMark } from "./types";

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
}

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
  labelScale: number;
  scale: number;
  zoomRatio: number;
  nodeScreen(id: string): Point | null;
  toScreen(x: number, y: number): Point;
  chipRadiusPx: number;
  hubRadiusPx: number;
  discRadiusPx: number;
  petalBoxes: readonly Box[];
  occupied: Box[];
  freeRect: Box;
  ledgerIds: ReadonlySet<string>;
}

const NAME_STEPS = 8;
const NAME_STEP_PX = 9;
const NAME_CLEARANCE_PX = 10;
const SIDE_COS = 0.42;
const CAPABILITY_LABEL_SCALE_MAX = 1.3;

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

export function textBox(width: number, x: number, y: number, align: CanvasTextAlign, fontPx: number, pad: number): Box {
  const minX = align === "center" ? x - width / 2 : align === "right" || align === "end" ? x - width : x;
  return { minX: minX - pad, maxX: minX + width + pad, minY: y - fontPx * 0.62 - pad, maxY: y + fontPx * 0.62 + pad };
}

export function sideOf(angle: number): CanvasTextAlign {
  const cos = Math.cos(angle);
  return cos > SIDE_COS ? "left" : cos < -SIDE_COS ? "right" : "center";
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
  sector: DialSector,
  model: DialModel,
  labels: DialLabels | null,
  evidence: DialEvidenceView | null,
  measure: MeasureText,
  labelScale: number,
  tokens: DialTokens,
): DomainLabelBlock {
  const domain = model.domainById.get(sector.domainId);
  const nameFont = scaledLabelFont("domain", labelScale);
  const nameFontPx = scaledLabelFontSize("domain", labelScale);
  const unitsFont = scaledLabelFont("element", labelScale);
  const unitsFontPx = scaledLabelFontSize("element", labelScale);
  const lines = wrapDialName(domain?.label ?? sector.domainId, tokens.nameMaxPx * Math.max(1, labelScale), nameFont, measure);
  const units = labels && domain ? labels.units(domain.capabilityIds.length, domain.elementCount) : null;
  const staleCount = evidence?.measured ? evidence.staleByDomain.get(sector.domainId) ?? 0 : 0;
  const stale = labels && units !== null && staleCount > 0 ? ` · ${labels.stale(staleCount)}` : null;
  const lineWidths = lines.map((line) => measure(line, nameFont));
  const unitsWidth = units === null ? 0 : measure(units + (stale ?? ""), unitsFont);
  const lineGap = nameFontPx * 1.25;
  return {
    domainId: sector.domainId,
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
  const align = sideOf(angle);
  const sin = Math.sin(angle);
  const h = block.height;
  const top = align === "center" ? (sin < 0 ? ay - h : ay) : ay - h / 2 + sin * h * 0.35;
  const lineYs = block.lines.map((_, i) => top + block.lineGap * (i + 0.5));
  const lineBoxes = block.lines.map((_, i) => textBox(block.lineWidths[i]!, ax, lineYs[i]!, align, block.nameFontPx, 3));
  const unitsY = top + block.lineGap * (block.lines.length + 0.5);
  const unitsBox = block.units === null ? null : textBox(block.unitsWidth, ax, unitsY, align, block.unitsFontPx, 2);
  const nameBox = union(lineBoxes);
  return { block, align, x: ax, lineYs, lineBoxes, unitsY, unitsBox, nameBox, box: unitsBox ? union([nameBox, unitsBox]) : nameBox };
}

function receded(attn: DialAttention, domainId: string): boolean {
  return attn.domainId !== null && attn.domainId !== domainId && !attn.partnerDomains.has(domainId);
}

function pushText(out: Pick<DialMarks, "texts">, mark: TextMark, input: LabelMarksInput): boolean {
  if (!inside(mark.box, input.freeRect)) return false;
  out.texts.push(mark);
  return true;
}

function projectName(input: LabelMarksInput, out: Pick<DialMarks, "texts">): void {
  const { model } = input;
  if (!model.projectId || !model.projectLabel) return;
  const hub = input.nodeScreen(model.projectId) ?? input.toScreen(0, 0);
  const font = scaledLabelFont("project", input.labelScale);
  const fontPx = scaledLabelFontSize("project", input.labelScale);
  const y = hub.y + input.hubRadiusPx + fontPx * 0.9;
  const box = textBox(input.measureText(model.projectLabel, font), hub.x, y, "center", fontPx, 4);
  if (pushText(out, { id: model.projectId, role: "project", text: model.projectLabel, x: hub.x, y, align: "center", font, ink: input.ink(input.inks.project), box, parts: null }, input)) {
    input.occupied.push(box);
  }
}

function domainNames(input: LabelMarksInput, out: Pick<DialMarks, "texts">): void {
  const { scene, attention: attn, inks } = input;
  const placed: PlacedBlock[] = [];
  for (const sector of scene.sectors) {
    const chip = input.nodeScreen(sector.domainId);
    if (!chip) continue;
    const block = domainLabelBlock(sector, input.model, input.labels, input.evidence, input.measureText, input.labelScale, input.tokens);
    const cos = Math.cos(sector.angle);
    const sin = Math.sin(sector.angle);
    let plan: PlacedBlock | null = null;
    for (let step = 0; step < NAME_STEPS; step += 1) {
      const reach = (scene.outerRadius - scene.ringRadius) * input.scale + input.chipRadiusPx + NAME_CLEARANCE_PX + step * NAME_STEP_PX;
      plan = placeBlock(block, sector.angle, chip.x + cos * reach, chip.y + sin * reach);
      if (!input.petalBoxes.some((p) => overlaps(p, plan!.box))) break;
    }
    if (plan && plan.lineBoxes.every((b) => inside(b, input.freeRect))) placed.push(plan);
  }
  for (const plan of placed) {
    const id = plan.block.domainId;
    const isAttended = attn.domainId === id;
    const dim = receded(attn, id);
    const nameInk = input.ink(dim ? inks.domainReceded : isAttended ? inks.domainAttended : inks.domain);
    plan.block.lines.forEach((line, i) => {
      out.texts.push({ id, role: "domain", text: line, x: plan.x, y: plan.lineYs[i]!, align: plan.align, font: plan.block.nameFont, ink: nameInk, box: plan.lineBoxes[i]!, parts: null });
    });
    input.occupied.push(plan.nameBox);
    const unitsBox = plan.unitsBox;
    if (!unitsBox || plan.block.units === null) continue;
    if (!inside(unitsBox, input.freeRect)) continue;
    if (placed.some((other) => other !== plan && overlaps(other.box, unitsBox))) continue;
    const unitsInk = input.ink(dim ? inks.domainReceded : inks.units);
    const text = plan.block.units + (plan.block.stale ?? "");
    const parts = plan.block.stale
      ? [{ text: plan.block.units, ink: unitsInk }, { text: plan.block.stale, ink: input.ink(dim ? inks.domainReceded : inks.stale) }]
      : null;
    out.texts.push({ id, role: "units", text, x: plan.x, y: plan.unitsY, align: plan.align, font: plan.block.unitsFont, ink: unitsInk, box: unitsBox, parts });
    input.occupied.push(unitsBox);
  }
}

function orphanCaption(input: LabelMarksInput, out: Pick<DialMarks, "texts">): void {
  const { scene, labels } = input;
  if (!labels || scene.orphans.length === 0) return;
  let top = Infinity;
  for (const id of scene.orphans) {
    const p = input.nodeScreen(id);
    if (p) top = Math.min(top, p.y);
  }
  if (!Number.isFinite(top)) return;
  const font = scaledLabelFont("element", input.labelScale);
  const fontPx = scaledLabelFontSize("element", input.labelScale);
  const text = labels.orphans(scene.orphans.length);
  const centre = input.toScreen(0, 0);
  const y = top - fontPx * 1.4;
  const box = textBox(input.measureText(text, font), centre.x, y, "center", fontPx, 2);
  if (input.occupied.some((o) => overlaps(o, box))) return;
  if (pushText(out, { id: null, role: "orphans", text, x: centre.x, y, align: "center", font, ink: input.ink(input.inks.orphans), box, parts: null }, input)) {
    input.occupied.push(box);
  }
}

function capabilityNames(input: LabelMarksInput, out: Pick<DialMarks, "texts">): void {
  const { attention: attn, inks, model } = input;
  const pitchPx = input.scene.pitch * input.scale;
  if (pitchPx < input.tokens.namePitchPx || input.zoomRatio < input.tokens.namesRatio) return;
  const ls = Math.min(CAPABILITY_LABEL_SCALE_MAX, input.labelScale);
  const font = scaledLabelFont("capability", ls);
  const fontPx = scaledLabelFontSize("capability", ls);
  const blocked: Box[] = [...input.occupied, ...input.petalBoxes];
  const pinRoom = Math.max(3, input.discRadiusPx * 0.75) + 4;
  const out0 = input.discRadiusPx + pinRoom;
  const ordered = [...input.scene.sectors].sort((x, y) => Number(y.domainId === attn.domainId) - Number(x.domainId === attn.domainId));
  for (const sector of ordered) {
    const dimSector = attn.domainId !== null && sector.domainId !== attn.domainId;
    const petals = sector.petals.filter((p) => !p.direct).sort((a, b) => a.angle - b.angle);
    petals.forEach((petal, index) => {
      if (input.ledgerIds.has(petal.id)) return;
      const p = input.nodeScreen(petal.id);
      const cap = model.capabilityById.get(petal.id);
      if (!p || !cap) return;
      const isNeed = attn.needsCaps.has(cap.id);
      const isUser = attn.usedByCaps.has(cap.id);
      if (dimSector && !isNeed && !isUser) return;
      const width = input.measureText(cap.label, font);
      const cos = Math.cos(petal.angle);
      const sin = Math.sin(petal.angle);
      const candidates: { x: number; y: number; align: CanvasTextAlign }[] = [];
      if (Math.abs(cos) >= 0.55) {
        candidates.push({ x: p.x + cos * out0 + (cos > 0 ? 2 : -2), y: p.y + sin * out0, align: cos > 0 ? "left" : "right" });
      } else {
        const preferred = index % 3;
        for (const row of [preferred, (preferred + 1) % 3, (preferred + 2) % 3, 3]) {
          const lift = out0 + fontPx * 0.7 + row * fontPx * 1.35;
          candidates.push({ x: p.x + cos * out0, y: p.y + (sin < 0 ? -lift : lift), align: "center" });
        }
      }
      for (const c of candidates) {
        const box = textBox(width, c.x, c.y, c.align, fontPx, 2);
        if (blocked.some((o) => overlaps(o, box)) || !inside(box, input.freeRect)) continue;
        blocked.push(box);
        input.occupied.push(box);
        const ink = input.ink(isNeed ? inks.needs : isUser ? inks.usedBy : inks.capability);
        out.texts.push({ id: cap.id, role: "capability", text: cap.label, x: c.x, y: c.y, align: c.align, font, ink, box, parts: null });
        return;
      }
    });
  }
}

export function buildLabelMarks(input: LabelMarksInput, out: Pick<DialMarks, "texts">): void {
  projectName(input, out);
  domainNames(input, out);
  orphanCaption(input, out);
  capabilityNames(input, out);
}
