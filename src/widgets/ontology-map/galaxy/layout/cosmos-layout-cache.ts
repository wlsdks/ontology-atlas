import type { TreeInputEdge } from "../../model/containment-tree";
import type { CosmosInputNode } from "./cosmos-model";
import { computeCosmosLayout, type CosmosLayout, type CosmosPlacementRecord } from "./cosmos-layout";

let last: {
  nodes: readonly CosmosInputNode[];
  edges: readonly TreeInputEdge[];
  placement: string;
  fresh: boolean;
  layout: CosmosLayout;
} | null = null;
let runs = 0;

export function cosmosLayoutFor(
  nodes: readonly CosmosInputNode[],
  edges: readonly TreeInputEdge[],
  placement: CosmosPlacementRecord | null,
  fresh: boolean,
): CosmosLayout {
  const key = JSON.stringify(placement);
  if (last && last.nodes === nodes && last.edges === edges && last.placement === key && last.fresh === fresh) return last.layout;
  runs += 1;
  const layout = computeCosmosLayout(
    nodes.map((n) => ({ id: n.id, label: n.label, kind: n.kind, size: n.size, fullDegree: n.fullDegree })),
    edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind, relationType: e.relationType })),
    { placement, fresh },
  );
  last = { nodes, edges, placement: key, fresh, layout };
  return layout;
}

export function cosmosLayoutRuns(): number {
  return runs;
}
