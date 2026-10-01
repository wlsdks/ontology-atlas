import { rankEgoNeighborsByDOI } from "../../model/focus-state";
import type { TopologyWorld, WorldEdge } from "../topology-world";

type WorldStructure = Pick<TopologyWorld, "edges" | "nodeById" | "neighborMap" | "childrenByParent">;
interface StructureCache {
  pulseEdges: ReadonlyMap<string, WorldEdge> | null;
  childRanks: Map<string, readonly string[]>;
  egoMembers: readonly string[];
  egoRanks: readonly string[];
}

// Structural inputs are fixed for a world; live geometry remains on the original objects.
const caches = new WeakMap<WorldStructure, StructureCache>();
const NO_CHILDREN: readonly string[] = [];

function cacheFor(world: WorldStructure): StructureCache {
  let cache = caches.get(world);
  if (!cache) {
    cache = { pulseEdges: null, childRanks: new Map(), egoMembers: [], egoRanks: [] };
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
