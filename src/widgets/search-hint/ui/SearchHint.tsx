'use client';

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCcw, Search } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { ChromeChip } from '@/shared/ui/chrome-chip';

interface Props {
  onOpenSearch: () => void;
  /** 자동 정렬 트리거 — 토폴로지 physics reheat. */
  onRelayout: () => void;
  density?: 'default' | 'compact-focus';
  /**
   * Phone selected-node focus에서는 popover가 입력 우선권을 가진다.
   * 검색/정렬 utility lane은 tablet 이상에서만 남겨 hit area 충돌을 피한다.
   */
  phoneFocusSuppressed?: boolean;
  /**
   * path 모드 상태 칩(`TopologyPathChip`, 분석 패널 완전 소멸 2단계 §b) —
   * "상단 중앙 검색 옆"이라는 배치 요구를 이 컴포넌트의 기존 중앙 정렬
   * 계산(`md:left-1/2 md:-translate-x-1/2`)에 얹어 새 절대 위치 계산 없이
   * 만족한다. 이 슬롯이 있을 때만 렌더 — path 모드가 아니면 완전히 비어
   * 기존 검색/정렬 2버튼 레이아웃과 동일하다.
   */
  pathChip?: ReactNode;
  /**
   * 인사이트발 딥링크 복귀 칩(`TopologyInsightsReturnChip`) — pathChip 과 같은
   * "상단 중앙 크롬 열" 문법. 두 칩이 공존해도 같은 flex 열 안에 grouped 로
   * 남아 부유 패널이 늘지 않는다. 슬롯이 비면 렌더 비용 0.
   */
  returnChip?: ReactNode;
  /**
   * S4 "영역 전개" 상태 칩 — pathChip/returnChip 과 같은 "상단 중앙 크롬 열"
   * 문법. 영역 활성일 때만 렌더돼 "영역: {title} ✕" 로 현재 세계를 알리고
   * ✕ 로 전체 지도 복귀한다. 슬롯이 비면 렌더 비용 0.
   */
  realmChip?: ReactNode;
  /**
   * 발자국 트레일 칩(`TopologyTrailChip`, fable 설계) — pathChip/realmChip 과
   * 같은 "상단 중앙 크롬 열" 문법. 세션 방문이 2개 이상일 때만 렌더돼 "걸은 길
   * N개" 로 걸어온 경로를 알린다. 슬롯이 비면 렌더 비용 0.
   */
  trailChip?: ReactNode;
}

const subscribe = () => () => {};
const getIsMac = () => /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);
const getIsMacServer = () => false;
const ARRANGE_FEEDBACK_MS = 950;

/**
 * 상단 중앙 툴바. 자동 정렬 · 검색 2버튼.
 * glassmorphism(backdrop-blur) 금지 룰 준수 — solid panel bg만 사용.
 *
 * feat/chrome-system §6 — ChromeChip(44px·10px radius) 재스킨. 우상단
 * "작업공간" 칩(`HomePage`)도 이후 슬라이스에서 같은 ChromeChip 으로
 * 이관되어 상단 열 전체가 44px 로 수렴했다(feat/chrome-finish — 남은
 * TopologyReviewLink/Create-Node 버튼의 --topology-utility-lane-height
 * 잔재도 같은 슬라이스에서 --chrome-tile-size 로 정리).
 */
export function SearchHint({
  onOpenSearch,
  onRelayout,
  density = 'default',
  phoneFocusSuppressed = false,
  pathChip,
  returnChip,
  realmChip,
  trailChip,
}: Props) {
  const t = useTranslations('searchWidgets.hint');
  const isMac = useSyncExternalStore(subscribe, getIsMac, getIsMacServer);
  const [arranging, setArranging] = useState(false);
  const compact = density === 'compact-focus';

  useEffect(() => {
    if (!arranging) return;
    const timer = window.setTimeout(() => setArranging(false), ARRANGE_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [arranging]);

  return (
    <div
      className={cn(
        "topology-ui-scale pointer-events-auto absolute right-4 top-[4.75rem] z-20 md:left-1/2 md:right-auto md:top-6 md:-translate-x-1/2 xl:top-8",
        phoneFocusSuppressed ? "hidden md:block" : undefined,
      )}
      data-testid="topology-search-action-lane"
      data-search-lane-density={density}
      data-search-lane-contract={
        compact ? 'icon-first-focus-search' : 'labeled-search-utility'
      }
      data-phone-focus-utility-contract={
        phoneFocusSuppressed ? "hidden-below-md-while-node-popover-owns-focus" : undefined
      }
      data-search-lane-compact-width-token={
        compact ? '--topology-search-lane-compact-width' : undefined
      }
      data-search-lane-surface-token="--chrome-surface"
      data-search-lane-border-token="--chrome-border"
      data-search-lane-shadow-token="--chrome-shadow"
    >
      <div className="flex items-center gap-2">
        {returnChip}
        {realmChip}
        {pathChip}
        {trailChip}
        {/* 자동 정렬 — 데스크톱에서만 노출. 모바일에서는 자주 안 쓰는 액션이라
            우상단 floating 버튼이 시각적 무게를 잡아먹는 게 더 큰 손실. 필요하면
            그래프 컨트롤 패널 안에서 트리거. wrapper 의 hidden/md:block 이
            표시 여부를 맡아 ChromeChip 자체 display 유틸과 안 부딪힌다. */}
        <div className="hidden md:block">
          <ChromeChip
            type="button"
            onClick={() => {
              setArranging(true);
              onRelayout();
            }}
            data-testid="topology-auto-arrange"
            data-arranging={arranging ? 'true' : 'false'}
            data-utility-action-token-contract="support-surface-family"
            data-utility-action-surface-token="--chrome-surface"
            data-utility-action-border-token="--chrome-border"
            data-utility-action-hover-surface-token="--color-overlay-2"
            data-utility-action-active-surface-token="--chrome-active-surface"
            data-utility-action-active-border-token="--chrome-active-border"
            data-utility-action-shadow-token="--chrome-shadow"
            data-utility-action-focus-ring-token="--color-indigo-accent"
            icon={<RefreshCcw className={cn(arranging && 'motion-safe:animate-spin')} />}
            active={arranging}
            compact={compact}
            aria-label={t('relayoutAriaLabel')}
            title={t('relayoutTitle')}
          >
            {arranging ? t('relayoutActiveLabel') : t('relayoutLabel')}
          </ChromeChip>
        </div>
        <ChromeChip
          type="button"
          onClick={onOpenSearch}
          data-testid="topology-concept-search"
          data-utility-action-token-contract="support-surface-family"
          data-utility-action-surface-token="--chrome-surface"
          data-utility-action-border-token="--chrome-border"
          data-utility-action-hover-surface-token="--color-overlay-2"
          data-utility-action-shadow-token="--chrome-shadow"
          data-utility-action-focus-ring-token="--color-indigo-accent"
          compact={compact}
          icon={<Search />}
          kbd={isMac ? '⌘K' : 'CtrlK'}
          className={compact ? undefined : 'md:min-w-[176px] xl:min-w-[208px]'}
          aria-label={t('searchAriaLabel')}
          title={t('searchTitle')}
        >
          {t('searchLabel')}
        </ChromeChip>
      </div>
    </div>
  );
}
