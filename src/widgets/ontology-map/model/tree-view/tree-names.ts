import type {
  TreeDrawList,
  TreeFocus,
  TreeModel,
  TreeNameBox,
  TreeNameCandidate,
  TreeNamePlacement,
  TreeNameSide,
  TreeNameSizes,
  TreeNodeKind,
  TreeRect,
} from "./types";
import { TREE_ARC_BUDGET } from "./types";

/** Side length of the overlap grid's cells, CSS pixels: a few name heights. */
const PLACE_CELL_PX = 48;

const RANK_BLOCK = 0;
const RANK_PINNED = 1;
const RANK_CAPABILITY = 2;
const RANK_ELEMENT = 3;
const UNNAMED = -1;

const PIN_ARC_END = 1;
const PIN_FOCUS = 2;

/** Placement tries the sides in their `TreeNameSide` order: right, left, above, below. */
const FIRST_SIDE: TreeNameSide = 0;
const LAST_SIDE: TreeNameSide = 3;

let markOfNode = new Int32Array(0);
let pinnedMark = new Uint8Array(0);
let spacedMark = new Uint8Array(0);
let elementMarks = new Int32Array(0);
let elementCellX = new Int32Array(0);
let elementCellY = new Int32Array(0);
let elementNext = new Int32Array(0);
let elementHead = new Int32Array(0);

/**
 * Fills `out[0..n)` with the names worth trying, in placement order, and returns n.
 * O(m log m) for m marks: one pass over the marks and the focus, then a heap sort.
 * A sub line is sized `domainSub` and measured as "domain" text scaled to that size.
 */
export function treeNameCandidates(
  list: TreeDrawList,
  model: TreeModel,
  focus: TreeFocus | null,
  measure: (text: string, kind: TreeNodeKind) => number,
  subOf: (node: number) => string | null,
  sizes: TreeNameSizes,
  elementNamePitchPx: number,
  out: TreeNameCandidate[],
): number {
  const count = list.count;
  growCandidateScratch(model.count, count);
  for (let i = 0; i < count; i += 1) markOfNode[list.marks[i]!.node] = i;
  if (focus) pinFocus(focus, model);
  markSpacedElements(list, model, elementNamePitchPx);

  let n = 0;
  for (let i = 0; i < count; i += 1) {
    const mark = list.marks[i]!;
    const node = mark.node;
    const pinned = pinnedMark[i]! > 0;
    const rank = rankOf(node, model, pinned, spacedMark[i] === 1);
    if (rank === UNNAMED) continue;
    const text = model.labels[node] ?? "";
    if (text === "") continue;
    const kind = model.kinds[node]!;
    const sub = rank === RANK_BLOCK ? subOf(node) : null;
    const subWidth = sub ? (measure(sub, "domain") * sizes.domainSub) / sizes.domain : 0;
    const candidate = (out[n] ??= emptyCandidate());
    candidate.node = node;
    candidate.text = text;
    candidate.sub = sub;
    candidate.x = mark.x;
    candidate.y = mark.y;
    candidate.radius = mark.radius;
    candidate.width = Math.max(measure(text, kind), subWidth);
    candidate.height = (fontSizeOf(kind, sizes) + (sub ? sizes.domainSub : 0)) * sizes.leading;
    candidate.priority = rank;
    candidate.pinned = pinned;
    n += 1;
  }

  sortCandidates(out, n, model);
  for (let i = 0; i < n; i += 1) out[i]!.priority = i;
  for (let i = 0; i < count; i += 1) {
    markOfNode[list.marks[i]!.node] = -1;
    pinnedMark[i] = 0;
    spacedMark[i] = 0;
  }
  return n;
}

function rankOf(node: number, model: TreeModel, pinned: boolean, spaced: boolean): number {
  switch (model.kinds[node]) {
    case "project":
      return model.ids[node] === null ? UNNAMED : RANK_BLOCK;
    case "domain":
      return RANK_BLOCK;
    case "fork":
      return RANK_BLOCK;
    case "capability":
      return pinned ? RANK_PINNED : RANK_CAPABILITY;
    case "element":
      if (pinned) return RANK_PINNED;
      return spaced ? RANK_ELEMENT : UNNAMED;
    default:
      return UNNAMED;
  }
}

/** A fork is named only as the loose shoot, whose caption is its label. */
function fontSizeOf(kind: TreeNodeKind, sizes: TreeNameSizes): number {
  switch (kind) {
    case "project":
      return sizes.project;
    case "domain":
      return sizes.domain;
    case "element":
      return sizes.element;
    default:
      return sizes.capability;
  }
}

function emptyCandidate(): TreeNameCandidate {
  return { node: -1, text: "", sub: null, x: 0, y: 0, radius: 0, width: 0, height: 0, priority: 0, pinned: false };
}

function growCandidateScratch(nodes: number, marks: number): void {
  if (markOfNode.length < nodes) {
    markOfNode = new Int32Array(nodes);
    markOfNode.fill(-1);
  }
  if (pinnedMark.length < marks) {
    pinnedMark = new Uint8Array(marks);
    spacedMark = new Uint8Array(marks);
    elementMarks = new Int32Array(marks);
    elementCellX = new Int32Array(marks);
    elementCellY = new Int32Array(marks);
    elementNext = new Int32Array(marks);
  }
}

/** Pins the focus and the ends of the arcs the painter draws: `needs`, then `usedBy`, within the budget. */
function pinFocus(focus: TreeFocus, model: TreeModel): void {
  pinHolder(focus.node, model, PIN_FOCUS);
  const needs = Math.min(focus.needs.length, TREE_ARC_BUDGET);
  const usedBy = Math.min(focus.usedBy.length, TREE_ARC_BUDGET - needs);
  for (let i = 0; i < needs; i += 1) pinHolder(focus.needs[i]!, model, PIN_ARC_END);
  for (let i = 0; i < usedBy; i += 1) pinHolder(focus.usedBy[i]!, model, PIN_ARC_END);
}

/** Pins the node's mark, or the closed mark it is folded into. O(depth). */
function pinHolder(node: number, model: TreeModel, pin: number): void {
  let at = node;
  while (at >= 0 && at < model.count && markOfNode[at]! < 0) at = model.parent[at]!;
  if (at < 0 || at >= model.count) return;
  const mark = markOfNode[at]!;
  pinnedMark[mark] = Math.max(pinnedMark[mark]!, pin);
}

/**
 * An element mark is spaced when no other drawn element lies closer than the pitch.
 * Expected O(e) for e element marks: a hash of pitch-sized cells, each looking at 3 x 3 cells.
 */
function markSpacedElements(list: TreeDrawList, model: TreeModel, pitchPx: number): void {
  let e = 0;
  for (let i = 0; i < list.count; i += 1) {
    if (model.kinds[list.marks[i]!.node] === "element") elementMarks[e++] = i;
  }
  if (e === 0 || !(pitchPx < Infinity)) return;
  if (!(pitchPx > 0)) {
    for (let k = 0; k < e; k += 1) spacedMark[elementMarks[k]!] = 1;
    return;
  }
  let tableSize = 1;
  while (tableSize < e * 2) tableSize *= 2;
  if (elementHead.length < tableSize) elementHead = new Int32Array(tableSize);
  elementHead.fill(-1, 0, tableSize);
  const mask = tableSize - 1;
  for (let k = 0; k < e; k += 1) {
    const mark = list.marks[elementMarks[k]!]!;
    const cx = Math.floor(mark.x / pitchPx);
    const cy = Math.floor(mark.y / pitchPx);
    elementCellX[k] = cx;
    elementCellY[k] = cy;
    const slot = cellHash(cx, cy) & mask;
    elementNext[k] = elementHead[slot]!;
    elementHead[slot] = k;
  }
  const pitchSq = pitchPx * pitchPx;
  for (let k = 0; k < e; k += 1) {
    const mark = list.marks[elementMarks[k]!]!;
    if (!hasElementWithin(k, mark.x, mark.y, pitchSq, list, mask)) spacedMark[elementMarks[k]!] = 1;
  }
}

function hasElementWithin(k: number, x: number, y: number, pitchSq: number, list: TreeDrawList, mask: number): boolean {
  const cx = elementCellX[k]!;
  const cy = elementCellY[k]!;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let j = elementHead[cellHash(cx + dx, cy + dy) & mask]!; j >= 0; j = elementNext[j]!) {
        if (j === k || elementCellX[j] !== cx + dx || elementCellY[j] !== cy + dy) continue;
        const other = list.marks[elementMarks[j]!]!;
        const ox = other.x - x;
        const oy = other.y - y;
        if (ox * ox + oy * oy < pitchSq) return true;
      }
    }
  }
  return false;
}

function cellHash(cx: number, cy: number): number {
  return Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663);
}

/** Rank; the focus before arc ends; capabilities by element count and id; then the nearer mark. */
function compareCandidates(a: TreeNameCandidate, b: TreeNameCandidate, model: TreeModel): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  if (a.priority === RANK_PINNED) {
    const byPin = pinnedMark[markOfNode[b.node]!]! - pinnedMark[markOfNode[a.node]!]!;
    if (byPin !== 0) return byPin;
  }
  if (a.priority === RANK_CAPABILITY) {
    const byElements = model.elements[b.node]! - model.elements[a.node]!;
    if (byElements !== 0) return byElements;
    const idA = model.ids[a.node] ?? "";
    const idB = model.ids[b.node] ?? "";
    if (idA !== idB) return idA < idB ? -1 : 1;
  }
  return markOfNode[b.node]! - markOfNode[a.node]!;
}

/** In-place heap sort of `items[0..n)`: O(n log n), no allocation. */
function sortCandidates(items: TreeNameCandidate[], n: number, model: TreeModel): void {
  for (let start = (n >> 1) - 1; start >= 0; start -= 1) siftDown(items, start, n, model);
  for (let end = n - 1; end > 0; end -= 1) {
    const top = items[0]!;
    items[0] = items[end]!;
    items[end] = top;
    siftDown(items, 0, end, model);
  }
}

function siftDown(items: TreeNameCandidate[], start: number, end: number, model: TreeModel): void {
  let root = start;
  for (;;) {
    let child = root * 2 + 1;
    if (child >= end) return;
    if (child + 1 < end && compareCandidates(items[child]!, items[child + 1]!, model) < 0) child += 1;
    if (compareCandidates(items[root]!, items[child]!, model) >= 0) return;
    const swap = items[root]!;
    items[root] = items[child]!;
    items[child] = swap;
    root = child;
  }
}

let cellHead = new Int32Array(0);
let entryNext = new Int32Array(0);
let entryOccupant = new Int32Array(0);
let occupantStamp = new Int32Array(0);
let entryCount = 0;
let gridCols = 0;
let gridRows = 0;

/**
 * Places `candidates[0..count)` greedily in array order (ascending `priority`), each on the
 * first side that is inside `free` and keeps `spacing.pad` from every mark and placed box.
 * With `keep`, only kept nodes are tried, each on its recorded side. Expected O(c + m) with a grid.
 */
export function placeTreeNames(
  candidates: readonly TreeNameCandidate[],
  count: number,
  list: TreeDrawList,
  free: TreeRect,
  keep: ReadonlyMap<number, TreeNameSide> | null,
  out: TreeNamePlacement,
  spacing: Pick<TreeNameSizes, "gap" | "pad">,
): void {
  out.count = 0;
  out.dropped = 0;
  out.tested = 0;
  resetGrid(free, list.count + count);
  for (let i = 0; i < list.count; i += 1) {
    const mark = list.marks[i]!;
    const r = mark.radius + spacing.pad;
    insertOccupant(i, mark.x - r, mark.y - r, mark.x + r, mark.y + r, free);
  }
  let query = 0;
  for (let c = 0; c < count; c += 1) {
    const candidate = candidates[c]!;
    const kept = keep ? keep.get(candidate.node) : undefined;
    if (keep && kept === undefined) continue;
    const box = (out.boxes[out.count] ??= emptyBox());
    let placed = false;
    const lastSide = kept ?? LAST_SIDE;
    for (let side = kept ?? FIRST_SIDE; side <= lastSide; side += 1) {
      setBoxOnSide(box, candidate, side as TreeNameSide, spacing.gap);
      query += 1;
      if (insideRect(box, free) && isClear(box, candidate.node, list, out, free, spacing.pad, query)) {
        placed = true;
        break;
      }
    }
    if (!placed) {
      out.dropped += 1;
      continue;
    }
    box.node = candidate.node;
    box.text = candidate.text;
    box.sub = candidate.sub;
    insertOccupant(list.count + out.count, box.x, box.y, box.x + box.width, box.y + box.height, free);
    out.count += 1;
  }
}

function emptyBox(): TreeNameBox {
  return { node: -1, text: "", sub: null, x: 0, y: 0, width: 0, height: 0, side: 0 };
}

function setBoxOnSide(box: TreeNameBox, candidate: TreeNameCandidate, side: TreeNameSide, gapPx: number): void {
  const reach = candidate.radius + gapPx;
  box.width = candidate.width;
  box.height = candidate.height;
  box.side = side;
  if (side === 0 || side === 1) {
    box.x = side === 0 ? candidate.x + reach : candidate.x - reach - candidate.width;
    box.y = candidate.y - candidate.height / 2;
  } else {
    box.x = candidate.x - candidate.width / 2;
    box.y = side === 2 ? candidate.y - reach - candidate.height : candidate.y + reach;
  }
}

function insideRect(box: TreeNameBox, rect: TreeRect): boolean {
  return (
    box.x >= rect.x &&
    box.y >= rect.y &&
    box.x + box.width <= rect.x + rect.width &&
    box.y + box.height <= rect.y + rect.height
  );
}

function resetGrid(free: TreeRect, occupants: number): void {
  gridCols = Math.max(1, Math.ceil(free.width / PLACE_CELL_PX));
  gridRows = Math.max(1, Math.ceil(free.height / PLACE_CELL_PX));
  const cells = gridCols * gridRows;
  if (cellHead.length < cells) cellHead = new Int32Array(cells);
  cellHead.fill(-1, 0, cells);
  if (occupantStamp.length < occupants) occupantStamp = new Int32Array(occupants);
  occupantStamp.fill(0, 0, occupants);
  entryCount = 0;
}

function insertOccupant(occupant: number, x0: number, y0: number, x1: number, y1: number, free: TreeRect): void {
  const c0 = Math.max(0, Math.min(gridCols - 1, Math.floor((x0 - free.x) / PLACE_CELL_PX)));
  const c1 = Math.min(gridCols - 1, Math.floor((x1 - free.x) / PLACE_CELL_PX));
  const r0 = Math.max(0, Math.min(gridRows - 1, Math.floor((y0 - free.y) / PLACE_CELL_PX)));
  const r1 = Math.min(gridRows - 1, Math.floor((y1 - free.y) / PLACE_CELL_PX));
  for (let row = r0; row <= r1; row += 1) {
    for (let col = c0; col <= c1; col += 1) {
      if (entryCount === entryNext.length) growEntries();
      const cell = row * gridCols + col;
      entryOccupant[entryCount] = occupant;
      entryNext[entryCount] = cellHead[cell]!;
      cellHead[cell] = entryCount;
      entryCount += 1;
    }
  }
}

function growEntries(): void {
  const size = Math.max(256, entryNext.length * 2);
  const next = new Int32Array(size);
  const occupant = new Int32Array(size);
  next.set(entryNext);
  occupant.set(entryOccupant);
  entryNext = next;
  entryOccupant = occupant;
}

/** Tests the box once against each occupant of the cells it reaches; its own node's mark is skipped. */
function isClear(
  box: TreeNameBox,
  node: number,
  list: TreeDrawList,
  out: TreeNamePlacement,
  free: TreeRect,
  padPx: number,
  query: number,
): boolean {
  const c0 = Math.max(0, Math.min(gridCols - 1, Math.floor((box.x - padPx - free.x) / PLACE_CELL_PX)));
  const c1 = Math.min(gridCols - 1, Math.floor((box.x + box.width + padPx - free.x) / PLACE_CELL_PX));
  const r0 = Math.max(0, Math.min(gridRows - 1, Math.floor((box.y - padPx - free.y) / PLACE_CELL_PX)));
  const r1 = Math.min(gridRows - 1, Math.floor((box.y + box.height + padPx - free.y) / PLACE_CELL_PX));
  for (let row = r0; row <= r1; row += 1) {
    for (let col = c0; col <= c1; col += 1) {
      for (let e = cellHead[row * gridCols + col]!; e >= 0; e = entryNext[e]!) {
        const occupant = entryOccupant[e]!;
        if (occupantStamp[occupant] === query) continue;
        occupantStamp[occupant] = query;
        if (occupant < list.count) {
          const mark = list.marks[occupant]!;
          if (mark.node === node) continue;
          out.tested += 1;
          if (circleNearBox(mark.x, mark.y, mark.radius + padPx, box)) return false;
        } else {
          out.tested += 1;
          if (boxesNear(out.boxes[occupant - list.count]!, box, padPx)) return false;
        }
      }
    }
  }
  return true;
}

function circleNearBox(cx: number, cy: number, reach: number, box: TreeNameBox): boolean {
  const dx = cx - Math.min(Math.max(cx, box.x), box.x + box.width);
  const dy = cy - Math.min(Math.max(cy, box.y), box.y + box.height);
  return dx * dx + dy * dy < reach * reach;
}

function boxesNear(a: TreeNameBox, b: TreeNameBox, padPx: number): boolean {
  return (
    a.x < b.x + b.width + padPx &&
    b.x < a.x + a.width + padPx &&
    a.y < b.y + b.height + padPx &&
    b.y < a.y + a.height + padPx
  );
}

