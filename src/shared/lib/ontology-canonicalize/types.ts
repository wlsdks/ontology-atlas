/**
 * Canonical node ID 매핑 + stub placeholder 생성.
 *
 * 결정 문서: 2026-04-27-ontology-id-resolution.md
 *  §1 canonical = `<kind>:<id>` (frontmatter id 우선) / 없으면 legacy slug
 *  §2 stub = relates.target 미존재 시 placeholder (kind='unknown')
 */

import type { OntologyEdgeType, OntologyKind } from "@/shared/lib/ontology-frontmatter";

/** canonical mapping 입력 — 추출 노드 + frontmatter (선택). */
export interface CanonicalizeInput {
  /** LLM 이 매긴 임시 ID (output 의 tempId). */
  tempId: string;
  /** node title. legacy slug 의 fallback 키. */
  title: string;
  /** node kind. */
  kind: OntologyKind;
  /** 첫 projectId — legacy slug 의 scope 부에 사용. */
  primaryProjectId?: string;
  /** 문서 frontmatter 의 id. 있으면 우선 적용. */
  frontmatterId?: string;
  /** 문서 frontmatter 의 kind. 있으면 frontmatterId 와 함께 사용. */
  frontmatterKind?: OntologyKind;
}

/** canonical mapping 결과. */
export interface CanonicalIdResult {
  /** 최종 canonical node ID — `<kind>:<idOrSlug>` 형식. */
  canonicalId: string;
  /** 실제 사용된 kind (frontmatter override 있으면 그것). */
  resolvedKind: OntologyKind | "unknown";
  /** 결과 출처 — 디버깅 / 검수 메타. */
  source: "frontmatter-id" | "legacy-slug";
  /** kind 충돌 (frontmatterKind ≠ extracted kind) 시 비어있지 않음. */
  conflictWarning?: string;
}

/** stub placeholder 생성 입력 — 보통 frontmatter relates 처리 중 호출. */
export interface CreateStubInput {
  /** relates.target 이 가리키는 ID (kebab-case). */
  targetId: string;
  /** frontmatter 가 명시한 edge type (보존만, edge 생성 시는 강등). */
  declaredType: OntologyEdgeType;
  /** stub 을 만들게 한 source 노드의 canonical ID — promote 시 edge 복원에 사용. */
  pendingFromId: string;
  /** 근거 문서 ID — evidenceIds 에 들어감. */
  evidenceDocumentId: string;
}

/** stub 노드 — knowledgeApprovedNodes 에 쓸 shape (필수 필드만). */
export interface StubNodeRecord {
  /** canonical ID — `unknown:<targetId>`. */
  id: string;
  /** title — targetId 그대로 (사람 친화는 검수자가 promote 시 갱신). */
  title: string;
  /** 항상 `unknown`. */
  kind: "unknown";
  /** 빈 배열 (project 연결은 promote 시 결정). */
  projectIds: string[];
  /** 근거 문서 ID. */
  evidenceIds: string[];
  /** stub 식별 — 검수 UI 가 이 플래그로 별도 섹션에 노출. */
  isStub: true;
  /** frontmatter 가 명시한 edge type — promote 후 복원. */
  pendingType: OntologyEdgeType;
  /** promote 후 복원할 source canonical ID. */
  pendingFromId: string;
}
