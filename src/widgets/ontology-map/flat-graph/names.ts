import type { MeasureText } from "../dial/label-marks";
import type { Box, DialLabels, DialModel, Point } from "../dial/types";
import { FONT_WEIGHT } from "@/shared/ui/tokens/font-weight";
import { domainPartners } from "../model/containment-tree";
import type { GraphLine } from "./attention";
import { arcPathInto, crowdShare, emptyArcPath, litLineTrimsInto, ORPHAN_ROOM } from "./marks";
import { byId } from "./seed";
import type { FlatGraphLayout, FlatGraphPaintTokens, FlatGraphTitle } from "./types";

export type NameRole = "project" | "domain" | "units" | "orphans" | "capability" | "element" | "reach";

/** One run of a line drawn left-aligned at `dx` from the line's anchor; a digit gets its own cell. */
export interface NamePiece { text: string; dx: number }

/** A name in screen pixels relative to its concept's live position; `box` is relative too. */
export interface PlacedName {
  id: string;
  role: NameRole;
  text: string;
  font: string;
  dx: number;
  dy: number;
  align: CanvasTextAlign;
  box: Box;
  /** Set when the line's figures must align as table columns: canvas text has no `tnum`. */
  pieces?: readonly NamePiece[];
  /** A lit name a lit line crosses on every side it may take: it draws on the canvas ground. */
  backed?: boolean;
  /** A name set a row above or below its concept: it draws a hairline back to the mark. */
  leader?: boolean;
}

export interface NameAdmission {
  step: number;
  names: readonly PlacedName[];
  ids: ReadonlySet<string>;
  /** Which of its candidate sides each capability or element name took, so the step above keeps it there. */
  sides: ReadonlyMap<string, number>;
}

export interface NameInput {
  model: DialModel;
  layout: FlatGraphLayout;
  tokens: FlatGraphPaintTokens;
  labels: DialLabels | null;
  measureText: MeasureText;
  fontFamily: string;
  scale: number;
  growth: number;
  elementLabel(id: string): string | null;
  staleByDomain: ReadonlyMap<string, number> | null;
  lit: ReadonlySet<string> | null;
  focusId: string | null;
  /** Whether the focus is selected: a selected capability is named large, with its reach beneath. */
  selected: boolean;
  /** Concepts a lit picture names ahead of the rest; one drops only where its name would print over another concept's. */
  named: ReadonlySet<string>;
  reach: { needs: number; neededBy: number } | null;
  /** The focus's lines; lit names take a side none of them crosses. */
  lines: readonly GraphLine[];
  /** The concept a connected agent is working on: always named, like the focus. */
  agentFocusId: string | null;
  attentionKey: string;
  discRadius(id: string): number;
  elementSpacingPx: number;
  /** The line the project carries under its disc while it has one; names keep off its row. */
  hubCaption?: string | null;
}

/** Whether a screen box overlaps any of `obstacles`. O(obstacles). */
export function boxUnderAny(obstacles: readonly Box[], minX: number, maxX: number, minY: number, maxY: number): boolean {
  for (let i = 0; i < obstacles.length; i += 1) {
    const o = obstacles[i]!;
    if (minX < o.maxX && maxX > o.minX && minY < o.maxY && maxY > o.minY) return true;
  }
  return false;
}

/** The end of the run of names from `from` that one concept placed together: a name with its caption or reach line. */
export function nameBlockEnd(names: readonly PlacedName[], from: number): number {
  let end = from + 1;
  while (end < names.length && names[end]!.id === names[from]!.id) end += 1;
  return end;
}

/**
 * Whether the block `names[from, to)`, drawn about its concept's screen point (x, y), stays clear
 * of every chrome box; one line under chrome hides the block, since a caption alone names nothing.
 * Admission runs per zoom step in world space, so the chrome, which moves with the screen, is
 * judged at draw time. O(block × obstacles).
 */
export function nameBlockClear(names: readonly PlacedName[], from: number, to: number, x: number, y: number, obstacles: readonly Box[]): boolean {
  for (let i = from; i < to; i += 1) {
    const b = names[i]!.box;
    if (boxUnderAny(obstacles, x + b.minX, x + b.maxX, y + b.minY, y + b.maxY)) return false;
  }
  return true;
}

/** Whether a block draws: the selection's own name always does, since the camera framed it and it is what the reader chose. */
export function nameBlockDraws(names: readonly PlacedName[], from: number, to: number, x: number, y: number, obstacles: readonly Box[], selectedId: string | null): boolean {
  return names[from]!.id === selectedId || nameBlockClear(names, from, to, x, y, obstacles);
}

export function zoomStep(scale: number, stepsPerOctave: number): number {
  return Math.round(Math.log2(Math.max(1e-6, scale)) * stepsPerOctave);
}

export function stepScale(step: number, stepsPerOctave: number): number {
  return 2 ** (step / stepsPerOctave);
}

const CELL_PX = 96;

/** Uniform grid over world-space boxes: insert and overlap queries cost O(cells touched). */
class Occupancy {
  private readonly cells = new Map<string, Box[]>();
  constructor(private readonly cell: number) {}

  private keys(b: Box): string[] {
    const out: string[] = [];
    for (let gx = Math.floor(b.minX / this.cell); gx <= Math.floor(b.maxX / this.cell); gx += 1) {
      for (let gy = Math.floor(b.minY / this.cell); gy <= Math.floor(b.maxY / this.cell); gy += 1) out.push(`${gx},${gy}`);
    }
    return out;
  }

  hits(b: Box): boolean {
    return this.count(b, 1) > 0;
  }

  /** Boxes `b` overlaps, counted up to `limit`; a box in several cells counts once per cell. */
  count(b: Box, limit = Infinity): number {
    let n = 0;
    for (const key of this.keys(b)) {
      for (const o of this.cells.get(key) ?? []) {
        if (b.minX < o.maxX && b.maxX > o.minX && b.minY < o.maxY && b.maxY > o.minY && (n += 1) >= limit) return n;
      }
    }
    return n;
  }

  add(b: Box): void {
    for (const key of this.keys(b)) {
      const list = this.cells.get(key);
      if (list) list.push(b);
      else this.cells.set(key, [b]);
    }
  }
}

function worldBox(at: Point, rel: Box, scale: number): Box {
  return { minX: at.x + rel.minX / scale, maxX: at.x + rel.maxX / scale, minY: at.y + rel.minY / scale, maxY: at.y + rel.maxY / scale };
}

/** The world box a screen box covers anywhere between two scales: each edge moves monotonically with 1 / scale. */
function sweptBox(at: Point, rel: Box, lo: number, hi: number): Box {
  const a = worldBox(at, rel, lo);
  const b = worldBox(at, rel, hi);
  return { minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX), minY: Math.min(a.minY, b.minY), maxY: Math.max(a.maxY, b.maxY) };
}

function grown(b: Box, px: number): Box {
  return { minX: b.minX - px, maxX: b.maxX + px, minY: b.minY - px, maxY: b.maxY + px };
}

/** Segments per lit line: the frame's bow strays under a pixel from a twelve-chord polyline at any lit length on screen. */
const LINE_SAMPLES = 12;

const linePath = emptyArcPath();
const lineTrims = new Float64Array(2);

/** The focus's lines as world polylines of the curves the frame draws at `scale`, trimmed alike. */
export function linePolylines(
  lines: readonly GraphLine[], layout: FlatGraphLayout, tokens: FlatGraphPaintTokens, scale: number, growth: number, discRadius: (id: string) => number,
): Float64Array[] {
  const out: Float64Array[] = [];
  for (const line of lines) {
    const from = layout.positions.get(line.from) ?? layout.itemAt.get(line.from);
    const to = layout.positions.get(line.to) ?? layout.itemAt.get(line.to);
    if (!from || !to) continue;
    litLineTrimsInto(lineTrims, layout, line, Math.hypot(to.x - from.x, to.y - from.y) * scale, scale, growth, discRadius(line.from), discRadius(line.to), tokens);
    if (!arcPathInto(linePath, from, to, tokens.lineBow, lineTrims[0]! / scale, lineTrims[1]! / scale)) continue;
    const { a, c, b } = linePath;
    const pts = new Float64Array((LINE_SAMPLES + 1) * 2);
    for (let k = 0; k <= LINE_SAMPLES; k += 1) {
      const t = k / LINE_SAMPLES;
      const u = 1 - t;
      pts[k * 2] = u * u * a.x + 2 * u * t * c.x + t * t * b.x;
      pts[k * 2 + 1] = u * u * a.y + 2 * u * t * c.y + t * t * b.y;
    }
    out.push(pts);
  }
  return out;
}

/** Liang–Barsky: whether the segment from (x0, y0) to (x1, y1) enters `b`. */
/** A leader's hairline in screen pixels about its mark's centre: from the mark's rim to one pad short of the text. */
export function leaderSegment(n: PlacedName, markRadius: number, padPx: number): { x0: number; y0: number; x1: number; y1: number } {
  const reach = Math.hypot(n.dx, n.dy);
  return { x0: (n.dx / reach) * markRadius, y0: (n.dy / reach) * markRadius, x1: n.dx - Math.sign(n.dx) * padPx, y1: n.dy };
}

export function segmentCrossesBox(x0: number, y0: number, x1: number, y1: number, b: Box): boolean {
  let enter = 0;
  let leave = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const edges: [number, number][] = [[-dx, x0 - b.minX], [dx, b.maxX - x0], [-dy, y0 - b.minY], [dy, b.maxY - y0]];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) enter = Math.max(enter, r);
    else leave = Math.min(leave, r);
    if (enter > leave) return false;
  }
  return true;
}

/** Whether any lit line runs through `b`: O(lines × LINE_SAMPLES). */
function linesCross(polylines: readonly Float64Array[], b: Box): boolean {
  for (const pts of polylines) {
    for (let k = 0; k < LINE_SAMPLES; k += 1) {
      if (segmentCrossesBox(pts[k * 2]!, pts[k * 2 + 1]!, pts[k * 2 + 2]!, pts[k * 2 + 3]!, b)) return true;
    }
  }
  return false;
}

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

function font(weight: number, px: number, family: string): string {
  return `${weight} ${px}px ${family}`;
}

type DomainBlockInput = Pick<NameInput, "model" | "tokens" | "labels" | "measureText" | "fontFamily" | "staleByDomain" | "discRadius">;

/**
 * A domain's name and caption. A selected domain's reach line takes the caption's row: the layout
 * keeps members off a two-row title, and the detail panel shows the membership the caption counts.
 * A resting caption draws only a stale count, the one fact in it that asks for attention.
 */
function domainBlock(input: DomainBlockInput, domainId: string, reachLine: string | null = null, captionRests = false): PlacedName[] {
  const { model, tokens: t, labels, measureText, fontFamily } = input;
  const d = model.domainById.get(domainId)!;
  const r = input.discRadius(domainId);
  const nameFont = font(FONT_WEIGHT.strong, t.domainNamePx, fontFamily);
  const nameW = measureText(d.label, nameFont);
  const nameY = r + t.nameGapPx + t.domainNamePx / 2;
  const out: PlacedName[] = [{
    id: domainId, role: "domain", text: d.label, font: nameFont, dx: 0, dy: nameY, align: "center",
    box: { minX: -nameW / 2 - t.namePadPx, maxX: nameW / 2 + t.namePadPx, minY: nameY - t.domainNamePx / 2 - t.namePadPx, maxY: nameY + t.domainNamePx / 2 + t.namePadPx },
  }];
  if (labels) {
    const stale = input.staleByDomain?.get(domainId) ?? 0;
    const units = labels.units(d.capabilityIds.length, d.elementCount);
    const text = captionRests ? labels.stale(stale) : stale > 0 ? `${units} · ${labels.stale(stale)}` : units;
    const captionFont = font(400, t.captionPx, fontFamily);
    const y = nameY + t.domainNamePx / 2 + t.captionGapPx + t.captionPx / 2;
    if (reachLine) {
      const figures = tabularPieces(reachLine, captionFont, measureText);
      const min = -figures.width / 2;
      out.push({
        id: domainId, role: "reach", text: reachLine, font: captionFont, dx: 0, dy: y, align: "center",
        box: { minX: min - t.namePadPx, maxX: -min + t.namePadPx, minY: y - t.captionPx / 2 - t.namePadPx, maxY: y + t.captionPx / 2 + t.namePadPx },
        pieces: figures.pieces.map((p) => ({ text: p.text, dx: min + p.dx })),
      });
    } else if (!captionRests || stale > 0) {
      const w = measureText(text, captionFont);
      out.push({
        id: domainId, role: "units", text, font: captionFont, dx: 0, dy: y, align: "center",
        box: { minX: -w / 2 - t.namePadPx, maxX: w / 2 + t.namePadPx, minY: y - t.captionPx / 2 - t.namePadPx, maxY: y + t.captionPx / 2 + t.namePadPx },
      });
    }
  }
  return out;
}

/**
 * A domain block moved above its disc, its lines in the same order: where a partner domain's title
 * goes when a lit domain line would run through it below, so the line meets the disc.
 */
function blockAbove(block: readonly PlacedName[]): PlacedName[] {
  let top = Infinity;
  let bottom = -Infinity;
  for (const n of block) {
    top = Math.min(top, n.box.minY);
    bottom = Math.max(bottom, n.box.maxY);
  }
  const shift = -(top + bottom);
  return block.map((n) => ({ ...n, dy: n.dy + shift, box: { ...n.box, minY: n.box.minY + shift, maxY: n.box.maxY + shift } }));
}

/** Whether a domain's title may take the side above its disc: a far end of a focused domain's lines. */
function titleMayRise(input: Pick<NameInput, "model" | "focusId" | "named">, domainId: string): boolean {
  const focus = input.focusId;
  return focus !== null && focus !== domainId && input.model.domainById.has(focus) && input.named.has(domainId);
}

/** The selected domain's reach line, null for any other domain or picture. */
function domainReachLine(input: Pick<NameInput, "selected" | "focusId" | "labels" | "reach">, domainId: string): string | null {
  return input.selected && input.focusId === domainId ? reachText(input.labels, input.reach) : null;
}

/**
 * Each domain's name and caption block at the overview, which the layout keeps clear of members,
 * wide enough for the reach line that takes the caption's row when the domain is selected; `name`
 * measures the name row alone. O(flows × D).
 */
export function domainTitleBlocks(input: Omit<DomainBlockInput, "staleByDomain" | "discRadius">, rows: "all" | "name" = "all"): Map<string, FlatGraphTitle> {
  const blocks = new Map<string, FlatGraphTitle>();
  const block: DomainBlockInput = { ...input, staleByDomain: null, discRadius: () => input.tokens.domainDiscPx };
  for (const d of input.model.domains) {
    const { needs, usedBy } = domainPartners(input.model.flows, d.id);
    const reachLine = reachText(input.labels, { needs: needs.length, neededBy: usedBy.length });
    const drawn = [...domainBlock(block, d.id), ...(reachLine ? domainBlock(block, d.id, reachLine) : [])];
    const boxes = drawn.filter((n) => rows === "all" || n.role === "domain").map((n) => n.box);
    blocks.set(d.id, {
      halfWidthPx: Math.max(...boxes.map((b) => Math.max(-b.minX, b.maxX))),
      topPx: Math.min(...boxes.map((b) => b.minY)),
      bottomPx: Math.max(...boxes.map((b) => b.maxY)),
    });
  }
  return blocks;
}

/**
 * How far the project's name above the hub and its two caption lines below reach from the hub's
 * centre at the overview. The layout keeps every cluster outside that circle; the lines' ends reach
 * past it sideways, where a cluster's own title already holds its members off. O(1).
 */
export function hubBlockReachPx(input: Pick<NameInput, "model" | "tokens">): number {
  const { model, tokens: t } = input;
  if (model.projectId === null) return 0;
  const nameTop = t.projectDiscPx + t.nameGapPx + t.projectNamePx + t.namePadPx;
  const captionBottom = t.projectDiscPx + t.nameGapPx + 2 * t.captionPx + t.captionGapPx + t.namePadPx;
  return Math.max(nameTop, captionBottom);
}

function projectName(input: NameInput): PlacedName | null {
  const { model, tokens: t, measureText, fontFamily } = input;
  if (model.projectId === null || !model.projectLabel) return null;
  const f = font(FONT_WEIGHT.strong, t.projectNamePx, fontFamily);
  const w = measureText(model.projectLabel, f);
  const y = -input.discRadius(model.projectId) - t.nameGapPx - t.projectNamePx / 2;
  return {
    id: model.projectId, role: "project", text: model.projectLabel, font: f, dx: 0, dy: y, align: "center",
    box: { minX: -w / 2 - t.namePadPx, maxX: w / 2 + t.namePadPx, minY: y - t.projectNamePx / 2 - t.namePadPx, maxY: y + t.projectNamePx / 2 + t.namePadPx },
  };
}

type NameShape = Pick<NameInput, "tokens" | "measureText" | "fontFamily" | "selected" | "focusId" | "discRadius" | "growth" | "named" | "lit" | "labels" | "reach">;

function sideNames(input: NameShape, id: string, role: "capability" | "element", text: string): PlacedName[][] {
  const { tokens: t, measureText, fontFamily } = input;
  if (input.selected && id === input.focusId) return selectedNames(input, id, role, text);
  const px = role === "capability" ? t.capNamePx : t.elementNamePx;
  const weight = role === "capability" ? FONT_WEIGHT.emphasis : input.lit?.has(id) ? FONT_WEIGHT.signature : 400;
  const f = font(weight, px, fontFamily);
  const w = measureText(text, f);
  const r = role === "capability" ? input.discRadius(id) : t.elementDotPx * input.growth;
  const x = r + t.nameGapPx;
  const half = px / 2 + t.namePadPx;
  const sides: PlacedName[][] = [
    [{ id, role, text, font: f, dx: x, dy: 0, align: "left", box: { minX: x - t.namePadPx, maxX: x + w + t.namePadPx, minY: -half, maxY: half } }],
    [{ id, role, text, font: f, dx: -x, dy: 0, align: "right", box: { minX: -x - w - t.namePadPx, maxX: -x + t.namePadPx, minY: -half, maxY: half } }],
  ];
  if (!input.named.has(id)) return sides;
  const below = x + px / 2;
  const centred = (dy: number): PlacedName[] => [{ id, role, text, font: f, dx: 0, dy, align: "center", box: { minX: -w / 2 - t.namePadPx, maxX: w / 2 + t.namePadPx, minY: dy - half, maxY: dy + half } }];
  const rise = px + t.namePadPx * 2;
  const diagonal = (side: 1 | -1, dy: number): PlacedName[] => [{
    id, role, text, font: f, dx: side * x, dy, align: side === 1 ? "left" : "right",
    box: { minX: side === 1 ? x - t.namePadPx : -x - w - t.namePadPx, maxX: side === 1 ? x + w + t.namePadPx : -x + t.namePadPx, minY: dy - half, maxY: dy + half },
    leader: true,
  }];
  const onRow = [...sides, centred(below), centred(-below)];
  // Only a selection's far end leaves its row: a pointed-at name must stay under the pointer.
  if (!input.selected || id === input.focusId) return onRow;
  return [...onRow, diagonal(1, -rise), diagonal(-1, -rise), diagonal(1, rise), diagonal(-1, rise)];
}

/** Text runs with each digit centred in a cell as wide as the widest digit, so figures align as `tnum` would. */
function tabularPieces(text: string, f: string, measureText: MeasureText): { pieces: NamePiece[]; width: number } {
  let cell = 0;
  for (let d = 0; d <= 9; d += 1) cell = Math.max(cell, measureText(String(d), f));
  const pieces: NamePiece[] = [];
  let x = 0;
  let run = "";
  const flush = () => {
    if (!run) return;
    pieces.push({ text: run, dx: x });
    x += measureText(run, f);
    run = "";
  };
  for (const ch of text) {
    if (ch < "0" || ch > "9") {
      run += ch;
      continue;
    }
    flush();
    pieces.push({ text: ch, dx: x + (cell - measureText(ch, f)) / 2 });
    x += cell;
  }
  flush();
  return { pieces, width: x };
}

/** The reach line's text: zero sides are left out, and nothing at all is null. */
export function reachText(labels: DialLabels | null, reach: { needs: number; neededBy: number } | null): string | null {
  if (!labels || !reach) return null;
  const parts: string[] = [];
  if (reach.needs > 0 && labels.reachNeeds) parts.push(labels.reachNeeds(reach.needs));
  if (reach.neededBy > 0 && labels.reachNeededBy) parts.push(labels.reachNeededBy(reach.neededBy));
  return parts.length > 0 ? parts.join(" · ") : null;
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
  const line = reachText(input.labels, input.reach);
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
  return [
    block("left", side, -px / 2),
    block("right", -side, -px / 2),
    block("center", 0, side),
    block("center", 0, -side - height),
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
  }
  return union(boxes);
}

interface Candidate { id: string; element: boolean; tries: () => PlacedName[][] }

function candidates(input: NameInput, degree: ReadonlyMap<string, number>): Candidate[] {
  const { model, layout } = input;
  const lit = input.lit;
  const caps = [...model.capabilityById.values()].filter((c) => layout.positions.has(c.id));
  const rank = (a: { id: string }, b: { id: string }) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || byId(a.id, b.id);
  const capCandidate = (c: { id: string; label: string }): Candidate => ({ id: c.id, element: false, tries: () => sideNames(input, c.id, "capability", c.label) });
  const showElements = input.elementSpacingPx >= input.tokens.elementNameSpacingPx;
  const elementIds = showElements ? [...model.capabilityOf.keys(), ...model.domains.flatMap((d) => d.directElementIds)].filter((id) => layout.positions.has(id)).sort(byId) : [];
  const elementCandidate = (id: string): Candidate => ({ id, element: true, tries: () => { const label = input.elementLabel(id); return label ? sideNames(input, id, "element", label) : []; } });
  const focusFirst = (a: { id: string }, b: { id: string }) => (a.id === input.focusId ? -1 : b.id === input.focusId ? 1 : rank(a, b));
  const litCaps = lit ? caps.filter((c) => lit.has(c.id)).sort(focusFirst) : [];
  const namesElements = lit !== null && input.focusId !== null && !model.domainById.has(input.focusId);
  const litElements = namesElements ? [...lit!].filter((id) => model.capabilityOf.has(id) || (model.domainOf.has(id) && !model.domainById.has(id) && !model.capabilityById.has(id))).filter((id) => layout.positions.has(id)).sort((a, b) => (a === input.focusId ? -1 : b === input.focusId ? 1 : byId(a, b))) : [];
  const rest = caps.filter((c) => !lit?.has(c.id)).sort(rank);
  const orphans = layout.orphanIds.filter((id) => !lit || lit.has(id)).map((id): Candidate => ({
    id, element: false, tries: () => { const label = input.elementLabel(id); return label ? sideNames(input, id, "capability", label) : []; },
  }));
  const agent = input.agentFocusId;
  const agentCandidate: Candidate[] = agent === null || !layout.positions.has(agent) || model.domainById.has(agent) || agent === model.projectId ? []
    : model.capabilityById.has(agent) ? [capCandidate({ id: agent, label: model.capabilityById.get(agent)!.label })]
      : layout.orphanIds.includes(agent) ? orphans.filter((o) => o.id === agent) : [elementCandidate(agent)];
  const focusElement = litElements.filter((id) => id === input.focusId).map(elementCandidate);
  return [
    ...focusElement,
    ...agentCandidate,
    ...litCaps.map(capCandidate),
    ...litElements.filter((id) => id !== input.focusId).map(elementCandidate),
    ...rest.map(capCandidate),
    ...orphans,
    ...elementIds.filter((id) => !lit?.has(id)).map(elementCandidate),
  ];
}

/** The row the project's caption draws on under its disc, padded like a name. O(1). */
function hubCaptionBox(input: NameInput): Box | null {
  const { model, tokens: t } = input;
  if (!input.hubCaption || model.projectId === null || !input.layout.positions.has(model.projectId)) return null;
  const w = input.measureText(input.hubCaption, font(FONT_WEIGHT.signature, t.captionPx, input.fontFamily));
  const y = input.discRadius(model.projectId) + t.nameGapPx + t.captionPx / 2;
  return { minX: -w / 2 - t.namePadPx, maxX: w / 2 + t.namePadPx, minY: y - t.captionPx / 2 - t.namePadPx, maxY: y + t.captionPx / 2 + t.namePadPx };
}

/** How many capabilities a folded star names at rest: its most connected ones stand for the mass. */
const FOLDED_STAR_NAMES = 2;

/** The concepts outside every domain, captioned once under their group with the count. */
function orphanCaption(input: NameInput, scale: number): PlacedName | null {
  const { layout, tokens: t, labels, measureText, fontFamily } = input;
  const first = layout.orphanIds[0];
  if (first === undefined || !labels) return null;
  const at = layout.positions.get(first)!;
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of layout.orphanIds) {
    const p = layout.positions.get(id)!;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const count = layout.orphanIds.length;
  const text = labels.noDomain?.(count) ?? labels.orphans(count);
  const f = font(400, t.captionPx, fontFamily);
  const w = measureText(text, f);
  const r = Math.max(...layout.orphanIds.map((id) => input.discRadius(id)));
  const dx = ((minX + maxX) / 2 - at.x) * scale;
  const dy = (maxY - at.y) * scale + r + t.nameGapPx + t.captionPx / 2;
  return {
    id: first, role: "orphans", text, font: f, dx, dy, align: "center",
    box: { minX: dx - w / 2 - t.namePadPx, maxX: dx + w / 2 + t.namePadPx, minY: dy - t.captionPx / 2 - t.namePadPx, maxY: dy + t.captionPx / 2 + t.namePadPx },
  };
}

function admit(input: NameInput, step: number, seed: NameAdmission | null, ceiling: ReadonlySet<string> | null): NameAdmission {
  const { model, layout, tokens } = input;
  const scale = stepScale(step, tokens.zoomStepsPerOctave);
  // Every collision box covers the whole step, so names a step admits apart stay apart at any zoom inside it.
  const lowest = stepScale(step - 0.5, tokens.zoomStepsPerOctave);
  const highest = stepScale(step + 0.5, tokens.zoomStepsPerOctave);
  const span = (at: Point, rel: Box) => sweptBox(at, rel, lowest, highest);
  const grid = new Occupancy(CELL_PX / scale);
  const titles = new Occupancy(CELL_PX / scale);
  const words = new Occupancy(CELL_PX / scale);
  const conceptNames = new Occupancy(CELL_PX / scale);
  const glyphs: Box[] = [];
  const names: PlacedName[] = [];
  const ids = new Set<string>();
  const sides = new Map<string, number>();
  const discs: [string, number][] = [];
  if (model.projectId !== null && layout.positions.has(model.projectId)) discs.push([model.projectId, input.discRadius(model.projectId)]);
  for (const c of layout.clusters) {
    discs.push([c.domainId, input.discRadius(c.domainId)]);
    for (const it of c.items) if (!it.direct) discs.push([it.id, input.discRadius(it.id)]);
  }
  for (const id of layout.orphanIds) discs.push([id, input.discRadius(id)]);
  const selectedId = input.selected ? input.focusId : null;
  const marks = new Occupancy(CELL_PX / scale);
  for (const [id, r] of discs) {
    // A disc and the name beside it share an anchor and scale together, so discs keep their box at the step's own scale.
    const box = worldBox(layout.positions.get(id)!, { minX: -r, maxX: r, minY: -r, maxY: r }, scale);
    grid.add(box);
    marks.add(box);
  }
  const ringCentre = selectedId !== null ? layout.positions.get(selectedId) ?? null : null;
  const ringRadius = selectedId !== null ? (input.discRadius(selectedId) + tokens.selectedRingGapPx + tokens.selectedRingPx) / scale : 0;
  // The ring is a circle: a name beside it on a diagonal is clear of it, which its bounding box would deny.
  const onRing = (at: Point, group: readonly PlacedName[]) => ringCentre !== null && group.some((n) => {
    const b = worldBox(at, n.box, scale);
    const dx = Math.max(b.minX - ringCentre.x, 0, ringCentre.x - b.maxX);
    const dy = Math.max(b.minY - ringCentre.y, 0, ringCentre.y - b.maxY);
    return dx * dx + dy * dy < ringRadius * ringRadius;
  });
  const place = (n: PlacedName) => {
    const box = span(layout.positions.get(n.id)!, n.box);
    grid.add(box);
    words.add(box);
    glyphs.push(worldBox(layout.positions.get(n.id)!, grown(n.box, -tokens.namePadPx), scale));
    names.push(n);
    ids.add(n.id);
  };
  const project = projectName(input);
  if (project) place(project);
  const projectBox = project ? worldBox(layout.positions.get(project.id)!, project.box, scale) : null;
  const hubRow = hubCaptionBox(input);
  if (hubRow) {
    const box = span(layout.positions.get(model.projectId!)!, hubRow);
    grid.add(box);
    words.add(box);
    titles.add(box);
  }
  const polylines = input.lit !== null && input.lines.length > 0 ? linePolylines(input.lines, layout, tokens, scale, input.growth, input.discRadius) : [];
  const crossed = (at: Point, group: readonly PlacedName[]) => group.some((n) => linesCross(polylines, span(at, n.box)));
  for (const c of layout.clusters) {
    let block = domainBlock(input, c.domainId, domainReachLine(input, c.domainId), layout.compactTitles && input.focusId !== c.domainId);
    if (titleMayRise(input, c.domainId) && polylines.length > 0) {
      const at = layout.positions.get(c.domainId)!;
      const above = blockAbove(block);
      const onDisc = above.some((n) => grid.hits(span(at, n.box)));
      if (crossed(at, block) && !crossed(at, above) && !onDisc) block = above;
    }
    for (const n of block) {
      const box = span(layout.positions.get(n.id)!, n.box);
      // The census row is the one line of a title block that may go: it gives way to the project's name.
      if (n.role === "units" && projectBox !== null && box.minX < projectBox.maxX && projectBox.minX < box.maxX && box.minY < projectBox.maxY && projectBox.minY < box.maxY) continue;
      titles.add(box);
      place(n);
    }
  }
  const caption = orphanCaption(input, scale);
  if (caption) {
    const box = span(layout.positions.get(caption.id)!, caption.box);
    grid.add(box);
    words.add(box);
    names.push(caption);
  }
  const pending = candidates(input, degreeOf(model));
  // The overview fit pads the extent by the domain name size; a name past that pad would leave the
  // free map. Checked at the smallest scale this step stands for, so the whole step stays inside.
  const reach = tokens.domainNamePx / lowest;
  const inside = (at: Point, group: readonly PlacedName[]) => group.every((n) => {
    const b = worldBox(at, n.box, lowest);
    const e = layout.extent;
    return b.minX >= e.minX - reach && b.maxX <= e.maxX + reach && b.minY >= e.minY - reach && b.maxY <= e.maxY + reach;
  });
  const hits = (on: Occupancy, at: Point, group: readonly PlacedName[]) => group.some((n) => on.hits(span(at, n.box)));
  const crowding = (at: Point, group: readonly PlacedName[]) => group.reduce((sum, n) => sum + grid.count(span(at, n.box)), 0);
  const offTitles = (at: Point, group: readonly PlacedName[], gap = tokens.selectedTitleGapPx) =>
    !group.some((n) => titles.hits(span(at, grown(n.box, gap))));
  // Both boxes carry the name pad; the test box gives up one, so two names keep one pad of air between their glyphs.
  const overprints = (at: Point, group: readonly PlacedName[]) => group.some((n) => conceptNames.hits(span(at, grown(n.box, -tokens.namePadPx))));
  // A lit name takes the first side no lit line crosses. Under a lit picture a forced name other than
  // the selection and the agent's focus keeps to the sides clear of title blocks when any is, and
  // drops when each of those prints over a concept's name; an element also keeps off discs and the ring.
  const tryPlace = (cand: Candidate, force: boolean, mayOverprint = force) => {
    const at = layout.positions.get(cand.id)!;
    const all = cand.tries();
    const kept = seed?.sides.get(cand.id);
    // A name the step below placed tries that side first, so names do not trade sides and crowd one another out.
    const tries = kept !== undefined && kept > 0 && kept < all.length ? [all[kept]!, ...all.slice(0, kept), ...all.slice(kept + 1)] : all;
    const lit = polylines.length > 0 && input.lit!.has(cand.id);
    const yields = input.lit !== null && cand.id !== input.focusId && cand.id !== input.agentFocusId;
    const keepsOffTitles = cand.id === selectedId || (cand.element && input.lit !== null);
    const offRing = (group: readonly PlacedName[]) => !(yields && cand.element) || !onRing(at, group);
    // A leader may not run through a name already set down. O(names) per off-row try.
    const leaderClear = (group: readonly PlacedName[]) => !group.some((n) => {
      if (!n.leader) return false;
      const s = leaderSegment(n, Math.abs(n.dx) - tokens.nameGapPx, tokens.namePadPx);
      return glyphs.some((b) => segmentCrossesBox(at.x + s.x0 / scale, at.y + s.y0 / scale, at.x + s.x1 / scale, at.y + s.y1 / scale, b));
    });
    // Names are tested against names across the whole step; a disc is tested at the step's own scale.
    const free = (group: readonly PlacedName[]) => inside(at, group) && !group.some((n) => marks.hits(worldBox(at, n.box, scale))) && !hits(words, at, group) && (!keepsOffTitles || offTitles(at, group)) && offRing(group) && leaderClear(group);
    let fit = chooseSide(tries, free, (group) => lit && crossed(at, group))?.side;
    // A forced name with no side clear across the whole step takes one clear at the step's own scale.
    if (!fit && force) {
      const clearNow = (group: readonly PlacedName[]) => inside(at, group) && !group.some((n) => grid.hits(worldBox(at, n.box, scale)))
        && (!keepsOffTitles || !group.some((n) => titles.hits(worldBox(at, grown(n.box, tokens.selectedTitleGapPx), scale)))) && offRing(group) && leaderClear(group);
      fit = chooseSide(tries, clearNow, (group) => lit && crossed(at, group))?.side;
    }
    if (!fit && mayOverprint && tries.length > 0) {
      const apart = yields ? tries.filter((group) => !hits(words, at, group) && leaderClear(group) && (!cand.element || (offTitles(at, group) && offRing(group)))) : [];
      const offMarks = cand.element ? apart.filter((group) => !hits(marks, at, group)) : apart;
      const clear = tries.filter((group) => offTitles(at, group, cand.id === selectedId ? tokens.selectedTitleGapPx : 0));
      const offTitle = clear.length > 0 ? clear : tries;
      const legible = yields ? offTitle.filter((group) => !overprints(at, group) && leaderClear(group)) : offTitle;
      const pool = offMarks.length > 0 ? offMarks : apart.length > 0 ? apart : yields && cand.element ? [] : legible;
      fit = pool.length > 0 ? pool.reduce((best, group) => (crowding(at, group) < crowding(at, best) ? group : best)) : undefined;
    }
    if (fit) sides.set(cand.id, all.indexOf(fit));
    if (fit) for (const n of fit) {
      place(n);
      conceptNames.add(span(at, n.box));
    }
  };
  // The focus wins over every name, then capabilities over elements.
  const ahead = (cand: Candidate) => cand.id === input.focusId || !cand.element;
  // A name the step below showed stays where a side is clear; it never prints over another to stay.
  if (seed) for (const cand of pending) if (seed.ids.has(cand.id)) tryPlace(cand, true, false);
  for (const cand of pending) if (!ids.has(cand.id) && cand.id === input.focusId) tryPlace(cand, true);
  for (const cand of pending) if (!ids.has(cand.id) && input.named.has(cand.id) && ahead(cand)) tryPlace(cand, true);
  if (input.lit !== null) for (const cand of pending) if (!ids.has(cand.id) && !cand.element && input.lit.has(cand.id)) tryPlace(cand, false);
  for (const cand of pending) if (!ids.has(cand.id) && input.named.has(cand.id)) tryPlace(cand, true);
  // A folded star is a mass: at rest it names only its most connected few, and a folded orphan group none.
  const folded = (roomKey: string) => crowdShare(layout, roomKey, tokens, lowest, input.growth) < 1;
  const restNames = new Map<string, number>();
  const starOf = (id: string) => (model.capabilityById.has(id) ? model.domainOf.get(id) ?? null : null);
  const countName = (id: string) => {
    const domainId = starOf(id);
    if (domainId !== null) restNames.set(domainId, (restNames.get(domainId) ?? 0) + 1);
  };
  for (const id of ids) countName(id);
  const orphanIds = new Set(layout.orphanIds);
  const overBudget = (cand: Candidate) => {
    if (cand.element || input.lit?.has(cand.id)) return false;
    if (orphanIds.has(cand.id)) return folded(ORPHAN_ROOM);
    const domainId = starOf(cand.id);
    return domainId !== null && (restNames.get(domainId) ?? 0) >= FOLDED_STAR_NAMES && folded(domainId);
  };
  for (const cand of pending) {
    if (ids.has(cand.id) || (ceiling && !ceiling.has(cand.id))) continue;
    const forced = cand.id === input.focusId || cand.id === input.agentFocusId;
    if (!forced && overBudget(cand)) continue;
    tryPlace(cand, forced);
    if (ids.has(cand.id)) countName(cand.id);
  }
  if (polylines.length > 0) {
    for (const n of names) if (input.lit!.has(n.id) && crossed(layout.positions.get(n.id)!, [n])) n.backed = true;
  }
  return { step, names, ids, sides };
}

const degreeCache = new WeakMap<DialModel, Map<string, number>>();

function degreeOf(model: DialModel): Map<string, number> {
  let hit = degreeCache.get(model);
  if (!hit) {
    hit = new Map();
    for (const dep of model.capabilityDependencies) {
      hit.set(dep.from, (hit.get(dep.from) ?? 0) + 1);
      hit.set(dep.to, (hit.get(dep.to) ?? 0) + 1);
    }
    degreeCache.set(model, hit);
  }
  return hit;
}

interface NameCache {
  font: string;
  elementNames: boolean;
  stale: ReadonlyMap<string, number> | null;
  hubCaption: string | null;
  rest: Map<number, NameAdmission>;
  focus: Map<string, NameAdmission>;
}
const FOCUS_CACHE_MAX = 32;
const caches = new WeakMap<FlatGraphLayout, NameCache>();

function nearest(map: ReadonlyMap<number, NameAdmission>, step: number, below: boolean): NameAdmission | null {
  let best: NameAdmission | null = null;
  for (const [s, a] of map) {
    if (below ? s < step && (!best || s > best.step) : s > step && (!best || s < best.step)) best = a;
  }
  return best;
}

const NO_NAMES: ReadonlySet<string> = new Set();

/** The disc a selected capability, element or orphan draws at, never smaller than its own. */
export function selectedDiscRadius(base: number, tokens: Pick<FlatGraphPaintTokens, "selectedDiscPx">, growth: number): number {
  return Math.max(base, tokens.selectedDiscPx * growth);
}

function withSelectedRadius(input: NameInput): NameInput {
  const focus = input.focusId;
  if (!input.selected || focus === null || input.model.domainById.has(focus) || focus === input.model.projectId) return input;
  const own = input.discRadius;
  return { ...input, discRadius: (id) => (id === focus ? selectedDiscRadius(own(id), input.tokens, input.growth) : own(id)) };
}

/** One admission at the input's zoom, outside the per-step cache: a camera weighing a zoom it has not shown yet. */
export function admitNamesAt(input: NameInput): NameAdmission {
  return admit(withSelectedRadius(input), zoomStep(input.scale, input.tokens.zoomStepsPerOctave), null, null);
}

/**
 * Names admitted at the camera's quantised zoom step, cached per step so pan and drag never
 * re-run admission. Without attention, a step's names include every name of the nearest admitted
 * step below and only names the nearest admitted step above also holds, so zooming in only adds.
 */
export function admittedNames(input: NameInput): NameAdmission {
  const step = zoomStep(input.scale, input.tokens.zoomStepsPerOctave);
  const elementNames = input.elementSpacingPx >= input.tokens.elementNameSpacingPx;
  let cache = caches.get(input.layout);
  if (!cache || cache.font !== input.fontFamily || cache.elementNames !== elementNames || cache.stale !== input.staleByDomain || cache.hubCaption !== (input.hubCaption ?? null)) {
    cache = { font: input.fontFamily, elementNames, stale: input.staleByDomain, hubCaption: input.hubCaption ?? null, rest: new Map(), focus: new Map() };
    caches.set(input.layout, cache);
  }
  if (input.lit !== null || input.agentFocusId !== null) {
    const focusKey = `${step}|${input.attentionKey}|${input.agentFocusId ?? ""}`;
    const hit = cache.focus.get(focusKey);
    if (hit) return hit;
    if (cache.focus.size >= FOCUS_CACHE_MAX) cache.focus.clear();
    const made = admit(withSelectedRadius(input), step, null, null);
    cache.focus.set(focusKey, made);
    return made;
  }
  const hit = cache.rest.get(step);
  if (hit) return hit;
  const restInput = { ...input, lit: null, focusId: null, agentFocusId: null, selected: false, named: NO_NAMES, reach: null, lines: [] };
  const made = admit(restInput, step, nearest(cache.rest, step, true), nearest(cache.rest, step, false)?.ids ?? null);
  cache.rest.set(step, made);
  return made;
}
