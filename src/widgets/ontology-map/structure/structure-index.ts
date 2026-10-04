export interface StructureNode { id: string; label: string; kind: 'project' | 'domain' | 'capability' | 'element' }
export interface StructureEdge { source: string; target: string; relationType: string }
export interface StructureIndex { nodes: ReadonlyMap<string, StructureNode>; children: ReadonlyMap<string, readonly string[]>; parents: ReadonlyMap<string, readonly string[]>; roots: readonly string[]; outside: readonly string[] }
const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

// O(N + E) membership/reachability; adjacency order adds O(E log E) in the worst case.
export function readStructure(input: readonly StructureNode[], edges: readonly StructureEdge[]): StructureIndex {
  const nodes = new Map(input.map(node => [node.id, node]));
  const childSets = new Map<string, Set<string>>();
  const parentSets = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.relationType !== 'contains' && edge.relationType !== 'belongs_to') continue;
    const [parent, child] = edge.relationType === 'belongs_to' ? [edge.target, edge.source] : [edge.source, edge.target];
    if (!nodes.has(parent) || !nodes.has(child)) continue;
    if (!childSets.has(parent)) childSets.set(parent, new Set());
    if (!parentSets.has(child)) parentSets.set(child, new Set());
    childSets.get(parent)!.add(child);
    parentSets.get(child)!.add(parent);
  }
  const children = new Map([...childSets].map(([id, set]) => [id, [...set].sort(compareId)]));
  const parents = new Map([...parentSets].map(([id, set]) => [id, [...set].sort(compareId)]));
  const projects = input.filter(node => node.kind === 'project').map(node => node.id).sort(compareId);
  const roots = projects.length ? projects : input.filter(node => !parents.has(node.id)).map(node => node.id).sort(compareId);
  const reached = new Set(roots);
  const queue = [...roots];
  for (let head = 0; head < queue.length; head += 1) {
    for (const child of children.get(queue[head]!) ?? []) {
      if (reached.has(child)) continue;
      reached.add(child);
      queue.push(child);
    }
  }
  return { nodes, children, parents, roots, outside: input.map(node => node.id).filter(id => !reached.has(id)).sort(compareId) };
}

// Breadth-first ancestry finds one valid reading path; all parents remain in the index.
export function structurePath(index: StructureIndex, id: string): string[] {
  if (!index.nodes.has(id)) return [];
  const roots = new Set(index.roots);
  const next = new Map<string, string>();
  const visited = new Set([id]);
  const queue = [id];
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]!;
    if (roots.has(current)) {
      const path = [current];
      while (next.has(path.at(-1)!)) path.push(next.get(path.at(-1)!)!);
      return path;
    }
    for (const parent of index.parents.get(current) ?? []) {
      if (visited.has(parent)) continue;
      visited.add(parent);
      next.set(parent, current);
      queue.push(parent);
    }
  }
  return [id];
}

export function trimStructurePath(index: StructureIndex, path: readonly string[]): string[] {
  const valid: string[] = [];
  const seen = new Set<string>();
  for (const id of path) {
    if (!index.nodes.has(id) || seen.has(id)) break;
    const parent = valid.at(-1);
    if (parent && !index.children.get(parent)?.includes(id)) break;
    seen.add(id);
    valid.push(id);
  }
  return valid;
}
