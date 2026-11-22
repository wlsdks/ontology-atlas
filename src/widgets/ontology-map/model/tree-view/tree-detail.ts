import { TREE_TONE_STEPS } from "./tree-shapes";
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
} from "./tree-shapes";

export const TREE_MARK_BUDGET = 1500;
/** Work per cut is bounded by marks drawn, not vault size. */
const TREE_VISITS_PER_MARK = 4;
/** Perspective can push a subtree's silhouette past r·unit·scale; slack costs visits, never a visible mark. */
const TREE_CULL_SLACK = 1.5;

/** Marks grow slower than distances, so zooming in or coming nearer separates them. */
const MARK_GROWTH = 0.5;

/** How every screen size (mark radius, branch width, the spacing a node needs to open) follows the projector's scale. */
export function treeScreenGrowth(scale: number): number {
  return scale ** MARK_GROWTH;
}

/**
 * Per-node scratch, grown with the vault and reused: no allocation once warm.
 * `screen` holds x, y, scale, depth per node; `heap` is the open frontier; `kept`
 * buffers the children an opening node will push.
 */
let screen = new Float64Array(0);
let heap = new Int32Array(0);
let heapSize = 0;
let kept = new Int32Array(0);
/** A revealed node or one of its ancestors: never culled, a mark held in reserve. */
let pathStamp = new Uint32Array(0);
/** An ancestor of a revealed node: open whatever the spacing. */
let ancestorStamp = new Uint32Array(0);
let revealEpoch = 0;
/** Reveal-path nodes not yet in the frontier; each holds one mark and one visit in reserve. */
let pathUnqueued = 0;
const probe: TreeScreenPoint = { x: 0, y: 0, scale: 0, depth: 0 };

function ensureScratch(count: number): void {
  if (heap.length >= count) return;
  screen = new Float64Array(count * 4);
  heap = new Int32Array(count);
  kept = new Int32Array(count);
  pathStamp = new Uint32Array(count);
  ancestorStamp = new Uint32Array(count);
  revealEpoch = 0;
}

/** Returns how many distinct nodes lie on reveal paths. */
function stampRevealed(parent: Int32Array, count: number, reveal: readonly number[]): number {
  revealEpoch++;
  if (revealEpoch === 0xffffffff) {
    pathStamp.fill(0);
    ancestorStamp.fill(0);
    revealEpoch = 1;
  }
  let pathNodes = 0;
  for (const target of reveal) {
    if (target < 0 || target >= count) continue;
    if (pathStamp[target] !== revealEpoch) pathNodes++;
    pathStamp[target] = revealEpoch;
    for (let node = parent[target]; node >= 0 && ancestorStamp[node] !== revealEpoch; node = parent[node]) {
      if (pathStamp[node] !== revealEpoch) pathNodes++;
      ancestorStamp[node] = revealEpoch;
      pathStamp[node] = revealEpoch;
    }
  }
  return pathNodes;
}

function onRevealPath(node: number): boolean {
  return pathStamp[node] === revealEpoch;
}

function holdsRevealed(node: number): boolean {
  return ancestorStamp[node] === revealEpoch;
}

/** Nearest first; ties by index keep the cut deterministic. */
function popsBefore(a: number, b: number): boolean {
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
  const reachPx = radius * projector.unit * nearScale * TREE_CULL_SLACK + padPx * treeScreenGrowth(nearScale);
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
  mark.radius = markSize(layout.model.kinds[node], input.marks) * treeScreenGrowth(mark.scale);
  mark.tone = toneOf(mark.depth, projector);
}

/**
 * Buffers the children in view into `kept`, one visit each; -1 when the ones off the reveal
 * paths need more than `markRoom` marks or `visitLimit` runs out first. Reveal-path children
 * hold marks reserved for them already.
 */
function keepChildrenInView(input: TreeDetailInput, node: number, markRoom: number, visitLimit: number, padPx: number, out: TreeDrawList): number {
  const { layout, projector, view } = input;
  const { subtreeEnd } = layout.model;
  if (markRoom < 0) return -1;
  let count = 0;
  let unreserved = 0;
  for (let child = node + 1; child < subtreeEnd[node]; child = subtreeEnd[child]) {
    if (out.visited >= visitLimit) return -1;
    out.visited++;
    if (onRevealPath(child)) {
      kept[count++] = child;
      continue;
    }
    if (outsideView(layout, child, projector, view, padPx)) continue;
    if (unreserved++ >= markRoom) return -1;
    kept[count++] = child;
  }
  return count;
}

function enqueue(layout: TreeLayout, projector: TreeProjector, node: number): void {
  if (onRevealPath(node)) pathUnqueued--;
  storeScreen(layout, node, projector);
  pushFrontier(node);
}

function isKept(node: number, count: number): boolean {
  for (let k = 0; k < count; k++) if (kept[k] === node) return true;
  return false;
}

/** Buffers the children of `node` that lead to a revealed node: O(reveal x depth), one visit each. */
function keepRevealPathChildren(input: TreeDetailInput, node: number, markRoom: number, visitCap: number, out: TreeDrawList): number {
  const { parent } = input.layout.model;
  let count = 0;
  for (const target of input.reveal) {
    let child = target;
    while (child >= 0 && parent[child] !== node) child = parent[child];
    if (child < 0 || isKept(child, count)) continue;
    if (count >= markRoom || out.visited >= visitCap) break;
    out.visited++;
    kept[count++] = child;
  }
  return count;
}

/**
 * Best-first over the preorder arrays: the nearest pending node opens when its children's
 * projected spacing reaches the threshold and the budget still holds a mark for each child
 * in view; otherwise it is one mark and its subtree folds in O(1). O(v log v), v <= 4 x budget.
 * Every reveal-path node not yet queued holds one mark and one visit in reserve, so a
 * revealed node is drawn whenever the budget covers its path.
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
  pathUnqueued = stampRevealed(model.parent, model.count, input.reveal);
  heapSize = 0;
  const visitCap = TREE_VISITS_PER_MARK * markBudget;
  const sizes = input.marks;
  const padPx = Math.max(sizes.project, sizes.domain, sizes.capability, sizes.element, sizes.bud);

  out.visited++;
  if (!onRevealPath(0) && outsideView(layout, 0, projector, view, padPx)) return;
  enqueue(layout, projector, 0);

  while (heapSize > 0) {
    const node = popFrontier();
    const end = subtreeEnd[node];
    const hasChildren = end > node + 1;
    const drawsWhenOpen = kinds[node] !== "fork";
    const forced = holdsRevealed(node);
    let pushed = -1;
    if (hasChildren && (forced || wantsOpen(input, node))) {
      const markRoom = markBudget - out.count - heapSize - (drawsWhenOpen ? 1 : 0) - pathUnqueued;
      pushed = keepChildrenInView(input, node, markRoom, visitCap - pathUnqueued, padPx, out);
    }
    const open = pushed >= 0;
    let shown = 0;
    if (!open && forced) {
      // A revealed node keeps a mark of its own even when its ancestor closes for the budget.
      pushed = keepRevealPathChildren(input, node, markBudget - out.count - heapSize - 1, visitCap, out);
      for (let k = 0; k < pushed; k++) shown += subtreeEnd[kept[k]] - kept[k];
    }
    for (let k = 0; k < pushed; k++) enqueue(layout, projector, kept[k]);
    if (!open && hasChildren) out.folded += end - node - 1 - shown;
    if (!open || drawsWhenOpen) emitMark(input, out, node, !open && hasChildren);
  }
  sortFarToNear(out.marks, out.count);
}

/** The layout gives a node only branches or only leaves, so its first child picks the threshold. */
function wantsOpen(input: TreeDetailInput, node: number): boolean {
  const { layout } = input;
  const leafHead = layout.model.kinds[node + 1] === "element";
  const scale = screen[node * 4 + 2];
  const spacingPx = childSpacing(layout, node) * input.projector.unit * scale;
  // The thresholds are a mark's diameter plus a gap where scale is 1, so they grow with the marks.
  return spacingPx >= (leafHead ? input.leafPitchPx : input.openPitchPx) * treeScreenGrowth(scale);
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
