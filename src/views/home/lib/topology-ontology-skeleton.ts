import { isContainmentRelation } from "@/shared/lib/ontology-tree";
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "@/entities/knowledge-graph";

/**
 * Where a node sits in the structural-skeleton entry view:
 * - `anchor`: every project + every domain — the coordinate system the audience
 *   reads (business spine). Never thresholded.
 * - `landmark`: the per-domain capabilities that govern the largest subtree.
 * - `hidden`: elements, non-landmark capabilities, documents — present in the
 *   graph but not part of the entry skeleton (revealed on demand).
 */
export type SkeletonLevel = "anchor" | "landmark" | "hidden";

export interface OntologySkeleton {
  /** anchors ∪ landmarks — the entry node set. */
  skeletonSlugs: Set<string>;
  levelBySlug: Map<string, SkeletonLevel>;
  /**
   * Transitive contained-element count per node (the tree's own magnitude) —
   * drives node SIZE so the overview is honest about where the system's gravity
   * sits, even though hidden descendants aren't drawn.
   */
  subtreeWeightBySlug: Map<string, number>;
  /** Domain slug → ordered landmark capability slugs chosen for it. */
  landmarksByDomain: Map<string, string[]>;
  /** Domain slug → capabilities hidden beyond the cap (for an aggregate "+N"). */
  overflowByDomain: Map<string, number>;
}

export interface BuildSkeletonOptions {
  /** Max landmark capabilities surfaced per domain (default 3). */
  perDomainCap?: number;
}

const DEFAULT_PER_DOMAIN_CAP = 3;

interface ContainmentIndex {
  /** parent slug → child slugs (via contains forward / belongs_to reverse). */
  childrenByParent: Map<string, string[]>;
}

/**
 * Build the parent→children adjacency from containment edges only.
 * `contains` is parent→child (from→to); `belongs_to` is the reverse (child→parent).
 */
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
 * Transitive count of element-kind descendants reachable through containment.
 * Cycle-safe (visited set). Memoized across nodes for cheapness.
 */
function computeSubtreeWeights(
  nodes: readonly KnowledgeGraphNode[],
  index: ContainmentIndex,
): Map<string, number> {
  const kindBySlug = new Map(nodes.map((node) => [node.id, node.kind]));
  const weightBySlug = new Map<string, number>();

  const visit = (slug: string, seen: Set<string>): Set<string> => {
    // returns the set of element descendant slugs (deduped) under `slug`.
    const elements = new Set<string>();
    for (const child of index.childrenByParent.get(slug) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      if (kindBySlug.get(child) === "element") elements.add(child);
      for (const deep of visit(child, seen)) elements.add(deep);
    }
    return elements;
  };

  for (const node of nodes) {
    weightBySlug.set(node.id, visit(node.id, new Set([node.id])).size);
  }
  return weightBySlug;
}

/** Count incoming edges of a given type pointing at `slug`. */
function countIncomingOfType(
  slug: string,
  type: string,
  edges: readonly KnowledgeGraphEdge[],
): number {
  let count = 0;
  for (const edge of edges) {
    if (edge.to === slug && edge.type === type) count += 1;
  }
  return count;
}

/**
 * Compute the structural skeleton: anchors (project/domain) + per-domain landmark
 * capabilities by governed subtree weight, deterministically.
 *
 * Landmark ranking (per the luminary panel): subtree weight desc → describes-
 * evidence fan-in desc → depends_on fan-in desc → slug asc. Deterministic and
 * replay-identical so the entry map is stable across renders.
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

  const levelBySlug = new Map<string, SkeletonLevel>();
  const skeletonSlugs = new Set<string>();
  const landmarksByDomain = new Map<string, string[]>();
  const overflowByDomain = new Map<string, number>();

  // every node starts hidden; anchors/landmarks are promoted below.
  for (const node of nodes) levelBySlug.set(node.id, "hidden");

  const promote = (slug: string, level: SkeletonLevel) => {
    levelBySlug.set(slug, level);
    skeletonSlugs.add(slug);
  };

  // anchors — every project + every domain, unconditional.
  for (const node of nodes) {
    if (node.kind === "project" || node.kind === "domain") {
      promote(node.id, "anchor");
    }
  }

  // landmarks — per domain, rank its capability children and take top-N.
  const domains = nodes.filter((node) => node.kind === "domain");
  for (const domain of domains) {
    const capabilityChildren = (index.childrenByParent.get(domain.id) ?? [])
      .filter((child) => kindBySlug.get(child) === "capability");
    const unique = [...new Set(capabilityChildren)];

    const ranked = unique.slice().sort((a, b) => {
      const wa = subtreeWeightBySlug.get(a) ?? 0;
      const wb = subtreeWeightBySlug.get(b) ?? 0;
      if (wa !== wb) return wb - wa;
      const da = countIncomingOfType(a, "describes", edges);
      const db = countIncomingOfType(b, "describes", edges);
      if (da !== db) return db - da;
      const pa = countIncomingOfType(a, "depends_on", edges);
      const pb = countIncomingOfType(b, "depends_on", edges);
      if (pa !== pb) return pb - pa;
      return a.localeCompare(b);
    });

    const landmarks = ranked.slice(0, perDomainCap);
    landmarksByDomain.set(domain.id, landmarks);
    overflowByDomain.set(domain.id, Math.max(0, ranked.length - landmarks.length));
    for (const slug of landmarks) promote(slug, "landmark");
  }

  return {
    skeletonSlugs,
    levelBySlug,
    subtreeWeightBySlug,
    landmarksByDomain,
    overflowByDomain,
  };
}
