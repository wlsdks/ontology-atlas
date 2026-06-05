import {
  ONTOLOGY_KIND_TONE,
  ONTOLOGY_VISUAL_KINDS,
  type OntologyVisualKind,
} from "@/entities/ontology-class";
import type { MeaningfulOntologyKind } from "@/shared/lib/ontology-tree";

export const TOPOLOGY_ONTOLOGY_KINDS = ONTOLOGY_VISUAL_KINDS;

export type TopologyOntologyKind = OntologyVisualKind;

/**
 * Ontology kind tones for the Sigma topology map.
 *
 * The graph is a data-visualization surface, so kind separation must be more
 * explicit than the surrounding product chrome. Use strong categorical hues and
 * high-opacity fills, while still pairing color with labels and size hierarchy
 * so kind is not conveyed by color alone.
 */
/** 모든 ontology border 의 단일 두께 — 헌장의 "size 변동 최소" 정책. */
export const ONTOLOGY_BORDER_WIDTH = 1.5;

/**
 * Kind-size hierarchy keeps the graph usable when color perception is limited:
 * project (scope anchor) > domain (vocabulary area) > capability (behavior)
 * > element (implementation).
 */
export const ONTOLOGY_NODE_SIZE_BY_KIND: Record<TopologyOntologyKind, number> = {
  project: ONTOLOGY_KIND_TONE.project.nodeSize,
  domain: ONTOLOGY_KIND_TONE.domain.nodeSize,
  capability: ONTOLOGY_KIND_TONE.capability.nodeSize,
  element: ONTOLOGY_KIND_TONE.element.nodeSize,
  unknown: ONTOLOGY_KIND_TONE.unknown.nodeSize,
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
    borderColor: ONTOLOGY_KIND_TONE[dominantKind].border,
    borderWidth: ONTOLOGY_BORDER_WIDTH,
  };
}

export function ontologyFillTone(kind: TopologyOntologyKind | MeaningfulOntologyKind): string {
  return ONTOLOGY_KIND_TONE[kind].fill;
}
