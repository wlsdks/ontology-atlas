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
  'inline-flex h-[var(--chrome-tile-size)] items-center justify-center gap-2 rounded-[var(--chrome-radius)] border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] px-3.5 text-body text-[color:var(--color-text-tertiary)] shadow-[var(--chrome-shadow)] transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] active:bg-[color:var(--chrome-active-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)] [&>svg]:size-3.5 [&>svg]:shrink-0';

/**
 * S10 결함 1 (소유자 실보고: 1920 에서 영역 칩이 검색/자동정렬 타일보다 큼) —
 * 상단 중앙 크롬 열의 **비-버튼 상태 칩**(영역·복귀·경로)이 `ChromeChip` 과
 * 같은 규격(높이 `--chrome-tile-size`, radius `--chrome-radius`, 보더/서피스/
 * 그림자, 패딩 `px-3.5`)을 공유하게 하는 단일 진실원 클래스. "모든 곳 동일
 * 적용" 계약(`docs/DESIGN-SYSTEM.md` Geometry ladder).
 *
 * ⚠️ `topology-ui-scale` 를 **포함하지 않는다**: 이 칩들은 `SearchHint` 슬롯으로
 * 렌더되고 그 래퍼가 이미 `topology-ui-scale`(≥1920px 에서 `zoom:1.15`)를
 * 건다. `zoom` 은 중첩 시 곱해지므로(1.15×1.15≈1.32) 칩이 자기 자신에 다시
 * 걸면 형제 ChromeChip 보다 커진다 — 바로 이 결함의 원인. 스케일은 래퍼가
 * 소유한다.
 */
export const CHROME_STATUS_CHIP_CLASS =
  'topology-chrome-in pointer-events-auto flex h-[var(--chrome-tile-size)] max-w-full items-center gap-1.5 rounded-[var(--chrome-radius)] border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] px-3.5 text-body text-[color:var(--color-text-secondary)] shadow-[var(--chrome-shadow)]';

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
            'ml-auto shrink-0 rounded border border-[color:var(--color-border-soft)] px-1 py-0.5 font-mono text-caption uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]',
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
