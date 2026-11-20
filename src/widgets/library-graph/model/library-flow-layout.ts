import type { LibraryGraph, LibraryGraphNode, LibraryGraphNodeKind } from "./build-library-graph";
import { maxOf, minOf } from "./library-graph-extremes";
import type { LayoutPoint } from "./library-graph-layout";
import { LIBRARY_ZOOM_MIN, SOURCE_MARK_WORLD_RADIUS } from "./library-graph-view";

/**
 * The flow layout: sources left, the pages written from them in the middle, the concepts
 * they name right. The Library's fact is direction, not nearness, so columns replace a
 * force layout: they fill the canvas at any count and are the same on every machine.
 *
 * Pure and deterministic. Pages are ordered by concept barycentre then title, the outer
 * columns by page barycentre (one crossing-reduction sweep). Folded pages stand in stacks,
 * each a whole flow of its own files, pages and concepts; a file or concept joins a stack by
 * counting its own edges. O(n log n + E) with Map lookups; width and scale are solved in closed form.
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
 * The most room a name place takes, in screen px. Every place gets an equal share of the free
 * width up to this; the rest of a wide pane is margin, so one long title cannot spread the
 * columns apart. The renderer cuts a name to the room published here (`FlowColumn.labelRoom`).
 */
export const FLOW_LABEL_ROOM_MAX_PX = 240;
/** The least room a name place gets at a narrow canvas: a few characters and an ellipsis. */
export const FLOW_LABEL_ROOM_MIN_PX = 40;
/** The widest mark's radius (`WIDEST_MARK_WORLD_RADIUS`) and the gap a name stands from it. */
const WIDEST_MARK = 9;
const NAME_GAP = 5;
/** A breath between a name's end and the next thing, in screen px. */
const BREATH_PX = 8;
/** Between the parts of a stack and between stacks, in world units: the lines have room to be lines. */
const STACK_GAP = 16;
/** The widest a gap between two columns may be, in screen px: past this a line says nothing along its length. */
const FLOW_COLUMN_GAP_MAX = 260;

const COLUMN_ORDER: readonly LibraryGraphNodeKind[] = ["source", "page", "concept"];

const LABEL_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function byLabelThenId(a: { id: string; label: string }, b: { id: string; label: string }): number {
  return LABEL_COLLATOR.compare(a.label, b.label) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Mean row index of a node's neighbours in `reference`, or +Infinity when it has none. */
function barycentre(id: string, neighbours: ReadonlyMap<string, readonly string[]>, reference: ReadonlyMap<string, number>): number {
  const rows = (neighbours.get(id) ?? []).map((other) => reference.get(other)).filter((row): row is number => row !== undefined);
  if (rows.length === 0) return Number.POSITIVE_INFINITY;
  return rows.reduce((sum, row) => sum + row, 0) / rows.length;
}

/** `nodes` sorted by their barycentre in `reference`, then by title; O(k log k + their edges). */
function byBarycentre(nodes: readonly LibraryGraphNode[], neighbours: ReadonlyMap<string, readonly string[]>, reference: ReadonlyMap<string, number>): LibraryGraphNode[] {
  return nodes
    .map((node) => ({ node, key: barycentre(node.id, neighbours, reference) }))
    .sort((a, b) => a.key - b.key || byLabelThenId(a.node, b.node))
    .map((entry) => entry.node);
}

/** `count` rows a row gap apart, centred on the picture's middle. */
function evenRows(count: number, rowGap: number, height: number): number[] {
  const top = height / 2 - (rowGap * (count - 1)) / 2;
  return Array.from({ length: count }, (_, row) => top + rowGap * row);
}

/**
 * Each id at the mean y of its neighbours found in `referenceY`, pushed apart to the row gap
 * in order, and the column re-centred so the push does not drift it downward. O(ids + their edges).
 */
function rowsByNeighbours(
  ids: readonly string[],
  neighbours: ReadonlyMap<string, readonly string[]>,
  referenceY: ReadonlyMap<string, number>,
  rowGap: number,
  height: number,
): number[] {
  const ys: number[] = [];
  for (const id of ids) {
    const near = (neighbours.get(id) ?? []).map((other) => referenceY.get(other)).filter((y): y is number => y !== undefined);
    const wanted = near.length > 0 ? near.reduce((sum, y) => sum + y, 0) / near.length : ys.length > 0 ? ys[ys.length - 1] + rowGap : height / 2;
    ys.push(ys.length > 0 ? Math.max(wanted, ys[ys.length - 1] + rowGap) : wanted);
  }
  const shift = height / 2 - (ys[0] + ys[ys.length - 1]) / 2;
  return ys.map((y) => y + shift);
}

/** What a name place costs besides its room: the marks either side, the name gap, a breath. */
function placeCost(breath: number): number {
  return WIDEST_MARK * 2 + NAME_GAP + breath;
}

/**
 * The picture's scale and every name place's room, solved together in closed form.
 * `stripWidth(room, breath)` is affine in both, so three probes give the fixed width and how
 * many rooms and breaths the strip holds. At the scale the height allows, each place shares
 * the free width up to the ceiling; when that leaves less than the minimum, the scale drops
 * until the minimum fits.
 */
function settleNameRoom(
  world: Required<FlowWorld>,
  height: number,
  stripWidth: (room: number, breath: number) => number,
): { room: number; scale: number; width: number } {
  const fixed = stripWidth(0, 0);
  const places = stripWidth(1, 0) - fixed;
  const breathsPx = (stripWidth(0, 1) - fixed) * BREATH_PX;
  const screenWidth = world.width * world.ceiling;
  const tallScale = world.ceiling * (world.height / height);
  const sharePx = places > 0 ? (screenWidth - fixed * tallScale - breathsPx) / places : 0;
  if (places === 0 ? fixed * tallScale + breathsPx <= screenWidth : sharePx >= FLOW_LABEL_ROOM_MIN_PX) {
    return { room: Math.min(FLOW_LABEL_ROOM_MAX_PX, sharePx) / tallScale, scale: tallScale, width: world.width * (height / world.height) };
  }
  // A pane narrower than every minimum gives no name any room; the scale stays positive and within the height.
  const roomPx = places > 0 && screenWidth - breathsPx > places * FLOW_LABEL_ROOM_MIN_PX ? FLOW_LABEL_ROOM_MIN_PX : 0;
  const scale = Math.min(tallScale, Math.max(1, screenWidth - breathsPx - places * roomPx) / fixed);
  return { room: roomPx / scale, scale, width: screenWidth / scale };
}

interface FlowColumn {
  kind: LibraryGraphNodeKind;
  x: number;
  ids: string[];
  /** How many sub-columns the band was folded into, or the most any one stack folded it into; 1 means every mark has a row of its own. */
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
  const conceptRank = new Map([...(nodesByKind.get("concept") ?? [])].sort(byLabelThenId).map((node, row) => [node.id, row]));
  const pages = byBarycentre(nodesByKind.get("page") ?? [], neighbours, conceptRank);
  const pageRow = new Map(pages.map((node, row) => [node.id, row]));
  const candidates: Array<{ kind: LibraryGraphNodeKind; nodes: typeof graph.nodes }> = [
    { kind: "source", nodes: byBarycentre(nodesByKind.get("source") ?? [], neighbours, pageRow) },
    { kind: "page", nodes: pages },
    { kind: "concept", nodes: byBarycentre(nodesByKind.get("concept") ?? [], neighbours, pageRow) },
  ];
  const ordered = candidates.filter((column) => column.nodes.length > 0);

  const box: Required<FlowWorld> = { width: Math.max(1, world.width), height: Math.max(1, world.height), ceiling: world.ceiling ?? 1 };
  if (ordered.length === 0) {
    return { positions: new Map(), columns: [], rowGap: FLOW_ROW_MAX, extent: { width: box.width, height: box.height }, scale: box.ceiling };
  }
  const innerHeight = Math.max(0, box.height - FLOW_TOP_PAD * 2);

  /**
   * Rows. A named mark keeps its own row while the picture can afford `FLOW_ROW_MIN_PX`;
   * past that its column folds into sub-columns, like an index in two columns. The unnamed
   * file band folds the same way rather than becoming a ladder the camera shrinks away.
   */
  const rowsFit = Math.max(1, Math.floor(innerHeight / FLOW_ROW_MIN) + 1);
  const leastScale = FLOW_ROW_MIN_PX / FLOW_ROW_MIN;
  const rowsAffordable = Math.max(1, Math.floor(((box.height * box.ceiling) / leastScale - FLOW_TOP_PAD * 2) / FLOW_ROW_MIN) + 1);
  // A file band folds only past the rows affordable at the 18px floor, not the rows that
  // fit at the ceiling, or a short band folds while a plain list would name every file.
  const grids = ordered.map((column) => Math.max(1, Math.ceil(column.nodes.length / rowsAffordable)));
  const rowsOf = (count: number, grid: number): number => Math.ceil(count / grid);
  const longestRows = Math.max(1, ...ordered.map((column, index) => rowsOf(column.nodes.length, grids[index])));
  // One gap for every column, so rows line up and an edge is a straight-ish S, not a fan.
  const rowGap =
    longestRows > rowsFit ? FLOW_ROW_MIN : Math.min(FLOW_ROW_MAX, Math.max(FLOW_ROW_MIN, longestRows > 1 ? innerHeight / (longestRows - 1) : FLOW_ROW_MAX));
  const height = Math.max(box.height, rowGap * (longestRows - 1) + FLOW_TOP_PAD * 2);

  const pageIndex = ordered.findIndex((column) => column.kind === "page");
  if (pageIndex >= 0 && grids[pageIndex] > 1) {
    return stackedFlowLayout(ordered, grids[pageIndex], neighbours, box, rowGap, height);
  }

  /**
   * Width keeps the box's aspect, so the fitted camera fills both axes. Every name place
   * shares what the canvas leaves: outside the outer columns, in each gap, and beside each
   * named sub-column. A folded file band names nothing at rest, so it keeps no room outside.
   */
  const namedLanes = ordered.reduce((sum, column, index) => sum + (column.kind === "source" ? 0 : grids[index] - 1), 0);
  const leftRoom = ordered[0].kind === "source" && grids[0] > 1 ? 0 : 1;
  const places = leftRoom + 1 + (ordered.length - 1) + namedLanes;
  const sourceBands = ordered.reduce((sum, column, index) => sum + (column.kind === "source" ? (grids[index] - 1) * FLOW_GRID_STEP : 0), 0);
  const { room: labelRoom, scale, width } = settleNameRoom(box, height, (room, breath) => FLOW_SIDE_PAD * 2 + sourceBands + places * (placeCost(breath) + room));
  const breath = BREATH_PX / scale;
  const laneStep = placeCost(breath) + labelRoom;
  const stepOf = (kind: LibraryGraphNodeKind): number => (kind === "source" ? FLOW_GRID_STEP : laneStep);
  const bandWidths = ordered.map((column, index) => (grids[index] - 1) * stepOf(column.kind));
  const bandsTotal = bandWidths.reduce((sum, w) => sum + w, 0);
  const outerRoom = labelRoom + NAME_GAP + WIDEST_MARK;
  /*
   * The column gap is capped at `FLOW_COLUMN_GAP_MAX`, unless a name place needs more, and
   * the picture centred in the rest, or a wide canvas draws every citation as a long line.
   */
  const spread = ordered.length > 1 ? (width - FLOW_SIDE_PAD * 2 - outerRoom * (leftRoom + 1) - bandsTotal) / (ordered.length - 1) : 0;
  const gap = Math.min(spread, Math.max(FLOW_COLUMN_GAP_MAX / scale, laneStep));
  const slack = ordered.length > 1 ? (spread - gap) * (ordered.length - 1) : 0;
  const columnX = (index: number): number => {
    if (ordered.length === 1) return width / 2;
    let x = FLOW_SIDE_PAD + outerRoom * leftRoom + slack / 2;
    for (let i = 0; i < index; i += 1) x += bandWidths[i] + gap;
    return x + bandWidths[index] / 2;
  };

  const columns: FlowColumn[] = ordered.map((column, index) => ({
    kind: column.kind,
    x: columnX(index),
    ids: column.nodes.map((node) => node.id),
    grid: grids[index],
    labelRoom,
  }));

  /**
   * The anchor column and any folded band are spread evenly; every other mark takes the mean
   * y of its neighbours in the column placed before it (`rowsByNeighbours`).
   */
  const positions = new Map<string, LayoutPoint>();
  const yOf = new Map<string, number>();
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
    // folded concept column fills column by column.
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
  const rowsFor = (index: number, referenceIndex: number | null): number[] => {
    const column = columns[index];
    if (column.grid > 1 || referenceIndex === null) return evenRows(rowsOf(column.ids.length, column.grid), rowGap, height);
    const referenceY = new Map(columns[referenceIndex].ids.map((id) => [id, yOf.get(id)!]));
    return rowsByNeighbours(column.ids, neighbours, referenceY, rowGap, height);
  };
  place(anchorIndex, rowsFor(anchorIndex, null));
  for (let index = anchorIndex + 1; index < columns.length; index += 1) place(index, rowsFor(index, index - 1));
  for (let index = anchorIndex - 1; index >= 0; index -= 1) place(index, rowsFor(index, index + 1));

  /**
   * Widens a column's name room to the picture's edge when the kind to its right has no
   * rows; otherwise a name would lie across the citations crossing that gap. A folded
   * column is left alone: its single `x` cannot speak for its sub-columns.
   */
  const rowsOfKind = new Map(columns.map((column) => [column.kind, column.ids.length]));
  for (const column of columns) {
    // A file's name stands left of its square, in room already reserved there.
    if (column.kind === "source" || column.grid > 1) continue;
    const nextKind = COLUMN_ORDER[COLUMN_ORDER.indexOf(column.kind) + 1];
    if (nextKind === undefined || (rowsOfKind.get(nextKind) ?? 0) > 0) continue;
    const start = column.x + WIDEST_MARK + NAME_GAP;
    column.labelRoom = Math.max(labelRoom, width - FLOW_SIDE_PAD - start);
  }
  return { positions, columns, rowGap, extent: { width, height }, scale };
}

/** Which kinds in a stack are given a name place at rest. */
interface StackNaming {
  files: boolean;
  pages: boolean;
  concepts: boolean;
}
/** Every name first, then narrower: files' names go before concepts' (the list beside the picture names files). */
const STACK_NAMINGS: readonly StackNaming[] = [
  { files: true, pages: true, concepts: true },
  { files: false, pages: true, concepts: true },
  { files: false, pages: true, concepts: false },
];
const UNNAMED_STACKS: StackNaming = { files: false, pages: false, concepts: false };

/**
 * Folded pages stand in `stacks` runs of consecutive pages, and each stack is a whole flow:
 * its files as a grid to its left, its concepts to its right, so a stack's lines stay inside
 * it. A file goes to the first stack that reads it, a concept to the stack holding most of
 * the pages naming it (the earlier on a tie); either with no page goes to the last stack.
 * O(n log n + E): every mark is counted, sorted and placed once, within its own stack.
 */
function stackedFlowLayout(
  ordered: ReadonlyArray<{ kind: LibraryGraphNodeKind; nodes: readonly LibraryGraphNode[] }>,
  stacks: number,
  neighbours: ReadonlyMap<string, readonly string[]>,
  box: Required<FlowWorld>,
  rowGap: number,
  height: number,
): FlowLayout {
  const nodesOf = (kind: LibraryGraphNodeKind): readonly LibraryGraphNode[] => ordered.find((column) => column.kind === kind)?.nodes ?? [];
  const pageIds = nodesOf("page").map((node) => node.id);
  const rows = Math.ceil(pageIds.length / stacks);
  const stackOfPage = new Map(pageIds.map((id, index) => [id, Math.floor(index / rows)]));
  const rowYs = evenRows(rows, rowGap, height);

  const fileGroups: string[][] = Array.from({ length: stacks }, () => []);
  const pageIndex = new Map(pageIds.map((id, index) => [id, index]));
  for (const { id } of nodesOf("source")) {
    const first = minOf((neighbours.get(id) ?? []).map((other) => pageIndex.get(other) ?? Number.POSITIVE_INFINITY));
    fileGroups[Number.isFinite(first) ? Math.floor(first / rows) : stacks - 1].push(id);
  }
  const fileGrid = fileGroups.map((group) => Math.max(1, Math.ceil(group.length / rows)));
  // Files are named per kind, not per stack (`FOLDED_LABEL_MIN_SCALE`), so one folded group leaves every file unnamed at rest.
  const filesNameable = maxOf(fileGrid) === 1;

  /** A concept's naming pages per stack, each page counted once. */
  const conceptGroups: Array<Array<{ node: LibraryGraphNode; key: number }>> = Array.from({ length: stacks }, () => []);
  for (const node of nodesOf("concept")) {
    const namers = new Set((neighbours.get(node.id) ?? []).filter((other) => stackOfPage.has(other)));
    const counts = new Map<number, number>();
    for (const page of namers) counts.set(stackOfPage.get(page)!, (counts.get(stackOfPage.get(page)!) ?? 0) + 1);
    let stack = stacks - 1;
    let most = 0;
    for (const [k, count] of counts) {
      if (count > most || (count === most && k < stack)) [stack, most] = [k, count];
    }
    const ownRows = [...namers].filter((page) => stackOfPage.get(page) === stack).map((page) => pageIndex.get(page)! % rows);
    const key = ownRows.length > 0 ? ownRows.reduce((sum, row) => sum + row, 0) / ownRows.length : Number.POSITIVE_INFINITY;
    conceptGroups[stack].push({ node, key });
  }
  const conceptStacks = conceptGroups.map((group) =>
    group.sort((a, b) => a.key - b.key || byLabelThenId(a.node, b.node)).map((entry) => entry.node.id),
  );
  const conceptGrid = conceptStacks.map((group) => (group.length === 0 ? 0 : Math.ceil(group.length / rows)));

  /**
   * Left to right, stacks a gap apart: [file names] files · gap · pages [and names] · gap ·
   * concept lanes [and names]. No side pad: the camera frames the strip with its own.
   */
  const strip = (room: number, breath: number, naming: StackNaming) => {
    let x = 0;
    const at: Array<{ files: number; pages: number; concepts: number[] }> = [];
    for (let k = 0; k < stacks; k += 1) {
      if (k > 0) x += STACK_GAP;
      let files = x;
      if (fileGroups[k].length > 0) {
        if (naming.files && filesNameable) x += room + NAME_GAP;
        x += SOURCE_MARK_WORLD_RADIUS;
        files = x + ((fileGrid[k] - 1) * FLOW_GRID_STEP) / 2;
        x += (fileGrid[k] - 1) * FLOW_GRID_STEP + SOURCE_MARK_WORLD_RADIUS + breath + STACK_GAP;
      }
      x += WIDEST_MARK;
      const pages = x;
      x += WIDEST_MARK + breath + (naming.pages ? NAME_GAP + room : 0);
      const concepts: number[] = [];
      if (conceptGrid[k] > 0) x += STACK_GAP;
      for (let lane = 0; lane < conceptGrid[k]; lane += 1) {
        x += WIDEST_MARK;
        concepts.push(x);
        x += WIDEST_MARK + breath + (naming.concepts ? NAME_GAP + room : 0);
      }
      at.push({ files, pages, concepts });
    }
    return { width: x, at };
  };
  /*
   * The most names whose rows keep the floor. Past that, pages alone keep their names while
   * the camera can still fit them (`LIBRARY_ZOOM_MIN`), the rows giving way; then nothing is named at rest.
   */
  const settle = (naming: StackNaming) => ({ naming, ...settleNameRoom(box, height, (room, breath) => strip(room, breath, naming).width) });
  const plans = STACK_NAMINGS.map(settle);
  const pagesOnly = plans[plans.length - 1];
  const { naming, room, scale, width } =
    plans.find((plan) => plan.scale >= FLOW_ROW_MIN_PX / rowGap - 1e-9) ?? (pagesOnly.scale >= LIBRARY_ZOOM_MIN ? pagesOnly : settle(UNNAMED_STACKS));
  const laid = strip(room, BREATH_PX / scale, naming);
  const shift = (width - laid.width) / 2;

  const positions = new Map<string, LayoutPoint>();
  pageIds.forEach((id, i) => positions.set(id, { x: laid.at[Math.floor(i / rows)].pages + shift, y: rowYs[i % rows] }));
  fileGroups.forEach((group, k) => {
    const left = laid.at[k].files - ((fileGrid[k] - 1) * FLOW_GRID_STEP) / 2 + shift;
    // A short group sits level with its stack's middle rather than hanging from the top.
    const firstRow = Math.max(0, Math.floor((rows - Math.ceil(group.length / fileGrid[k])) / 2));
    group.forEach((id, i) => {
      const row = firstRow + Math.floor(i / fileGrid[k]);
      positions.set(id, { x: left + FLOW_GRID_STEP * (i % fileGrid[k]), y: rowYs[Math.min(row, rows - 1)] });
    });
  });
  conceptStacks.forEach((group, k) => {
    if (group.length === 0) return;
    const lanes = laid.at[k].concepts;
    if (lanes.length === 1) {
      const ownPageY = new Map(pageIds.slice(k * rows, (k + 1) * rows).map((id, row) => [id, rowYs[row]]));
      const ys = rowsByNeighbours(group, neighbours, ownPageY, rowGap, height);
      group.forEach((id, i) => positions.set(id, { x: lanes[0] + shift, y: ys[i] }));
      return;
    }
    // Folded like a named column: filled lane by lane, so a lane is a run of neighbours.
    const count = Math.ceil(group.length / lanes.length);
    const ys = evenRows(count, rowGap, height);
    group.forEach((id, i) => positions.set(id, { x: lanes[Math.floor(i / count)] + shift, y: ys[i % count] }));
  });

  const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length + shift;
  const columnOf: Record<LibraryGraphNodeKind, () => FlowColumn> = {
    source: () => ({ kind: "source", x: mean(laid.at.map((at) => at.files)), ids: fileGroups.flat(), grid: maxOf(fileGrid), labelRoom: naming.files && filesNameable ? room : 0 }),
    page: () => ({ kind: "page", x: mean(laid.at.map((at) => at.pages)), ids: pageIds, grid: stacks, labelRoom: naming.pages ? room : 0 }),
    concept: () => ({ kind: "concept", x: mean(laid.at.flatMap((at) => at.concepts)), ids: conceptStacks.flat(), grid: maxOf(conceptGrid), labelRoom: naming.concepts ? room : 0 }),
  };
  return { positions, columns: ordered.map((column) => columnOf[column.kind]()), rowGap, extent: { width, height }, scale };
}
