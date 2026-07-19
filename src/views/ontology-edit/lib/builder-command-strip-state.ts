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
