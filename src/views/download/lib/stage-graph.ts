import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/entities/knowledge-graph';
import {
  computeDomainCensusRows,
  domainCensusById,
  isContainmentRelation,
} from '@/entities/knowledge-graph/lib/ontology-tree';
import type { TopologyV2Edge, TopologyV2Node } from '@/widgets/topology-map-v2';

const RENDERABLE_KIND_LIST = ['project', 'domain', 'capability', 'element'] as const;
const RENDERABLE_KINDS = new Set<string>(RENDERABLE_KIND_LIST);
type RenderableKind = (typeof RENDERABLE_KIND_LIST)[number];

/**
 * The adapter that puts the **real map engine** on the `/download` stage.
 *
 * **Why this exists separately** (rather than reusing HomePage's). `buildTopologyV2Graph` does the
 * same job in `views/home/lib`, but that is **another view's internals**. Importing it from
 * `views/download` violates FSD's ban on same-layer cross-imports, and the chain it drags in
 * (`topology-ontology-skeleton`, `topology-analysis` → `views/home/model/url-state`) brings home's
 * URL state with it. Conversely, refactoring that adapter down into a widget would move things
 * **this page does not need** (change pulses, dusty verdicts, relation-quality classification) and
 * touch the wiring of the most important map in the app.
 *
 * So only what this screen actually uses is built here. Engine fields with no meaning on this
 * stage (`recentlyUpdated`, `stale`, `ownerKey`, `relationQuality`) are left at **neutral values
 * rather than fabricated** — the gateway has neither a "recently changed" baseline nor vault
 * mtimes, so any value would be false.
 *
 * ⚠️ **That rationale applies only to view-layer functions.** An older version read it broadly and
 * reimplemented descendant counting with its own recursion, and that recursion counted
 * **containment paths rather than unique nodes**, so the hub engraved `379` — a **4× contradiction**
 * on a screen whose caption right beside it read `96 concepts` (domain badges inflated up to 2.9×
 * too: views 129 vs a real 46; onboarding-ux 119 vs 15). This page's honesty contract is that the
 * background shares the caption's source, and the background itself was breaking it. The single
 * source for descendant counts, `computeDomainCensusRows`, lives in `shared/lib` and therefore
 * **never had a cross-import problem** — the INDEX tree, `/projects`, and the home adapter all
 * already use it (infoviz seat's finding, 2026-07-29).
 *
 * **Why no coordinates are produced.** The engine (`topology-world.ts`) computes a deterministic
 * concentric layout from `contains` edges and ignores incoming `x`/`y`. So zeros are passed — the
 * same as home's adapter.
 */
export interface StageGraph {
  nodes: TopologyV2Node[];
  edges: TopologyV2Edge[];
}

export function buildStageGraph(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): StageGraph {
  const included = nodes.filter((node) => RENDERABLE_KINDS.has(node.kind));
  const includedIds = new Set(included.map((node) => node.id));
  const includedEdges = edges.filter(
    // Self-referencing edges are excluded — cycles genuinely exist in this vault (the `cycles`
    // query counts them), and an edge pointing at itself renders as a zero-length line.
    (edge) => edge.from !== edge.to && includedIds.has(edge.from) && includedIds.has(edge.to),
  );

  const fullDegree = new Map<string, number>();
  const incoming = new Map<string, number>();
  for (const edge of includedEdges) {
    fullDegree.set(edge.from, (fullDegree.get(edge.from) ?? 0) + 1);
    fullDegree.set(edge.to, (fullDegree.get(edge.to) ?? 0) + 1);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }

  /**
   * The descendant count — the source for node size and the engraved number. It is not recounted
   * per surface: one shared census, which normalizes containment to parent→child and BFSes with a
   * **unique per-node tally**, is the source of truth for the INDEX tree, `/projects`, the home
   * map, and this stage. Cycle safety (visited) already lives there too.
   *
   * Its default subjects are domain and project, but **all four drawn kinds** are passed here —
   * the engraved number is drawn only on project and domain (`topology-frame-draw.ts`), but `size`
   * (visual scale and label priority) is used by capability as well. Collapsing that with `?? 0`
   * would kill capability's scale channel entirely.
   */
  const censusById = domainCensusById(
    computeDomainCensusRows(nodes, edges, RENDERABLE_KIND_LIST),
  );
  const descendantCountOf = (id: string) => censusById.get(id)?.total ?? 0;

  /**
   * There is **exactly one** hub — the charter's amber ring is a single-node emphasis. Ties break
   * by ascending id so the same node is picked on every build.
   */
  let hubId: string | null = null;
  let hubIncoming = 0;
  for (const node of included) {
    const count = incoming.get(node.id) ?? 0;
    /**
     * ⚠️ `incoming === 0` is skipped. With a starting value of `-1`, a graph where **nothing is
     * referenced** (a vault of only isolated nodes) would pick the array's first node as the hub
     * and light the amber ring with no basis. The charter says both "there is exactly one hub" and
     * "there may be no hub" — drawing one that does not exist is drawing a fact absent from the
     * data. Home's adapter has the same guard, and its absence here meant two places implementing
     * one invariant differently (design-system seat's finding, 2026-07-28).
     */
    if (count === 0) continue;
    if (count > hubIncoming || (count === hubIncoming && hubId !== null && node.id < hubId)) {
      hubId = node.id;
      hubIncoming = count;
    }
  }

  return {
    nodes: included.map((node) => ({
      id: node.id,
    // The canvas label is the short display title — drawing the full title (parenthetical asides
    // included) gets clipped and looks messy.
      label: node.display ?? node.title,
      kind: node.kind as RenderableKind,
      size: descendantCountOf(node.id),
      x: 0,
      y: 0,
      isHub: node.id === hubId,
      ownerKey: null,
      recentlyUpdated: false,
      stale: false,
      fullDegree: fullDegree.get(node.id) ?? 0,
      descendantCount: descendantCountOf(node.id),
    })),
    edges: includedEdges.map((edge) => ({
      source: edge.from,
      target: edge.to,
      relationType: edge.type,
      relationQuality: null,
      evidenceCount: edge.evidenceIds.length,
      kind: isContainmentRelation(edge.type) ? ('contains' as const) : ('depends' as const),
      declaredBySlug: edge.evidenceIds[0] ?? null,
    })),
  };
}
