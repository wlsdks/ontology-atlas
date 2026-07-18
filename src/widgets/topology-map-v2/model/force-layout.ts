/**
 * Seeded force simulation — the "living graph" layer the owner asked for
 * ("노드를 클릭 드래그하면 그 노드가 force graph처럼 움직여야 한다"). The
 * deterministic concentric layout (`model/layout.ts`) is used as the *seed*
 * positions (preserving spatial memory — the owner's stated reason for
 * choosing the B2 layout), then `graphology-layout-forceatlas2` relaxes it
 * into an organic settlement that un-piles the concentric fan-arcs and, more
 * importantly, *reacts* when a node is dragged.
 *
 * Integration decision (lead, P3): a **bounded synchronous tick budget**, not
 * a web worker. Reasons: (1) the semantic-zoom node gate caps what's on
 * screen, and FA2 here runs only while "warm" (a small frame budget after
 * mount + while a node is pinned) then freezes — so there is no perpetual
 * main-thread cost to offload; (2) a worker adds structured-clone message
 * hops + Next static-export worker-bundling friction for no steady-state
 * benefit; (3) `forceAtlas2.assign` is a synchronous, deterministic
 * incremental stepper, which is exactly what a per-frame tick budget wants.
 *
 * Pinning: FA2 has no native "fixed node" concept, so a pinned node is
 * re-stamped back to its pin coordinate after every `assign` — its own
 * computed displacement is discarded while neighbors still feel its (fixed)
 * position and reflow around it. This is the standard force-graph pin trick.
 *
 * Pure/deterministic given identical seeds + edges + iteration counts (no
 * `Math.random` — FA2's `assign` is deterministic; the seed positions carry
 * all the initial state). `force-layout.test.ts` pins that.
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

export interface ForcePosition {
  x: number;
  y: number;
}

export interface ForceSimulation {
  /**
   * Runs `iterations` FA2 steps, then re-stamps the pinned node (if any).
   * No-op for `iterations <= 0`.
   *
   * C1 B2 (radius-limited release settle): when `restrictToIds` is given, any
   * node NOT in that set is restored to its PRE-tick position after `assign()`
   * runs — i.e. it still participates in FA2's force computation (so the
   * physics stay coherent) but ends the tick with zero net displacement. This
   * is what keeps the post-drag settle burst local to the dragged node's own
   * cluster instead of visibly relaxing the whole graph. Omit (or pass
   * `undefined`/`null`) for the unrestricted default (every node free to move).
   */
  tick(iterations: number, restrictToIds?: ReadonlySet<string> | null): void;
  /** Current `{x, y}` per node id — a fresh Map each call (cheap at the semantic-zoom-capped node counts). */
  positions(): Map<string, ForcePosition>;
  /** Pins a node to a world coordinate (grabbed for drag) — held fixed across ticks until `clearPin`. */
  pin(id: string, x: number, y: number): void;
  /** Updates the active pin's coordinate (drag move) — 1:1, no easing. */
  movePin(x: number, y: number): void;
  /** Releases the pin so the node settles with the rest of the graph again. */
  clearPin(): void;
  pinnedId(): string | null;
  hasNode(id: string): boolean;
}

/**
 * Gentle-relaxation FA2 settings. Kept conservative so the settled layout
 * stays compact and legible (rather than hairballing) while still un-piling
 * the concentric fan-arcs — `strongGravity` holds the graph together around
 * its seeded centroid so spatial memory survives the relaxation.
 */
export const DEFAULT_FORCE_SETTINGS = {
  // Gentle relaxation: weak gravity + generous repulsion + heavy slowDown so
  // the settle *un-piles* overlaps without collapsing the seeded concentric
  // structure (preserving the owner's spatial memory). Strong gravity was
  // tried first and pulled the domains into an overlapping clump — rejected.
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

/** Deterministic tiny offset so coincident seed positions (e.g. multiple orphans at the origin) don't make FA2 emit NaN. */
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
        // Snapshot every OUTSIDE node's pre-tick position so it can be
        // restored after — the tick still runs FA2 over the whole graph (so
        // in-set nodes feel a coherent force field), just discards the result
        // for anything outside the affected set.
        const frozen = new Map<string, { x: number; y: number }>();
        graph.forEachNode((id, attrs) => {
          if (!restrictToIds.has(id)) frozen.set(id, { x: attrs.x as number, y: attrs.y as number });
        });
        forceAtlas2.assign(graph, { iterations, settings });
        for (const [id, pos] of frozen) {
          graph.setNodeAttribute(id, "x", pos.x);
          graph.setNodeAttribute(id, "y", pos.y);
        }
      } else {
        forceAtlas2.assign(graph, { iterations, settings });
      }
      restamp();
    },
    positions() {
      const map = new Map<string, ForcePosition>();
      graph.forEachNode((id, attrs) => {
        const x = attrs.x as number;
        const y = attrs.y as number;
        // Guard against a rare FA2 NaN blow-up — callers keep the last good
        // position rather than teleporting a node to nowhere.
        if (Number.isFinite(x) && Number.isFinite(y)) map.set(id, { x, y });
      });
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
