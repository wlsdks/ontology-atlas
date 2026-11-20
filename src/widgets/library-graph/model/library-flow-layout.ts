import type { LibraryGraph, LibraryGraphNode, LibraryGraphNodeKind } from "./build-library-graph";
import {
  byLabelThenId,
  COLUMN_ORDER,
  evenRows,
  FLOW_FILL,
  FLOW_GRID_STEP,
  FLOW_ROW_MAX,
  FLOW_SIDE_PAD,
  FLOW_TOP_PAD,
  type FlowColumn,
  type FlowFit,
  type FlowLayout,
  type FlowWorld,
  NAME_GAP,
  namingHolds,
  namingLadder,
  placeCost,
  resolveFit,
  rowPitch,
  rowsAffordable,
  rowsByNeighbours,
  settleNameRoom,
  shownScale,
  WIDEST_MARK,
  BREATH_PX,
} from "./library-flow-measure";
import { stackedFlowLayout } from "./library-flow-stacks";
import type { LayoutPoint } from "./library-graph-layout";

export type { FlowLayout, FlowWorld } from "./library-flow-measure";

/**
 * The flow layout: sources left, the pages written from them in the middle, the concepts
 * they name right. The Library's fact is direction, not nearness, so columns replace a
 * force layout: they fill the canvas at any count and are the same on every machine.
 *
 * Pure and deterministic. Pages are ordered by concept barycentre then title, the outer
 * columns by page barycentre (one crossing-reduction sweep). Folded pages stand in stacks
 * (`library-flow-stacks`), laid for three stack counts, or for fewer when none fits the
 * camera's box. O(n log n + E) per count with Map lookups; width and zoom are solved in
 * closed form (`library-flow-measure`).
 */

/** The widest a gap between two columns may be, in screen px: past this a line says nothing along its length. */
const FLOW_COLUMN_GAP_MAX = 260;

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

  const fit = resolveFit(world);
  if (ordered.length === 0) {
    const extent = { width: (fit.width / fit.ceiling) * FLOW_FILL, height: fit.rowsHeight };
    return { positions: new Map(), columns: [], rowGap: FLOW_ROW_MAX, extent, scale: shownScale(extent, fit) };
  }
  /**
   * Rows. A named mark keeps its own row while the picture can afford `FLOW_ROW_MIN_PX`;
   * past that its column folds into sub-columns, like an index in two columns. The unnamed
   * file band folds the same way rather than becoming a ladder the camera shrinks away.
   */
  const affordable = rowsAffordable(fit);
  const lanes = ordered.map((column) => Math.max(1, Math.ceil(column.nodes.length / affordable)));
  const pageIndex = ordered.findIndex((column) => column.kind === "page");
  if (pageIndex >= 0 && lanes[pageIndex] > 1) return stackedFlowLayout(ordered, lanes[pageIndex], neighbours, fit);
  return bandFlowLayout(ordered, lanes, neighbours, fit);
}

/**
 * Columns side by side, each folded into `lanes` sub-columns. Width keeps the box's aspect, so
 * the fitted camera fills both axes. Name places share what the canvas leaves, kinds named down
 * `namingLadder`.
 */
function bandFlowLayout(
  ordered: ReadonlyArray<{ kind: LibraryGraphNodeKind; nodes: readonly LibraryGraphNode[] }>,
  lanes: readonly number[],
  neighbours: ReadonlyMap<string, readonly string[]>,
  fit: FlowFit,
): FlowLayout {
  const rowsOf = (count: number, laneCount: number): number => Math.ceil(count / laneCount);
  // One gap for every column, so rows line up and an edge is a straight-ish S, not a fan.
  const { rowGap, height } = rowPitch(Math.max(1, ...ordered.map((column, index) => rowsOf(column.nodes.length, lanes[index]))), fit);

  // A folded file band or concept column names nothing at rest, so it keeps no room for names.
  const nameable = (kind: LibraryGraphNodeKind): boolean => kind === "page" || lanes[ordered.findIndex((column) => column.kind === kind)] === 1;
  const sourceBands = ordered.reduce((sum, column, index) => sum + (column.kind === "source" ? (lanes[index] - 1) * FLOW_GRID_STEP : 0), 0);
  const extraLanes = ordered.map((column, index) => (column.kind === "source" ? 0 : lanes[index] - 1));
  const last = ordered.length - 1;
  /*
   * Name places: left of a named file band; in every gap once a column's names stand in one
   * (gaps are one width); beside a named column's sub-columns; right of the last column. Each
   * costs its marks and a breath; a named one adds the room.
   */
  const shapeOf = (naming: ReadonlySet<LibraryGraphNodeKind>) => ({
    leftSlot: ordered[0].kind === "source" && naming.has("source") ? 1 : 0,
    rightSlot: ordered[last].kind !== "source" && nameable(ordered[last].kind) ? 1 : 0,
    rightNamed: ordered[last].kind !== "source" && naming.has(ordered[last].kind),
    gapsNamed: ordered.some((column, index) => index < last && column.kind !== "source" && naming.has(column.kind)),
  });
  const settleWith = (naming: ReadonlySet<LibraryGraphNodeKind>) => {
    const { leftSlot, rightSlot, rightNamed, gapsNamed } = shapeOf(naming);
    const slots = leftSlot + rightSlot + last + extraLanes.reduce((sum, count) => sum + count, 0);
    const rooms =
      leftSlot + (rightNamed ? 1 : 0) + (gapsNamed ? last : 0) + ordered.reduce((sum, column, index) => sum + (naming.has(column.kind) ? extraLanes[index] : 0), 0);
    return { naming, ...settleNameRoom(fit, height, (room, breath) => FLOW_SIDE_PAD * 2 + sourceBands + slots * placeCost(breath) + rooms * room) };
  };
  // The most names, down the ladder, that each keep `FLOW_NAME_ROOM_MIN_PX` with rows at the floor.
  const { naming, room: labelRoom, scale, width } = namingLadder(new Set(ordered.map((column) => column.kind)), nameable)
    .map(settleWith)
    .find((plan) => namingHolds(plan.naming, plan, rowGap))!;
  const { leftSlot, rightSlot, rightNamed, gapsNamed } = shapeOf(naming);
  const named = ordered.map((column) => naming.has(column.kind));

  const breath = BREATH_PX / scale;
  const laneStep = placeCost(breath) + labelRoom;
  const stepOf = (index: number): number => (ordered[index].kind === "source" ? FLOW_GRID_STEP : named[index] ? laneStep : placeCost(breath));
  const bandWidths = ordered.map((_, index) => (lanes[index] - 1) * stepOf(index));
  const bandsTotal = bandWidths.reduce((sum, w) => sum + w, 0);
  const leftOuter = leftSlot * (labelRoom + NAME_GAP + WIDEST_MARK);
  const rightOuter = rightSlot * ((rightNamed ? labelRoom : 0) + NAME_GAP + WIDEST_MARK);
  /*
   * The column gap is capped at `FLOW_COLUMN_GAP_MAX`, unless a name place needs more, and
   * the picture centred in the rest, or a wide canvas draws every citation as a long line.
   */
  const spread = last > 0 ? (width - FLOW_SIDE_PAD * 2 - leftOuter - rightOuter - bandsTotal) / last : 0;
  const gap = Math.min(spread, Math.max(FLOW_COLUMN_GAP_MAX / scale, gapsNamed ? laneStep : placeCost(breath)));
  const slack = last > 0 ? (spread - gap) * last : 0;
  const columnX = (index: number): number => {
    if (last === 0) return width / 2;
    let x = FLOW_SIDE_PAD + leftOuter + slack / 2;
    for (let i = 0; i < index; i += 1) x += bandWidths[i] + gap;
    return x + bandWidths[index] / 2;
  };

  const columns: FlowColumn[] = ordered.map((column, index) => ({
    kind: column.kind,
    x: columnX(index),
    ids: column.nodes.map((node) => node.id),
    lanes: lanes[index],
    stacks: 1,
    named: named[index],
    labelRoom: named[index] ? labelRoom : 0,
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
    if (column.kind === "source" && column.lanes > 1) return best;
    if (columns[best].kind === "source" && columns[best].lanes > 1) return index;
    return rowsOf(column.ids.length, column.lanes) > rowsOf(columns[best].ids.length, columns[best].lanes) ? index : best;
  }, 0);

  /** Lays one column: a plain band takes the rows as given; a folded band tiles them. */
  const place = (index: number, rowYs: number[]): void => {
    const column = columns[index];
    const count = rowsOf(column.ids.length, column.lanes);
    const step = stepOf(index);
    const left = column.x - (step * (column.lanes - 1)) / 2;
    // A folded file band tiles row by row, so one page's files leave as one sheaf; a
    // folded concept column fills column by column.
    const rowMajor = column.kind === "source" && column.lanes > 1;
    column.ids.forEach((id, i) => {
      const sub = column.lanes === 1 ? 0 : rowMajor ? i % column.lanes : Math.floor(i / count);
      const row = column.lanes === 1 ? i : rowMajor ? Math.floor(i / column.lanes) : i % count;
      const y = rowYs[Math.min(row, rowYs.length - 1)];
      const x = column.lanes === 1 ? column.x : left + step * sub;
      yOf.set(id, y);
      positions.set(id, { x, y });
    });
  };
  const rowsFor = (index: number, referenceIndex: number | null): number[] => {
    const column = columns[index];
    if (column.lanes > 1 || referenceIndex === null) return evenRows(rowsOf(column.ids.length, column.lanes), rowGap, height);
    const referenceY = new Map(columns[referenceIndex].ids.map((id) => [id, yOf.get(id)!]));
    return rowsByNeighbours(column.ids, neighbours, referenceY, rowGap, FLOW_TOP_PAD, height - FLOW_TOP_PAD);
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
    if (column.kind === "source" || column.lanes > 1 || !column.named) continue;
    const nextKind = COLUMN_ORDER[COLUMN_ORDER.indexOf(column.kind) + 1];
    if (nextKind === undefined || (rowsOfKind.get(nextKind) ?? 0) > 0) continue;
    const start = column.x + WIDEST_MARK + NAME_GAP;
    column.labelRoom = Math.max(labelRoom, width - FLOW_SIDE_PAD - start);
  }
  const extent = { width, height };
  return { positions, columns, rowGap, extent, scale: shownScale(extent, fit) };
}
