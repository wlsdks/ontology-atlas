import { rankEgoNeighborsByDOI } from "../../model/focus-state";
import { collectDomeAncestry, collectDomeSubtree } from "../../model/dome-ancestry";
import type { TopologyWorld, WorldEdge } from "../topology-world";

type WorldStructure = Pick<TopologyWorld, "edges" | "nodeById" | "neighborMap" | "childrenByParent">;
interface StructureCache {
  pulseEdges: ReadonlyMap<string, WorldEdge> | null;
  childRanks: Map<string, readonly string[]>;
  egoMembers: readonly string[];
  egoRanks: readonly string[];
  families: { focusId: string; includeSubtree: boolean; value: DomeFamily }[];
}

// Structural inputs are fixed for a world; live geometry remains on the original objects.
const caches = new WeakMap<WorldStructure, StructureCache>();
const NO_CHILDREN: readonly string[] = [];

interface DomeFamily {
  nodes: ReadonlySet<string>;
  edges: ReadonlySet<string>;
  neighbors: ReadonlySet<string>;
}

export function domeFamily(world: WorldStructure, focusId: string, includeSubtree: boolean): DomeFamily {
  const cache = cacheFor(world);
  const hit = cache.families.findIndex((entry) => entry.focusId === focusId && entry.includeSubtree === includeSubtree);
  if (hit >= 0) {
    const entry = cache.families[hit];
    const last = cache.families.length - 1;
    cache.families[hit] = cache.families[last];
    cache.families[last] = entry;
    return entry.value;
  }
  const nodes = new Set<string>();
  const edges = new Set<string>();
  collectDomeAncestry(focusId, (id) => world.nodeById.get(id)?.parentId, nodes, edges);
  if (includeSubtree) collectDomeSubtree(focusId, (id) => world.childrenByParent.get(id), nodes, edges);
  const neighbors = new Set(world.neighborMap.get(focusId));
  for (const id of nodes) neighbors.add(id);
  const value = { nodes, edges, neighbors };
  // Live and retained colour focus can differ during the fade. Keep both, but
  // never retain every overlapping subtree visited in a large vault.
  if (cache.families.length === 2) cache.families.shift();
  cache.families.push({ focusId, includeSubtree, value });
  return value;
}

function cacheFor(world: WorldStructure): StructureCache {
  let cache = caches.get(world);
  if (!cache) {
    cache = { pulseEdges: null, childRanks: new Map(), egoMembers: [], egoRanks: [], families: [] };
    caches.set(world, cache);
  }
  return cache;
}

/** O(edges) once per world; repeated pulse frames use O(1) pair lookup. */
export function indexedPulseEdges(world: WorldStructure): ReadonlyMap<string, WorldEdge> {
  const cache = cacheFor(world);
  return cache.pulseEdges ??= new Map(world.edges.map((edge) =>
    [`${edge.sourceId} ${edge.targetId}`, edge],
  ));
}

function rankedMembers(world: WorldStructure, members: readonly string[], relationType?: string): readonly string[] {
  return rankEgoNeighborsByDOI(members.map((id) => ({
    id,
    kind: world.nodeById.get(id)?.kind ?? "element",
    degree: world.neighborMap.get(id)?.size ?? 0,
    relationType,
  })));
}

export function rankedDiscChildren(world: WorldStructure, parentId: string): readonly string[] {
  const members = world.childrenByParent.get(parentId);
  if (!members) return NO_CHILDREN;
  const cache = cacheFor(world);
  let ranked = cache.childRanks.get(parentId);
  if (!ranked) {
    ranked = rankedMembers(world, members, "contains");
    cache.childRanks.set(parentId, ranked);
  }
  return ranked;
}

/** O(members) on hits; compare contents because the dome reuses one mutable union set. */
export function rankedEgoNeighbors(world: WorldStructure, members: ReadonlySet<string>): readonly string[] {
  const cache = cacheFor(world);
  if (cache.egoMembers.length === members.size) {
    let index = 0;
    let same = true;
    for (const id of members) {
      if (cache.egoMembers[index++] !== id) { same = false; break; }
    }
    if (same) return cache.egoRanks;
  }
  cache.egoMembers = [...members];
  cache.egoRanks = rankedMembers(world, cache.egoMembers);
  return cache.egoRanks;
}
