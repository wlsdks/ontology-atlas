import type { BuilderDraftPreview } from "./builder-draft-agent-packet";

/**
 * 하단 쓰기-확인 바의 상태 문구 선택 — dry-run 미리보기가 무엇을 보여줄지,
 * "vault 에 쓰기" 가 아직 누를 수 있는 실제 작업이 있는지 판정한다.
 *
 * 실제 쓰기 로직은 건드리지 않는다 — 이 함수는 어떤 *기존* 핸들러
 * (confirmPendingRelation / saveEphemeral / 상세 열기) 를 가리킬지만
 * 고른다. 표피 restyle 범위 원칙 (기능은 그대로, 진입점만 하나 늘림).
 */
export type BuilderWriteConfirmStatus =
  | "readOnlySource"
  | "relationPending"
  | "draftReady"
  | "draftNeedsName"
  | "clean";

export function resolveBuilderWriteConfirmStatus({
  readOnlySource,
  hasPendingRelation,
  draftNodes,
  draftEdges,
  hasUnnamedDraft,
}: {
  /** 샘플/읽기 전용 소스 — 연결된 쓰기 가능 vault 가 없다. draft·관계가
   *  있어도 이 상태에서는 vault 에 쓸 수 없으므로 최우선으로 진실을 말한다. */
  readOnlySource: boolean;
  hasPendingRelation: boolean;
  draftNodes: number;
  draftEdges: number;
  hasUnnamedDraft: boolean;
}): BuilderWriteConfirmStatus {
  if (readOnlySource) return "readOnlySource";
  if (hasPendingRelation) return "relationPending";
  if (draftNodes === 0 && draftEdges === 0) return "clean";
  if (hasUnnamedDraft) return "draftNeedsName";
  return "draftReady";
}

export type BuilderWriteConfirmAction =
  | { type: "connectSource" }
  | { type: "confirmRelation" }
  | { type: "saveDraft"; nodeId: string }
  | { type: "openDraft"; nodeId: string }
  | { type: "none" };

/**
 * "vault 에 쓰기" 클릭 시 무엇을 할지 — 읽기 전용 소스면 쓰기가 아예 불가하니
 * vault 연결(내 폴더 열기)로 유도하는 게 최우선, 그다음 대기 중인 관계 확인,
 * 이름이 있어 바로 저장 가능한 draft 노드, 이름이 필요한 첫 draft 를 열어
 * 사용자가 이름부터 채우게 한다. 아무 것도 없으면 no-op.
 */
export function resolveBuilderWriteConfirmAction({
  readOnlySource,
  hasPendingRelation,
  readyDraftNodeId,
  firstDraftNodeId,
}: {
  readOnlySource: boolean;
  hasPendingRelation: boolean;
  readyDraftNodeId: string | null;
  firstDraftNodeId: string | null;
}): BuilderWriteConfirmAction {
  if (readOnlySource) return { type: "connectSource" };
  if (hasPendingRelation) return { type: "confirmRelation" };
  if (readyDraftNodeId) return { type: "saveDraft", nodeId: readyDraftNodeId };
  if (firstDraftNodeId) return { type: "openDraft", nodeId: firstDraftNodeId };
  return { type: "none" };
}

/**
 * 인스펙터의 "이 세션의 파일 변경" 프리뷰 줄 — 쓰기 확인 전에는 어떤
 * 파일도 바뀌지 않는다는 안전 계약을 시각화한다 (준비된 draft 노드의
 * 예상 경로 + 대기 중인 관계의 소스 파일).
 */
export interface BuilderSessionDiffLine {
  changeType: "add" | "relation";
  path: string;
}

export function buildBuilderSessionDiffLines({
  draftPreviews,
  pendingRelation,
}: {
  draftPreviews: BuilderDraftPreview[];
  pendingRelation: { sourceSlug: string } | null;
}): BuilderSessionDiffLine[] {
  const lines: BuilderSessionDiffLine[] = [];
  for (const draft of draftPreviews) {
    if (draft.needsName) continue;
    lines.push({ changeType: "add", path: draft.path });
  }
  if (pendingRelation) {
    lines.push({ changeType: "relation", path: `${pendingRelation.sourceSlug}.md` });
  }
  return lines;
}
