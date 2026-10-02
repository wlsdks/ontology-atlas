import { readContainmentTree, type TreeInputEdge, type TreeInputNode } from "../model/containment-tree";

const DECLARED = new Set(["depends_on", "dependencies"]);

export interface ReliefMetric {
  capability: ReadonlyMap<string, number>;
  region: ReadonlyMap<string, number>;
  capabilityMax: number;
  regionMax: number;
}

export function declaredDependents(nodes: readonly TreeInputNode[], edges: readonly TreeInputEdge[]): ReliefMetric {
  const tree = readContainmentTree(nodes, edges);
  const domainIds = new Set(tree.domains.map((d) => d.id));
  const capabilityOf = (id: string): string | null => {
    if (tree.capabilityDomain.has(id)) return id;
    const owner = tree.elementParent.get(id);
    return owner !== undefined && tree.capabilityDomain.has(owner) ? owner : null;
  };
  const domainOf = (id: string): string | null => {
    if (domainIds.has(id)) return id;
    const capability = capabilityOf(id);
    if (capability) return tree.capabilityDomain.get(capability) ?? null;
    const owner = tree.elementParent.get(id);
    return owner !== undefined && domainIds.has(owner) ? owner : null;
  };

  const byCapability = new Map<string, Set<string>>();
  const byRegion = new Map<string, Set<string>>();
  const add = (into: Map<string, Set<string>>, key: string, source: string) => {
    const set = into.get(key);
    if (set) set.add(source);
    else into.set(key, new Set([source]));
  };
  for (const e of edges) {
    if (e.kind === "contains" || !DECLARED.has(e.relationType)) continue;
    const targetCapability = capabilityOf(e.target);
    if (targetCapability && e.source !== targetCapability && capabilityOf(e.source) !== targetCapability)
      add(byCapability, targetCapability, e.source);
    const targetDomain = domainOf(e.target);
    if (targetDomain && domainOf(e.source) !== targetDomain) add(byRegion, targetDomain, e.source);
  }

  const capability = new Map<string, number>();
  let capabilityMax = 0;
  for (const c of tree.capabilities) {
    const n = byCapability.get(c.id)?.size ?? 0;
    capability.set(c.id, n);
    capabilityMax = Math.max(capabilityMax, n);
  }
  const region = new Map<string, number>();
  let regionMax = 0;
  for (const d of tree.domains) {
    const n = byRegion.get(d.id)?.size ?? 0;
    region.set(d.id, n);
    regionMax = Math.max(regionMax, n);
  }
  return { capability, region, capabilityMax, regionMax };
}
