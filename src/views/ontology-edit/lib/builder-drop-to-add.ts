import type { ManualNodeKind } from "@/entities/knowledge-graph";

/**
 * "drop to add" (n8n 패턴) — 사용자가 한 노드의 포트에서 선을 끌어 빈 캔버스에
 * 놓으면 그 자리에 새 개념 초안을 만든다. 새 노드의 kind 는 ontology 계층을
 * 한 단계 내려 추론한다: project→domain→capability→element. element 는 잎이라
 * 더 내려갈 곳이 없어 형제(element)로 둔다. 이는 강제 규칙이 아니라 합리적
 * 기본값일 뿐 — 인스펙터에서 얼마든지 바꿀 수 있다.
 *
 * 순수 함수 — React 무관, 단위 테스트 대상.
 */
export function childKindForParent(parentKind: string): ManualNodeKind {
  switch (parentKind) {
    case "project":
      return "domain";
    case "domain":
      return "capability";
    case "capability":
      return "element";
    case "element":
      return "element";
    default:
      // ephemeral / 미상 → 가장 흔한 편집 단위인 capability.
      return "capability";
  }
}
