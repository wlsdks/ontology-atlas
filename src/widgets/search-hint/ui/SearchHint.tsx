'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCcw, Search } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

interface Props {
  onOpenSearch: () => void;
  /** 자동 정렬 트리거 — 토폴로지 physics reheat. */
  onRelayout: () => void;
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
}: Props) {
  const t = useTranslations('searchWidgets.hint');
  const isMac = useSyncExternalStore(subscribe, getIsMac, getIsMacServer);
  const [arranging, setArranging] = useState(false);
  const pillClass =
    'h-11 rounded-full border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] shadow-[0_10px_26px_rgba(0,0,0,0.14)]';

  useEffect(() => {
    if (!arranging) return;
    const timer = window.setTimeout(() => setArranging(false), ARRANGE_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [arranging]);

  return (
    <div
      data-interactive-overlay="true"
      className="topology-ui-scale pointer-events-auto absolute right-4 top-[4.75rem] z-20 md:left-1/2 md:right-auto md:top-6 md:-translate-x-1/2 xl:top-8"
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
          className={cn(
            'hidden h-11 items-center gap-2 overflow-hidden px-4 text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)] active:bg-[color:var(--color-overlay-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] data-[arranging=true]:border-[color:rgba(139,151,255,0.44)] data-[arranging=true]:text-[color:var(--color-text-primary)] md:flex',
            pillClass,
          )}
          aria-label={t('relayoutAriaLabel')}
          title={t('relayoutTitle')}
        >
          <RefreshCcw
            size={14}
            className={arranging ? 'motion-safe:animate-spin' : undefined}
          />
          <span className="hidden md:inline">
            {arranging ? t('relayoutActiveLabel') : t('relayoutLabel')}
          </span>
        </button>
        <button
          type="button"
          onClick={onOpenSearch}
          className={cn(
            'group flex h-11 items-center gap-2 overflow-hidden px-3.5 text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors active:bg-[color:rgba(94,106,210,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] md:min-w-[176px] md:gap-2.5 md:pl-4 md:text-[color:var(--color-text-tertiary)] md:hover:text-[color:var(--color-text-primary)] md:active:bg-[color:var(--color-overlay-1)] xl:min-w-[208px]',
            pillClass,
          )}
          aria-label={t('searchAriaLabel')}
          title={t('searchTitle')}
        >
          <Search
            size={14}
            className="text-[color:var(--color-text-secondary)] md:text-[color:var(--color-text-tertiary)] md:group-hover:text-[color:var(--color-text-secondary)]"
          />
          <span className="hidden md:inline md:group-hover:text-[color:var(--color-text-primary)]">
            {t('searchLabel')}
          </span>
          <span
            aria-hidden="true"
            className="hidden items-center gap-0.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)] md:flex"
          >
            {isMac ? '⌘' : 'Ctrl'}
            <span>K</span>
          </span>
        </button>
      </div>
    </div>
  );
}
