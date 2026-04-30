import {
  getKnowledgeJobStatusDotColor,
  getKnowledgeJobStatusLabel,
  type KnowledgeJobStatusDotColor,
} from "@/entities/knowledge-job";
import { Badge } from "@/shared/ui";
import { cn } from "@/shared/lib/cn";

/**
 * 추출 작업 상태 배지. 라벨 앞에 primitive dot을 놓아 색 추가 없이 상태 구분.
 *
 * 색 팔레트: success(초록) · warning(노랑) · paused(오렌지) · neutral(회색) —
 * `ProjectCard` 의 statusDotClass 와 동일 컨벤션. 디자인 헌장 §11 의 상태 신호
 * 톤만 사용, 장식적 색은 없음.
 *
 * 호출자: `KnowledgeDocumentDetailPage` 의 job 목록 row.
 */
export function JobStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const dot: KnowledgeJobStatusDotColor = getKnowledgeJobStatusDotColor(status);
  const dotClass =
    dot === "success"
      ? "bg-[color:var(--color-status-success)]"
      : dot === "warning"
        ? "bg-[color:var(--color-status-warning)]"
        : dot === "paused"
          ? "bg-[color:var(--color-status-paused)]"
          : "bg-[color:var(--color-text-quaternary)]";
  return (
    <Badge
      variant={status === "failed" ? "indigo" : "default"}
      className={className}
    >
      <span
        aria-hidden="true"
        className={cn("inline-block h-1.5 w-1.5 rounded-full", dotClass)}
      />
      {getKnowledgeJobStatusLabel(status)}
    </Badge>
  );
}
