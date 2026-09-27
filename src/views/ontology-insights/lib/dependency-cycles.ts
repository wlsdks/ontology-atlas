import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";

/**
 * Loops in the directed depends_on graph, from the nodes and edges the page already loaded, with the meaning of
 * MCP `query_ontology({operation:"cycles"})`: dependency, not containment. Both `depends_on` and `dependencies`
 * are accepted, since the storage key may precede canonicalization. A depth-limited DFS from each node with a
 * Johnson-style minimum-vertex rule finds each simple cycle once, at its minimum node. Worst case is exponential in the
 * depth limit `maxHops`. `STEP_BUDGET` caps DFS calls, not the cycles recorded or their sort: ten nodes that all
 * depend on one another record 500,000 cycles in seconds (measured), with `limited` set.
 */

/** Directed dependency edge types, not containment; the same meaning as MCP cycles. */
const DEPENDENCY_EDGE_TYPES = new Set(["depends_on", "dependencies"]);

export function isDependencyEdgeType(type: string): boolean {
  return DEPENDENCY_EDGE_TYPES.has(type);
}

export interface DependencyCycle {
  /** Stable id: the directed path joined from its minimum node. */
  id: string;
  /** The cycle's distinct node count, independent of the display cap. */
  length: number;
  /** The display path without the repeated start, capped by `maxPathNodes`; the UI appends `nodeIds[0]` to close it. */
  nodeIds: string[];
  /** The value length - nodeIds.length; above 0 the path was truncated. */
  hiddenNodeCount: number;
}

export interface DependencyCyclesResult {
  /** Cycles capped by `maxCycles`, shortest first. */
  cycles: DependencyCycle[];
  /** All distinct cycles detected, possibly more than `maxCycles`. */
  totalCycles: number;
  /** The value totalCycles - cycles.length; above 0 it prints as "N more". */
  hiddenCycles: number;
  /** Every current cycle id regardless of the display cap, for the exact review verdict. */
  activeCycleIds: string[];
  /** Whether the depth limit or the work budget cut the search, so longer cycles may be missing. */
  limited: boolean;
}

export interface FindDependencyCyclesOptions {
  maxCycles?: number;
  maxPathNodes?: number;
  /**
   * Detection depth in distinct nodes. Defaults to 16, above the display cap of 8 so "N more" means something;
   * MCP cycles defaults to 8.
   */
  maxHops?: number;
}

/** A hard guard against runaway search on a pathologically dense graph. */
const STEP_BUDGET = 500_000;

export function findDependencyCycles(
  graphNodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  options: FindDependencyCyclesOptions = {},
): DependencyCyclesResult {
  const maxCycles = options.maxCycles ?? 5;
  const maxPathNodes = options.maxPathNodes ?? 8;
  const maxHops = options.maxHops ?? 16;

  const nodeIdSet = new Set(graphNodes.map((node) => node.id));

  // Only dependency edges between known nodes enter the adjacency (dangling references are ignored, like
  // MCP's `edge.resolved`); self-loops are collected separately.
  const adjacency = new Map<string, Set<string>>();
  const selfLoops = new Set<string>();
  for (const edge of edges) {
    if (!isDependencyEdgeType(edge.type)) continue;
    if (!nodeIdSet.has(edge.from) || !nodeIdSet.has(edge.to)) continue;
    if (edge.from === edge.to) {
      selfLoops.add(edge.from);
      continue;
    }
    let outs = adjacency.get(edge.from);
    if (!outs) {
      outs = new Set();
      adjacency.set(edge.from, outs);
    }
    outs.add(edge.to);
  }

  const foundPaths = new Map<string, string[]>();
  let someBranchHitMaxHops = false;
  let budgetExhausted = false;
  let steps = 0;

  for (const id of [...selfLoops].sort()) {
    foundPaths.set(id, [id]);
  }

  const path: string[] = [];
  const inPath = new Set<string>();
  const starts = [...adjacency.keys()].sort();

  for (const start of starts) {
    if (budgetExhausted) break;
    dfs(start, start);
  }

  function dfs(start: string, current: string): void {
    if (steps++ > STEP_BUDGET) {
      budgetExhausted = true;
      return;
    }
  // A per-branch prune, so sibling branches with shorter cycles keep being searched.
    if (path.length >= maxHops) {
      someBranchHitMaxHops = true;
      return;
    }
    path.push(current);
    inPath.add(current);
    for (const next of adjacency.get(current) ?? []) {
      if (next === start) {
        if (path.length > 1) {
          const key = path.join(" ");
          if (!foundPaths.has(key)) foundPaths.set(key, [...path]);
        }
        continue;
      }
  // Johnson's minimum-vertex rule: advance only to ids above the start, so each cycle is found once, at its minimum node.
      if (next < start) continue;
      if (inPath.has(next)) continue;
      dfs(start, next);
      if (budgetExhausted) break;
    }
    path.pop();
    inPath.delete(current);
  }

  const allCycles = [...foundPaths.values()].sort(
    (a, b) => a.length - b.length || a.join(" ").localeCompare(b.join(" ")),
  );

  const totalCycles = allCycles.length;
  const cycles: DependencyCycle[] = allCycles.slice(0, maxCycles).map((nodeIdsFull) => {
    const shown = nodeIdsFull.slice(0, maxPathNodes);
    return {
      id: nodeIdsFull.join(" "),
      length: nodeIdsFull.length,
      nodeIds: shown,
      hiddenNodeCount: nodeIdsFull.length - shown.length,
    };
  });

  return {
    cycles,
    totalCycles,
    hiddenCycles: Math.max(0, totalCycles - cycles.length),
    activeCycleIds: allCycles.map((nodeIds) => nodeIds.join(" ")),
    limited: someBranchHitMaxHops || budgetExhausted,
  };
}
