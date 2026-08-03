import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/shared/lib/cn';

/**
 * ChromeTile — 44px 정사각 아이콘 버튼. 크롬 시스템(feat/chrome-system,
 * `docs/prototypes/index-panel-v2-full.html` 승인 시안)의 타일 계층. 순수
 * 표현 컴포넌트 — 상태/네비게이션 로직은 호출부 책임이고, 이 컴포넌트는
 * 시각 계약(44px · 10px radius · 16px 아이콘 · title/aria 필수)만 강제한다.
 * `href` 를 주면 next-intl `Link` 로, 없으면 `button` 으로 렌더한다.
 *
 * 크롬 표면은 이 컴포넌트를 소비해야 한다 — 정사각 44px 버튼을 JSX 안에서
 * 인라인으로 재구현하지 말 것 (`docs/DESIGN-SYSTEM.md` "크롬 문법" 챕터).
 */
interface ChromeTileBaseProps {
  icon: ReactNode;
  /** 툴팁 텍스트이자 접근성 이름의 기본값. */
  title: string;
  'aria-label'?: string;
  /** 현재 목적지/토글 상태 — 인디고 보더로만 표시 (제2 채색 없음). */
  active?: boolean;
  className?: string;
}

export interface ChromeTileButtonProps
  extends ChromeTileBaseProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title' | 'className'> {
  href?: undefined;
}

export interface ChromeTileLinkProps
  extends ChromeTileBaseProps,
    Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'title' | 'className' | 'href'> {
  href: string;
}

export type ChromeTileProps = ChromeTileButtonProps | ChromeTileLinkProps;

const TILE_CLASS =
  'inline-flex size-[var(--chrome-tile-size)] shrink-0 items-center justify-center rounded-[var(--chrome-radius)] border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] text-[color:var(--color-text-tertiary)] shadow-[var(--chrome-shadow)] transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)] [&>svg]:size-[var(--chrome-icon)]';

/**
 * 비활성 — **누를 수 없으면 누를 수 없어 보여야 한다.**
 *
 * `ChromeChip` 과 같은 값·같은 문법이다. 2026-08-03 에 칩 쪽 구멍이 소유자 실보고
 * (*"'최근 변경' 누르니까 아무런 반응이 없는데?"*)로 드러났고, 그때 새로 건
 * 게이트(`tests/contract/disabled-affordance.contract.test.ts`)가 **이 파일의
 * 같은 구멍을 함께 잡았다** — 아무도 실보고하기 전에.
 */
const DISABLED_CLASS =
  'disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:hover:border-[color:var(--chrome-border)] disabled:hover:bg-[color:var(--chrome-surface)] disabled:hover:text-[color:var(--color-text-tertiary)]';

const ACTIVE_CLASS =
  'border-[color:var(--chrome-active-border)] text-[color:var(--color-text-primary)]';

export const ChromeTile = forwardRef<HTMLButtonElement | HTMLAnchorElement, ChromeTileProps>(
  ({ icon, title, active, className, href, 'aria-label': ariaLabelProp, ...rest }, ref) => {
    const ariaLabel = ariaLabelProp ?? title;
    const resolvedClassName = cn(TILE_CLASS, DISABLED_CLASS, active && ACTIVE_CLASS, className);

    if (href) {
      return (
        <Link
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={href}
          title={title}
          aria-label={ariaLabel}
          className={resolvedClassName}
          {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
        >
          {icon}
        </Link>
      );
    }

    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        title={title}
        aria-label={ariaLabel}
        className={resolvedClassName}
        {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {icon}
      </button>
    );
  },
);
ChromeTile.displayName = 'ChromeTile';
