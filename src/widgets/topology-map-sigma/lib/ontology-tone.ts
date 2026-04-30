import type { MeaningfulOntologyKind } from "@/shared/lib/ontology-tree";

/**
 * project 노드의 sigma border 톤 — ontology kind 도미넌트별 1색.
 *
 * 디자인 헌장 (CLAUDE.md §11) 준수:
 * - 모든 hue 가 chroma ≤ 8% (무채색 계열) — `OWNER_TONE_PALETTE` 의 동일 제약.
 * - fill 은 분기 안 함 (border 만). 무채색 본문 + 인디고 허브 골격 보존.
 * - amber (unknown) 는 stub 검수 신호로 헌장의 "허용된 경고 톤" — `Workspace
 *   OntologyStrip` 와 일관 (`rgba(255,179,71,*)`).
 *
 * capability 의 인디고는 alpha 낮춘 border 만 (fill 아님) 이라 단일 인디고
 * 허브 (`#5e6ad2` fill) 와 hue 충돌이 아니다.
 */
const ONTOLOGY_BORDER_BY_KIND: Record<MeaningfulOntologyKind, string> = {
  // 블루 그레이 — domain 은 큰 분류라 가장 차분한 무채색
  domain: "rgba(186, 194, 206, 0.95)",
  // 인디고 (alpha 낮춤) — capability 는 사용자 관심 단위의 핵심
  capability: "rgba(94, 106, 210, 0.75)",
  // 틸/민트 그레이 — element 는 구현체라 살짝 다른 hue
  element: "rgba(176, 190, 190, 0.95)",
  // amber — unknown stub 검수 신호 (`WorkspaceOntologyStrip` 와 일관)
  unknown: "rgba(255, 179, 71, 0.95)",
};

/** 모든 ontology border 의 단일 두께 — 헌장의 "size 변동 최소" 정책. */
export const ONTOLOGY_BORDER_WIDTH = 1.5;

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
