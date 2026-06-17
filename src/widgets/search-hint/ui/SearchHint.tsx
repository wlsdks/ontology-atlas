'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCcw, Search } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

interface Props {
  onOpenSearch: () => void;
  /** 자동 정렬 트리거 — 토폴로지 physics reheat. */
  onRelayout: () => void;
  density?: 'default' | 'compact-focus';
}

const subscribe = () => () => {};
const getIsMac = () => /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);
const getIsMacServer = () => false;
const ARRANGE_FEEDBACK_MS = 950;

/**
 * 상단 중앙 툴바. 자동 정렬 · 검색 2버튼.
 * glassmorphism(backdrop-blur) 금지 룰 준수 — solid panel bg만 사용.
 */
export function SearchHint({
  onOpenSearch,
  onRelayout,
  density = 'default',
}: Props) {
  const t = useTranslations('searchWidgets.hint');
  const isMac = useSyncExternalStore(subscribe, getIsMac, getIsMacServer);
  const [arranging, setArranging] = useState(false);
  const compact = density === 'compact-focus';
  const pillClass =
    'h-[var(--topology-utility-lane-height)] rounded-[var(--topology-utility-lane-radius)] border border-[color:var(--topology-utility-lane-border)] bg-[color:var(--topology-utility-lane-surface)] shadow-[var(--topology-utility-lane-shadow)]';

  useEffect(() => {
    if (!arranging) return;
    const timer = window.setTimeout(() => setArranging(false), ARRANGE_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [arranging]);

  return (
    <div
      className="topology-ui-scale pointer-events-auto absolute right-4 top-[4.75rem] z-20 md:left-1/2 md:right-auto md:top-6 md:-translate-x-1/2 xl:top-8"
      data-testid="topology-search-action-lane"
      data-search-lane-density={density}
      data-search-lane-contract={
        compact ? 'icon-first-focus-search' : 'labeled-search-utility'
      }
      data-search-lane-compact-width-token={
        compact ? '--topology-search-lane-compact-width' : undefined
      }
      data-search-lane-surface-token="--topology-utility-lane-surface"
      data-search-lane-border-token="--topology-utility-lane-border"
      data-search-lane-shadow-token="--topology-utility-lane-shadow"
    >
      <div className="flex items-center gap-2">
        {/* 자동 정렬 — 데스크톱에서만 노출. 모바일에서는 자주 안 쓰는 액션이라
            우상단 floating 버튼이 시각적 무게를 잡아먹는 게 더 큰 손실. 필요하면
            그래프 컨트롤 패널 안에서 트리거. */}
        <button
          type="button"
          onClick={() => {
            setArranging(true);
            onRelayout();
          }}
          data-testid="topology-auto-arrange"
          data-arranging={arranging ? 'true' : 'false'}
          data-utility-action-token-contract="support-surface-family"
          data-utility-action-surface-token="--topology-utility-lane-surface"
          data-utility-action-border-token="--topology-utility-lane-border"
          data-utility-action-hover-surface-token="--topology-utility-lane-hover-surface"
          data-utility-action-active-surface-token="--topology-utility-lane-accent-surface"
          data-utility-action-active-border-token="--topology-utility-lane-accent-border"
          data-utility-action-shadow-token="--topology-utility-lane-shadow"
          data-utility-action-focus-ring-token="--topology-utility-lane-focus-ring"
          className={cn(
            'hidden items-center justify-center gap-2 overflow-hidden text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--topology-utility-lane-hover-surface)] hover:text-[color:var(--color-text-primary)] active:bg-[color:var(--topology-utility-lane-accent-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--topology-utility-lane-focus-ring)] data-[arranging=true]:border-[color:var(--topology-utility-lane-accent-border)] data-[arranging=true]:bg-[color:var(--topology-utility-lane-accent-surface)] data-[arranging=true]:text-[color:var(--color-text-primary)] md:flex',
            compact ? 'w-[var(--topology-utility-lane-compact-width)] px-0' : 'px-4',
            pillClass,
          )}
          aria-label={t('relayoutAriaLabel')}
          title={t('relayoutTitle')}
        >
          <RefreshCcw
            size={14}
            className={arranging ? 'motion-safe:animate-spin' : undefined}
          />
          <span className={compact ? 'sr-only' : 'hidden md:inline'}>
            {arranging ? t('relayoutActiveLabel') : t('relayoutLabel')}
          </span>
        </button>
        <button
          type="button"
          onClick={onOpenSearch}
          data-testid="topology-concept-search"
          data-utility-action-token-contract="support-surface-family"
          data-utility-action-surface-token="--topology-utility-lane-surface"
          data-utility-action-border-token="--topology-utility-lane-border"
          data-utility-action-hover-surface-token="--topology-utility-lane-hover-surface"
          data-utility-action-active-surface-token="--topology-utility-lane-accent-surface"
          data-utility-action-shadow-token="--topology-utility-lane-shadow"
          data-utility-action-focus-ring-token="--topology-utility-lane-focus-ring"
          className={cn(
            'group flex items-center justify-center gap-2 overflow-hidden text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors active:bg-[color:var(--topology-utility-lane-accent-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--topology-utility-lane-focus-ring)] md:gap-2.5 md:text-[color:var(--color-text-tertiary)] md:hover:bg-[color:var(--topology-utility-lane-hover-surface)] md:hover:text-[color:var(--color-text-primary)]',
            compact
              ? 'w-[var(--topology-utility-lane-compact-width)] px-0'
              : 'px-3.5 md:min-w-[176px] md:pl-4 xl:min-w-[208px]',
            pillClass,
          )}
          aria-label={t('searchAriaLabel')}
          title={t('searchTitle')}
        >
          <Search
            size={14}
            className="text-[color:var(--color-text-secondary)] md:text-[color:var(--color-text-tertiary)] md:group-hover:text-[color:var(--color-text-secondary)]"
          />
          <span className={compact ? 'sr-only' : 'hidden md:inline md:group-hover:text-[color:var(--color-text-primary)]'}>
            {t('searchLabel')}
          </span>
          <span
            aria-hidden="true"
            className={cn(
              'hidden items-center gap-0.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]',
              compact ? '' : 'md:flex',
            )}
          >
            {isMac ? '⌘' : 'Ctrl'}
            <span>K</span>
          </span>
        </button>
      </div>
    </div>
  );
}
