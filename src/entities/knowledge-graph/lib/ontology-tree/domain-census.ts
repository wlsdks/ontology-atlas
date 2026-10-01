import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../../model";
import { isContainmentRelation } from "./relations";

/** First-parent, cycle-safe capability and element counts. */
export interface DomainCensusRow {
  id: string;
  title: string;
  capabilityCount: number;
  elementCount: number;
  total: number;
  capabilityIds?: string[];
}

const DEFAULT_TARGET_KINDS: readonly string[] = ["domain", "project"];

export interface DomainCensusOptions {
  /** Also collect member ids, e.g. for ranking top capabilities. */
  collectCapabilityIds?: boolean;
}

// Aggregate counts once; enumerate ids through compressed paths in breadth-first order.
export function computeDomainCensusRows(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  targetKinds: readonly string[] = DEFAULT_TARGET_KINDS,
  options: DomainCensusOptions = {},
): DomainCensusRow[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // First containment parent wins, as in `buildOntologyTree`; edge order is deterministic.
  const ownerOf = new Map<string, string>();
  for (const edge of edges) {
    if (!isContainmentRelation(edge.type)) continue;
    const [parent, child] = edge.type === "belongs_to" ? [edge.to, edge.from] : [edge.from, edge.to];
    if (!nodeById.has(parent) || !nodeById.has(child)) continue;
    if (parent === child) continue;
    if (ownerOf.has(child)) continue;
    ownerOf.set(child, parent);
  }

  const childrenOf = new Map<string, string[]>();
  for (const [child, parent] of ownerOf) {
    const arr = childrenOf.get(parent);
    if (arr) arr.push(child);
    else childrenOf.set(parent, [child]);
  }

  const totals = new Map<string, { capabilities: number; elements: number; size: number }>();
  const remainingChildren = new Map<string, number>();
  const leaves: string[] = [];
  for (const [id, node] of nodeById) {
    totals.set(id, {
      size: 1,
      capabilities: Number(node.kind === "capability"),
      elements: Number(node.kind === "element"),
    });
    const count = childrenOf.get(id)?.length ?? 0;
    remainingChildren.set(id, count);
    if (count === 0) leaves.push(id);
  }
  // Peeling leaves aggregates trees without recursion, including trees attached to cycles.
  for (let head = 0; head < leaves.length; head += 1) {
    const id = leaves[head];
    const parent = ownerOf.get(id);
    if (parent === undefined) continue;
    const childTotal = totals.get(id)!;
    const parentTotal = totals.get(parent)!;
    parentTotal.size += childTotal.size;
    parentTotal.capabilities += childTotal.capabilities;
    parentTotal.elements += childTotal.elements;
    const count = remainingChildren.get(parent)! - 1;
    remainingChildren.set(parent, count);
    if (count === 0) leaves.push(parent);
  }
  const resolvedCycles = new Set<string>();
  for (const [id, count] of remainingChildren) {
    if (count === 0 || resolvedCycles.has(id)) continue;
    const members: string[] = [];
    let current = id;
    let size = 0;
    let capabilities = 0;
    let elements = 0;
    do {
      members.push(current);
      resolvedCycles.add(current);
      const total = totals.get(current)!;
      size += total.size;
      capabilities += total.capabilities;
      elements += total.elements;
      current = ownerOf.get(current)!;
    } while (current !== id);
    for (const member of members) totals.set(member, { capabilities, elements, size });
  }

  const targets = new Set(targetKinds);
  let estimatedVisits = 0;
  let estimatedOutput = 0;
  if (options.collectCapabilityIds) {
    for (const node of nodes) {
      if (!targets.has(node.kind)) continue;
      const total = totals.get(node.id)!;
      const count = total.capabilities - Number(nodeById.get(node.id)!.kind === "capability");
      if (count === 0) continue;
      estimatedVisits += total.size;
      estimatedOutput += count;
    }
  }
  const compressPaths = estimatedVisits > nodeById.size * 4 + estimatedOutput * 2;
  const capabilityChildren = new Map<string, string[]>();
  const jumps = new Map<string, { id: string; distance: number }>();
  if (compressPaths) {
    for (const id of nodeById.keys()) {
      capabilityChildren.set(id, (childrenOf.get(id) ?? []).filter(
        child => totals.get(child)!.capabilities > 0,
      ));
    }
    // Collapse capability-free single-child paths; retain their original distances.
    for (const [id, total] of totals) {
      if (total.capabilities === 0 || jumps.has(id)) continue;
      const path: string[] = [];
      let current = id;
      while (!jumps.has(current)) {
        const children = capabilityChildren.get(current)!;
        if (nodeById.get(current)!.kind === "capability" || children.length !== 1) {
          jumps.set(current, { id: current, distance: 0 });
          break;
        }
        path.push(current);
        current = children[0];
      }
      let jump = jumps.get(current)!;
      for (let i = path.length - 1; i >= 0; i -= 1) {
        jump = { id: jump.id, distance: jump.distance + 1 };
        jumps.set(path[i], jump);
      }
    }
  }

  const rows: DomainCensusRow[] = [];

  for (const node of nodes) {
    if (!targets.has(node.kind)) continue;

    const total = totals.get(node.id)!;
    const ownKind = nodeById.get(node.id)!.kind;
    const capabilityCount = total.capabilities - Number(ownKind === "capability");
    const elementCount = total.elements - Number(ownKind === "element");
    const capabilityIds: string[] | null = options.collectCapabilityIds ? [] : null;
    if (capabilityIds && capabilityCount > 0 && !compressPaths) {
      const visited = new Set<string>([node.id]);
      const queue = [node.id];
      for (let head = 0; head < queue.length; head += 1) {
        for (const child of childrenOf.get(queue[head]) ?? []) {
          if (visited.has(child)) continue;
          visited.add(child);
          queue.push(child);
          if (nodeById.get(child)!.kind === "capability") capabilityIds.push(child);
        }
      }
    } else if (capabilityIds && capabilityCount > 0) {
      const start = jumps.get(node.id)!;
      const visited = new Set<string>([node.id]);
      const pending = [{ id: node.id, distance: 0 }];
      const members: { id: string; distance: number }[] = [];
      while (pending.length > 0) {
        const current = pending.pop()!;
        const children = capabilityChildren.get(current.id)!;
        for (let i = children.length - 1; i >= 0; i -= 1) {
          const jump = jumps.get(children[i])!;
          // A cycle may re-enter the collapsed path above the starting node.
          if (start.distance > 0 && jump.id === start.id && jump.distance >= start.distance) continue;
          if (visited.has(jump.id)) continue;
          visited.add(jump.id);
          pending.push({ id: jump.id, distance: current.distance + jump.distance + 1 });
        }
        if (current.id !== node.id && nodeById.get(current.id)!.kind === "capability") {
          members.push(current);
        }
      }
      // Stable depth sorting of preorder restores the original breadth-first tie order.
      members.sort((a, b) => a.distance - b.distance);
      for (const member of members) capabilityIds.push(member.id);
    }

    rows.push({
      id: node.id,
      title: node.display ?? node.title,
      capabilityCount,
      elementCount,
      total: capabilityCount + elementCount,
      ...(capabilityIds ? { capabilityIds } : {}),
    });
  }

  return rows.sort((a, b) => b.total - a.total || a.title.localeCompare(b.title));
}

/** id → row. */
export function domainCensusById(rows: readonly DomainCensusRow[]): ReadonlyMap<string, DomainCensusRow> {
  return new Map(rows.map((row) => [row.id, row]));
}

/** One-hop document count via any relation, O(V + E). */
export function countConnectedDocuments(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  memberIds: ReadonlySet<string>,
): number {
  const documents = nodes.filter((node) => node.kind === "document");
  if (documents.length === 0 || memberIds.size === 0) return 0;
  const connectedIds = new Set<string>();
  for (const edge of edges) {
    if (memberIds.has(edge.from)) connectedIds.add(edge.to);
    if (memberIds.has(edge.to)) connectedIds.add(edge.from);
  }
  let count = 0;
  for (const node of documents) {
    if (memberIds.has(node.id) || connectedIds.has(node.id)) count += 1;
  }
  return count;
}
