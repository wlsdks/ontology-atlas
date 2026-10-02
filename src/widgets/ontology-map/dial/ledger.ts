import type { Box, DialScene, DialTokens, Point } from "./types";

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
}

export interface EnteredDomainInput {
  scene: Pick<DialScene, "clusterByDomain" | "clusters">;
  attendedDomainId: string | null;
  capabilitiesDrawn: ReadonlySet<string>;
  freeRect: Box;
  toScreen(x: number, y: number): Point;
}

export function enteredDomain(input: EnteredDomainInput): string | null {
  const { attendedDomainId, scene } = input;
  if (attendedDomainId && scene.clusterByDomain.has(attendedDomainId)) return attendedDomainId;
  const cx = (input.freeRect.minX + input.freeRect.maxX) / 2;
  const cy = (input.freeRect.minY + input.freeRect.maxY) / 2;
  let best: string | null = null;
  let bestD = Infinity;
  for (const cluster of scene.clusters) {
    if (!input.capabilitiesDrawn.has(cluster.domainId)) continue;
    const p = input.toScreen(cluster.chip.x, cluster.chip.y);
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d < bestD || (d === bestD && best !== null && cluster.domainId < best)) {
      best = cluster.domainId;
      bestD = d;
    }
  }
  return best;
}

export interface LedgerTriggerInput {
  capabilityCount: number;
  namedInPlace: number;
  capabilityPitchPx: number;
  tokens: Pick<DialTokens, "reachCap">;
}

export function ledgerWanted(input: LedgerTriggerInput): boolean {
  return input.namedInPlace < input.capabilityCount && input.capabilityPitchPx < input.tokens.reachCap;
}

export interface LedgerRow {
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

function cross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

export function segmentsCross(a: LedgerLeader, b: LedgerLeader): boolean {
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
  let side: "right" | "left";
  let colX: number;
  if (maxX + tokens.ledgerGapPx + widest <= freeRect.maxX) {
    side = "right";
    colX = maxX + tokens.ledgerGapPx;
  } else if (minX - tokens.ledgerGapPx - widest >= freeRect.minX) {
    side = "left";
    colX = minX - tokens.ledgerGapPx;
  } else {
    return null;
  }
  const align: CanvasTextAlign = side === "right" ? "left" : "right";
  const slotCount = shown.length + (moreText ? 1 : 0);
  const centre = shown.length > 0 ? shown.reduce((s, d) => s + d.y, 0) / shown.length : (freeRect.minY + freeRect.maxY) / 2;
  const height = slotCount * rowPx;
  const top = Math.min(freeRect.maxY - height, Math.max(freeRect.minY, centre - height / 2));
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
