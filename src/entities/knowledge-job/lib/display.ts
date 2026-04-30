import type { KnowledgeJobStatus } from "../model";

export const KNOWLEDGE_JOB_STATUS_OPTIONS = [
  { value: "queued", label: "대기 중" },
  { value: "leased", label: "작업 할당" },
  { value: "processing", label: "추출 중" },
  { value: "succeeded", label: "성공" },
  { value: "failed", label: "실패" },
  { value: "superseded", label: "대체됨" },
] as const;

export function getKnowledgeJobStatusLabel(
  status: KnowledgeJobStatus | string | undefined,
): string {
  switch ((status ?? "").trim().toLowerCase()) {
    case "queued":
      return "대기 중";
    case "leased":
      return "작업 할당";
    case "processing":
      return "추출 중";
    case "succeeded":
      return "성공";
    case "failed":
      return "실패";
    case "superseded":
      return "대체됨";
    default:
      return status || "상태 없음";
  }
}

/**
 * 프로젝트 카드 상태 도트와 동일한 primitive 4색 — UI 전체가 "단일 인디고 + 상태
 * 도트"만 유지하도록 Badge에 넣을 때도 이 팔레트만 사용한다.
 */
export type KnowledgeJobStatusDotColor =
  | "success"
  | "warning"
  | "paused"
  | "neutral";

export function getKnowledgeJobStatusDotColor(
  status: KnowledgeJobStatus | string | undefined,
): KnowledgeJobStatusDotColor {
  switch ((status ?? "").trim().toLowerCase()) {
    case "processing":
    case "leased":
      return "warning"; // 진행 중 — 지켜볼 상태
    case "succeeded":
      return "success";
    case "failed":
      return "paused"; // 오렌지 — 조치가 필요한 상태
    case "queued":
    case "superseded":
    default:
      return "neutral";
  }
}
