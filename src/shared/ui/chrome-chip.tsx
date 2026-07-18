import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

/**
 * ChromeChip — 라벨 버튼(44px 높이 · 아이콘 14px + 텍스트 + 선택적 kbd 캡).
 * 크롬 시스템(feat/chrome-system, `docs/prototypes/index-panel-v2-full.html`
 * 승인 시안)의 칩 계층 — ChromeTile 과 같은 표면(radius·surface·shadow)을
 * 공유하지만 라벨/kbd 를 위해 폭이 늘어난다. 순수 표현 컴포넌트 — 클릭
 * 핸들러/상태는 호출부가 소유.
 *
 * `compact` 는 라벨을 sr-only 로 감추고 폭을 타일 크기로 좁힌 아이콘-only
 * 모드(좁은 뷰포트/집중 상태 용). `active` 는 인디고 틴트로만 상태 표시
 * (제2 채색 없음). `badge` 는 compact 여부와 무관하게 항상 보이는 소형
 * 카운트 표시(예: 고정 문서 수) — label 과 달리 sr-only 로 감춰지지 않는다.
 */
export interface ChromeChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  icon?: ReactNode;
  /** compact 에서도 계속 보이는 소형 카운트/상태 표시. */
  badge?: ReactNode;
  kbd?: ReactNode;
  active?: boolean;
  compact?: boolean;
  className?: string;
}

const CHIP_CLASS =
  'inline-flex h-[var(--chrome-tile-size)] items-center justify-center gap-2 rounded-[var(--chrome-radius)] border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] px-3.5 text-[12.5px] text-[color:var(--color-text-tertiary)] shadow-[var(--chrome-shadow)] transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] active:bg-[color:var(--chrome-active-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)] [&>svg]:size-3.5 [&>svg]:shrink-0';

const ACTIVE_CLASS =
  'border-[color:var(--chrome-active-border)] bg-[color:var(--chrome-active-surface)] text-[color:var(--color-text-primary)]';

const COMPACT_CLASS = 'w-[var(--chrome-tile-size)] px-0';

export const ChromeChip = forwardRef<HTMLButtonElement, ChromeChipProps>(
  ({ icon, badge, kbd, active, compact, children, className, ...rest }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(CHIP_CLASS, active && ACTIVE_CLASS, compact && COMPACT_CLASS, className)}
      {...rest}
    >
      {icon}
      {children ? (
        <span className={cn('truncate', compact && 'sr-only')}>{children}</span>
      ) : null}
      {badge}
      {kbd ? (
        <span
          aria-hidden="true"
          className={cn(
            'ml-auto shrink-0 rounded border border-[color:var(--color-border-soft)] px-1 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]',
            compact && 'hidden',
          )}
        >
          {kbd}
        </span>
      ) : null}
    </button>
  ),
);
ChromeChip.displayName = 'ChromeChip';
