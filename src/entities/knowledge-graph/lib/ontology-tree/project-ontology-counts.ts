import type { KnowledgeGraphNode } from "../../model";
import {
  MEANINGFUL_ONTOLOGY_KINDS,
  isMeaningfulOntologyKind,
  type MeaningfulOntologyKind,
} from "./kind-stats";

/** `byKind` is dense, zeros included. */
export interface OntologyCountsForProject {
  byKind: Record<MeaningfulOntologyKind, number>;
  total: number;
}

/**
 * Project slug → kind counts over `MEANINGFUL_ONTOLOGY_KINDS`; a node in several projects counts in
 * each. Only slugs seen in the input have keys.
 */
export function buildProjectOntologyCounts(
  nodes: readonly KnowledgeGraphNode[],
): Map<string, OntologyCountsForProject> {
  const map = new Map<string, OntologyCountsForProject>();

  for (const node of nodes) {
    if (!isMeaningfulOntologyKind(node.kind)) continue;
    const projectIds = Array.isArray(node.projectIds) ? node.projectIds : [];
    for (const slug of projectIds) {
      if (!slug) continue;
      let entry = map.get(slug);
      if (!entry) {
        entry = createZeroCounts();
        map.set(slug, entry);
      }
      entry.byKind[node.kind] += 1;
      entry.total += 1;
    }
  }

  return map;
}

function createZeroCounts(): OntologyCountsForProject {
  const byKind = {
    domain: 0,
    capability: 0,
    element: 0,
    unknown: 0,
  } satisfies Record<MeaningfulOntologyKind, number>;
  return { byKind, total: 0 };
}

/** Largest kind, ties in `MEANINGFUL_ONTOLOGY_KINDS` order; any `unknown` wins as a review signal; null when empty. */
export function pickDominantOntologyKind(
  counts: OntologyCountsForProject | undefined,
): MeaningfulOntologyKind | null {
  if (!counts || counts.total === 0) return null;
  if (counts.byKind.unknown > 0) return "unknown";
  let best: MeaningfulOntologyKind | null = null;
  let bestCount = 0;
  for (const kind of MEANINGFUL_ONTOLOGY_KINDS) {
    if (kind === "unknown") continue;
    const c = counts.byKind[kind];
    if (c > bestCount) {
      best = kind;
      bestCount = c;
    }
  }
  return best;
}
