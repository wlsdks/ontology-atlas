import { readContainmentTree, type TreeInputEdge, type TreeInputNode } from "../containment-tree";
import type { TreeFocus, TreeModel, TreeNodeKind } from "./types";

/** A concept parent keeps at most this many domain or capability children before it forks. */
const DIRECT_CHILD_LIMIT = 3;
/** Most children one synthetic fork holds, and most forks one parent splits into. */
const FORK_FAN_OUT = 4;

type BuildTask =
  | { kind: "concept"; node: TreeInputNode; parent: number }
  | { kind: "fork"; items: readonly TreeInputNode[]; lo: number; hi: number; parent: number }
  | { kind: "loose"; parent: number };

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const EMPTY_INTS = new Int32Array(0);

function emptyModel(): TreeModel {
  return {
    count: 0,
    ids: [],
    labels: [],
    kinds: [],
    parent: EMPTY_INTS,
    subtreeEnd: EMPTY_INTS,
    concepts: EMPTY_INTS,
    capabilities: EMPTY_INTS,
    elements: EMPTY_INTS,
    indexOf: new Map(),
    needsStart: new Int32Array(1),
    needs: EMPTY_INTS,
    usedByStart: new Int32Array(1),
    usedBy: EMPTY_INTS,
    looseRoot: -1,
  };
}

function firstOfEachId(nodes: readonly TreeInputNode[]): TreeInputNode[] {
  const seen = new Set<string>();
  const out: TreeInputNode[] = [];
  for (const node of nodes) {
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    out.push(node);
  }
  return out;
}

function mergeById(a: readonly TreeInputNode[], b: readonly TreeInputNode[]): TreeInputNode[] {
  const out: TreeInputNode[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (j >= b.length || (i < a.length && byId(a[i]!, b[j]!) <= 0)) out.push(a[i++]!);
    else out.push(b[j++]!);
  }
  return out;
}

function pushToList<V>(map: Map<string, V[]>, key: string, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * Rows of a CSR list transposed; each output row comes out in ascending order because input rows
 * are read in index order. O(rows + entries).
 */
function transpose(start: Int32Array, list: Int32Array, rows: number): { start: Int32Array; list: Int32Array } {
  const outStart = new Int32Array(rows + 1);
  for (let k = 0; k < list.length; k += 1) outStart[list[k]! + 1]! += 1;
  for (let r = 0; r < rows; r += 1) outStart[r + 1]! += outStart[r]!;
  const fill = outStart.slice(0, rows);
  const outList = new Int32Array(list.length);
  for (let r = 0; r < rows; r += 1) {
    for (let k = start[r]!; k < start[r + 1]!; k += 1) outList[fill[list[k]!]!++] = r;
  }
  return { start: outStart, list: outList };
}

/**
 * The containment of `readContainmentTree` as a preorder tree: trunk, domains, capabilities,
 * elements, with synthetic forks keeping every domain or capability fan-out at most four and one
 * loose fork for what no domain holds. Linear after the id sort the containment rule performs.
 */
export function buildTreeModel(nodes: readonly TreeInputNode[], edges: readonly TreeInputEdge[]): TreeModel {
  const unique = firstOfEachId(nodes);
  if (unique.length === 0) return emptyModel();
  const tree = readContainmentTree(unique, edges);
  const kindOf = new Map<string, TreeInputNode["kind"]>();
  for (const node of unique) kindOf.set(node.id, node.kind);

  const domainCapabilities = new Map<string, TreeInputNode[]>();
  const looseCapabilities: TreeInputNode[] = [];
  for (const capability of tree.capabilities) {
    const domain = tree.capabilityDomain.get(capability.id) ?? null;
    if (domain) pushToList(domainCapabilities, domain, capability);
    else looseCapabilities.push(capability);
  }
  const ownedLeaves = new Map<string, TreeInputNode[]>();
  const looseLeaves: TreeInputNode[] = [];
  const extraProjects: TreeInputNode[] = [];
  const elements: TreeInputNode[] = [];
  for (const node of unique) {
    if (node.kind === "element") elements.push(node);
    else if (node.kind === "project" && node.id !== tree.project?.id) extraProjects.push(node);
  }
  elements.sort(byId);
  extraProjects.sort(byId);
  for (const element of elements) {
    const owner = tree.elementParent.get(element.id);
    if (owner) pushToList(ownedLeaves, owner, element);
    else looseLeaves.push(element);
  }
  const looseBranches = mergeById(extraProjects, looseCapabilities);
  const hasLoose = looseBranches.length + looseLeaves.length > 0;

  const ids: (string | null)[] = [];
  const labels: string[] = [];
  const kinds: TreeNodeKind[] = [];
  const parents: number[] = [];
  let looseRoot = -1;
  const emit = (id: string | null, label: string, kind: TreeNodeKind, parent: number): number => {
    ids.push(id);
    labels.push(label);
    kinds.push(kind);
    parents.push(parent);
    return ids.length - 1;
  };

  const stack: BuildTask[] = [];
  const pushGroups = (items: readonly TreeInputNode[], lo: number, hi: number, parent: number, directLimit: number, maxParts: number) => {
    const n = hi - lo;
    if (n <= directLimit) {
      for (let k = hi - 1; k >= lo; k -= 1) stack.push({ kind: "concept", node: items[k]!, parent });
      return;
    }
    const parts = Math.min(maxParts, Math.max(2, Math.ceil(n / FORK_FAN_OUT)));
    for (let j = parts - 1; j >= 0; j -= 1) {
      stack.push({ kind: "fork", items, lo: lo + Math.floor((j * n) / parts), hi: lo + Math.floor(((j + 1) * n) / parts), parent });
    }
  };
  const pushChildren = (parent: number, branches: readonly TreeInputNode[], leaves: readonly TreeInputNode[], maxParts: number) => {
    for (let k = leaves.length - 1; k >= 0; k -= 1) stack.push({ kind: "concept", node: leaves[k]!, parent });
    pushGroups(branches, 0, branches.length, parent, DIRECT_CHILD_LIMIT, maxParts);
  };

  const trunk = emit(tree.project?.id ?? null, tree.project?.label ?? "", "project", -1);
  if (hasLoose) stack.push({ kind: "loose", parent: trunk });
  pushGroups(tree.domains, 0, tree.domains.length, trunk, DIRECT_CHILD_LIMIT, hasLoose ? FORK_FAN_OUT - 1 : FORK_FAN_OUT);
  const none: readonly TreeInputNode[] = [];
  while (stack.length > 0) {
    const task = stack.pop()!;
    if (task.kind === "fork") {
      const fork = emit(null, "", "fork", task.parent);
      pushGroups(task.items, task.lo, task.hi, fork, FORK_FAN_OUT, FORK_FAN_OUT);
    } else if (task.kind === "loose") {
      looseRoot = emit(null, "", "fork", task.parent);
      pushChildren(looseRoot, looseBranches, looseLeaves, FORK_FAN_OUT);
    } else {
      const { node } = task;
      const index = emit(node.id, node.label, node.kind, task.parent);
      if (node.kind === "domain") pushChildren(index, domainCapabilities.get(node.id) ?? none, ownedLeaves.get(node.id) ?? none, FORK_FAN_OUT);
      else if (node.kind === "capability") pushChildren(index, none, ownedLeaves.get(node.id) ?? none, FORK_FAN_OUT);
    }
  }

  const count = ids.length;
  const parent = Int32Array.from(parents);
  const subtreeEnd = new Int32Array(count);
  const concepts = new Int32Array(count);
  const capabilities = new Int32Array(count);
  const elementCounts = new Int32Array(count);
  const indexOf = new Map<string, number>();
  for (let i = 0; i < count; i += 1) {
    subtreeEnd[i] = i + 1;
    const id = ids[i];
    if (id === null || id === undefined) continue;
    indexOf.set(id, i);
    concepts[i] = 1;
    if (kinds[i] === "capability") capabilities[i] = 1;
    if (kinds[i] === "element") elementCounts[i] = 1;
  }
  for (let i = count - 1; i > 0; i -= 1) {
    const p = parent[i]!;
    if (subtreeEnd[i]! > subtreeEnd[p]!) subtreeEnd[p] = subtreeEnd[i]!;
    concepts[p]! += concepts[i]!;
    capabilities[p]! += capabilities[i]!;
    elementCounts[p]! += elementCounts[i]!;
  }

  const sources: number[] = [];
  const targets: number[] = [];
  const seenPairs = new Set<number>();
  for (const edge of edges) {
    if (edge.kind === "contains" || edge.relationType !== "depends_on") continue;
    const from = indexOf.get(edge.source);
    const to = indexOf.get(edge.target);
    if (from === undefined || to === undefined || from === to) continue;
    const key = from * count + to;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    sources.push(from);
    targets.push(to);
  }
  const rawStart = new Int32Array(count + 1);
  for (const from of sources) rawStart[from + 1]! += 1;
  for (let r = 0; r < count; r += 1) rawStart[r + 1]! += rawStart[r]!;
  const rawFill = rawStart.slice(0, count);
  const rawList = new Int32Array(sources.length);
  for (let k = 0; k < sources.length; k += 1) rawList[rawFill[sources[k]!]!++] = targets[k]!;
  const usedBy = transpose(rawStart, rawList, count);
  const needs = transpose(usedBy.start, usedBy.list, count);

  return {
    count,
    ids,
    labels,
    kinds,
    parent,
    subtreeEnd,
    concepts,
    capabilities,
    elements: elementCounts,
    indexOf,
    needsStart: needs.start,
    needs: needs.list,
    usedByStart: usedBy.start,
    usedBy: usedBy.list,
    looseRoot,
  };
}

/** What the node depends on, what depends on it, and its ancestors nearest first, forks included. */
export function readTreeFocus(model: TreeModel, node: number, selected: boolean): TreeFocus {
  const needs = Array.from(model.needs.subarray(model.needsStart[node]!, model.needsStart[node + 1]!));
  const usedBy = Array.from(model.usedBy.subarray(model.usedByStart[node]!, model.usedByStart[node + 1]!));
  const path: number[] = [];
  for (let p = model.parent[node]!; p >= 0; p = model.parent[p]!) path.push(p);
  return { node, selected, needs, usedBy, path };
}
