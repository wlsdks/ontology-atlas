import { TREE_TONE_STEPS } from "./types";
import type {
  TreeDetailInput,
  TreeDrawList,
  TreeDrawMark,
  TreeLayout,
  TreeMarkSizes,
  TreeNodeKind,
  TreeProjector,
  TreeRect,
  TreeScreenPoint,
} from "./types";

export const TREE_MARK_BUDGET = 1500;
/** Work per cut is bounded by marks drawn, not vault size. */
const TREE_VISITS_PER_MARK = 4;
/** Perspective can push a subtree's silhouette past r·unit·scale; slack costs visits, never a visible mark. */
const TREE_CULL_SLACK = 1.5;

/** How a mark's radius follows the projector's scale. */
function markRadiusScale(scale: number): number {
  return scale;
}

/**
 * Per-node scratch, grown with the vault and reused: no allocation once warm.
 * `screen` holds x, y, scale, depth per node; `heap` is the open frontier.
 */
let screen = new Float64Array(0);
let heap = new Int32Array(0);
let heapSize = 0;
let revealStamp = new Uint32Array(0);
let revealEpoch = 0;
const probe: TreeScreenPoint = { x: 0, y: 0, scale: 0, depth: 0 };

function ensureScratch(count: number): void {
  if (heap.length >= count) return;
  screen = new Float64Array(count * 4);
  heap = new Int32Array(count);
  revealStamp = new Uint32Array(count);
  revealEpoch = 0;
}

function stampRevealed(parent: Int32Array, count: number, reveal: readonly number[]): void {
  revealEpoch++;
  if (revealEpoch === 0xffffffff) {
    revealStamp.fill(0);
    revealEpoch = 1;
  }
  for (const target of reveal) {
    let node = target;
    while (node >= 0 && node < count && revealStamp[node] !== revealEpoch) {
      revealStamp[node] = revealEpoch;
      node = parent[node];
    }
  }
}

function isRevealed(node: number): boolean {
  return revealStamp[node] === revealEpoch;
}

/** Revealed nodes leave the frontier first, then nearest first; ties by index keep the cut deterministic. */
function popsBefore(a: number, b: number): boolean {
  const revealedA = isRevealed(a);
  if (revealedA !== isRevealed(b)) return revealedA;
  const depthA = screen[a * 4 + 3];
  const depthB = screen[b * 4 + 3];
  return depthA !== depthB ? depthA < depthB : a < b;
}

function pushFrontier(node: number): void {
  let at = heapSize++;
  while (at > 0) {
    const up = (at - 1) >> 1;
    if (!popsBefore(node, heap[up])) break;
    heap[at] = heap[up];
    at = up;
  }
  heap[at] = node;
}

function popFrontier(): number {
  const top = heap[0];
  const last = heap[--heapSize];
  let at = 0;
  for (;;) {
    let next = at * 2 + 1;
    if (next >= heapSize) break;
    if (next + 1 < heapSize && popsBefore(heap[next + 1], heap[next])) next++;
    if (!popsBefore(heap[next], last)) break;
    heap[at] = heap[next];
    at = next;
  }
  if (heapSize > 0) heap[at] = last;
  return top;
}

function outsideView(layout: TreeLayout, node: number, projector: TreeProjector, view: TreeRect, padPx: number): boolean {
  const b = node * 4;
  const radius = layout.bound[b + 3];
  projector.project(layout.bound[b], layout.bound[b + 1], layout.bound[b + 2], probe);
  const gap = probe.depth - radius;
  if (gap <= 0) return false;
  const nearScale = (probe.scale * probe.depth) / gap;
  const reachPx = radius * projector.unit * nearScale * TREE_CULL_SLACK + padPx * markRadiusScale(nearScale);
  return (
    probe.x + reachPx < view.x ||
    probe.x - reachPx > view.x + view.width ||
    probe.y + reachPx < view.y ||
    probe.y - reachPx > view.y + view.height
  );
}

function storeScreen(layout: TreeLayout, node: number, projector: TreeProjector): void {
  const p = node * 3;
  projector.project(layout.position[p], layout.position[p + 1], layout.position[p + 2], probe);
  const s = node * 4;
  screen[s] = probe.x;
  screen[s + 1] = probe.y;
  screen[s + 2] = probe.scale;
  screen[s + 3] = probe.depth;
}

/** Least child spacing in world units; a lone child's spacing is the length of its branch. */
function childSpacing(layout: TreeLayout, node: number): number {
  const pitch = layout.childPitch[node];
  if (pitch > 0) return pitch;
  const a = node * 3;
  const b = (node + 1) * 3;
  const { position } = layout;
  return Math.hypot(position[b] - position[a], position[b + 1] - position[a + 1], position[b + 2] - position[a + 2]);
}

function markSize(kind: TreeNodeKind, sizes: TreeMarkSizes): number {
  return kind === "fork" ? sizes.bud : sizes[kind];
}

function toneOf(depth: number, projector: TreeProjector): number {
  const span = projector.far - projector.near;
  const nearness = span > 0 ? (projector.far - depth) / span : 1;
  return Math.min(TREE_TONE_STEPS - 1, Math.max(0, Math.round(nearness * (TREE_TONE_STEPS - 1))));
}

function nextMark(out: TreeDrawList): TreeDrawMark {
  if (out.count === out.marks.length) {
    out.marks.push({ node: 0, x: 0, y: 0, radius: 0, scale: 0, depth: 0, tone: 0, closed: false });
  }
  return out.marks[out.count++];
}

function emitMark(input: TreeDetailInput, out: TreeDrawList, node: number, closed: boolean): void {
  const { layout, projector } = input;
  const mark = nextMark(out);
  mark.node = node;
  mark.closed = closed;
  if (node === 0) {
    projector.project(0, 0, 0, probe);
    mark.x = probe.x;
    mark.y = probe.y;
    mark.scale = probe.scale;
    mark.depth = probe.depth;
  } else {
    const s = node * 4;
    mark.x = screen[s];
    mark.y = screen[s + 1];
    mark.scale = screen[s + 2];
    mark.depth = screen[s + 3];
  }
  mark.radius = markSize(layout.model.kinds[node], input.marks) * markRadiusScale(mark.scale);
  mark.tone = toneOf(mark.depth, projector);
}

/** Counts direct children by jumping subtrees; stops at `limit + 1`, each step a visit. */
function countChildren(subtreeEnd: Int32Array, node: number, limit: number, out: TreeDrawList): number {
  const end = subtreeEnd[node];
  let children = 0;
  for (let child = node + 1; child < end; child = subtreeEnd[child]) {
    children++;
    out.visited++;
    if (children > limit) break;
  }
  return children;
}

/**
 * Best-first over the preorder arrays: the nearest pending node opens when its children's
 * projected spacing reaches the threshold and the budget still holds a mark for each of them;
 * otherwise it is one mark and its subtree folds in O(1). O(v log v), v <= 4 x the budget.
 */
export function cutTreeDetail(input: TreeDetailInput, out: TreeDrawList): void {
  const { layout, projector, view, markBudget } = input;
  const { model } = layout;
  const { subtreeEnd, kinds } = model;
  out.count = 0;
  out.visited = 0;
  out.folded = 0;
  if (model.count === 0 || markBudget < 1) return;
  ensureScratch(model.count);
  stampRevealed(model.parent, model.count, input.reveal);
  heapSize = 0;
  const visitCap = TREE_VISITS_PER_MARK * markBudget;
  const sizes = input.marks;
  const padPx = Math.max(sizes.project, sizes.domain, sizes.capability, sizes.element, sizes.bud);

  out.visited++;
  if (!isRevealed(0) && outsideView(layout, 0, projector, view, padPx)) return;
  storeScreen(layout, 0, projector);
  pushFrontier(0);

  let budgetBinds = false;
  while (heapSize > 0) {
    const node = popFrontier();
    const end = subtreeEnd[node];
    const hasChildren = end > node + 1;
    const drawsWhenOpen = kinds[node] !== "fork";
    let open = false;
    if (hasChildren && !budgetBinds && (isRevealed(node) || wantsOpen(input, node))) {
      const markRoom = markBudget - out.count - heapSize - (drawsWhenOpen ? 1 : 0);
      const limit = Math.min(markRoom, (visitCap - out.visited) >> 1);
      if (limit > 0 && countChildren(subtreeEnd, node, limit, out) <= limit) {
        open = true;
        for (let child = node + 1; child < end; child = subtreeEnd[child]) {
          out.visited++;
          if (!isRevealed(child) && outsideView(layout, child, projector, view, padPx)) continue;
          storeScreen(layout, child, projector);
          pushFrontier(child);
        }
      } else {
        budgetBinds = true;
      }
    }
    if (!open && hasChildren) out.folded += end - node - 1;
    if (!open || drawsWhenOpen) emitMark(input, out, node, !open && hasChildren);
  }
  sortFarToNear(out.marks, out.count);
}

function wantsOpen(input: TreeDetailInput, node: number): boolean {
  const { layout } = input;
  const leafHead = layout.model.kinds[node + 1] === "element";
  const spacingPx = childSpacing(layout, node) * input.projector.unit * screen[node * 4 + 2];
  return spacingPx >= (leafHead ? input.leafPitchPx : input.openPitchPx);
}

/** Far before near; equal depths by node index. */
function drawsBefore(a: TreeDrawMark, b: TreeDrawMark): boolean {
  return a.depth !== b.depth ? a.depth > b.depth : a.node < b.node;
}

/** In-place heapsort of marks[0..count): O(m log m), no allocation. */
function sortFarToNear(marks: TreeDrawMark[], count: number): void {
  for (let start = (count >> 1) - 1; start >= 0; start--) siftLast(marks, start, count);
  for (let end = count - 1; end > 0; end--) {
    const last = marks[0];
    marks[0] = marks[end];
    marks[end] = last;
    siftLast(marks, 0, end);
  }
}

/** Keeps the mark that draws last at the root of the heap marks[0..size). */
function siftLast(marks: TreeDrawMark[], at: number, size: number): void {
  const moving = marks[at];
  for (;;) {
    let next = at * 2 + 1;
    if (next >= size) break;
    if (next + 1 < size && drawsBefore(marks[next], marks[next + 1])) next++;
    if (!drawsBefore(moving, marks[next])) break;
    marks[at] = marks[next];
    at = next;
  }
  marks[at] = moving;
}
