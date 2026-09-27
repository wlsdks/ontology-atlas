import { isContainmentRelation } from "@/entities/knowledge-graph";
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "@/entities/knowledge-graph";

/**
 * `anchor`: every project and domain, never thresholded. `landmark`: each domain's capabilities
 * governing the largest subtree, plus one evidence element. `hidden`: the rest, revealed on demand.
 */
type SkeletonLevel = "anchor" | "landmark" | "hidden";

export interface OntologySkeleton {
  skeletonSlugs: Set<string>;
  levelBySlug: Map<string, SkeletonLevel>;
  /**
   * Drives node size, so the overview shows where the system's weight sits even with descendants
   * hidden.
   */
  subtreeWeightBySlug: Map<string, number>;
  landmarksByDomain: Map<string, string[]>;
  evidenceLandmarksByDomain: Map<string, string[]>;
  /** Capabilities hidden beyond the cap, for "+N". */
  overflowByDomain: Map<string, number>;
}

export interface BuildSkeletonOptions {
  /** Default 3. */
  perDomainCap?: number;
}

const DEFAULT_PER_DOMAIN_CAP = 3;

interface ContainmentIndex {
  /** Via `contains` forward and `belongs_to` reversed. */
  childrenByParent: Map<string, string[]>;
}

function buildContainmentIndex(
  edges: readonly KnowledgeGraphEdge[],
): ContainmentIndex {
  const childrenByParent = new Map<string, string[]>();
  const push = (parent: string, child: string) => {
    if (parent === child) return;
    const list = childrenByParent.get(parent);
    if (list) list.push(child);
    else childrenByParent.set(parent, [child]);
  };
  for (const edge of edges) {
    if (!isContainmentRelation(edge.type)) continue;
    if (edge.type === "belongs_to") push(edge.to, edge.from);
    else push(edge.from, edge.to);
  }
  return { childrenByParent };
}

/**
 * One DFS per node with its own visited set, each level re-copying its child's elements:
 * O(V × (V + E) + V² × h) for containment depth h, cubic on a deep chain. Not memoised.
 */
function computeSubtreeWeights(
  nodes: readonly KnowledgeGraphNode[],
  index: ContainmentIndex,
): Map<string, number> {
  const kindBySlug = new Map(nodes.map((node) => [node.id, node.kind]));
  const weightBySlug = new Map<string, number>();
  for (const node of nodes) {
    weightBySlug.set(
      node.id,
      collectElementDescendants(node.id, index, kindBySlug, new Set([node.id])).length,
    );
  }
  return weightBySlug;
}

function countFanIn(edges: readonly KnowledgeGraphEdge[]) {
  const describes = new Map<string, number>();
  const dependsOn = new Map<string, number>();
  for (const edge of edges) {
    const counts = edge.type === "describes" ? describes : edge.type === "depends_on" ? dependsOn : null;
    if (counts) counts.set(edge.to, (counts.get(edge.to) ?? 0) + 1);
  }
  return { describes, dependsOn };
}

function collectElementDescendants(
  slug: string,
  index: ContainmentIndex,
  kindBySlug: ReadonlyMap<string, string>,
  seen: Set<string>,
): string[] {
  const elements: string[] = [];
  for (const child of index.childrenByParent.get(slug) ?? []) {
    if (seen.has(child)) continue;
    seen.add(child);
    if (kindBySlug.get(child) === "element") elements.push(child);
    elements.push(...collectElementDescendants(child, index, kindBySlug, seen));
  }
  return elements;
}

/**
 * Landmarks rank by subtree weight, then describes fan-in, depends_on fan-in, slug ascending:
 * stable across renders. Fan-in is counted in one pass, so ranking is O(E + C log C) for C
 * capabilities.
 */
export function buildOntologySkeleton(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  options: BuildSkeletonOptions = {},
): OntologySkeleton {
  const perDomainCap = Math.max(1, options.perDomainCap ?? DEFAULT_PER_DOMAIN_CAP);
  const index = buildContainmentIndex(edges);
  const subtreeWeightBySlug = computeSubtreeWeights(nodes, index);
  const kindBySlug = new Map(nodes.map((node) => [node.id, node.kind]));
  const fanIn = countFanIn(edges);
  const byFanIn = (a: string, b: string) =>
    (fanIn.describes.get(b) ?? 0) - (fanIn.describes.get(a) ?? 0) ||
    (fanIn.dependsOn.get(b) ?? 0) - (fanIn.dependsOn.get(a) ?? 0) ||
    a.localeCompare(b);

  const levelBySlug = new Map<string, SkeletonLevel>();
  const skeletonSlugs = new Set<string>();
  const landmarksByDomain = new Map<string, string[]>();
  const evidenceLandmarksByDomain = new Map<string, string[]>();
  const overflowByDomain = new Map<string, number>();

  for (const node of nodes) levelBySlug.set(node.id, "hidden");

  const promote = (slug: string, level: SkeletonLevel) => {
    levelBySlug.set(slug, level);
    skeletonSlugs.add(slug);
  };

  for (const node of nodes) {
    if (node.kind === "project" || node.kind === "domain") {
      promote(node.id, "anchor");
    }
  }

  const domains = nodes.filter((node) => node.kind === "domain");
  for (const domain of domains) {
    const capabilityChildren = (index.childrenByParent.get(domain.id) ?? [])
      .filter((child) => kindBySlug.get(child) === "capability");
    const unique = [...new Set(capabilityChildren)];

    const ranked = unique.slice().sort(
      (a, b) => (subtreeWeightBySlug.get(b) ?? 0) - (subtreeWeightBySlug.get(a) ?? 0) || byFanIn(a, b),
    );

    const landmarks = ranked.slice(0, perDomainCap);
    landmarksByDomain.set(domain.id, landmarks);
    overflowByDomain.set(domain.id, Math.max(0, ranked.length - landmarks.length));
    for (const slug of landmarks) promote(slug, "landmark");
  }

  // One global evidence landmark proves the ontology reaches implementation without flooding the
  // map with leaves.
  const evidenceForDomain = (domainSlug: string): string | null => {
    const candidateCapabilities = landmarksByDomain.get(domainSlug) ?? [];
    const candidates = candidateCapabilities
      .flatMap((capability) =>
        collectElementDescendants(
          capability,
          index,
          kindBySlug,
          new Set([capability]),
        ),
      )
      .filter((slug, index, list) => list.indexOf(slug) === index);
    return candidates.sort(byFanIn)[0] ?? null;
  };

  const maxDomainWeight = Math.max(
    0,
    ...domains.map((domain) => subtreeWeightBySlug.get(domain.id) ?? 0),
  );
  const sortedDomains = domains.slice().sort((a, b) => a.id.localeCompare(b.id));
  const leftHalfDomains = sortedDomains.slice(Math.ceil(sortedDomains.length / 2));
  const rankDomains = (items: readonly KnowledgeGraphNode[]) =>
    items.slice().sort((a, b) => {
      const wa = subtreeWeightBySlug.get(a.id) ?? 0;
      const wb = subtreeWeightBySlug.get(b.id) ?? 0;
      if (wa !== wb) return wb - wa;
      return a.id.localeCompare(b.id);
    });
  const preferredDomains = [
    ...rankDomains(
      leftHalfDomains.filter(
        (domain) => (subtreeWeightBySlug.get(domain.id) ?? 0) >= maxDomainWeight * 0.5,
      ),
    ),
    ...rankDomains(domains),
  ].filter(
    (domain, index, list) => list.findIndex((item) => item.id === domain.id) === index,
  );

  for (const domain of preferredDomains) {
    const evidenceLandmark = evidenceForDomain(domain.id);
    if (evidenceLandmark) {
      evidenceLandmarksByDomain.set(domain.id, [evidenceLandmark]);
      promote(evidenceLandmark, "landmark");
      break;
    }
  }

  return {
    skeletonSlugs,
    levelBySlug,
    subtreeWeightBySlug,
    landmarksByDomain,
    evidenceLandmarksByDomain,
    overflowByDomain,
  };
}
