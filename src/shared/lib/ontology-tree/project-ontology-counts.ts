import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  MEANINGFUL_ONTOLOGY_KINDS,
  isMeaningfulOntologyKind,
  type MeaningfulOntologyKind,
} from "./kind-stats";

/**
 * Kind distribution of the ontology nodes under one project slug.
 *
 * `byKind` is dense — zeroes included — so a consumer can read any kind without
 * guarding.
 */
export interface OntologyCountsForProject {
  byKind: Record<MeaningfulOntologyKind, number>;
  total: number;
}

/**
 * Aggregates nodes into project slug → kind counts.
 *
 * The `project` and `document` kinds are metadata and excluded
 * (`MEANINGFUL_ONTOLOGY_KINDS`). A node belonging to several projects counts once
 * in each; a unique count would be a separate function if one is ever needed.
 *
 * Keys cover only the slugs seen in the input, so a caller wanting an all-zero
 * fallback must handle `undefined` itself.
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

/**
 * The dominant kind for a project, the first input to its border tone. Ties break
 * in `MEANINGFUL_ONTOLOGY_KINDS` order (domain → capability → element → unknown),
 * which is both a stable sort and the spec's natural layer order.
 *
 * A single `unknown` outranks every other kind: it means a stub needs review, and
 * the consuming surface signals that in amber.
 *
 * `null` for an empty count — the caller falls back to a neutral tone.
 */
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
