import {
  readContainmentTree,
  rollDirectedDomainFlows,
  rollDomainDependencies,
  rollRelatesDomainPairs,
  type TreeInputEdge,
  type TreeInputNode,
} from "./containment-tree";

export interface DomainUsageRow {
  domainId: string;
  label: string;
  links: number;
}

export interface DomainUsage {
  usedBy: DomainUsageRow[];
  needs: DomainUsageRow[];
}

/** Reads one domain's partners from the same directed flows the dial draws between domains. */
export function readDomainUsage(
  nodes: readonly TreeInputNode[],
  edges: readonly TreeInputEdge[],
  domainId: string,
): DomainUsage | null {
  const tree = readContainmentTree(nodes, edges);
  const labelOf = new Map(tree.domains.map((domain) => [domain.id, domain.label] as const));
  if (!labelOf.has(domainId)) return null;
  const flows = rollDirectedDomainFlows(rollDomainDependencies(tree, edges), rollRelatesDomainPairs(tree, edges));
  const usedBy: DomainUsageRow[] = [];
  const needs: DomainUsageRow[] = [];
  for (const flow of flows) {
    if (flow.a !== domainId && flow.b !== domainId) continue;
    const partner = flow.a === domainId ? flow.b : flow.a;
    const outgoing = flow.a === domainId ? flow.ab : flow.ba;
    const incoming = flow.a === domainId ? flow.ba : flow.ab;
    const label = labelOf.get(partner) ?? partner;
    if (incoming > 0) usedBy.push({ domainId: partner, label, links: incoming });
    if (outgoing > 0) needs.push({ domainId: partner, label, links: outgoing });
  }
  const byWeight = (a: DomainUsageRow, b: DomainUsageRow) =>
    b.links - a.links || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
  return { usedBy: usedBy.sort(byWeight), needs: needs.sort(byWeight) };
}
