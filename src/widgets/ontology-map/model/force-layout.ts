/**
 * Seeded force simulation so a dragged node moves like a force graph. The deterministic
 * concentric layout (`model/layout.ts`) seeds positions to keep spatial memory, and
 * `graphology-layout-forceatlas2` relaxes and reacts on a bounded synchronous tick budget
 * while warm: no worker, since there is no steady-state cost to offload. FA2 has no fixed
 * node, so a pin is re-stamped after every `assign`. Deterministic for identical seeds,
 * edges and iteration counts.
 */

import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";

export interface ForceSeedNode {
  id: string;
  x: number;
  y: number;
}

export interface ForceEdgeInput {
  source: string;
  target: string;
}

interface ForcePosition {
  x: number;
  y: number;
}

export interface ForceSimulation {
  /**
   * With `restrictToIds`, FA2 runs on the subgraph of those nodes and the edges between them,
   * keeping a drag local. A boundary node that looks under-constrained needs a wider set, not
   * a whole-graph run.
   */
  tick(iterations: number, restrictToIds?: ReadonlySet<string> | null): void;
  /**
   * A fresh Map each call; `only` narrows it to those ids (unknown ids are skipped). Omitted
   * ids are not written back, so a caller that relies on this call to reset a per-frame
   * displacement must pass a wider set (`use-topology-loop.ts` neighbour tug).
   */
  positions(only?: ReadonlySet<string> | null): Map<string, ForcePosition>;
  /** Held fixed across ticks until `clearPin`. */
  pin(id: string, x: number, y: number): void;
  /** 1:1, no easing. */
  movePin(x: number, y: number): void;
  clearPin(): void;
  pinnedId(): string | null;
  hasNode(id: string): boolean;
}

/**
 * Gentle relaxation: weak gravity, generous repulsion and heavy slowDown un-pile the fan
 * arcs without collapsing the seeded structure; strong gravity clumped the domains.
 */
const DEFAULT_FORCE_SETTINGS = {
  gravity: 0.5,
  scalingRatio: 40,
  slowDown: 20,
  strongGravity: false,
  barnesHutOptimize: true,
  adjustSizes: true,
  linLogMode: false,
  outboundAttractionDistribution: true,
  edgeWeightInfluence: 0,
} as const;

/** Coincident seeds (orphans at the origin) would make FA2 emit NaN. */
function dedupeJitter(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return ((hash % 1000) / 1000) * 2 - 1; // [-1, 1), deterministic per id
}

export function createForceSimulation(
  seeds: readonly ForceSeedNode[],
  edges: readonly ForceEdgeInput[],
  settings: Record<string, unknown> = DEFAULT_FORCE_SETTINGS,
): ForceSimulation {
  const graph = new Graph({ type: "undirected", multi: false, allowSelfLoops: false });

  const taken = new Set<string>();
  for (const seed of seeds) {
    if (graph.hasNode(seed.id)) continue;
    let { x, y } = seed;
    const key = `${x},${y}`;
    if (taken.has(key)) {
      x += dedupeJitter(seed.id) * 0.5;
      y += dedupeJitter(`${seed.id}~y`) * 0.5;
    }
    taken.add(`${x},${y}`);
    graph.addNode(seed.id, { x, y });
  }

  for (const edge of edges) {
    if (edge.source === edge.target) continue;
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue;
    if (graph.hasEdge(edge.source, edge.target)) continue;
    graph.addEdge(edge.source, edge.target);
  }

  let pinId: string | null = null;
  let pinX = 0;
  let pinY = 0;

  const restamp = () => {
    if (pinId !== null && graph.hasNode(pinId)) {
      graph.setNodeAttribute(pinId, "x", pinX);
      graph.setNodeAttribute(pinId, "y", pinY);
    }
  };

  return {
    tick(iterations: number, restrictToIds?: ReadonlySet<string> | null) {
      if (iterations <= 0 || graph.order === 0) return;
      if (restrictToIds) {
        // Run FA2 only on the restricted subgraph: it is quadratic in node count, so running the
        // whole graph and restoring the outside spends the frame on discarded work.
        const sub = new Graph({ type: "undirected", multi: false, allowSelfLoops: false });
        for (const id of restrictToIds) {
          if (!graph.hasNode(id)) continue;
          sub.addNode(id, { x: graph.getNodeAttribute(id, "x"), y: graph.getNodeAttribute(id, "y") });
        }
        // Only inside edges exert force, so boundary nodes lose their pull toward outside
        // neighbours. slowDown 20 with a short warm window keeps that tiny per frame, overlap
        // separation catches a cluster riding onto a settled node, and release settling rewinds
        // the tug offset.
        for (const id of restrictToIds) {
          if (!sub.hasNode(id)) continue;
          graph.forEachNeighbor(id, (other) => {
            if (!sub.hasNode(other) || sub.hasEdge(id, other)) return;
            sub.addEdge(id, other);
          });
        }
        if (sub.order > 0) {
          forceAtlas2.assign(sub, { iterations, settings });
          sub.forEachNode((id, attrs) => {
            graph.setNodeAttribute(id, "x", attrs.x as number);
            graph.setNodeAttribute(id, "y", attrs.y as number);
          });
        }
      } else {
        forceAtlas2.assign(graph, { iterations, settings });
      }
      restamp();
    },
    positions(only?: ReadonlySet<string> | null) {
      const map = new Map<string, ForcePosition>();
      // A rare FA2 NaN keeps the last good position rather than teleporting the node.
      const put = (id: string, x: number, y: number) => {
        if (Number.isFinite(x) && Number.isFinite(y)) map.set(id, { x, y });
      };
      if (only) {
        for (const id of only) {
          if (!graph.hasNode(id)) continue;
          put(id, graph.getNodeAttribute(id, "x") as number, graph.getNodeAttribute(id, "y") as number);
        }
      } else {
        graph.forEachNode((id, attrs) => put(id, attrs.x as number, attrs.y as number));
      }
      return map;
    },
    pin(id: string, x: number, y: number) {
      if (!graph.hasNode(id)) return;
      pinId = id;
      pinX = x;
      pinY = y;
      graph.setNodeAttribute(id, "x", x);
      graph.setNodeAttribute(id, "y", y);
    },
    movePin(x: number, y: number) {
      if (pinId === null) return;
      pinX = x;
      pinY = y;
      graph.setNodeAttribute(pinId, "x", x);
      graph.setNodeAttribute(pinId, "y", y);
    },
    clearPin() {
      pinId = null;
    },
    pinnedId() {
      return pinId;
    },
    hasNode(id: string) {
      return graph.hasNode(id);
    },
  };
}
