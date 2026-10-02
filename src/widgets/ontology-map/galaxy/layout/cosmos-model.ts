import {
  readContainmentTree,
  rollDependencies,
  rollDomainFlows,
  type DomainFlow,
  type TreeInputEdge,
  type TreeInputNode,
} from "../../model/containment-tree";

export interface CosmosInputNode extends TreeInputNode {
  size?: number;
  fullDegree?: number;
}

interface CosmosClusterModel {
  id: string;
  label: string;
  stars: string[];
}

export interface CosmosGalaxyModel {
  id: string;
  label: string;
  clusters: CosmosClusterModel[];
  field: string[];
  internalLinks: { a: string; b: string; count: number }[];
  members: number;
  cohesion: number;
  concentration: number;
}

export interface CosmosModel {
  project: { id: string; label: string } | null;
  galaxies: CosmosGalaxyModel[];
  halo: string[];
  flows: DomainFlow[];
  seed: string;
  labels: ReadonlyMap<string, string>;
  kinds: ReadonlyMap<string, TreeInputNode["kind"]>;
  magnitudes: ReadonlyMap<string, number>;
}

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function buildCosmosModel(nodes: readonly CosmosInputNode[], edges: readonly TreeInputEdge[]): CosmosModel {
  const tree = readContainmentTree(nodes, edges);
  const dependencies = rollDependencies(tree, edges);
  const domainOf = (id: string) => tree.capabilityDomain.get(id) ?? null;
  const flows = rollDomainFlows(dependencies, domainOf);

  const clustersByDomain = new Map<string, CosmosClusterModel[]>();
  const halo: string[] = [];
  for (const capability of tree.capabilities) {
    const domain = domainOf(capability.id);
    const stars = [...(tree.capabilityElements.get(capability.id) ?? [])].sort(byString);
    if (!domain) {
      halo.push(capability.id, ...stars);
      continue;
    }
    const list = clustersByDomain.get(domain);
    const cluster = { id: capability.id, label: capability.label, stars };
    if (list) list.push(cluster);
    else clustersByDomain.set(domain, [cluster]);
  }

  const fieldByDomain = new Map<string, string[]>();
  const capabilityIds = new Set(tree.capabilities.map((c) => c.id));
  const domainIds = new Set(tree.domains.map((d) => d.id));
  for (const node of nodes) {
    if (node.kind !== "element") continue;
    const owner = tree.elementParent.get(node.id) ?? null;
    if (owner && capabilityIds.has(owner)) continue;
    if (owner && domainIds.has(owner)) {
      const list = fieldByDomain.get(owner);
      if (list) list.push(node.id);
      else fieldByDomain.set(owner, [node.id]);
      continue;
    }
    halo.push(node.id);
  }

  const internal = new Map<string, Map<string, number>>();
  for (const dep of dependencies) {
    const a = domainOf(dep.from);
    if (!a || a !== domainOf(dep.to)) continue;
    const [x, y] = dep.from < dep.to ? [dep.from, dep.to] : [dep.to, dep.from];
    const key = `${x}\0${y}`;
    const perDomain = internal.get(a) ?? new Map<string, number>();
    perDomain.set(key, (perDomain.get(key) ?? 0) + 1);
    internal.set(a, perDomain);
  }

  const galaxies: CosmosGalaxyModel[] = tree.domains.map((domain) => {
    const clusters = clustersByDomain.get(domain.id) ?? [];
    const field = (fieldByDomain.get(domain.id) ?? []).sort(byString);
    const clusterStars = clusters.reduce((sum, c) => sum + c.stars.length, 0);
    const members = clusters.length + clusterStars + field.length;
    const links = [...(internal.get(domain.id) ?? new Map<string, number>()).entries()]
      .map(([key, count]) => {
        const [a, b] = key.split("\0") as [string, string];
        return { a, b, count };
      })
      .sort((p, q) => byString(p.a + p.b, q.a + q.b));
    const internalCount = links.reduce((sum, l) => sum + l.count, 0);
    const biggest = clusters.reduce((max, c) => Math.max(max, c.stars.length), 0);
    return {
      id: domain.id,
      label: domain.label,
      clusters,
      field,
      internalLinks: links,
      members,
      cohesion: members > 0 ? internalCount / members : 0,
      concentration: clusterStars > 0 ? biggest / clusterStars : 0,
    };
  });

  const maxRaw = nodes.reduce((max, n) => Math.max(max, (n.size ?? 0) + (n.fullDegree ?? 0) * 18), 1);
  const magnitudes = new Map<string, number>();
  for (const n of nodes) {
    const raw = Math.max(0, (n.size ?? 0) + Math.max(0, n.fullDegree ?? 0) * 18);
    magnitudes.set(n.id, Math.sqrt(Math.min(1, raw / maxRaw)));
  }

  const project = tree.project ? { id: tree.project.id, label: tree.project.label } : null;
  return {
    project,
    galaxies,
    halo: halo.sort(byString),
    flows,
    seed: project?.id ?? tree.domains.map((d) => d.id).join("|"),
    labels: new Map(nodes.map((n) => [n.id, n.label])),
    kinds: new Map(nodes.map((n) => [n.id, n.kind])),
    magnitudes,
  };
}
