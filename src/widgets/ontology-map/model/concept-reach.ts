import { conceptLines, type GraphLineKind } from "../flat-graph/attention";
import {
  directRelations,
  domainPartners,
  readContainmentTree,
  rollDirectedDomainFlows,
  rollDomainDependencies,
  rollRelatesDomainPairs,
  type CapabilityRelation,
  type TreeInputEdge,
  type TreeInputNode,
} from "./containment-tree";

export interface ReachRow {
  id: string;
  label: string;
  kind: string;
  line: GraphLineKind;
  /** A partner domain's relation count in this direction; null for a concept row. */
  links: number | null;
  /** The far concept's own "needed by" count, the key the list is ordered by. */
  neededBy: number;
}

/** What a selected concept needs, what needs it, and its other links, counted as the map counts them. */
export interface ConceptReach {
  needs: ReachRow[];
  neededBy: ReachRow[];
  /** `relates` either way and `is_a` toward the broader end: lines that name no dependency. */
  other: ReachRow[];
}

const byLabel = (a: ReachRow, b: ReachRow) => a.label.localeCompare(b.label);
const byNeededBy = (a: ReachRow, b: ReachRow) => b.neededBy - a.neededBy || byLabel(a, b);
const byLinks = (a: ReachRow, b: ReachRow) => (b.links ?? 0) - (a.links ?? 0) || byLabel(a, b);

/** Distinct concepts that need each concept, over every dependency. O(E). */
function neededByCounts(relations: readonly CapabilityRelation[]): Map<string, number> {
  const sources = new Map<string, Set<string>>();
  for (const r of relations) {
    if (r.kind !== "depends") continue;
    let set = sources.get(r.to);
    if (!set) sources.set(r.to, (set = new Set()));
    set.add(r.from);
  }
  return new Map([...sources].map(([id, set]) => [id, set.size]));
}

/**
 * The reach the detail panel lists, read with the map's own counting: `domainPartners` for a
 * domain and `conceptLines` over `directRelations` for a capability or element, so every row and
 * number equals the map's lines and count line. Null for a project or a concept the map does not
 * draw. O(N + E).
 */
export function readConceptReach(
  nodes: readonly TreeInputNode[],
  edges: readonly TreeInputEdge[],
  conceptId: string,
): ConceptReach | null {
  const nodeById = new Map(nodes.map((n) => [n.id, n] as const));
  const concept = nodeById.get(conceptId);
  if (!concept || concept.kind === "project") return null;
  const relations = directRelations(edges);
  const counts = neededByCounts(relations);
  const row = (id: string, line: GraphLineKind, links: number | null = null): ReachRow => {
    const node = nodeById.get(id);
    return { id, label: node?.label ?? id, kind: node?.kind ?? "concept", line, links, neededBy: counts.get(id) ?? 0 };
  };
  const lines = conceptLines(relations, conceptId);
  const other = lines
    .filter((l) => l.kind === "relates" || l.kind === "broader")
    .map((l) => row(l.from === conceptId ? l.to : l.from, l.kind));
  if (concept.kind === "domain") {
    const tree = readContainmentTree(nodes, edges);
    const flows = rollDirectedDomainFlows(rollDomainDependencies(tree, edges), rollRelatesDomainPairs(tree, edges));
    const partners = domainPartners(flows, conceptId);
    return {
      needs: partners.needs.map((p) => row(p.domainId, "needs", p.links)).sort(byLinks),
      neededBy: partners.usedBy.map((p) => row(p.domainId, "neededBy", p.links)).sort(byLinks),
      other,
    };
  }
  return {
    needs: lines.filter((l) => l.kind === "needs").map((l) => row(l.to, "needs")).sort(byNeededBy),
    neededBy: lines.filter((l) => l.kind === "neededBy").map((l) => row(l.from, "neededBy")).sort(byNeededBy),
    other,
  };
}
