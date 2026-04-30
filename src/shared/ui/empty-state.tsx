import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

interface EmptyStateProps {
  /**
   * 큰 제목 — empty 상황 한 줄 요약. ReactNode 라 안에 inline link 등을
   * 넣어도 된다 (페이지 본문 통째 비어 한 문장만 띄울 때 흔한 패턴).
   */
  title: ReactNode;
  /** 부연 설명, 다음 행동 안내. ReactNode 라 안에 Link 등을 넣을 수 있다. */
  description?: ReactNode;
  /** 우하단/하단 primary 액션 (버튼, 링크 등) */
  action?: ReactNode;
  /** 조금 더 크게 full-bleed 로 보여야 할 때 */
  size?: 'compact' | 'regular';
  /**
   * 보더 톤. 기본 `dashed` 는 "여긴 채울 자리야" 신호 (목록 / 카드 영역).
   * `solid` 는 페이지 전체가 비어 있는 상황 (페이지 본문 한복판) 에 더 어울림.
   */
  tone?: 'dashed' | 'solid';
  /**
   * 정렬. `left` (기본) 는 카드 / 목록 위 ㅏ안의 일관된 흐름. `center` 는
   * 페이지 본문이 통째로 비어 단 한 문장만 보여줄 때.
   */
  align?: 'left' | 'center';
  className?: string;
}

/**
 * 리스트/섹션이 비어 있을 때 공통 UX 를 제공. 기본 톤은 dashed border ·
 * subdued bg · 좌측 정렬 · title + description + action. 페이지 전체가
 * 비어 있는 surface 는 `tone="solid"` + `align="center"` 로 한 문장만
 * 가운데에 띄우는 패턴으로 호출.
 */
export function EmptyState({
  title,
  description,
  action,
  size = 'regular',
  tone = 'dashed',
  align = 'left',
  className,
}: EmptyStateProps) {
  const borderClass =
    tone === 'dashed'
      ? 'border-dashed border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)]'
      : 'border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)]';
  const padClass = size === 'compact' ? 'px-4 py-4' : 'px-5 py-6';
  // align=center 는 페이지 본문 통째로 비어 한 문장만 띄울 때 — 패딩 키움.
  const centerPadOverride = align === 'center' ? 'px-6 py-10' : null;

  return (
    <div
      className={cn(
        'rounded-2xl border',
        borderClass,
        centerPadOverride ?? padClass,
        align === 'center' && 'text-center',
        className,
      )}
      data-empty-tone={tone}
      data-empty-align={align}
    >
      <p
        className={cn(
          'font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]',
          size === 'compact' ? 'text-sm' : 'text-[15px]',
          // align=center 한 문장 패턴 — 본문 톤 (h1 무게 없이 secondary 색).
          align === 'center' && 'font-normal text-sm text-[color:var(--color-text-tertiary)]',
        )}
      >
        {title}
      </p>
      {description ? (
        <p
          className={cn(
            'leading-6 text-[color:var(--color-text-tertiary)]',
            size === 'compact' ? 'mt-1 text-xs' : 'mt-2 text-sm',
          )}
        >
          {description}
        </p>
      ) : null}
      {action ? (
        <div
          className={cn(
            'mt-4 flex flex-wrap gap-2',
            align === 'center' && 'justify-center',
          )}
        >
          {action}
        </div>
      ) : null}
    </div>
  );
}
