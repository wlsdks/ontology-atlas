"use client";

import { ArrowLeft, X } from "lucide-react";
import { Link } from "@/i18n/navigation";

export interface TopologyInsightsReturnChipProps {
  /** 복귀 목적지 — 원래 보던 인사이트 탭 (`buildOntologyInsightsReturnHref`). */
  href: string;
  label: string;
  ariaLabel: string;
  dismissAriaLabel: string;
  /** 명시 dismiss — URL 의 `via` 마커를 지운다 (칩 수명 계약의 유일한 제거 경로). */
  onDismiss: () => void;
}

/**
 * 인사이트발 딥링크(`?via=insights:<tab>`)로 지도에 진입했을 때만 뜨는
 * "인사이트로 돌아가기" 복귀 칩 — `TopologyPathChip` 과 같은 상단 중앙
 * "chrome grammar" 열(`SearchHint` 슬롯)에 마운트되는 transient chrome 이다.
 * 브라우저 뒤로가기는 지도 안 상호작용마다 history 가 쌓여 복귀 비용이
 * 커지므로, 원래 탭으로 한 번에 돌아가는 화면 내 어포던스를 제공한다.
 *
 * 수명 계약(url-state `insightsReturnTab` 참조): 지도 탐색 중에는 유지,
 * 제거는 X dismiss 뿐. 칩 클릭(복귀 Link)은 마커를 지우지 않는다. Esc
 * 사다리(M-7, `topology-esc-ladder.ts`)에는 불참 — 포커스를 소유하는
 * 표면이 아니다.
 */
export function TopologyInsightsReturnChip({
  href,
  label,
  ariaLabel,
  dismissAriaLabel,
  onDismiss,
}: TopologyInsightsReturnChipProps) {
  return (
    <div
      data-testid="topology-insights-return-chip"
      className="topology-ui-scale pointer-events-auto flex h-[var(--chrome-tile-size)] max-w-full items-center gap-1.5 rounded-[var(--chrome-radius)] border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] px-3 text-[12.5px] text-[color:var(--color-text-secondary)] shadow-[var(--chrome-shadow)]"
    >
      <Link
        href={href}
        aria-label={ariaLabel}
        data-testid="topology-insights-return-chip-link"
        className="flex min-w-0 items-center gap-1.5 transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]"
      >
        <ArrowLeft
          size={14}
          aria-hidden
          className="shrink-0 text-[color:var(--color-text-tertiary)]"
        />
        <span className="min-w-0 truncate">{label}</span>
      </Link>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissAriaLabel}
        data-testid="topology-insights-return-chip-dismiss"
        className="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)]"
      >
        <X size={13} aria-hidden />
      </button>
    </div>
  );
}
