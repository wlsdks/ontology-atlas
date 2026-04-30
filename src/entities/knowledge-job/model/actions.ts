import type { KnowledgeJob, KnowledgeJobActionState } from "./types";

export function resolveKnowledgeJobActionState(
  status: KnowledgeJob["status"],
): KnowledgeJobActionState {
  switch (status) {
    case "failed":
      return {
        canRetry: true,
        canViewResult: false,
        canOpenReplacement: false,
        helperText: "실패 원인을 확인한 뒤 새 job으로 재시도할 수 있습니다.",
      };
    case "succeeded":
      return {
        canRetry: false,
        canViewResult: true,
        canOpenReplacement: false,
        helperText: "추출 결과를 확인하고 다음 단계를 판단합니다.",
      };
    case "superseded":
      return {
        canRetry: false,
        canViewResult: false,
        canOpenReplacement: true,
        helperText: "대체 job으로 이동해 최신 상태를 확인합니다.",
      };
    case "queued":
    case "leased":
    case "processing":
    default:
      return {
        canRetry: false,
        canViewResult: false,
        canOpenReplacement: false,
        helperText: "현재 상태는 읽기 전용입니다.",
      };
  }
}

