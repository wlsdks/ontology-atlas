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
   * ⚠️ NOT cheap at scale: the sim holds EVERY node regardless of semantic-zoom
   * capping, so this allocates an N-entry Map per tick (3000 at `?synth=3000`)
   * even when a restricted tick moved ~30 of them. Known waste, measured but
   * not yet fixed — see `docs/MAP-TESTABILITY.md` for how to re-measure before
   * changing it.
   */
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
        // **제한을 진짜로 건다 — 부분 그래프를 떼어 그 위에서만 돈다.**
        //
        // 종전에는 바깥 노드를 스냅샷 → **전체 그래프에 FA2** → 바깥 복원이었다.
        // 즉 «제한» 이 계산을 줄이지 않고 **결과만 버렸다**. FA2 는 노드 수의
        // 제곱에 붙으므로 3000노드에서 이 한 줄이 프레임의 상당 부분을 먹었고,
        // 버리는 데(스냅샷 3000 + 복원 ~2000 setAttribute) 또 비용을 냈다.
        // 2026-07-31 렉 사고에서 소유자가 세 번 물은 *"보이는 건 20개인데 왜
        // 3000개를 계산하나"* 가 이 자리를 가리키고 있었다.
        const sub = new Graph({ type: "undirected", multi: false, allowSelfLoops: false });
        for (const id of restrictToIds) {
          if (!graph.hasNode(id)) continue;
          sub.addNode(id, { x: graph.getNodeAttribute(id, "x"), y: graph.getNodeAttribute(id, "y") });
        }
        // 부분 그래프 «안쪽» 엣지만 — 밖으로 나가는 엣지는 상대가 없으므로
        // 힘도 없다. 즉 **경계 노드는 바깥 이웃 쪽으로의 복원력을 잃는다.**
        //
        // 이게 화면에서 안 보이는 이유는 tug 가 아니다(tug 는 드래그 방향
        // «추종력» 이라 방향이 반대다 — 감사에서 정정된 논거). 실제로 덮는 것은
        // 셋이다: ① `slowDown: 20` + 짧은 warm 창이라 FA2 유래 변위가 프레임당
        // 미소하고, ② 가시 증상(끌던 무리가 정지 노드에 얹힘)은 겹침 해소가
        // 같은 프레임에 잡으며(활성 노드는 «모든» 정지 노드와 검사된다),
        // ③ 남은 경계 엣지 미세 신장은 릴리즈 정착이 tug 오프셋을 0으로
        // 되감으며 대부분 소멸한다.
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
