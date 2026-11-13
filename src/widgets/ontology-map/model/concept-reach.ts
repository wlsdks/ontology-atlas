import { isDirectionalRelation } from "@/entities/knowledge-graph";
import type { DialModel } from "../dial/types";
import { capabilityLines, type GraphLineKind } from "../flat-graph/attention";
import {
  directCapabilityRelations,
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

function relationKind(relationType: string): CapabilityRelation["kind"] {
  if (!isDirectionalRelation(relationType)) return "relates";
  return relationType === "is_a" ? "broader" : "depends";
}

/** One concept's own non-containment edges, in the shape `directCapabilityRelations` gives a capability. O(E). */
function ownRelations(edges: readonly TreeInputEdge[], conceptId: string): CapabilityRelation[] {
  const out: CapabilityRelation[] = [];
  for (const e of edges) {
    if (e.kind === "contains" || e.source === e.target) continue;
    if (e.source !== conceptId && e.target !== conceptId) continue;
    out.push({ from: e.source, to: e.target, kind: relationKind(e.relationType) });
  }
  return out;
}

/** Distinct concepts that need each concept, over every dependency edge. O(E). */
function neededByCounts(edges: readonly TreeInputEdge[]): Map<string, number> {
  const sources = new Map<string, Set<string>>();
  for (const e of edges) {
    if (e.kind === "contains" || e.source === e.target) continue;
    if (relationKind(e.relationType) !== "depends") continue;
    let set = sources.get(e.target);
    if (!set) sources.set(e.target, (set = new Set()));
    set.add(e.source);
  }
  return new Map([...sources].map(([id, set]) => [id, set.size]));
}

/**
 * The reach the detail panel lists, read with the map's own counting: `domainPartners` for a
 * domain and `capabilityLines` over `directCapabilityRelations` for a capability, so every number
 * equals the map's count line. An element reads its own relations by the same line rules. Null for
 * a project or a concept the map does not draw. O(N + E).
 */
export function readConceptReach(
  nodes: readonly TreeInputNode[],
  edges: readonly TreeInputEdge[],
  conceptId: string,
): ConceptReach | null {
  const nodeById = new Map(nodes.map((n) => [n.id, n] as const));
  const concept = nodeById.get(conceptId);
  if (!concept || concept.kind === "project") return null;
  const tree = readContainmentTree(nodes, edges);
  const counts = neededByCounts(edges);
  const row = (id: string, line: GraphLineKind, links: number | null = null): ReachRow => {
    const node = nodeById.get(id);
    return { id, label: node?.label ?? id, kind: node?.kind ?? "concept", line, links, neededBy: counts.get(id) ?? 0 };
  };
  const relations = concept.kind === "capability" ? directCapabilityRelations(tree, edges) : ownRelations(edges, conceptId);
  const lines = capabilityLines({ capabilityRelations: relations } as Pick<DialModel, "capabilityRelations"> as DialModel, conceptId);
  const other = lines
    .filter((l) => l.kind === "relates" || l.kind === "broader")
    .map((l) => row(l.from === conceptId ? l.to : l.from, l.kind));
  if (concept.kind === "domain") {
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
