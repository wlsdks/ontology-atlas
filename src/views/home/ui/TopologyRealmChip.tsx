"use client";

import { Orbit, X } from "lucide-react";

import { CHROME_STATUS_CHIP_CLASS } from "@/shared/ui/chrome-chip";

export interface TopologyRealmChipProps {
  /** 현재 영역 루트 노드의 제목 (없으면 slug fallback 을 HomePage 가 넣는다). */
  title: string;
  /** i18n prefix — "영역" / "Realm". */
  prefixLabel: string;
  clearAriaLabel: string;
  onClear: () => void;
}

/**
 * S4 "영역 전개" 상단 중앙 상태 칩 — 지도가 어느 노드의 세계로 전환됐는지 알리고
 * (`영역: {title}`) ✕ 로 전체 지도로 복귀한다. `TopologyPathChip` 과 같은 "크롬
 * 그래머" 계약: 상단 중앙 flex 열에 얹혀 새 부유 패널을 늘리지 않는다. 지도 렌더
 * 로직 없음 — 순수 크롬.
 */
export function TopologyRealmChip({
  title,
  prefixLabel,
  clearAriaLabel,
  onClear,
}: TopologyRealmChipProps) {
  return (
    <div
      data-testid="topology-realm-chip"
      role="status"
      className={CHROME_STATUS_CHIP_CLASS}
    >
      <Orbit size={14} aria-hidden className="shrink-0 text-[color:var(--color-text-tertiary)]" />
      <span className="shrink-0 text-[color:var(--color-text-tertiary)]">{prefixLabel}</span>
      <span data-testid="topology-realm-chip-title" className="min-w-0 truncate font-medium text-[color:var(--color-text-primary)]">
        {title}
      </span>
      <button
        type="button"
        onClick={onClear}
        aria-label={clearAriaLabel}
        data-testid="topology-realm-chip-clear"
        className="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)]"
      >
        <X size={13} aria-hidden />
      </button>
    </div>
  );
}
