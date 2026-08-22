import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";

/**
 * The dependency-cycle card — it answers "has a structurally dangerous loop appeared?" and lists
 * only loops in the directed depends_on graph.
 *
 * Data: computed on the client from the nodes/edges already loaded by the page (single source of
 * truth — no separate store). The dependency-family verdict means the same as the MCP
 * `query_ontology({operation:"cycles"})` derivation: depends_on rather than containment
 * (contains/belongs_to). Both spellings are accepted because the frontmatter storage key may still
 * be `dependencies` before canonicalization.
 *
 * Algorithm: a depth-limited DFS from each node, plus a Johnson-style minimum-vertex constraint
 * (advance only to ids greater than the current start), so each simple directed cycle is found
 * exactly once at its minimum node — rotational duplicates are structurally excluded. On a sparse
 * ontology dependency graph this is milliseconds even at 300 nodes.
 */

/** Directed dependency-family edge types — not structural (containment). Same meaning as MCP cycles. */
const DEPENDENCY_EDGE_TYPES = new Set(["depends_on", "dependencies"]);

export function isDependencyEdgeType(type: string): boolean {
  return DEPENDENCY_EDGE_TYPES.has(type);
}

export interface DependencyCycle {
  /** A stable id — the canonical key from joining the directed path starting at the minimum node. */
  id: string;
  /** The cycle's real (distinct) node count. An honest length, independent of the display cap. */
  length: number;
  /**
   * The distinct node path for display (no repeated start), capped by `maxPathNodes`.
   * The UI appends `nodeIds[0]` at the end to close it as "A → B → C → A".
   */
  nodeIds: string[];
  /** length − nodeIds.length. Above 0 the path was truncated, printed as "N more". */
  hiddenNodeCount: number;
}

export interface DependencyCyclesResult {
  /** Cycles capped by `maxCycles`, sorted shortest first. */
  cycles: DependencyCycle[];
  /** The total number of distinct cycles detected (may exceed `maxCycles`). */
  totalCycles: number;
  /** totalCycles − cycles.length. Above 0 it is printed as "N more". */
  hiddenCycles: number;
  /** Every current cycle id, independent of the display cap. Used for the exact review verdict. */
  activeCycleIds: string[];
  /** Was the search truncated by the depth limit or the work budget (longer cycles may have been missed)? */
  limited: boolean;
}

export interface FindDependencyCyclesOptions {
  /** The maximum cycles to expose. Defaults to 5. */
  maxCycles?: number;
  /** The maximum nodes to print in a path. Defaults to 8. */
  maxPathNodes?: number;
  /**
   * The detection depth limit (distinct nodes in a path). Defaults to 16 — deliberately larger than
   * the display cap (8) so the "N more" truncation actually means something. MCP cycles itself
   * defaults to maxDepth 8; here it is generous for the sake of that truncation.
   */
  maxHops?: number;
}

/** A hard guard against runaway search — milliseconds even on a pathologically dense graph. */
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

  // Only dependency edges enter the adjacency list, and both endpoints must be known nodes
  // (matching MCP's `edge.resolved` — dangling references are ignored). Self-loops are collected
  // separately as self-referencing cycles.
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
  // `depthTruncated`: some branch hit the depth limit and may have missed a longer cycle (a
  // per-branch prune, not a global stop). `budgetExhausted`: the hard work budget ran out, stopping
  // globally. Either one makes the result's `limited` true.
  let depthTruncated = false;
  let budgetExhausted = false;
  let steps = 0;

  // ① Self-reference — A depends_on A.
  for (const id of [...selfLoops].sort()) {
    foundPaths.set(id, [id]);
  }

  // ② Multi-node cycles — DFS with the minimum-vertex constraint.
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
  // The depth limit is a per-branch prune. Sibling branches (shorter cycles) must keep being
  // searched, so only this branch is folded rather than stopping globally.
    if (path.length >= maxHops) {
      depthTruncated = true;
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
  // Johnson's minimum-vertex constraint: advance only to ids greater than the start, so each cycle
  // is discovered only at its minimum node (excluding rotational duplicates and cutting work).
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
    limited: depthTruncated || budgetExhausted,
  };
}
