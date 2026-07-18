'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
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
}

const subscribe = () => () => {};
const getIsMac = () => /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);
const getIsMacServer = () => false;
const ARRANGE_FEEDBACK_MS = 950;

/**
 * 상단 중앙 툴바. 자동 정렬 · 검색 2버튼.
 * glassmorphism(backdrop-blur) 금지 룰 준수 — solid panel bg만 사용.
 *
 * feat/chrome-system §6 — ChromeChip(44px·10px radius) 재스킨. 우측 문서함
 * 버튼은 이번 슬라이스 스코프 밖이라 여전히 `--topology-utility-lane-*`
 * 문법 — 같은 상단 열에 두 표면 높이가 과도기적으로 공존한다(합본 시안
 * 확정 후 다음 슬라이스에서 수렴).
 */
export function SearchHint({
  onOpenSearch,
  onRelayout,
  density = 'default',
  phoneFocusSuppressed = false,
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
