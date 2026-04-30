import type { KnowledgeOutput } from "@/entities/knowledge-output";

/**
 * KnowledgeDocumentDetailPage 의 추출 결과 노드 kind → 한글 라벨 매핑.
 *
 * `entities/ontology-class/model/labels.ts` 의 `getOntologyKindLabel` 와 의도적
 * 으로 분리: 이 함수는 **추출 후보** 노드 (`KnowledgeOutput.nodes` 의 미승인
 * tempId 노드) 의 kind 표시용. ontology-class label 은 승인된 노드 / TBox
 * 클래스의 표시용. 두 영역의 kind enum 이 약간 다르고 (`concept` 같은 후보
 * 전용 kind), 라벨 톤도 다름.
 *
 * `미정` fallback 은 빈 string · undefined 입력 보호.
 */
export function resolveNodeKindLabel(kind: string): string {
  if (kind === "document") return "문서";
  if (kind === "project") return "프로젝트";
  if (kind === "domain") return "도메인";
  if (kind === "capability") return "기능";
  if (kind === "element") return "요소";
  if (kind === "concept") return "관련 개념";
  return kind || "미정";
}

/**
 * `KnowledgeOutput.edges[].sourceTempId / targetTempId` 가 가리키는 노드의 사람
 * 친화 title 을 lookup. 매치되는 노드가 없으면 tempId 를 그대로 반환 (fallback).
 *
 * Output 의 edge 표시 / 검수 큐 후보 라인 / 알림 toast 등에서 ID 대신 title 표시.
 */
export function resolveOutputNodeTitle(
  output: KnowledgeOutput,
  tempId: string,
): string {
  return output.nodes.find((node) => node.tempId === tempId)?.title ?? tempId;
}
