import type { LibraryGraph, LibraryGraphNodeKind } from "./build-library-graph";
import type { LayoutPoint } from "./library-graph-layout";

/**
 * The flow layout: sources left, the pages written from them in the middle, the concepts
 * they name right. The Library's fact is direction, not nearness, so columns replace a
 * force layout: they fill the canvas at any count and are the same on every machine.
 *
 * Pure and deterministic. Pages are ordered by concept barycentre then title, the outer
 * columns by page barycentre (one crossing-reduction sweep): O(n log n + E) with Map
 * lookups, plus a width fixed point of at most six turns.
 */

/**
 * World units. The world box is the pixel box seen through the zoom ceiling
 * (`libraryZoomMax`), so a small folder fits at the ceiling; a longer one lays out taller,
 * keeping the box's aspect, down to the row pitch a name needs, past which a column folds.
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
 * Room kept outside the outer columns for the names that stand beside them, in screen px;
 * `STANDING_LABEL_MAX_WIDTH` in the renderer, which does its own truncation past it.
 */
export const FLOW_LABEL_ROOM_PX = 132;
/** The least room a name is given at a narrow canvas: a few characters and an ellipsis. */
const FLOW_LABEL_ROOM_MIN_PX = 40;
/** The widest mark's radius (`WIDEST_MARK_WORLD_RADIUS`) and the gap a name stands from it. */
const WIDEST_MARK = 9;
const NAME_GAP = 5;
/** A breath between a name's end and the next thing, in screen px. */
const BREATH_PX = 8;
/** Between a stack's files and its pages, in world units: the lines have room to be lines. */
const ISLAND_STACK_GAP = 40;
/** The widest a gap between two columns may be, in screen px: past this a line says nothing along its length. */
const FLOW_COLUMN_GAP_MAX = 260;

const COLUMN_ORDER: readonly LibraryGraphNodeKind[] = ["source", "page", "concept"];

function byLabel(a: { label: string }, b: { label: string }): number {
  return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" });
}

/** Mean row index of a node's neighbours in `reference`, or +Infinity when it has none. */
function barycentre(id: string, neighbours: ReadonlyMap<string, readonly string[]>, reference: ReadonlyMap<string, number>): number {
  const rows = (neighbours.get(id) ?? []).map((other) => reference.get(other)).filter((row): row is number => row !== undefined);
  if (rows.length === 0) return Number.POSITIVE_INFINITY;
  return rows.reduce((sum, row) => sum + row, 0) / rows.length;
}

interface FlowColumn {
  kind: LibraryGraphNodeKind;
  x: number;
  ids: string[];
  /** How many sub-columns the band was folded into; 1 means every mark has a row of its own. */
  grid: number;
  /**
   * World units a name beside this column may run to before it is cut: the shared budget,
   * or out to the picture's edge when the kind to its right holds no rows.
   */
  labelRoom: number;
}

export interface FlowLayout {
  positions: Map<string, LayoutPoint>;
  columns: FlowColumn[];
  rowGap: number;
  /** The box the picture was laid in: the world box, or a larger one the camera fits. */
  extent: { width: number; height: number };
  /** The zoom the camera will fit `extent` at: the ceiling, or lower for a long folder. */
  scale: number;
}

export interface FlowWorld {
  width: number;
  height: number;
  /** The zoom the world was derived at; the picture's own scale is this or lower. */
  ceiling?: number;
}

export function flowLayout(graph: LibraryGraph, world: FlowWorld): FlowLayout {
  const nodesByKind = new Map<LibraryGraphNodeKind, typeof graph.nodes>();
  for (const kind of COLUMN_ORDER) nodesByKind.set(kind, []);
  for (const node of graph.nodes) nodesByKind.get(node.kind)?.push(node);

  const neighbours = new Map<string, string[]>();
  const link = (from: string, to: string): void => {
    const list = neighbours.get(from);
    if (list) list.push(to);
    else neighbours.set(from, [to]);
  };
  for (const edge of graph.edges) {
    link(edge.source, edge.target);
    link(edge.target, edge.source);
  }

  /**
   * Pages are ordered by the mean title rank of the concepts they name, then by title, so
   * the middle column never shuffles when a file is added and pages naming one concept
   * stand together; a page naming none goes last.
   */
  const conceptRank = new Map([...(nodesByKind.get("concept") ?? [])].sort(byLabel).map((node, row) => [node.id, row]));
  const pages = [...(nodesByKind.get("page") ?? [])]
    .map((node) => ({ node, key: barycentre(node.id, neighbours, conceptRank) }))
    .sort((a, b) => a.key - b.key || byLabel(a.node, b.node))
    .map((entry) => entry.node);
  const pageRow = new Map(pages.map((node, row) => [node.id, row]));
  const outer = (kind: LibraryGraphNodeKind) =>
    [...(nodesByKind.get(kind) ?? [])]
      .map((node) => ({ node, key: barycentre(node.id, neighbours, pageRow) }))
      .sort((a, b) => a.key - b.key || byLabel(a.node, b.node))
      .map((entry) => entry.node);
  const candidates: Array<{ kind: LibraryGraphNodeKind; nodes: typeof graph.nodes }> = [
    { kind: "source", nodes: outer("source") },
    { kind: "page", nodes: pages },
    { kind: "concept", nodes: outer("concept") },
  ];
  const ordered = candidates.filter((column) => column.nodes.length > 0);

  const worldWidth = Math.max(1, world.width);
  const worldHeight = Math.max(1, world.height);
  const ceiling = world.ceiling ?? 1;
  const innerHeight = Math.max(0, worldHeight - FLOW_TOP_PAD * 2);

  /**
   * Rows. A named mark keeps its own row while the picture can afford `FLOW_ROW_MIN_PX`;
   * past that its column folds into sub-columns, like an index in two columns. The unnamed
   * file band folds the same way rather than becoming a ladder the camera shrinks away.
   */
  const rowsFit = Math.max(1, Math.floor(innerHeight / FLOW_ROW_MIN) + 1);
  const leastScale = FLOW_ROW_MIN_PX / FLOW_ROW_MIN;
  const rowsAffordable = Math.max(1, Math.floor(((worldHeight * ceiling) / leastScale - FLOW_TOP_PAD * 2) / FLOW_ROW_MIN) + 1);
  const named = ordered.filter((column) => column.kind !== "source");
  const namedGrid = new Map(named.map((column) => [column.kind, Math.max(1, Math.ceil(column.nodes.length / rowsAffordable))]));
  const rowsOf = (count: number, grid: number): number => Math.ceil(count / grid);
  // A file band folds only past the rows affordable at the 18px floor, not the rows that
  // fit at the ceiling, or a short band folds while a plain list would name every file.
  const gridOf = (kind: LibraryGraphNodeKind, count: number): number =>
    kind === "source" ? Math.max(1, Math.ceil(count / rowsAffordable)) : (namedGrid.get(kind) ?? 1);
  const longestRows = Math.max(1, ...ordered.map((column) => rowsOf(column.nodes.length, gridOf(column.kind, column.nodes.length))));
  // One gap for every column, so rows line up and an edge is a straight-ish S, not a fan.
  const rowGap =
    longestRows > rowsFit ? FLOW_ROW_MIN : Math.min(FLOW_ROW_MAX, Math.max(FLOW_ROW_MIN, longestRows > 1 ? innerHeight / (longestRows - 1) : FLOW_ROW_MAX));
  const height = Math.max(worldHeight, rowGap * (longestRows - 1) + FLOW_TOP_PAD * 2);

  /**
   * Width keeps the box's aspect, so the fitted camera fills both axes. Name room is a
   * screen budget (`FLOW_LABEL_ROOM_PX`, or an equal share of what a narrow canvas leaves);
   * room and scale depend on each other, so they settle over a few turns.
   */
  const grids = ordered.map((column) => gridOf(column.kind, column.nodes.length));
  const namedLanes = ordered.reduce((sum, column, index) => sum + (column.kind === "source" ? 0 : grids[index] - 1), 0);
  // A folded file band names nothing at rest, so it keeps no room on its outer side.
  const leftRoom = ordered[0]?.kind === "source" && (grids[0] ?? 1) > 1 ? 0 : 1;
  const roomPlaces = ordered.length > 1 || (grids[0] ?? 1) > 1 ? leftRoom + 1 + (ordered.length - 1) + namedLanes : 0;
  const aspectWidth = worldWidth * (height / worldHeight);
  let width = aspectWidth;
  let scale = ceiling * Math.min(worldHeight / height, worldWidth / width);
  let bandWidths: number[] = [];
  let labelRoom = 0;
  for (let turn = 0; turn < 6; turn += 1) {
    const breath = BREATH_PX / scale;
    const sourceBands = ordered.reduce((sum, column, index) => sum + (column.kind === "source" ? (grids[index] - 1) * FLOW_GRID_STEP : 0), 0);
      const fixed = FLOW_SIDE_PAD * 2 + sourceBands + namedLanes * (WIDEST_MARK * 2 + NAME_GAP + breath) + Math.max(0, ordered.length - 1) * breath;
    const budget = roomPlaces > 0 ? Math.max(FLOW_LABEL_ROOM_MIN_PX / scale, (worldWidth * (ceiling / scale) - fixed) / roomPlaces) : 0;
    labelRoom = roomPlaces > 0 ? Math.min(FLOW_LABEL_ROOM_PX / scale, budget) : 0;
    const nameStep = WIDEST_MARK * 2 + NAME_GAP + labelRoom + breath;
    bandWidths = ordered.map((column, index) => (grids[index] - 1) * (column.kind === "source" ? FLOW_GRID_STEP : nameStep));
    const needed = fixed + labelRoom * roomPlaces;
    const wanted = Math.max(aspectWidth, needed);
    const next = ceiling * Math.min(worldHeight / height, worldWidth / wanted);
    width = wanted;
    if (Math.abs(next - scale) < 1e-6) break;
    scale = next;
  }
  const bandsTotal = bandWidths.reduce((sum, w) => sum + w, 0);
  /*
   * The column gap is capped at `FLOW_COLUMN_GAP_MAX` and the picture centred in the rest,
   * or a wide canvas draws every citation as a long line with nothing along it.
   */
  const spread = ordered.length > 1 ? (width - FLOW_SIDE_PAD * 2 - labelRoom * (leftRoom + 1) - bandsTotal) / (ordered.length - 1) : 0;
  const gap = Math.min(spread, FLOW_COLUMN_GAP_MAX / scale);
  const slack = ordered.length > 1 ? (spread - gap) * (ordered.length - 1) : 0;
  const columnX = (index: number): number => {
    if (ordered.length === 1) return width / 2;
    let x = FLOW_SIDE_PAD + labelRoom * leftRoom + slack / 2;
    for (let i = 0; i < index; i += 1) x += bandWidths[i] + gap;
    return x + bandWidths[index] / 2;
  };
  const stepOf = (kind: LibraryGraphNodeKind): number =>
    kind === "source" ? FLOW_GRID_STEP : WIDEST_MARK * 2 + NAME_GAP + labelRoom + BREATH_PX / scale;

  /**
   * The anchor column is spread evenly; every other mark takes the mean y of its neighbours
   * in the column placed before it, is pushed apart to the row gap in order, and the column
   * is re-centred so the push does not drift it downward.
   */
  const positions = new Map<string, LayoutPoint>();
  const yOf = new Map<string, number>();
  const placeEven = (count: number): number[] => {
    const span = rowGap * (count - 1);
    const top = height / 2 - span / 2;
    return Array.from({ length: count }, (_, row) => top + rowGap * row);
  };
  const placeByNeighbours = (ids: readonly string[], reference: ReadonlySet<string>): number[] => {
    const wanted = ids.map((id) => {
      const ys = (neighbours.get(id) ?? []).filter((other) => reference.has(other)).map((other) => yOf.get(other)).filter((y): y is number => y !== undefined);
      return ys.length > 0 ? ys.reduce((sum, y) => sum + y, 0) / ys.length : Number.NaN;
    });
    const ys: number[] = [];
    for (let i = 0; i < ids.length; i += 1) {
      const target = Number.isNaN(wanted[i]) ? (ys.length > 0 ? ys[ys.length - 1] + rowGap : height / 2) : wanted[i];
      ys.push(ys.length > 0 ? Math.max(target, ys[ys.length - 1] + rowGap) : target);
    }
    const middle = (ys[0] + ys[ys.length - 1]) / 2;
    const shift = height / 2 - middle;
    return ys.map((y) => y + shift);
  };

  const columns: FlowColumn[] = ordered.map((column, index) => ({
    kind: column.kind,
    x: columnX(index),
    ids: column.nodes.map((node) => node.id),
    grid: grids[index],
    labelRoom,
  }));
  /**
   * Widens a column's name room to the picture's edge when the kind to its right has no
   * rows; otherwise a name would lie across the citations crossing that gap. A folded
   * column is left alone: its single `x` cannot speak for its sub-columns.
   */
  const settleLabelRooms = (laid: FlowColumn[], pictureWidth: number): void => {
    const rowsOfKind = new Map(laid.map((column) => [column.kind, column.ids.length]));
    for (const column of laid) {
      // A file's name stands left of its square, in room already reserved there.
      if (column.kind === "source" || column.grid > 1) continue;
      const nextKind = COLUMN_ORDER[COLUMN_ORDER.indexOf(column.kind) + 1];
      if (nextKind === undefined || (rowsOfKind.get(nextKind) ?? 0) > 0) continue;
      const start = column.x + WIDEST_MARK + NAME_GAP;
      column.labelRoom = Math.max(labelRoom, pictureWidth - FLOW_SIDE_PAD - start);
    }
  };
  /*
   * The anchor is the column with the most rows, except a folded file band: a page column
   * placed after that grid clumps where the files happen to tile.
   */
  const anchorIndex = columns.reduce((best, column, index) => {
    if (column.kind === "source" && column.grid > 1) return best;
    if (columns[best].kind === "source" && columns[best].grid > 1) return index;
    return rowsOf(column.ids.length, column.grid) > rowsOf(columns[best].ids.length, columns[best].grid) ? index : best;
  }, 0);

  /** Lays one column: a plain band takes the rows as given; a folded band tiles them. */
  const place = (index: number, rowYs: number[]): void => {
    const column = columns[index];
    const count = rowsOf(column.ids.length, column.grid);
    const step = stepOf(column.kind);
    const left = column.x - (step * (column.grid - 1)) / 2;
    // A folded file band tiles row by row, so one page's files leave as one sheaf; a
    // folded page column fills column by column, a stack being a run of consecutive pages.
    const rowMajor = column.kind === "source" && column.grid > 1;
    column.ids.forEach((id, i) => {
      const sub = column.grid === 1 ? 0 : rowMajor ? i % column.grid : Math.floor(i / count);
      const row = column.grid === 1 ? i : rowMajor ? Math.floor(i / column.grid) : i % count;
      const y = rowYs[Math.min(row, rowYs.length - 1)];
      const x = column.grid === 1 ? column.x : left + step * sub;
      yOf.set(id, y);
      positions.set(id, { x, y });
    });
  };
  const rowsFor = (index: number, reference: ReadonlySet<string> | null): number[] => {
    const column = columns[index];
    if (column.grid > 1 || reference === null) return placeEven(rowsOf(column.ids.length, column.grid));
    return placeByNeighbours(column.ids, reference);
  };
  place(anchorIndex, rowsFor(anchorIndex, null));
  for (let index = anchorIndex + 1; index < columns.length; index += 1) {
    place(index, rowsFor(index, new Set(columns[index - 1].ids)));
  }
  for (let index = anchorIndex - 1; index >= 0; index -= 1) {
    place(index, rowsFor(index, new Set(columns[index + 1].ids)));
  }

  /**
   * Folded pages stand in stacks, each with its own files as a grid to its left, or every
   * citation to a later sub-column crosses the names of the first. A file read from two
   * stacks goes to the first; files no page read go to the last. The world widens to fit.
   */
  const pageColumn = columns.find((column) => column.kind === "page");
  const sourceColumn = columns.find((column) => column.kind === "source");
  if (pageColumn && sourceColumn && pageColumn.grid > 1) {
    const stacks = pageColumn.grid;
    const rows = rowsOf(pageColumn.ids.length, stacks);
    const pageIndex = new Map(pageColumn.ids.map((id, index) => [id, index]));
    const stackOf = new Map<string, number>();
    for (const id of sourceColumn.ids) {
      const first = Math.min(...(neighbours.get(id) ?? []).map((other) => pageIndex.get(other) ?? Number.POSITIVE_INFINITY));
      stackOf.set(id, Number.isFinite(first) ? Math.floor(first / rows) : stacks - 1);
    }
    const groups: string[][] = Array.from({ length: stacks }, () => []);
    for (const id of sourceColumn.ids) groups[stackOf.get(id)!].push(id);
    const groupGrid = groups.map((group) => Math.max(1, Math.ceil(group.length / rows)));
    const breath = BREATH_PX / scale;
    // Left to right: [room if named] files_k · breath · pages_k · room … then the concepts.
    let x = FLOW_SIDE_PAD;
    const stackX: Array<{ files: number; pages: number }> = [];
    groups.forEach((group, k) => {
      if (groupGrid[k] === 1 && group.length > 0) x += labelRoom;
      const filesLeft = x;
      x += (groupGrid[k] - 1) * FLOW_GRID_STEP;
      const filesRight = x;
      x += group.length > 0 ? breath + ISLAND_STACK_GAP : 0;
      const pagesX = x;
        x += WIDEST_MARK * 2 + NAME_GAP + labelRoom + breath;
      stackX.push({ files: (filesLeft + filesRight) / 2, pages: pagesX });
    });
    const conceptColumn = columns.find((column) => column.kind === "concept");
    const conceptX = conceptColumn ? x + breath : null;
    x += conceptColumn ? breath + labelRoom : 0;
    const needed = x + FLOW_SIDE_PAD;
    const stackWidth = Math.max(width, needed);
    const shift = (stackWidth - needed) / 2;
    const rowYs = placeEven(rows);
    pageColumn.ids.forEach((id, i) => {
      const k = Math.floor(i / rows);
      const point = positions.get(id)!;
      positions.set(id, { x: stackX[k].pages + shift, y: point.y });
    });
    groups.forEach((group, k) => {
      const left = stackX[k].files - ((groupGrid[k] - 1) * FLOW_GRID_STEP) / 2 + shift;
      // A short group sits level with its stack's middle rather than hanging from the top.
      const groupRows = Math.ceil(group.length / groupGrid[k]);
      const firstRow = Math.max(0, Math.floor((rows - groupRows) / 2));
      group.forEach((id, i) => {
        const sub = i % groupGrid[k];
        const row = firstRow + Math.floor(i / groupGrid[k]);
        positions.set(id, { x: left + FLOW_GRID_STEP * sub, y: rowYs[Math.min(row, rowYs.length - 1)] });
      });
    });
    if (conceptColumn && conceptX !== null) {
      const dx = conceptX + shift - conceptColumn.x;
      for (const id of conceptColumn.ids) {
        const point = positions.get(id)!;
        positions.set(id, { x: point.x + dx, y: point.y });
      }
      conceptColumn.x = conceptX + shift;
    }
    sourceColumn.x = stackX.reduce((sum, at) => sum + at.files, 0) / stackX.length + shift;
    sourceColumn.grid = Math.max(...groupGrid);
    pageColumn.x = stackX.reduce((sum, at) => sum + at.pages, 0) / stackX.length + shift;
    settleLabelRooms(columns, stackWidth);
    return { positions, columns, rowGap, extent: { width: stackWidth, height }, scale };
  }

  settleLabelRooms(columns, width);
  return { positions, columns, rowGap, extent: { width, height }, scale };
}
