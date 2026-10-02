import type { TreeInputEdge } from "../../model/containment-tree";
import type { CosmosInputNode } from "./cosmos-model";
import { computeCosmosLayout, type CosmosLayout, type CosmosPlacementRecord } from "./cosmos-layout";

let last: { signature: string; layout: CosmosLayout } | null = null;
let runs = 0;

function contentSignature(nodes: readonly CosmosInputNode[], edges: readonly TreeInputEdge[], placement: CosmosPlacementRecord | null, fresh: boolean): string {
  const parts: string[] = [JSON.stringify(placement), String(fresh)];
  for (const n of nodes) parts.push(`${n.id}\u0001${n.label}\u0001${n.kind}\u0001${n.size}\u0001${n.fullDegree}`);
  parts.push("");
  for (const e of edges) parts.push(`${e.source}\u0001${e.target}\u0001${e.kind}\u0001${e.relationType}`);
  return parts.join("\u0002");
}

export function cosmosLayoutFor(
  nodes: readonly CosmosInputNode[],
  edges: readonly TreeInputEdge[],
  placement: CosmosPlacementRecord | null,
  fresh: boolean,
): CosmosLayout {
  const signature = contentSignature(nodes, edges, placement, fresh);
  if (last && last.signature === signature) return last.layout;
  runs += 1;
  const layout = computeCosmosLayout(
    nodes.map((n) => ({ id: n.id, label: n.label, kind: n.kind, size: n.size, fullDegree: n.fullDegree })),
    edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind, relationType: e.relationType })),
    { placement, fresh },
  );
  last = { signature, layout };
  return layout;
}

export function cosmosLayoutRuns(): number {
  return runs;
}
