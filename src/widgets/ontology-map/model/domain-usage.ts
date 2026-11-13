import {
  domainPartners,
  readContainmentTree,
  rollDirectedDomainFlows,
  rollDomainDependencies,
  rollRelatesDomainPairs,
  type DomainPartner,
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
  const partners = domainPartners(flows, domainId);
  const rows = (list: readonly DomainPartner[]): DomainUsageRow[] =>
    list.map((p) => ({ domainId: p.domainId, label: labelOf.get(p.domainId) ?? p.domainId, links: p.links }));
  const byWeight = (a: DomainUsageRow, b: DomainUsageRow) =>
    b.links - a.links || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
  return { usedBy: rows(partners.usedBy).sort(byWeight), needs: rows(partners.needs).sort(byWeight) };
}
