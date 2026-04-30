/**
 * Manual editor v0 — `addManualKnowledgeEdge` 의 입력 계약 + 순수 validation.
 *
 * Firestore rules (`knowledgeApprovedEdges` create) 가 같은 제약을 서버에서도
 * 강제. 이 모듈은 클라이언트가 친절한 에러 메시지를 만들 수 있도록 동일
 * 검증을 순수 함수로 노출.
 */

import { KNOWLEDGE_EDGE_TYPES, type KnowledgeEdgeType } from "./types";

export interface AddManualKnowledgeEdgeInput {
  accountId: string;
  /** source node ID. 기존 노드 ID 참조 — 클라이언트는 미리 존재 여부 확인 가능. */
  from: string;
  to: string;
  type: KnowledgeEdgeType;
  /** edge 라벨 (옵션) — UI 가 type 외 추가 설명 표시할 때. */
  label?: string;
  manualNote?: string;
  projectIds?: string[];
}

export type ManualEdgeInputError =
  | 'account_id_required'
  | 'from_required'
  | 'to_required'
  | 'self_loop'
  | 'type_invalid';

export interface ManualEdgeInputValidation {
  ok: boolean;
  errors: ManualEdgeInputError[];
}

export function validateManualKnowledgeEdgeInput(
  input: AddManualKnowledgeEdgeInput,
): ManualEdgeInputValidation {
  const errors: ManualEdgeInputError[] = [];

  if (!input.accountId || input.accountId.trim().length === 0) {
    errors.push('account_id_required');
  }

  const trimmedFrom = (input.from ?? '').trim();
  const trimmedTo = (input.to ?? '').trim();
  if (trimmedFrom.length === 0) errors.push('from_required');
  if (trimmedTo.length === 0) errors.push('to_required');

  if (trimmedFrom.length > 0 && trimmedFrom === trimmedTo) {
    errors.push('self_loop');
  }

  if (!(KNOWLEDGE_EDGE_TYPES as readonly string[]).includes(input.type)) {
    errors.push('type_invalid');
  }

  return { ok: errors.length === 0, errors };
}

export const MANUAL_EDGE_ERROR_MESSAGE: Record<ManualEdgeInputError, string> = {
  account_id_required: 'account 가 지정되지 않았습니다.',
  from_required: 'from 노드를 선택하세요.',
  to_required: 'to 노드를 선택하세요.',
  self_loop: '같은 노드끼리는 관계를 만들 수 없어요.',
  type_invalid:
    'type 은 contains / belongs_to / depends_on / implements / uses / describes / related_to 중 하나여야 합니다.',
};

/**
 * canonical edge ID 형식 — backend (`functions/index.js` line 1036) 와 일치.
 * 같은 (type, from, to) 튜플은 한 edge 만 존재 — 자연스러운 dedup.
 */
export function composeManualEdgeId(
  type: KnowledgeEdgeType,
  from: string,
  to: string,
): string {
  return `${type}:${from}->${to}`;
}
