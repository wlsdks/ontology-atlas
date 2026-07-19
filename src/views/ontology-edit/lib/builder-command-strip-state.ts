/**
 * 빌더 헤더 아래 컨텍스트 줄(BuilderCommandStrip)의 상태 머신 — 선택/초안/
 * 관계 대기 조합을 하나의 판정으로 접는다(OntologyEditPage.tsx A4 분해).
 */
export type BuilderCommandStripState =
  | "empty"
  | "draft"
  | "selectedProject"
  | "selectedDomain"
  | "selectedCapability"
  | "selected"
  | "relationReview";

export function resolveBuilderCommandStripState({
  draftNodes,
  draftEdges,
  hasSelection,
  hasPendingRelation,
  selectedKind,
  selectedEphemeral,
}: {
  draftNodes: number;
  draftEdges: number;
  hasSelection: boolean;
  hasPendingRelation: boolean;
  selectedKind?: string | null;
  selectedEphemeral?: boolean;
}): BuilderCommandStripState {
  if (hasPendingRelation) return "relationReview";
  if (selectedEphemeral) return "draft";
  if (hasSelection) {
    if (selectedKind === "project") return "selectedProject";
    if (selectedKind === "domain") return "selectedDomain";
    if (selectedKind === "capability") return "selectedCapability";
    return "selected";
  }
  if (draftNodes > 0 || draftEdges > 0) return "draft";
  return "empty";
}

export function isSelectedBuilderCommandState(state: BuilderCommandStripState): boolean {
  return (
    state === "selected" ||
    state === "selectedProject" ||
    state === "selectedDomain" ||
    state === "selectedCapability"
  );
}

/**
 * 헤더 ⋯ 오버플로 메뉴의 "상세 열기" 항목 노출 판정 — persona QA 발견
 * (fix/persona-findings ①): 이전엔 `commandStripState !== "selected"` 로
 * 게이팅되어 있어, 방금 만든 draft 를 닫은 뒤 다시 이름을 채우려 할 때 상태에
 * 따라 이 유일한 명시적 "상세 보기" 진입점이 숨어버릴 수 있었다. 상세
 * sheet 가 이미 열려 있지 않고 선택된 개념(ephemeral 또는 vault)이 있으면
 * 항상 노출 — 상태 조합과 무관한 단순하고 예측 가능한 안전망.
 */
export function shouldShowBuilderOpenDetailsMenuItem({
  hasSelection,
  detailsOpen,
}: {
  hasSelection: boolean;
  detailsOpen: boolean;
}): boolean {
  return hasSelection && !detailsOpen;
}
