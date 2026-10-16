import { NUMERAL_FONT_PX, numeralFont, scaledLabelFont, scaledLabelFontSize, tabularWidth } from "../render/labels";
import { inkIndex, type DialInks } from "./ink";
import { overlaps } from "./label-marks";
import type { Box, DialMarks, DialModel, DialTokens, Point } from "./types";

interface FarInput {
  model: DialModel;
  tokens: DialTokens;
  inks: DialInks;
  freeRect: Box;
  occupied: Box[];
  nameBoxes?: ReadonlyMap<string, Box>;
  measureText(text: string, font: string): number;
}

type FarMarks = Pick<DialMarks, "inks" | "numerals" | "texts">;

const FAR_GAP_PX = 6;
const NUMERAL_SPACING_PX = 24;

function inside(box: Box, rect: Box): boolean {
  return box.minX >= rect.minX && box.maxX <= rect.maxX && box.minY >= rect.minY && box.maxY <= rect.maxY;
}

export function stubText(name: string, needs: number, used: number): string {
  return [name, needs > 0 ? `→${needs}` : null, used > 0 ? `←${used}` : null].filter((p) => p !== null).join(" ");
}

export interface FarCount {
  needs: number;
  used: number;
  needsInk: string;
  usedInk: string;
  chip: { p: Point; r: number };
  toward: Point;
}

function besideChip(count: FarCount, w: number, h: number): Point[] {
  const { p, r } = count.chip;
  const dx = count.toward.x - p.x;
  const dy = count.toward.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const along = r + FAR_GAP_PX + (Math.abs(ux) * w + Math.abs(uy) * h) / 2;
  return [
    { x: p.x + ux * along, y: p.y + uy * along },
    { x: p.x + r + FAR_GAP_PX + w / 2, y: p.y },
    { x: p.x - r - FAR_GAP_PX - w / 2, y: p.y },
    { x: p.x, y: p.y + r + FAR_GAP_PX + h / 2 },
    { x: p.x, y: p.y - r - FAR_GAP_PX - h / 2 },
  ];
}

export function placeFarNumerals(input: FarInput, out: FarMarks, far: ReadonlyMap<string, FarCount>): void {
  const font = numeralFont();
  const h = NUMERAL_FONT_PX;
  const centres = out.numerals.map((n) => ({ x: (n.box.minX + n.box.maxX) / 2, y: (n.box.minY + n.box.maxY) / 2 }));
  const order = [...far].sort((x, y) => y[1].needs + y[1].used - (x[1].needs + x[1].used) || (x[0] < y[0] ? -1 : 1));
  for (const [id, count] of order) {
    const parts: { text: string; ink: string }[] = [];
    if (count.needs > 0) parts.push({ text: `→${count.needs}`, ink: count.needsInk });
    if (count.used > 0) parts.push({ text: `${parts.length > 0 ? " " : ""}←${count.used}`, ink: count.usedInk });
    if (parts.length === 0) continue;
    const name = input.nameBoxes?.get(id);
    if (!name) {
      placeNamedCount(input, out, id, count);
      continue;
    }
    const text = parts.map((p) => p.text).join("");
    const w = tabularWidth(text, font, input.measureText);
    const cx = (name.minX + name.maxX) / 2;
    const cy = (name.minY + name.maxY) / 2;
    const tries = [
      { x: name.maxX + FAR_GAP_PX + w / 2, y: cy },
      { x: name.minX - FAR_GAP_PX - w / 2, y: cy },
      { x: cx, y: name.maxY + FAR_GAP_PX + h / 2 },
      { x: cx, y: name.minY - FAR_GAP_PX - h / 2 },
      ...besideChip(count, w + 4, h + 4),
    ];
    for (const p of tries) {
      const box = { minX: p.x - w / 2 - 2, maxX: p.x + w / 2 + 2, minY: p.y - h / 2 - 2, maxY: p.y + h / 2 + 2 };
      if (!inside(box, input.freeRect) || input.occupied.some((o) => overlaps(o, box))) continue;
      if (centres.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < NUMERAL_SPACING_PX)) continue;
      input.occupied.push(box);
      centres.push(p);
      out.numerals.push({
        flowKey: `far\0${id}`, text, x: p.x, y: p.y + 0.5, ink: inkIndex(out, parts[0]!.ink), halo: true, font, box,
        parts: parts.map((part) => ({ text: part.text, ink: inkIndex(out, part.ink) })),
      });
      break;
    }
  }
}

function placeNamedCount(input: FarInput, out: FarMarks, id: string, count: FarCount): void {
  const { tokens, inks, model } = input;
  const font = scaledLabelFont("capability", tokens.labelScale);
  const px = scaledLabelFontSize("capability", tokens.labelScale);
  const label = model.domainById.get(id)?.label ?? id;
  const text = stubText(label, count.needs, count.used);
  const w = input.measureText(text, font);
  const h = px * 1.4;
  for (const p of besideChip(count, w + 4, h)) {
    const box = { minX: p.x - w / 2 - 2, maxX: p.x + w / 2 + 2, minY: p.y - h / 2, maxY: p.y + h / 2 };
    if (!inside(box, input.freeRect) || input.occupied.some((o) => overlaps(o, box))) continue;
    input.occupied.push(box);
    const nameInk = inkIndex(out, inks.domainLabelAttended);
    const parts: { text: string; ink: number }[] = [{ text: label, ink: nameInk }];
    if (count.needs > 0) parts.push({ text: ` →${count.needs}`, ink: inkIndex(out, count.needsInk) });
    if (count.used > 0) parts.push({ text: ` ←${count.used}`, ink: inkIndex(out, count.usedInk) });
    out.texts.push({ id, role: "stub", text, x: p.x - w / 2, y: p.y, align: "left", font, ink: nameInk, box, parts });
    return;
  }
}
