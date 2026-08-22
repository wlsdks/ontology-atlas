import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";

/**
 * The node kinds a user actually thinks in — the set every stat surface counts.
 *
 * Excluded:
 *  - `project` — a meta label. It is the root of the tree, but nobody counts it when saying
 *    "my ontology has N of these".
 *  - `document` — an evidence node, linked to concepts through `describes`. It does not
 *    belong in statistics the user reads as domains, capabilities and elements.
 *
 * Included:
 *  - `domain` / `capability` / `element` — the real units of meaning.
 *  - `unknown` — a stub placeholder. It appears in the distribution because the user needs to
 *    see it as awaiting review, highlighted in the amber tone (the UI's job).
 */
export const MEANINGFUL_ONTOLOGY_KINDS = [
  "domain",
  "capability",
  "element",
  "unknown",
] as const;

export type MeaningfulOntologyKind = (typeof MEANINGFUL_ONTOLOGY_KINDS)[number];

export function isMeaningfulOntologyKind(
  kind: string | undefined | null,
): kind is MeaningfulOntologyKind {
  if (!kind) return false;
  return (MEANINGFUL_ONTOLOGY_KINDS as readonly string[]).includes(kind);
}

export interface OntologyKindStats {
  total: number;
  byKind: Record<MeaningfulOntologyKind, number>;
}

/**
 * The kind distribution every stat surface shares. Regardless of input order, `byKind` is a
 * dense map in `MEANINGFUL_ONTOLOGY_KINDS` order, zeros included.
 */
export function buildMeaningfulOntologyStats(
  nodes: readonly KnowledgeGraphNode[],
): OntologyKindStats {
  const byKind = {
    domain: 0,
    capability: 0,
    element: 0,
    unknown: 0,
  } satisfies Record<MeaningfulOntologyKind, number>;
  let total = 0;
  for (const n of nodes) {
    if (!isMeaningfulOntologyKind(n.kind)) continue;
    byKind[n.kind] += 1;
    total += 1;
  }
  return { total, byKind };
}
