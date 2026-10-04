import { capabilityNameTries, crossesBox, overlaps } from "./label-marks";
import type { Box, DialTokens, Point } from "./types";

export interface LedgerDisc {
  id: string;
  label: string;
  x: number;
  y: number;
  r: number;
  degree: number;
}

export interface LedgerInput {
  domainId: string;
  discs: readonly LedgerDisc[];
  priority: ReadonlySet<string>;
  freeRect: Box;
  font: string;
  measureText(text: string, font: string): number;
  moreText(count: number): string;
  tokens: Pick<DialTokens, "ledgerRowPx" | "ledgerGapPx">;
  footprint?: { x: number; y: number; r: number } | null;
  avoid?: { boxes: readonly Box[]; nameBoxes?: readonly Box[]; lines: readonly (readonly Point[])[] } | null;
}

export interface LedgerTriggerInput {
  capabilityCount: number;
  namedInPlace: number;
  capabilityPitchPx: number;
  namesFitInPlace: boolean;
  tokens: Pick<DialTokens, "reachCap">;
}

export function ledgerWanted(input: LedgerTriggerInput): boolean {
  return !input.namesFitInPlace && input.namedInPlace < input.capabilityCount && input.capabilityPitchPx < input.tokens.reachCap;
}

export interface InPlaceNamesInput {
  items: readonly { id: string; x: number; y: number; direct: boolean; elements: number; label: string | null }[];
  chip: Point;
  chipRadiusPx: number;
  scale: number;
  discRadiusPx(elements: number): number;
  fontPx: number;
  font: string;
  measureText(text: string, font: string): number;
}

const circleBox = (x: number, y: number, r: number): Box => ({ minX: x - r - 1, maxX: x + r + 1, minY: y - r - 1, maxY: y + r + 1 });

export function namesFitInPlace(input: InPlaceNamesInput): boolean {
  const s = input.scale;
  const at = (it: { x: number; y: number }) => ({ x: (it.x - input.chip.x) * s, y: (it.y - input.chip.y) * s });
  const marks: Box[] = [circleBox(0, 0, input.chipRadiusPx)];
  const named: { id: string; label: string; elements: number; disc: { x: number; y: number; r: number } }[] = [];
  for (const it of input.items) {
    const p = at(it);
    const r = input.discRadiusPx(it.elements);
    marks.push(circleBox(p.x, p.y, r));
    if (!it.direct && it.label !== null) named.push({ id: it.id, label: it.label, elements: it.elements, disc: { ...p, r } });
  }
  named.sort((x, y) => y.elements - x.elements || (x.id < y.id ? -1 : 1));
  const claimed: Box[] = [];
  for (const { label, disc } of named) {
    const pick = capabilityNameTries(disc, input.measureText(label, input.font), input.fontPx)
      .find((t) => !marks.some((m) => overlaps(m, t.box)) && !claimed.some((c) => overlaps(c, t.box)));
    if (!pick) return false;
    claimed.push(pick.box);
  }
  return true;
}

interface LedgerRow {
  id: string;
  text: string;
  x: number;
  y: number;
  box: Box;
}

export interface LedgerLeader {
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface LedgerPlan {
  domainId: string;
  side: "right" | "left";
  align: CanvasTextAlign;
  rows: LedgerRow[];
  leaders: LedgerLeader[];
  more: { count: number; row: LedgerRow } | null;
  total: number;
}

const LEADER_INSET_PX = 3;
const MAX_UNCROSS_PASSES = 400;
const GAP_STEPS = [0, 1, 2, 3];
const SHIFT_ROWS = 10;
const TEXT_HIT_COST = 3;

function cross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function segmentsCross(a: LedgerLeader, b: LedgerLeader): boolean {
  const d1 = cross(a.x0, a.y0, a.x1, a.y1, b.x0, b.y0);
  const d2 = cross(a.x0, a.y0, a.x1, a.y1, b.x1, b.y1);
  const d3 = cross(b.x0, b.y0, b.x1, b.y1, a.x0, a.y0);
  const d4 = cross(b.x0, b.y0, b.x1, b.y1, a.x1, a.y1);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

export function countLeaderCrossings(leaders: readonly LedgerLeader[]): number {
  let n = 0;
  for (let i = 0; i < leaders.length; i += 1) {
    for (let j = i + 1; j < leaders.length; j += 1) if (segmentsCross(leaders[i]!, leaders[j]!)) n += 1;
  }
  return n;
}

function chooseShown(input: LedgerInput, capacity: number): { shown: LedgerDisc[]; more: number } {
  const n = input.discs.length;
  if (n <= capacity) return { shown: [...input.discs], more: 0 };
  const keep = Math.max(0, capacity - 1);
  const ranked = [...input.discs].sort(
    (x, y) =>
      Number(input.priority.has(y.id)) - Number(input.priority.has(x.id)) ||
      y.degree - x.degree ||
      x.label.localeCompare(y.label) ||
      (x.id < y.id ? -1 : 1),
  );
  return { shown: ranked.slice(0, keep), more: n - keep };
}

export function buildLedger(input: LedgerInput): LedgerPlan | null {
  const { freeRect, tokens } = input;
  if (input.discs.length === 0) return null;
  const rowPx = tokens.ledgerRowPx;
  const capacity = Math.floor((freeRect.maxY - freeRect.minY) / rowPx);
  if (capacity < 1) return null;
  const { shown, more } = chooseShown(input, capacity);
  const moreText = more > 0 ? input.moreText(more) : null;
  const widths = new Map(shown.map((d) => [d.id, input.measureText(d.label, input.font)]));
  const widest = Math.max(0, ...widths.values(), moreText ? input.measureText(moreText, input.font) : 0);
  const fp = input.footprint ?? null;
  const minX = Math.min(...input.discs.map((d) => d.x - d.r), fp ? fp.x - fp.r : Infinity);
  const maxX = Math.max(...input.discs.map((d) => d.x + d.r), fp ? fp.x + fp.r : -Infinity);
  const sides: { side: "right" | "left"; colX: number; step: number }[] = [];
  for (const step of GAP_STEPS) {
    const gap = tokens.ledgerGapPx * (1 + step);
    if (maxX + gap + widest <= freeRect.maxX) sides.push({ side: "right", colX: maxX + gap, step });
    if (minX - gap - widest >= freeRect.minX) sides.push({ side: "left", colX: minX - gap, step });
  }
  if (sides.length === 0) return null;
  const slotCount = shown.length + (moreText ? 1 : 0);
  const centre = shown.length > 0 ? shown.reduce((s, d) => s + d.y, 0) / shown.length : (freeRect.minY + freeRect.maxY) / 2;
  const height = slotCount * rowPx;
  const clampTop = (t: number) => Math.min(freeRect.maxY - height, Math.max(freeRect.minY, t));
  const base = clampTop(centre - height / 2);
  const avoid = input.avoid ?? null;
  if (!avoid) return layoutLedger(input, shown, widths, moreText, more, sides[0]!.side, sides[0]!.colX, base);
  const tries: { side: "right" | "left"; colX: number; top: number; distance: number }[] = [];
  for (const s of sides) {
    for (let k = -SHIFT_ROWS; k <= SHIFT_ROWS; k += 1) tries.push({ side: s.side, colX: s.colX, top: clampTop(base + k * rowPx), distance: Math.abs(k) + s.step * 2 });
  }
  tries.sort((a, b) => a.distance - b.distance);
  let best: typeof tries[number] | null = null;
  let bestCost = Infinity;
  for (const t of tries) {
    const minX = t.side === "right" ? t.colX : t.colX - widest;
    const column = { minX, maxX: minX + widest, minY: t.top, maxY: t.top + slotCount * rowPx };
    if (avoid.nameBoxes?.some((name) => overlaps(name, column))) continue;
    const cost = slotCost(t.side, t.colX, t.top, slotCount, widest, rowPx, avoid);
    if (cost < bestCost) {
      best = t;
      bestCost = cost;
      if (cost === 0) break;
    }
  }
  return best ? layoutLedger(input, shown, widths, moreText, more, best.side, best.colX, best.top) : null;
}

function slotCost(
  side: "right" | "left",
  colX: number,
  top: number,
  slots: number,
  width: number,
  rowPx: number,
  avoid: NonNullable<LedgerInput["avoid"]>,
): number {
  const minX = side === "right" ? colX : colX - width;
  let cost = 0;
  for (let k = 0; k < slots; k += 1) {
    const box = { minX, maxX: minX + width, minY: top + rowPx * k, maxY: top + rowPx * (k + 1) };
    if (avoid.boxes.some((b) => overlaps(b, box))) cost += TEXT_HIT_COST;
    else if (crossesBox(avoid.lines, box)) cost += 1;
  }
  return cost;
}

function layoutLedger(
  input: LedgerInput,
  shown: readonly LedgerDisc[],
  widths: ReadonlyMap<string, number>,
  moreText: string | null,
  more: number,
  side: "right" | "left",
  colX: number,
  top: number,
): LedgerPlan {
  const rowPx = input.tokens.ledgerRowPx;
  const align: CanvasTextAlign = side === "right" ? "left" : "right";
  const slotY = (k: number) => top + rowPx * (k + 0.5);
  const anchorX = side === "right" ? colX - LEADER_INSET_PX : colX + LEADER_INSET_PX;

  const order = [...shown].sort((x, y) => x.y - y.y || x.x - y.x || (x.id < y.id ? -1 : 1));
  const full = (k: number): LedgerLeader => ({ id: order[k]!.id, x0: order[k]!.x, y0: order[k]!.y, x1: anchorX, y1: slotY(k) });
  for (let pass = 0; pass < MAX_UNCROSS_PASSES; pass += 1) {
    let swapped = false;
    for (let i = 0; i < order.length; i += 1) {
      for (let j = i + 1; j < order.length; j += 1) {
        if (!segmentsCross(full(i), full(j))) continue;
        [order[i], order[j]] = [order[j]!, order[i]!];
        swapped = true;
      }
    }
    if (!swapped) break;
  }

  const rowBox = (width: number, y: number): Box => {
    const x0 = side === "right" ? colX : colX - width;
    return { minX: x0, maxX: x0 + width, minY: y - rowPx / 2, maxY: y + rowPx / 2 };
  };
  const rows: LedgerRow[] = [];
  const leaders: LedgerLeader[] = [];
  order.forEach((disc, k) => {
    const y = slotY(k);
    rows.push({ id: disc.id, text: disc.label, x: colX, y, box: rowBox(widths.get(disc.id)!, y) });
    const dx = anchorX - disc.x;
    const dy = y - disc.y;
    const len = Math.hypot(dx, dy) || 1;
    leaders.push({ id: disc.id, x0: disc.x + (dx / len) * disc.r, y0: disc.y + (dy / len) * disc.r, x1: anchorX, y1: y });
  });
  const moreRow = moreText
    ? { count: more, row: { id: input.domainId, text: moreText, x: colX, y: slotY(order.length), box: rowBox(input.measureText(moreText, input.font), slotY(order.length)) } }
    : null;
  return { domainId: input.domainId, side, align, rows, leaders, more: moreRow, total: input.discs.length };
}
