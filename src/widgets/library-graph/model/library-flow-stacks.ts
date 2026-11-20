import type { LibraryGraphNode, LibraryGraphNodeKind } from "./build-library-graph";
import {
  BREATH_PX,
  byLabelThenId,
  evenRows,
  FLOW_FILE_NAME_MIN_PX,
  FLOW_GRID_STEP,
  type FlowColumn,
  type FlowFit,
  type FlowLayout,
  keepsRowFloor,
  NAME_GAP,
  rowPitch,
  rowsByNeighbours,
  settleNameRoom,
  shownScale,
  WIDEST_MARK,
} from "./library-flow-measure";
import { maxOf, minOf } from "./library-graph-extremes";
import type { LayoutPoint } from "./library-graph-layout";
import { LIBRARY_ZOOM_MIN, SOURCE_MARK_WORLD_RADIUS } from "./library-graph-view";

/**
 * Folded pages stand in stacks of consecutive pages, and each stack is a whole flow: its files
 * as a grid to its left, its concepts to its right, so a stack's lines stay inside it. A file
 * goes to the first stack that reads it, a concept to the stack holding most of the pages
 * naming it (the earlier on a tie); either with no page goes to the last stack.
 */

/** How many stack counts past the fewest the row floor allows are laid to find the one that names most. */
const STACK_COUNTS_TRIED_PAST_FEWEST = 2;
/** Between the parts of a stack and between stacks, in world units: the lines have room to be lines. */
export const STACK_GAP = 16;

type Ordered = ReadonlyArray<{ kind: LibraryGraphNodeKind; nodes: readonly LibraryGraphNode[] }>;

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
 * Lays a folded folder for the fewest stacks the row floor allows and a couple more, and keeps
 * the count that names most: pages, then concepts, then files; then rows at the floor; then
 * the most room for a page name; then fewer stacks. Linear in the three counts laid.
 */
export function stackedFlowLayout(ordered: Ordered, fewestStacks: number, neighbours: ReadonlyMap<string, readonly string[]>, fit: FlowFit): FlowLayout {
  const pageCount = ordered.find((column) => column.kind === "page")!.nodes.length;
  // A count whose rows another count already gives would only lay an empty last stack.
  const distinct = (stacks: number): boolean => Math.ceil(pageCount / Math.ceil(pageCount / stacks)) === stacks;
  let best: { layout: FlowLayout; rank: number[] } | null = null;
  for (let stacks = fewestStacks; stacks <= Math.min(pageCount, fewestStacks + STACK_COUNTS_TRIED_PAST_FEWEST); stacks += 1) {
    if (!distinct(stacks)) continue;
    const layout = layStacks(ordered, stacks, neighbours, fit);
    const rank = rankOf(layout);
    if (best === null || outranks(rank, best.rank)) best = { layout, rank };
  }
  if (fitsCamera(best!.layout, fit)) return best!.layout;
  /*
   * A pane too narrow for even the fewest stacks at the zoom floor: fewer, taller stacks are
   * narrower, so the most stacks that still fit are laid, rows under the floor. At most the
   * fewest count more lays, and only in this case.
   */
  for (let stacks = fewestStacks - 1; stacks >= 1; stacks -= 1) {
    if (!distinct(stacks)) continue;
    const layout = layStacks(ordered, stacks, neighbours, fit);
    if (fitsCamera(layout, fit)) return layout;
  }
  return best!.layout;
}

/** Whether the camera shows the whole picture: its zoom was not held up at the floor. */
function fitsCamera(layout: FlowLayout, fit: FlowFit): boolean {
  return layout.extent.width * layout.scale <= fit.width + 1e-6 && layout.extent.height * layout.scale <= fit.height + 1e-6;
}

function rankOf(layout: FlowLayout): number[] {
  const column = (kind: LibraryGraphNodeKind) => layout.columns.find((candidate) => candidate.kind === kind);
  const named = (kind: LibraryGraphNodeKind) => (column(kind)?.named ? 1 : 0);
  return [named("page"), named("concept"), named("source"), keepsRowFloor(layout.rowGap, layout.scale) ? 1 : 0, (column("page")?.labelRoom ?? 0) * layout.scale];
}

function outranks(rank: number[], other: number[]): boolean {
  for (let i = 0; i < rank.length; i += 1) {
    if (Math.abs(rank[i] - other[i]) > 1e-9) return rank[i] > other[i];
  }
  return false;
}

/** Which stack each file and concept stands in, and in what order within it. O(n log n + E). */
function assignToStacks(ordered: Ordered, stacks: number, rows: number, neighbours: ReadonlyMap<string, readonly string[]>) {
  const nodesOf = (kind: LibraryGraphNodeKind): readonly LibraryGraphNode[] => ordered.find((column) => column.kind === kind)?.nodes ?? [];
  const pageIds = nodesOf("page").map((node) => node.id);
  const pageIndex = new Map(pageIds.map((id, index) => [id, index]));
  const stackOfPage = (id: string): number => Math.floor(pageIndex.get(id)! / rows);

  const fileGroups: string[][] = Array.from({ length: stacks }, () => []);
  for (const { id } of nodesOf("source")) {
    const first = minOf((neighbours.get(id) ?? []).map((other) => pageIndex.get(other) ?? Number.POSITIVE_INFINITY));
    fileGroups[Number.isFinite(first) ? Math.floor(first / rows) : stacks - 1].push(id);
  }

  const conceptGroups: Array<Array<{ node: LibraryGraphNode; key: number }>> = Array.from({ length: stacks }, () => []);
  for (const node of nodesOf("concept")) {
    // A concept's naming pages per stack, each page counted once.
    const namers = new Set((neighbours.get(node.id) ?? []).filter((other) => pageIndex.has(other)));
    const counts = new Map<number, number>();
    for (const page of namers) counts.set(stackOfPage(page), (counts.get(stackOfPage(page)) ?? 0) + 1);
    let stack = stacks - 1;
    let most = 0;
    for (const [k, count] of counts) {
      if (count > most || (count === most && k < stack)) [stack, most] = [k, count];
    }
    const ownRows = [...namers].filter((page) => stackOfPage(page) === stack).map((page) => pageIndex.get(page)! % rows);
    const key = ownRows.length > 0 ? ownRows.reduce((sum, row) => sum + row, 0) / ownRows.length : Number.POSITIVE_INFINITY;
    conceptGroups[stack].push({ node, key });
  }
  const conceptStacks = conceptGroups.map((group) => group.sort((a, b) => a.key - b.key || byLabelThenId(a.node, b.node)).map((entry) => entry.node.id));
  return { pageIds, fileGroups, conceptStacks };
}

function layStacks(ordered: Ordered, stacks: number, neighbours: ReadonlyMap<string, readonly string[]>, fit: FlowFit): FlowLayout {
  const pageCount = ordered.find((column) => column.kind === "page")!.nodes.length;
  const rows = Math.ceil(pageCount / stacks);
  // Files and concepts fold to the stack's rows, so the pages' rows are the picture's.
  const { rowGap, height } = rowPitch(rows, fit);
  const rowYs = evenRows(rows, rowGap, height);
  const { pageIds, fileGroups, conceptStacks } = assignToStacks(ordered, stacks, rows, neighbours);
  const fileLanes = fileGroups.map((group) => Math.max(1, Math.ceil(group.length / rows)));
  const conceptLanes = conceptStacks.map((group) => (group.length === 0 ? 0 : Math.ceil(group.length / rows)));
  // Names stand per kind, not per stack, so one folded group leaves its whole kind unnamed at rest: it keeps no room.
  const filesNameable = maxOf(fileLanes) === 1;
  const conceptsNameable = maxOf(conceptLanes, 0) <= 1;

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
        if (naming.files) x += room + NAME_GAP;
        x += SOURCE_MARK_WORLD_RADIUS;
        files = x + ((fileLanes[k] - 1) * FLOW_GRID_STEP) / 2;
        x += (fileLanes[k] - 1) * FLOW_GRID_STEP + SOURCE_MARK_WORLD_RADIUS + breath + STACK_GAP;
      }
      x += WIDEST_MARK;
      const pages = x;
      x += WIDEST_MARK + breath + (naming.pages ? NAME_GAP + room : 0);
      const concepts: number[] = [];
      if (conceptLanes[k] > 0) x += STACK_GAP;
      for (let lane = 0; lane < conceptLanes[k]; lane += 1) {
        x += WIDEST_MARK;
        concepts.push(x);
        x += WIDEST_MARK + breath + (naming.concepts ? NAME_GAP + room : 0);
      }
      at.push({ files, pages, concepts });
    }
    return { width: x, at };
  };

  /*
   * The most names whose rows keep the floor, files' only with `FLOW_FILE_NAME_MIN_PX`. Past
   * that, pages alone keep their names while the camera can still fit them (`LIBRARY_ZOOM_MIN`),
   * the rows giving way; then nothing is named at rest.
   */
  const settle = (naming: StackNaming) => ({ naming, ...settleNameRoom(fit, height, (room, breath) => strip(room, breath, naming).width) });
  const plans = STACK_NAMINGS.filter((naming) => (filesNameable || !naming.files) && (conceptsNameable || !naming.concepts)).map(settle);
  const pagesOnly = plans[plans.length - 1];
  const fileNamesTellApart = (plan: (typeof plans)[number]) => !plan.naming.files || plan.room * plan.scale >= FLOW_FILE_NAME_MIN_PX;
  const { naming, room, scale, width } =
    plans.find((plan) => plan.room > 0 && keepsRowFloor(rowGap, plan.scale) && fileNamesTellApart(plan)) ??
    (pagesOnly.room > 0 && pagesOnly.scale >= LIBRARY_ZOOM_MIN ? pagesOnly : settle(UNNAMED_STACKS));
  const laid = strip(room, BREATH_PX / scale, naming);
  const positions = placeStacks({ laid, shift: (width - laid.width) / 2, rows, rowYs, rowGap, pageIds, fileGroups, fileLanes, conceptStacks, neighbours });

  const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length + (width - laid.width) / 2;
  const columnOf: Record<LibraryGraphNodeKind, () => FlowColumn> = {
    source: () => ({ kind: "source", x: mean(laid.at.map((at) => at.files)), ids: fileGroups.flat(), lanes: maxOf(fileLanes), stacks, named: naming.files, labelRoom: naming.files ? room : 0 }),
    page: () => ({ kind: "page", x: mean(laid.at.map((at) => at.pages)), ids: pageIds, lanes: 1, stacks, named: naming.pages, labelRoom: naming.pages ? room : 0 }),
    concept: () => ({
      kind: "concept",
      x: mean(laid.at.flatMap((at) => at.concepts)),
      ids: conceptStacks.flat(),
      lanes: maxOf(conceptLanes, 1),
      stacks,
      named: naming.concepts,
      labelRoom: naming.concepts ? room : 0,
    }),
  };
  const extent = { width, height };
  return { positions, columns: ordered.map((column) => columnOf[column.kind]()), rowGap, extent, scale: shownScale(extent, fit) };
}

/** Every mark at its place in the laid strip: pages down their stack, files tiled, concepts level with their pages. */
function placeStacks(input: {
  laid: { at: Array<{ files: number; pages: number; concepts: number[] }> };
  shift: number;
  rows: number;
  rowYs: number[];
  rowGap: number;
  pageIds: string[];
  fileGroups: string[][];
  fileLanes: number[];
  conceptStacks: string[][];
  neighbours: ReadonlyMap<string, readonly string[]>;
}): Map<string, LayoutPoint> {
  const { laid, shift, rows, rowYs, rowGap, pageIds, fileGroups, fileLanes, conceptStacks, neighbours } = input;
  const positions = new Map<string, LayoutPoint>();
  pageIds.forEach((id, i) => positions.set(id, { x: laid.at[Math.floor(i / rows)].pages + shift, y: rowYs[i % rows] }));
  fileGroups.forEach((group, k) => {
    const left = laid.at[k].files - ((fileLanes[k] - 1) * FLOW_GRID_STEP) / 2 + shift;
    // A short group sits level with its stack's middle rather than hanging from the top.
    const firstRow = Math.max(0, Math.floor((rows - Math.ceil(group.length / fileLanes[k])) / 2));
    group.forEach((id, i) => {
      const row = firstRow + Math.floor(i / fileLanes[k]);
      positions.set(id, { x: left + FLOW_GRID_STEP * (i % fileLanes[k]), y: rowYs[Math.min(row, rows - 1)] });
    });
  });
  conceptStacks.forEach((group, k) => {
    if (group.length === 0) return;
    const lanes = laid.at[k].concepts;
    if (lanes.length === 1) {
      const ownPageY = new Map(pageIds.slice(k * rows, (k + 1) * rows).map((id, row) => [id, rowYs[row]]));
      const ys = rowsByNeighbours(group, neighbours, ownPageY, rowGap, rowYs[0], rowYs[rows - 1]);
      group.forEach((id, i) => positions.set(id, { x: lanes[0] + shift, y: ys[i] }));
      return;
    }
    // Folded like a named column: filled lane by lane, so a lane is a run of neighbours.
    const count = Math.ceil(group.length / lanes.length);
    const ys = evenRows(count, rowGap, rowYs[0] + rowYs[rows - 1]);
    group.forEach((id, i) => positions.set(id, { x: lanes[Math.floor(i / count)] + shift, y: ys[i % count] }));
  });
  return positions;
}
