import type { LibraryGraphNodeKind } from "./build-library-graph";
import type { LayoutPoint } from "./library-graph-layout";
import { fitScale, LIBRARY_ZOOM_MIN, WIDEST_MARK_WORLD_RADIUS } from "./library-graph-view";

/**
 * The flow picture's measures, shared by the unfolded columns (`library-flow-layout`) and the
 * stacks (`library-flow-stacks`): rows, name rooms, and the zoom the camera will show.
 *
 * World units hold the marks; screen px hold the names and the row floor. The layout is given
 * the box the camera fits the picture into, in px, and its ceiling; its zoom is the camera's
 * own (`fitScale`), so every px constant converts once, at the zoom the picture is shown at.
 */

export const FLOW_SIDE_PAD = 24;
export const FLOW_TOP_PAD = 16;
/** Rows at the ceiling: 44px and 72px on screen; the floor clears the widest mark (18) plus a breath. */
export const FLOW_ROW_MIN = 22;
export const FLOW_ROW_MAX = 36;
/**
 * The least on-screen row, in px: a name is an 11px face on a 15px line
 * (`draw-library-graph`), so a smaller row puts two names on one line.
 */
export const FLOW_ROW_MIN_PX = 18;
/** Sub-columns inside a folded file band: 24px at the ceiling for a 14px square. */
export const FLOW_GRID_STEP = 12;
/**
 * The most room a name place takes, in screen px. Every place gets an equal share of the free
 * width up to this; the rest of a wide pane is margin, so one long title cannot spread the
 * columns apart. The renderer cuts a name to the room published here (`FlowColumn.labelRoom`).
 */
export const FLOW_LABEL_ROOM_MAX_PX = 240;
/** The least room a name place gets at a narrow canvas: a few characters and an ellipsis. */
export const FLOW_LABEL_ROOM_MIN_PX = 40;
/**
 * The least screen room a file name is given: about a dozen glyphs, enough to tell one dated or
 * numbered file from the next. With less, files are an unnamed grid and their width goes to
 * the pages and concepts; the index beside the picture and a press's card still name them.
 */
export const FLOW_FILE_NAME_MIN_PX = 96;
/**
 * The share of the camera's box a picture at the zoom ceiling fills, so a small folder's fit
 * lands on the ceiling (`LIBRARY_MAX_MARK_PX`) with a margin rather than against the box.
 */
export const FLOW_FILL = 0.9;
/** The widest mark's radius and the gap a name stands from it, in world units. */
export const WIDEST_MARK = WIDEST_MARK_WORLD_RADIUS;
export const NAME_GAP = 5;
/** A breath between a name's end and the next thing, in screen px. */
export const BREATH_PX = 8;

export const COLUMN_ORDER: readonly LibraryGraphNodeKind[] = ["source", "page", "concept"];

/** The box the camera fits the flow picture into, in CSS px (the canvas less its margins), and its zoom ceiling. */
export interface FlowWorld {
  width: number;
  height: number;
  ceiling?: number;
}

/** `FlowWorld` with its ceiling, and the world box rows are laid in: the camera's box at the ceiling, filled to `FLOW_FILL`. */
export interface FlowFit {
  width: number;
  height: number;
  ceiling: number;
  rowsHeight: number;
}

export function resolveFit(world: FlowWorld): FlowFit {
  const ceiling = world.ceiling ?? 1;
  const width = Math.max(1, world.width);
  const height = Math.max(1, world.height);
  return { width, height, ceiling, rowsHeight: (height / ceiling) * FLOW_FILL };
}

export interface FlowColumn {
  kind: LibraryGraphNodeKind;
  x: number;
  ids: string[];
  /** The most sub-columns any one stack folds this kind into; 1 means every mark has a row of its own. */
  lanes: number;
  /** How many stacks the picture stands in; 1 when the pages did not fold. */
  stacks: number;
  /** Whether this kind's names stand at rest; a kind without them shows them once zoomed in. */
  named: boolean;
  /**
   * World units a name beside this column may run to before it is cut: the shared budget,
   * or out to the picture's edge when the kind to its right holds no rows; 0 with no room.
   */
  labelRoom: number;
}

export interface FlowLayout {
  positions: Map<string, LayoutPoint>;
  columns: FlowColumn[];
  rowGap: number;
  /** The box the picture was laid in, which the camera frames whole. */
  extent: { width: number; height: number };
  /** The zoom the camera fits `extent` at (`fitScale`): the ceiling, or lower for a long or wide folder. */
  scale: number;
}

const LABEL_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function byLabelThenId(a: { id: string; label: string }, b: { id: string; label: string }): number {
  return LABEL_COLLATOR.compare(a.label, b.label) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** The zoom the camera shows `extent` at: the expression `fitView` uses. */
export function shownScale(extent: { width: number; height: number }, fit: FlowFit): number {
  return fitScale(extent, fit, fit.ceiling);
}

/** The most rows a column may hold before it folds: rows whose pitch stays at `FLOW_ROW_MIN_PX` with the picture inside the box. */
export function rowsAffordable(fit: FlowFit): number {
  const leastScale = FLOW_ROW_MIN_PX / FLOW_ROW_MIN;
  return Math.max(1, Math.floor((fit.height / leastScale - FLOW_TOP_PAD * 2) / FLOW_ROW_MIN) + 1);
}

/** One row gap for a picture whose longest column has `longestRows` rows, and the height that takes. */
export function rowPitch(longestRows: number, fit: FlowFit): { rowGap: number; height: number } {
  const innerHeight = Math.max(0, fit.rowsHeight - FLOW_TOP_PAD * 2);
  const rowsFit = Math.max(1, Math.floor(innerHeight / FLOW_ROW_MIN) + 1);
  const rowGap =
    longestRows > rowsFit ? FLOW_ROW_MIN : Math.min(FLOW_ROW_MAX, Math.max(FLOW_ROW_MIN, longestRows > 1 ? innerHeight / (longestRows - 1) : FLOW_ROW_MAX));
  return { rowGap, height: Math.max(fit.rowsHeight, rowGap * (longestRows - 1) + FLOW_TOP_PAD * 2) };
}

/** Whether rows `rowGap` apart stay at the floor on screen at `scale`, with the camera able to fit the picture. */
export function keepsRowFloor(rowGap: number, scale: number): boolean {
  return rowGap * scale >= FLOW_ROW_MIN_PX - 1e-9 && scale >= LIBRARY_ZOOM_MIN;
}

/** `count` rows a row gap apart, centred on the picture's middle. */
export function evenRows(count: number, rowGap: number, height: number): number[] {
  const top = height / 2 - (rowGap * (count - 1)) / 2;
  return Array.from({ length: count }, (_, row) => top + rowGap * row);
}

/**
 * Each id at the mean y of its neighbours found in `referenceY`, pushed down to the row gap in
 * order, then up from `bottom` the same way, so a column of at most the rows between `top` and
 * `bottom` stays between them. O(ids + their edges).
 */
export function rowsByNeighbours(
  ids: readonly string[],
  neighbours: ReadonlyMap<string, readonly string[]>,
  referenceY: ReadonlyMap<string, number>,
  rowGap: number,
  top: number,
  bottom: number,
): number[] {
  const ys: number[] = [];
  for (const id of ids) {
    // Summed in value order, so the same folder gives the same bits whatever order its edges arrived in.
    const near = (neighbours.get(id) ?? [])
      .map((other) => referenceY.get(other))
      .filter((y): y is number => y !== undefined)
      .sort((a, b) => a - b);
    const previous = ys.length > 0 ? ys[ys.length - 1] : null;
    const wanted = near.length > 0 ? near.reduce((sum, y) => sum + y, 0) / near.length : previous !== null ? previous + rowGap : (top + bottom) / 2;
    ys.push(previous !== null ? Math.max(wanted, previous + rowGap) : Math.max(top, wanted));
  }
  const last = ys.length - 1;
  return ys.map((y, i) => Math.min(y, bottom - (last - i) * rowGap));
}

/** What a name place costs besides its room: the marks either side, the name gap, a breath. */
export function placeCost(breath: number): number {
  return WIDEST_MARK * 2 + NAME_GAP + breath;
}

/**
 * The zoom and every name place's room, solved together in closed form, in the camera's px.
 * `stripWidth(room, breath)` is affine in both, so three probes give the fixed width and how
 * many rooms and breaths the strip holds. At the zoom the height allows, each place shares
 * the free width up to the ceiling; when that leaves less than the minimum, the zoom drops
 * until the minimum fits, and with no width for even that, no name has room.
 */
export function settleNameRoom(
  fit: FlowFit,
  height: number,
  stripWidth: (room: number, breath: number) => number,
): { room: number; scale: number; width: number } {
  const fixed = stripWidth(0, 0);
  const places = stripWidth(1, 0) - fixed;
  const breathsPx = (stripWidth(0, 1) - fixed) * BREATH_PX;
  const tall = Math.min(fit.ceiling, fit.height / height);
  // At the ceiling a short picture keeps the box's aspect, narrower by the height it leaves.
  const tallWidthPx = fit.width * Math.min(1, (tall * height) / fit.height);
  const sharePx = places > 0 ? (tallWidthPx - fixed * tall - breathsPx) / places : 0;
  if (places === 0 ? fixed * tall + breathsPx <= tallWidthPx : sharePx >= FLOW_LABEL_ROOM_MIN_PX) {
    return { room: Math.min(FLOW_LABEL_ROOM_MAX_PX, sharePx) / tall, scale: tall, width: tallWidthPx / tall };
  }
  const roomPx = places > 0 && fit.width - breathsPx > places * FLOW_LABEL_ROOM_MIN_PX ? FLOW_LABEL_ROOM_MIN_PX : 0;
  const scale = Math.min(tall, Math.max(1, fit.width - breathsPx - places * roomPx) / fixed);
  return { room: roomPx / scale, scale, width: fit.width / scale };
}
