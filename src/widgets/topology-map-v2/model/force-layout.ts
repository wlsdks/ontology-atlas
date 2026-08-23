/**
 * Seeded force simulation — the "living graph" layer the owner asked for
 * ("when dragging a node by click-drag, it should move like a force graph" — drag a
 * node and it should move like a force graph). The
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
   * When `restrictToIds` is given, FA2 runs on a SUBGRAPH containing only those
   * nodes and the edges between them. Nodes outside the set do not participate
   * in the force computation at all, and edges crossing the boundary exert no
   * force — this is what keeps a drag local instead of visibly relaxing the
   * whole graph. Omit (or pass `undefined`/`null`) for the unrestricted default.
   *
   * ⚠️ This used to run FA2 over the WHOLE graph and then restore outside
   * nodes to their pre-tick positions — "restricted" bounded the RESULT, not
   * the WORK. At 3000 nodes that cost most of a 139.9ms drag frame while
   * discarding ~94% of what it computed (2026-07-31). If you are reading this
   * because a boundary node looks under-constrained, the fix is to widen the
   * set, not to go back to computing everything.
   */
  tick(iterations: number, restrictToIds?: ReadonlySet<string> | null): void;
  /**
   * Current `{x, y}` per node id — a fresh Map each call.
   *
   * `only` narrows the map to those ids. The sim holds EVERY node regardless of
   * semantic-zoom capping, so the unrestricted call allocates an N-entry Map
   * plus N position objects per tick (3000 at `?synth=3000`) even when a
   * restricted tick moved ~30 of them — pass the same set you passed `tick`
   * and the caller's write-back shrinks with it. Ids the sim doesn't hold are
   * skipped, so an over-wide `only` is safe.
   *
   * ⚠️ The omitted ids are omitted from the RESULT, and the caller's write-back
   * therefore no longer overwrites their world coordinates. That is only sound
   * while nothing else relies on this call to reset a per-frame displacement —
   * see `use-topology-loop.ts`'s neighbor tug, which does, and is why the set
   * passed there is wider than the tick's own restriction.
   */
  positions(only?: ReadonlySet<string> | null): Map<string, ForcePosition>;
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
        // **Actually apply the restriction — split out a subgraph and run only on it.**
        //
        // The previous shape was: snapshot the outside nodes → **run FA2 on the
        // whole graph** → restore the outside. The restriction did not reduce the
        // computation, it only **discarded the result**. FA2 is quadratic in node
        // count, so at 3000 nodes this one line ate a large share of the frame,
        // and discarding cost again (a 3000-node snapshot plus ~2000
        // `setAttribute` restores). In the 2026-07-31 lag incident the owner asked
        // three times *"Only 20 are visible, why compute 3000?"* (only 20 are
        // visible, why compute 3000?) — this line was the answer.
        const sub = new Graph({ type: "undirected", multi: false, allowSelfLoops: false });
        for (const id of restrictToIds) {
          if (!graph.hasNode(id)) continue;
          sub.addNode(id, { x: graph.getNodeAttribute(id, "x"), y: graph.getNodeAttribute(id, "y") });
        }
        // Only edges *inside* the subgraph — an edge leaving it has no partner and
        // therefore no force. So **boundary nodes lose their restoring pull toward
        // outside neighbours.**
        //
        // The reason that never shows on screen is not tug: tug is the *following*
        // force along the drag direction, which points the other way (argument
        // corrected in audit). Three things actually cover it: ① `slowDown: 20`
        // plus a short warm window keeps FA2-derived displacement tiny per frame,
        // ② the visible symptom — the dragged cluster riding onto a settled node —
        // is caught by overlap separation in the same frame (an active node is
        // tested against *every* settled node), and ③ the leftover micro-stretch on
        // boundary edges mostly disappears as release settling rewinds the tug
        // offset to 0.
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
      // Guard against a rare FA2 NaN blow-up — callers keep the last good
      // position rather than teleporting a node to nowhere.
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
