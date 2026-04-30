import type {
  KnowledgeDocumentMetadataPreviewRow,
  KnowledgeDocumentStatus,
} from "../model";

export const KNOWLEDGE_DOCUMENT_KIND_OPTIONS = [
  { value: "spec", label: "명세서" },
  { value: "note", label: "메모" },
  { value: "guide", label: "가이드" },
  { value: "policy", label: "정책" },
  { value: "decision", label: "결정 기록" },
  { value: "research", label: "리서치" },
  { value: "workflow", label: "워크플로" },
  { value: "api", label: "API 문서" },
] as const;

export const KNOWLEDGE_DOCUMENT_STATUS_OPTIONS = [
  { value: "draft", label: "초안" },
  { value: "ready", label: "추출 완료" },
  { value: "processing", label: "추출 중" },
  { value: "reviewing", label: "검토 중" },
  { value: "published", label: "공개됨" },
  { value: "error", label: "오류" },
] as const;

export function getKnowledgeDocumentKindLabel(kind: string): string {
  switch (kind.trim().toLowerCase()) {
    case "spec":
      return "명세서";
    case "note":
      return "메모";
    case "guide":
      return "가이드";
    case "policy":
      return "정책";
    case "decision":
      return "결정 기록";
    case "research":
      return "리서치";
    case "workflow":
      return "워크플로";
    case "api":
      return "API 문서";
    default:
      return kind || "미분류";
  }
}

export function getKnowledgeDocumentStatusLabel(
  status: KnowledgeDocumentStatus | string | undefined,
): string {
  switch ((status ?? "").trim().toLowerCase()) {
    case "draft":
      return "초안";
    case "ready":
      return "추출 완료";
    case "processing":
      return "추출 중";
    case "reviewing":
      return "검토 중";
    case "published":
      return "공개됨";
    case "error":
      return "오류";
    default:
      return status || "상태 없음";
  }
}

export function getKnowledgeMetadataFieldLabel(
  field: KnowledgeDocumentMetadataPreviewRow["field"] | string,
): string {
  switch (field) {
    case "title":
      return "제목";
    case "kind":
      return "문서 유형";
    case "projectIds":
      return "연결 프로젝트";
    default:
      return field;
  }
}
