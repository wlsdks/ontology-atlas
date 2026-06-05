import type { MeaningfulOntologyKind } from "@/shared/lib/ontology-tree";

/**
 * Ontology kind tones for the Sigma topology map.
 *
 * The graph is a data-visualization surface, so kind separation must be more
 * explicit than the surrounding product chrome. Use a colorblind-safe
 * Okabe-Ito-style set, while still pairing color with labels and size hierarchy
 * so kind is not conveyed by color alone.
 */
const ONTOLOGY_BORDER_BY_KIND: Record<MeaningfulOntologyKind, string> = {
  // sky blue — domain / shared vocabulary boundary
  domain: "rgba(86, 180, 233, 0.98)",
  // orange — capability / user-visible behavior
  capability: "rgba(230, 159, 0, 0.98)",
  // green — element / concrete implementation part
  element: "rgba(0, 158, 115, 0.98)",
  // purple — unknown / needs classification review
  unknown: "rgba(204, 121, 167, 0.98)",
};

const ONTOLOGY_FILL_BY_KIND: Record<MeaningfulOntologyKind, string> = {
  domain: "rgba(86, 180, 233, 0.92)",
  capability: "rgba(230, 159, 0, 0.92)",
  element: "rgba(0, 158, 115, 0.92)",
  unknown: "rgba(204, 121, 167, 0.92)",
};

/** 모든 ontology border 의 단일 두께 — 헌장의 "size 변동 최소" 정책. */
export const ONTOLOGY_BORDER_WIDTH = 1.5;

/**
 * Kind-size hierarchy keeps the graph usable when color perception is limited:
 * domain (big vocabulary area) > capability (behavior) > element (implementation).
 */
export const ONTOLOGY_NODE_SIZE_BY_KIND: Record<MeaningfulOntologyKind, number> = {
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
  dominantKind: MeaningfulOntologyKind | null,
): OntologyBorderTone | null {
  if (!dominantKind) return null;
  return {
    borderColor: ONTOLOGY_BORDER_BY_KIND[dominantKind],
    borderWidth: ONTOLOGY_BORDER_WIDTH,
  };
}

export function ontologyFillTone(kind: MeaningfulOntologyKind): string {
  return ONTOLOGY_FILL_BY_KIND[kind];
}
