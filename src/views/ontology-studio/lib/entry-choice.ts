import { ONTOLOGY_DEEPLINK_VIA_KEY } from "@/entities/knowledge-graph";

/**
 * `/ontology/studio` 진입 선택 모먼트(#1) 게이트 — 딥링크로 의도가 이미 실린
 * 진입은 선택 화면을 건너뛴다. "딥링크 의도" = mode=create · node · from ·
 * edit · (인사이트 검토 복귀) via 중 하나라도 있음. 순수 함수라 라우팅 계약을
 * 단위로 검증한다(회귀: 딥링크가 조용히 선택 화면에 갇히면 안 됨).
 */
export function studioHasDeepLinkIntent(params: Pick<URLSearchParams, "get">): boolean {
  return (
    params.get("mode") === "create" ||
    Boolean(params.get("node")) ||
    Boolean(params.get("from")) ||
    Boolean(params.get("edit")) ||
    Boolean(params.get(ONTOLOGY_DEEPLINK_VIA_KEY))
  );
}
