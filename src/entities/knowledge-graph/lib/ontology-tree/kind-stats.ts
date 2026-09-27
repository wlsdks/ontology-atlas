import type { KnowledgeGraphNode } from "../../model";

/** Kinds counted in stats: domain, capability, element, and the `unknown` stub; not project or document. */
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

/** Dense counts in `MEANINGFUL_ONTOLOGY_KINDS` order, zeros included. */
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
