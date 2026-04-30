/**
 * Manual editor v0 — `addManualKnowledgeNode` 의 입력 계약 + 순수 validation.
 *
 * Firestore rules (firestore.rules `knowledgeApprovedNodes` create 절) 가 같은
 * 제약을 서버에서도 강제한다. 이 모듈은 rules 호출 전에 클라이언트가 친절한
 * 에러 메시지를 만들 수 있도록 동일 검증을 순수 함수로 노출한다.
 */

export type ManualNodeKind =
  | 'project'
  | 'domain'
  | 'capability'
  | 'element'
  | 'document';

export const MANUAL_NODE_KINDS: readonly ManualNodeKind[] = [
  'project',
  'domain',
  'capability',
  'element',
  'document',
] as const;

export interface AddManualKnowledgeNodeInput {
  accountId: string;
  /** 사용자가 확정한 canonical node ID (예: `capability.foo-bar`). slug 추천을
   *  수용할 수도, 직접 override 할 수도 있다. 비어 있으면 검증 실패. */
  id: string;
  title: string;
  kind: ManualNodeKind;
  projectIds?: string[];
  parentId?: string;
  summary?: string;
  manualNote?: string;
}

export type ManualNodeInputError =
  | 'account_id_required'
  | 'id_required'
  | 'id_invalid_format'
  | 'title_required'
  | 'kind_invalid';

export interface ManualNodeInputValidation {
  ok: boolean;
  errors: ManualNodeInputError[];
}

/** Firestore document ID 가 허용하는 안전 형식. ASCII 영숫자 + `.`,`-`,`_`,`:`. */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export function validateManualKnowledgeNodeInput(
  input: AddManualKnowledgeNodeInput,
): ManualNodeInputValidation {
  const errors: ManualNodeInputError[] = [];

  if (!input.accountId || input.accountId.trim().length === 0) {
    errors.push('account_id_required');
  }

  const trimmedId = (input.id ?? '').trim();
  if (trimmedId.length === 0) {
    errors.push('id_required');
  } else if (!ID_PATTERN.test(trimmedId)) {
    errors.push('id_invalid_format');
  }

  if (!input.title || input.title.trim().length === 0) {
    errors.push('title_required');
  }

  if (!(MANUAL_NODE_KINDS as readonly string[]).includes(input.kind)) {
    errors.push('kind_invalid');
  }

  return { ok: errors.length === 0, errors };
}

/** UI 표시용 에러 메시지 — 한국어 한 줄. */
export const MANUAL_NODE_ERROR_MESSAGE: Record<ManualNodeInputError, string> = {
  account_id_required: 'account 가 지정되지 않았습니다.',
  id_required: 'ID 를 입력하세요.',
  id_invalid_format: 'ID 는 영문/숫자/`.`/`-`/`_`/`:` 만 사용할 수 있습니다.',
  title_required: '제목을 입력하세요.',
  kind_invalid:
    'kind 는 project / domain / capability / element / document 중 하나여야 합니다.',
};
