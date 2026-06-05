import type { MeaningfulOntologyKind } from "@/shared/lib/ontology-tree";

export const TOPOLOGY_ONTOLOGY_KINDS = [
  "project",
  "domain",
  "capability",
  "element",
  "unknown",
] as const;

export type TopologyOntologyKind = (typeof TOPOLOGY_ONTOLOGY_KINDS)[number];

/**
 * Ontology kind tones for the Sigma topology map.
 *
 * The graph is a data-visualization surface, so kind separation must be more
 * explicit than the surrounding product chrome. Use strong categorical hues and
 * high-opacity fills, while still pairing color with labels and size hierarchy
 * so kind is not conveyed by color alone.
 */
const ONTOLOGY_BORDER_BY_KIND: Record<TopologyOntologyKind, string> = {
  // red — project / product-system scope
  project: "rgba(255, 60, 80, 1)",
  // blue — domain / shared vocabulary boundary
  domain: "rgba(47, 128, 237, 1)",
  // amber — capability / user-visible behavior
  capability: "rgba(255, 210, 0, 1)",
  // green — element / concrete implementation part
  element: "rgba(28, 185, 120, 1)",
  // violet — unknown / needs classification review
  unknown: "rgba(187, 107, 217, 1)",
};

const ONTOLOGY_FILL_BY_KIND: Record<TopologyOntologyKind, string> = {
  project: "rgba(255, 60, 80, 0.97)",
  domain: "rgba(47, 128, 237, 0.97)",
  capability: "rgba(255, 210, 0, 0.97)",
  element: "rgba(28, 185, 120, 0.97)",
  unknown: "rgba(187, 107, 217, 0.97)",
};

/** 모든 ontology border 의 단일 두께 — 헌장의 "size 변동 최소" 정책. */
export const ONTOLOGY_BORDER_WIDTH = 1.5;

/**
 * Kind-size hierarchy keeps the graph usable when color perception is limited:
 * project (scope anchor) > domain (vocabulary area) > capability (behavior)
 * > element (implementation).
 */
export const ONTOLOGY_NODE_SIZE_BY_KIND: Record<TopologyOntologyKind, number> = {
  project: 8.4,
  domain: 7.2,
  capability: 5.2,
  element: 3.1,
  unknown: 3.6,
};

export interface OntologyBorderTone {
  borderColor: string;
  borderWidth: number;
}

/**
 * 도미넌트 kind → border tone. `null` 이면 ontology 0 = 기본 무채색
 * (호출자가 fallback 결정).
 */
export function ontologyBorderTone(
  dominantKind: TopologyOntologyKind | MeaningfulOntologyKind | null,
): OntologyBorderTone | null {
  if (!dominantKind) return null;
  return {
    borderColor: ONTOLOGY_BORDER_BY_KIND[dominantKind],
    borderWidth: ONTOLOGY_BORDER_WIDTH,
  };
}

export function ontologyFillTone(kind: TopologyOntologyKind | MeaningfulOntologyKind): string {
  return ONTOLOGY_FILL_BY_KIND[kind];
}
