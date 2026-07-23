"use client";

import { Orbit, X } from "lucide-react";

import { CHROME_STATUS_CHIP_CLASS } from "@/shared/ui/chrome-chip";

// 사용자 어휘는 "이것만 보기"(2026-07-23 소유자 결정) — 내부명 realm 은 유지.
export interface TopologyRealmChipProps {
  /** 현재 영역 루트 노드의 제목 (없으면 slug fallback 을 HomePage 가 넣는다). */
  title: string;
  /**
   * 제목 앞 문구 — en "Viewing only". 빈 문자열이면 렌더하지 않는다.
   * (`realm.chipViewing` 템플릿을 HomePage 가 {title} 기준으로 쪼개 주입.)
   */
  beforeLabel: string;
  /** 제목 뒤 문구 — ko "만 보는 중". 제목에 붙여(공백 없이) 렌더한다. */
  afterLabel: string;
  clearAriaLabel: string;
  onClear: () => void;
}

/**
 * "이것만 보기" 상단 중앙 상태 칩 — 지도가 어느 노드만 보는 상태인지 알리고
 * (`{title}만 보는 중` / `Viewing only {title}`) ✕ 로 전체 지도로 복귀한다.
 * `TopologyPathChip` 과 같은 "크롬 그래머" 계약: 상단 중앙 flex 열에 얹혀 새
 * 부유 패널을 늘리지 않는다. 지도 렌더 로직 없음 — 순수 크롬.
 */
export function TopologyRealmChip({
  title,
  beforeLabel,
  afterLabel,
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
      {beforeLabel.trim().length > 0 ? (
        <span className="shrink-0 text-[color:var(--color-text-tertiary)]">{beforeLabel.trim()}</span>
      ) : null}
      {/* 제목은 7rem 캡 + 말줄임 — 상단 중앙 레인은 우측 utility 클러스터와
          고정폭 협상이 없어 긴 제목이 14-inch 에서 검색 타일을 파고든다
          (2026-07-23 실측: "Viewing only" + 무캡 제목 → Search 타일 잘림).
          전체 이름은 원장 헤더·지도 중심 라벨·hover title 이 담당한다.
          suffix("만 보는 중")는 shrink-0 로 항상 생존. */}
      <span className="flex min-w-0 items-baseline" title={`${beforeLabel}${title}${afterLabel}`.trim()}>
        <span
          data-testid="topology-realm-chip-title"
          className="max-w-[7rem] truncate font-medium text-[color:var(--color-text-primary)]"
        >
          {title}
        </span>
        {afterLabel.trim().length > 0 ? (
          <span className="shrink-0 text-[color:var(--color-text-tertiary)]">{afterLabel}</span>
        ) : null}
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
