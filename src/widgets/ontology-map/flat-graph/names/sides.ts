import type { MeasureText } from "../../dial/label-marks";
import type { Box, Point } from "../../dial/dial-shapes";
import { FONT_WEIGHT } from "@/shared/ui/tokens/font-weight";
import type { FlatGraphLayout, FlatGraphPaintTokens } from "../flat-graph-shapes";
import { fanDotBox, fanSidesOf } from "../open";
import { blockAbove, domainBlock, domainReachLine, font, reachText, tabularPieces, titleMayRise } from "./titles";
import type { NameInput, PlacedName } from "./placed-name";

/**
 * The first try, in the tries' fixed order, that `free` accepts and no lit line crosses; failing
 * that, the first `free` try, which then draws backed. Null when no try is free.
 */
export function chooseSide<T>(tries: readonly T[], free: (t: T) => boolean, crossed: (t: T) => boolean): { side: T; backed: boolean } | null {
  let fallback: T | null = null;
  for (const t of tries) {
    if (!free(t)) continue;
    if (!crossed(t)) return { side: t, backed: false };
    fallback ??= t;
  }
  return fallback === null ? null : { side: fallback, backed: true };
}

export type NameShape = Pick<NameInput, "model" | "tokens" | "measureText" | "fontFamily" | "selected" | "focusId" | "discRadius" | "growth" | "named" | "lit" | "labels" | "reach" | "openStarId"> & {
  /** The layout the names stand in, which tells the side a selection's fan took; a camera judging names before the fan opens has none. */
  layout?: FlatGraphLayout;
};

/** The domain whose star is open, null while none is or a capability's elements are. */
export function openDomainStar(input: Pick<NameInput, "model" | "openStarId">): string | null {
  const id = input.openStarId ?? null;
  return id !== null && input.model.domainById.has(id) ? id : null;
}

/** Whether `id` is a member capability of the open domain star: a reader opens a star to read every one of them. */
export function isStarMember(input: Pick<NameInput, "model" | "openStarId">, id: string): boolean {
  const domainId = openDomainStar(input);
  return domainId !== null && input.model.capabilityById.has(id) && input.model.domainOf.get(id) === domainId;
}

/** An element dot's radius as its name keeps clear of it: the dot at this growth, or larger where an opened star grows it. */
export function elementDotRadius(input: Pick<NameInput, "tokens" | "growth" | "discRadius" | "openStarId">, id: string): number {
  const dotPx = input.tokens.elementDotPx * input.growth;
  return (input.openStarId ?? null) === null ? dotPx : Math.max(dotPx, input.discRadius(id));
}

/**
 * How far an open star member's one-line name reaches past its disc's rim on its own row, in px:
 * the gap and the text, as `sideNames` sets the name beside the disc; the frame holds a member's
 * glyphs inside the free map and lets its pad cross the margin. O(1) past the measure.
 */
export function memberNameReachPx(input: { tokens: Pick<FlatGraphPaintTokens, "nameGapPx" | "capNamePx">; measureText: MeasureText; fontFamily: string }, label: string): number {
  const t = input.tokens;
  return t.nameGapPx + input.measureText(label, font(FONT_WEIGHT.emphasis, t.capNamePx, input.fontFamily));
}

export function sideNames(input: NameShape, id: string, role: "capability" | "element", text: string): PlacedName[][] {
  const { tokens: t, measureText, fontFamily } = input;
  if (input.selected && id === input.focusId) return selectedNames(input, id, role, text);
  const px = role === "capability" ? t.capNamePx : t.elementNamePx;
  const weight = role === "capability" ? FONT_WEIGHT.emphasis : input.lit?.has(id) ? FONT_WEIGHT.signature : 400;
  const f = font(weight, px, fontFamily);
  const w = measureText(text, f);
  const r = role === "capability" ? input.discRadius(id) : elementDotRadius(input, id);
  const x = r + t.nameGapPx;
  const half = px / 2 + t.namePadPx;
  const sides: PlacedName[][] = [
    [{ id, role, text, font: f, dx: x, dy: 0, align: "left", box: { minX: x - t.namePadPx, maxX: x + w + t.namePadPx, minY: -half, maxY: half } }],
    [{ id, role, text, font: f, dx: -x, dy: 0, align: "right", box: { minX: -x - w - t.namePadPx, maxX: -x + t.namePadPx, minY: -half, maxY: half } }],
  ];
  const below = x + px / 2;
  const centred = (dy: number): PlacedName[] => [{ id, role, text, font: f, dx: 0, dy, align: "center", box: { minX: -w / 2 - t.namePadPx, maxX: w / 2 + t.namePadPx, minY: dy - half, maxY: dy + half } }];
  if (!input.named.has(id) && !isStarMember(input, id)) return sides;
  const rise = px + t.namePadPx * 2;
  const diagonal = (side: 1 | -1, dy: number, leader = true): PlacedName[] => [{
    id, role, text, font: f, dx: side * x, dy, align: side === 1 ? "left" : "right",
    box: { minX: side === 1 ? x - t.namePadPx : -x - w - t.namePadPx, maxX: side === 1 ? x + w + t.namePadPx : -x + t.namePadPx, minY: dy - half, maxY: dy + half },
    ...(leader ? { leader: true } : {}),
  }];
  const onRow = [...sides, centred(below), centred(-below)];
  // Only a selection's far end leaves its row: a pointed-at name must stay under the pointer.
  if (!input.selected || id === input.focusId) return onRow;
  const offRow = [diagonal(1, -rise), diagonal(-1, -rise), diagonal(1, rise), diagonal(-1, rise)];
  if (!isStarMember(input, id)) return [...onRow, ...offRow];
  // Half a row up or down a name still sits beside its disc, so it needs no leader.
  const slid = [diagonal(1, -rise / 2, false), diagonal(-1, -rise / 2, false), diagonal(1, rise / 2, false), diagonal(-1, rise / 2, false)];
  // Below or above, a name may also end at its disc's right edge or start at its left edge, out of a neighbour's way.
  const flush = (dy: number, edge: 1 | -1): PlacedName[] => [{
    id, role, text, font: f, dx: edge * r, dy, align: edge === 1 ? "right" : "left",
    box: { minX: edge === 1 ? r - w - t.namePadPx : -r - t.namePadPx, maxX: edge === 1 ? r + t.namePadPx : -r + w + t.namePadPx, minY: dy - half, maxY: dy + half },
  }];
  const alongRow = [flush(below, 1), flush(below, -1), flush(-below, 1), flush(-below, -1)];
  return [...onRow, ...slid, ...alongRow, ...offRow];
}

/**
 * The selected concept's name at the selected size, with its reach line beneath, tried right, left,
 * below and above its disc. Each try is one block, so the two lines never part.
 */
function selectedNames(input: NameShape, id: string, role: "capability" | "element", text: string): PlacedName[][] {
  const { tokens: t, measureText, fontFamily } = input;
  const px = t.selectedNamePx;
  const nameFont = font(FONT_WEIGHT.strong, px, fontFamily);
  const nameW = measureText(text, nameFont);
  // The domain is read as the selection's address, first on its count line, so its own title can step back.
  const domainId = input.model.domainOf.get(id);
  const address = domainId == null ? null : input.model.domainById.get(domainId)?.label ?? null;
  const counts = reachText(input.labels, input.reach);
  const line = address && counts ? `${address} · ${counts}` : address ?? counts;
  const lineFont = font(400, t.captionPx, fontFamily);
  const figures = line ? tabularPieces(line, lineFont, measureText) : null;
  const lineW = figures?.width ?? 0;
  const lineH = figures ? t.captionGapPx + t.captionPx : 0;
  const r = input.discRadius(id);
  const pad = t.namePadPx;
  const block = (align: CanvasTextAlign, x: number, top: number): PlacedName[] => {
    const nameY = top + px / 2;
    const lineY = nameY + px / 2 + t.captionGapPx + t.captionPx / 2;
    const span = (w: number) => (align === "left" ? [x, x + w] : align === "right" ? [x - w, x] : [x - w / 2, x + w / 2]) as [number, number];
    const [nameMin, nameMax] = span(nameW);
    const out: PlacedName[] = [{
      id, role, text, font: nameFont, dx: x, dy: nameY, align,
      box: { minX: nameMin - pad, maxX: nameMax + pad, minY: nameY - px / 2 - pad, maxY: nameY + px / 2 + pad },
    }];
    if (line && figures) {
      const [lineMin, lineMax] = span(lineW);
      out.push({
        id, role: "reach", text: line, font: lineFont, dx: x, dy: lineY, align,
        box: { minX: lineMin - pad, maxX: lineMax + pad, minY: lineY - t.captionPx / 2 - pad, maxY: lineY + t.captionPx / 2 + pad },
        pieces: figures.pieces.map((p) => ({ text: p.text, dx: lineMin - x + p.dx })),
      });
    }
    return out;
  };
  const side = r + t.nameGapPx;
  const height = px + lineH;
  // A capability's elements fan in rows down its sides, so its name takes the wedge the fan keeps above it, or the side the fan left.
  if (role === "capability" && (input.model.capabilityById.get(id)?.elementIds.length ?? 0) > 0) {
    // Without a layout the side the fan takes is unknown, so a camera's reach keeps both of the name's beside tries.
    const fan = input.layout ? fanSidesOf(input.model, input.layout, id) : { right: false, left: false };
    // The selection ring stands outside the disc, so the name keeps its gap from the ring.
    const clear = side + (input.selected && input.focusId === id ? t.selectedRingGapPx + t.selectedRingPx : 0);
    return [
      block("center", 0, -clear - height), block("right", r, -clear - height), block("left", -r, -clear - height),
      ...(fan && !fan.right ? [block("left", clear, -px / 2)] : []),
      ...(fan && !fan.left ? [block("right", -clear, -px / 2)] : []),
      block("center", 0, clear), block("right", r, clear), block("left", -r, clear),
    ];
  }
  return [
    block("left", side, -px / 2),
    block("right", -side, -px / 2),
    block("center", 0, side),
    block("center", 0, -side - height),
    // Below or above, the block may also end at its disc's right edge or start at its left edge, out of a neighbour's way.
    block("right", r, side),
    block("left", -r, side),
    block("right", r, -side - height),
    block("left", -r, -side - height),
  ];
}

export type NameReachInput = NameShape & Pick<NameInput, "model" | "elementLabel" | "staleByDomain">;

function union(boxes: readonly Box[]): Box {
  return {
    minX: Math.min(...boxes.map((b) => b.minX)), maxX: Math.max(...boxes.map((b) => b.maxX)),
    minY: Math.min(...boxes.map((b) => b.minY)), maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
}

/**
 * Screen pixels around a concept's centre that its disc, selection ring and every side its name
 * may take can cover: what a camera framing a lit set keeps on screen before admission has run.
 */
export function nameReachBox(input: NameReachInput, id: string): Box {
  const { model, tokens: t } = input;
  const r = input.discRadius(id);
  const ring = input.selected && id === input.focusId ? r + t.selectedRingGapPx + t.selectedRingPx : r;
  const boxes: Box[] = [{ minX: -ring, maxX: ring, minY: -ring, maxY: ring }];
  if (model.domainById.has(id)) {
    const block = domainBlock(input, id, domainReachLine(input, id));
    boxes.push(...block.map((n) => n.box));
    if (titleMayRise(input, id)) boxes.push(...blockAbove(block).map((n) => n.box));
  }
  else {
    const cap = model.capabilityById.get(id);
    const label = cap?.label ?? input.elementLabel(id);
    const role = cap || !model.domainOf.has(id) ? "capability" : "element";
    if (label) for (const group of sideNames(input, id, role, label)) for (const n of group) boxes.push(n.box);
    if (cap && input.selected && id === input.focusId) {
      const fan = fanDotBox(cap.elementIds.length, t, r);
      if (fan) {
        // The column may stand on either side, with its names running outward.
        const f = font(FONT_WEIGHT.signature, t.elementNamePx, input.fontFamily);
        const widest = Math.max(0, ...cap.elementIds.map((of) => input.measureText(input.elementLabel(of) ?? "", f)));
        const reach = fan.reach + t.nameGapPx + widest + t.namePadPx;
        boxes.push({ minX: -reach, maxX: reach, minY: fan.top, maxY: fan.bottom });
      }
    }
  }
  return union(boxes);
}

/**
 * A fanned element's name on the side that faces away from its capability, or centred under a dot
 * at the foot of the fan: the other side would run back across the fan.
 */
export function fannedNames(input: NameShape, id: string, text: string, offset: Point): PlacedName[][] {
  const { tokens: t } = input;
  const f = font(FONT_WEIGHT.signature, t.elementNamePx, input.fontFamily);
  const w = input.measureText(text, f);
  const x = elementDotRadius(input, id) + t.nameGapPx;
  const half = t.elementNamePx / 2 + t.namePadPx;
  const side = offset.x >= 0 ? 1 : -1;
  const row = (dy: number): PlacedName[] => [{
    id, role: "element", text, font: f, dx: side * x, dy, align: side === 1 ? "left" : "right",
    box: { minX: side === 1 ? x - t.namePadPx : -x - w - t.namePadPx, maxX: side === 1 ? x + w + t.namePadPx : -x + t.namePadPx, minY: dy - half, maxY: dy + half },
    ...(dy === 0 ? {} : { leader: true }),
  }];
  const rise = t.elementNamePx + t.namePadPx * 2;
  // The row that leans away from the capability comes first, so a leader never runs back over the fan.
  const away = offset.y >= 0 ? rise : -rise;
  const rows = [row(0), row(away), row(-away)];
  if (offset.y <= Math.abs(offset.x)) return rows;
  const dy = x + t.elementNamePx / 2;
  return [...rows, [{ id, role: "element", text, font: f, dx: 0, dy, align: "center", box: { minX: -w / 2 - t.namePadPx, maxX: w / 2 + t.namePadPx, minY: dy - half, maxY: dy + half } }]];
}
