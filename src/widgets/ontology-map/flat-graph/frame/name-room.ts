import type { Point } from "../../dial/types";
import type { PlacedName } from "../names";
import { grownIds } from "./place";
import { ROOM_GONE_PX, type Disc, type Dot, FrameList, L, NAME_REST_PX, F as frameState } from "./state";

// A module-local name: see `F` in ./state.
const F = frameState;

/** This frame's grown discs, then its grown dots from `grownDiscCount` on. */
export const grownMarks = new FrameList<Disc | Dot>();
let grownDiscCount = 0;

/** This frame's discs and dots an opened star or a selection grew, gathered once before the names. O(marks). */
export function collectGrownMarks(): void {
  grownMarks.restart();
  grownDiscCount = 0;
  if (grownIds.size === 0) return;
  for (let i = 0; i < L.discs.size; i += 1) if (grownIds.has(L.discs.items[i]!.id)) grownMarks.add(L.discs.items[i]!);
  grownDiscCount = grownMarks.size;
  for (let i = 0; i < L.dots.size; i += 1) if (grownIds.has(L.dots.items[i]!.id)) grownMarks.add(L.dots.items[i]!);
}

/** The air, in px, between a box and a circle's edge; below zero over it. */
function boxAir(minX: number, maxX: number, minY: number, maxY: number, m: Disc | Dot): number {
  const dx = Math.max(minX - m.x, 0, m.x - maxX);
  const dy = Math.max(minY - m.y, 0, m.y - maxY);
  return Math.sqrt(dx * dx + dy * dy) - m.r;
}

/** Side of a cell of the frame's mark grid, px: a little over a name's height, so a name's box meets a row or two of cells. */
const MARK_CELL_PX = 32;
/** A mark whose circle covers more cells than this is walked by every test instead of filed in each cell. */
const MARK_CELLS_MAX = 64;

/**
 * This frame's drawn discs, from every disc list, and its grown dots, hashed into square cells of
 * `MARK_CELL_PX`, each mark filed in every cell its circle's bounding square covers, so a name's
 * clearance test meets only the marks near its box. Filled on the frame's first test, after every
 * disc and dot is drawn, in O(marks × cells each covers); its arrays grow with the largest frame and
 * are reused. `dot` flags a grown dot, which a backed name's plate covers; `wide` lists the marks too
 * large to file.
 */
const markGrid = {
  filledStamp: -1,
  marks: [] as (Disc | Dot)[],
  size: 0,
  dot: new Uint8Array(0),
  seen: new Int32Array(0),
  stamp: 0,
  wide: [] as number[],
  entries: 0,
  mark: new Int32Array(0),
  next: new Int32Array(0),
  heads: new Int32Array(0),
};

function gridCell(v: number): number {
  return Math.floor(v / MARK_CELL_PX);
}

function gridBucket(cx: number, cy: number): number {
  return (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) & (markGrid.heads.length - 1);
}

function fileGridMark(m: Disc | Dot, dot: boolean): void {
  const g = markGrid;
  if (g.size === g.dot.length) {
    const size = Math.max(256, g.size * 2);
    const flags = new Uint8Array(size);
    flags.set(g.dot);
    g.dot = flags;
    g.seen = new Int32Array(size);
    g.stamp = 0;
  }
  g.marks[g.size] = m;
  g.dot[g.size] = dot ? 1 : 0;
  g.size += 1;
}

function fillMarkGrid(): void {
  const g = markGrid;
  g.filledStamp = F.stamp;
  g.size = 0;
  g.entries = 0;
  g.wide.length = 0;
  for (const list of discLists) for (let i = 0; i < list.size; i += 1) fileGridMark(list.items[i]!, false);
  for (let i = grownDiscCount; i < grownMarks.size; i += 1) fileGridMark(grownMarks.items[i]!, true);
  let entries = 0;
  for (let k = 0; k < g.size; k += 1) {
    const m = g.marks[k]!;
    const cells = (gridCell(m.x + m.r) - gridCell(m.x - m.r) + 1) * (gridCell(m.y + m.r) - gridCell(m.y - m.r) + 1);
    if (cells > MARK_CELLS_MAX || !Number.isFinite(cells)) g.wide.push(k);
    else entries += cells;
  }
  if (entries > g.mark.length) {
    const size = Math.max(512, entries * 2);
    g.mark = new Int32Array(size);
    g.next = new Int32Array(size);
  }
  let buckets = Math.max(64, g.heads.length);
  while (buckets < entries * 2) buckets *= 2;
  if (buckets !== g.heads.length) g.heads = new Int32Array(buckets);
  g.heads.fill(-1);
  let w = 0;
  for (let k = 0; k < g.size; k += 1) {
    if (w < g.wide.length && g.wide[w] === k) {
      w += 1;
      continue;
    }
    const m = g.marks[k]!;
    for (let cy = gridCell(m.y - m.r); cy <= gridCell(m.y + m.r); cy += 1) {
      for (let cx = gridCell(m.x - m.r); cx <= gridCell(m.x + m.r); cx += 1) {
        const e = g.entries;
        g.entries = e + 1;
        const bucket = gridBucket(cx, cy);
        g.mark[e] = k;
        g.next[e] = g.heads[bucket]!;
        g.heads[bucket] = e;
      }
    }
  }
}

/** Whether mark `k` of the grid crosses the box (`dots` false skips grown dots, `discs` false skips discs), not counting `id`'s own. */
function gridMarkCrosses(k: number, id: string, minX: number, maxX: number, minY: number, maxY: number, discs: boolean, dots: boolean): boolean {
  const g = markGrid;
  if (g.seen[k] === g.stamp) return false;
  g.seen[k] = g.stamp;
  const m = g.marks[k]!;
  if (m.id === id || (g.dot[k] === 1 ? !dots : !discs)) return false;
  return boxAir(minX, maxX, minY, maxY, m) <= ROOM_GONE_PX;
}

/**
 * Whether a disc (with `discs`) or a grown dot (with `dots`) not `id`'s own crosses the box past
 * `ROOM_GONE_PX`. O(the marks filed in the cells the box covers).
 */
function gridCrosses(id: string, minX: number, maxX: number, minY: number, maxY: number, discs: boolean, dots: boolean): boolean {
  const g = markGrid;
  if (g.filledStamp !== F.stamp) fillMarkGrid();
  if (g.stamp >= 0x3fffffff) {
    g.seen.fill(0);
    g.stamp = 0;
  }
  g.stamp += 1;
  for (let w = 0; w < g.wide.length; w += 1) if (gridMarkCrosses(g.wide[w]!, id, minX, maxX, minY, maxY, discs, dots)) return true;
  const cx0 = gridCell(minX);
  const cx1 = gridCell(maxX);
  const cy0 = gridCell(minY);
  const cy1 = gridCell(maxY);
  // A box wider than the grid's marks would be walked cell by cell for nothing: it meets every mark once instead.
  if (!((cx1 - cx0 + 1) * (cy1 - cy0 + 1) <= g.size)) {
    for (let k = 0; k < g.size; k += 1) if (gridMarkCrosses(k, id, minX, maxX, minY, maxY, discs, dots)) return true;
    return false;
  }
  for (let cy = cy0; cy <= cy1; cy += 1) {
    for (let cx = cx0; cx <= cx1; cx += 1) {
      for (let e = g.heads[gridBucket(cx, cy)]!; e >= 0; e = g.next[e]!) if (gridMarkCrosses(g.mark[e]!, id, minX, maxX, minY, maxY, discs, dots)) return true;
    }
  }
  return false;
}

/**
 * Whether a name's glyphs where this frame draws them, from `x`, `y`, keep more than `ROOM_GONE_PX`
 * of air from the names drawn before it, less the pad two names keep, and from every disc not its
 * own and grown dot (none for a backed name, whose plate covers them). A `held` name (the
 * selection's) measures only its own rows and the discs drawn past their resting radius. Rows of one
 * concept count only while one of them glides off its place, as a domain's census and reach rows
 * share one slot. Only while marks grow: O(the marks near it + names drawn) per name, the marks read
 * from the frame's grid (`markGrid`), stopping at the first that crosses it.
 */
export function nameClear(n: PlacedName, at: Point, x: number, y: number, held: boolean): boolean {
  const pad = F.P.namePadPx;
  const minX = x + n.box.minX + pad;
  const maxX = x + n.box.maxX - pad;
  const minY = y + n.box.minY + pad;
  const maxY = y + n.box.maxY - pad;
  if (held) {
    // Admission may rest the selection's name over a disc on its plate; one still shrinking from a closed star was not there.
    for (let i = 0; i < grownDiscCount; i += 1) if (grownMarks.items[i]!.id !== n.id && boxAir(minX, maxX, minY, maxY, grownMarks.items[i]!) <= ROOM_GONE_PX) return false;
  } else if (gridCrosses(n.id, minX, maxX, minY, maxY, true, n.backed !== true)) {
    // Domains and the project draw from their own lists; a name gives way to them like any disc.
    return false;
  }
  const gliding = Math.abs(x - at.x) > NAME_REST_PX || Math.abs(y - at.y) > NAME_REST_PX;
  for (let i = 0; i < L.names.size; i += 1) {
    const o = L.names.items[i]!;
    const ox = o.x - o.name.dx;
    const oy = o.y - o.name.dy;
    if (o.name.id === n.id && (CAPTION_ROWS.has(n.role) && CAPTION_ROWS.has(o.name.role) || (!gliding && Math.abs(ox - at.x) <= NAME_REST_PX && Math.abs(oy - at.y) <= NAME_REST_PX))) continue;
    if (held && o.name.id !== n.id) continue;
    const apart = Math.max(ox + o.name.box.minX + pad - maxX, minX - (ox + o.name.box.maxX - pad), oy + o.name.box.minY + pad - maxY, minY - (oy + o.name.box.maxY - pad));
    if (apart - pad <= ROOM_GONE_PX) return false;
  }
  return true;
}

/** Whether a name's glyphs drawn from `x`, `y` cross a grown dot not its own this frame. O(the marks near it). */
export function onGrownDot(n: PlacedName, x: number, y: number): boolean {
  const pad = F.P.namePadPx;
  return gridCrosses(n.id, x + n.box.minX + pad, x + n.box.maxX - pad, y + n.box.minY + pad, y + n.box.maxY - pad, false, true);
}

/** Every list a disc is drawn from. */
const discLists: readonly FrameList<Disc>[] = [L.discs, L.domains, L.project];

/** A domain's census and reach rows: one slot under its name, cross-fading. */
export const CAPTION_ROWS: ReadonlySet<PlacedName["role"]> = new Set(["units", "reach"]);
