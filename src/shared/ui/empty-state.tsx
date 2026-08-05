import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

interface EmptyStateProps {
  /**
   * 큰 제목 — empty 상황 한 줄 요약. ReactNode 라 안에 inline link 등을
   * 넣어도 된다 (페이지 본문 통째 비어 한 문장만 띄울 때 흔한 패턴).
   */
  title: ReactNode;
  /**
   * 제목을 낼 태그. 기본은 `p` — 목록/섹션 안의 빈 상태는 문서 구획이 아니다.
   *
   * **페이지 본문 전체가 이 카드 하나인 자리는 `h1` 로 부른다** (2026-07-29
   * 도그푸딩 실측). 좁은 폭에서 공방이 정직 강등 카드로 바뀌면 그 라우트의
   * heading 요소가 **0개**가 됐다 — 스크린리더 사용자에게는 이 페이지가
   * 무엇인지, 왜 공방이 안 열렸는지 말해 주는 제목이 아예 없는 화면이다.
   * 강등 카드의 계약이 「왜 + 어디로」인데, 그 「왜」를 못 읽으면 계약이
   * 지켜진 게 아니다.
   *
   * 태그만 바뀌고 **보이는 것은 그대로다** — Tailwind preflight 가 heading 의
   * 크기·굵기를 `inherit` 로 리셋하므로 아래 클래스가 계속 결정한다.
   */
  titleAs?: 'p' | 'h1' | 'h2';
  /** 부연 설명, 다음 행동 안내. ReactNode 라 안에 Link 등을 넣을 수 있다. */
  description?: ReactNode;
  /**
   * 라인아트 글리프 슬롯 (lucide 아이콘 등). muted 라운드 사각 안에 담겨
   * "여기에 무엇이 올 자리" 를 조용히 알린다. align=center 에서는 title 위,
   * 그 외에는 title 왼쪽에 놓인다.
   */
  icon?: ReactNode;
  /**
   * 자리표시 스켈레톤. `true` 면 기본 muted 막대 3줄(리스트/차트 형태 암시),
   * ReactNode 면 그 모양을 그대로 그린다. 빈 차트/목록이 "긴 공백" 대신
   * 채워질 형태를 먼저 보여주게 한다 (디자인 전면 정비 #16). 순수 장식 —
   * `aria-hidden`.
   */
  skeleton?: boolean | ReactNode;
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
   * 정렬. `left` (기본) 는 카드 / 목록 안의 일관된 흐름. `center` 는
   * 페이지 본문이 통째로 비어 단 한 문장만 보여줄 때.
   */
  align?: 'left' | 'center';
  className?: string;
}

/** 기본 스켈레톤 — muted 막대 3줄. 리스트/차트가 채워질 형태를 암시. */
function DefaultSkeleton({ align }: { align: 'left' | 'center' }) {
  const widths = ['72%', '52%', '38%'];
  return (
    <div
      aria-hidden
      data-empty-skeleton
      className={cn('flex w-full flex-col gap-2', align === 'center' && 'items-center')}
    >
      {widths.map((w) => (
        <span
          key={w}
          className="block h-2 rounded-full bg-[color:var(--color-overlay-2)]"
          style={{ width: w }}
        />
      ))}
    </div>
  );
}

/**
 * 리스트/섹션이 비어 있을 때 공통 UX 를 제공. 기본 톤은 dashed border ·
 * subdued bg · 좌측 정렬 · (선택)스켈레톤 + 아이콘 + title + description +
 * action. 페이지 전체가 비어 있는 surface 는 `tone="solid"` + `align="center"`
 * 로 한 문장만 가운데에 띄우는 패턴으로 호출.
 */
export function EmptyState({
  title,
  titleAs = 'p',
  description,
  icon,
  skeleton,
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
  const isCenter = align === 'center';

  const TitleTag = titleAs;
  const titleEl = (
    <TitleTag
      className={cn(
        'font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]',
        size === 'compact' ? 'text-body-lg' : 'text-title',
        // align=center 한 문장 패턴 — 본문 톤 (h1 무게 없이 secondary 색).
        isCenter && 'font-normal text-body-lg text-[color:var(--color-text-tertiary)]',
      )}
    >
      {title}
    </TitleTag>
  );

  const descriptionEl = description ? (
    <p
      className={cn(
        'leading-title text-[color:var(--color-text-tertiary)]',
        size === 'compact' ? 'mt-1 text-body' : 'mt-2 text-body-lg',
      )}
    >
      {description}
    </p>
  ) : null;

  const iconEl = icon ? (
    <span
      aria-hidden
      data-empty-icon
      className="inline-flex size-9 flex-none items-center justify-center rounded-card border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-quaternary)] [&>svg]:size-4"
    >
      {icon}
    </span>
  ) : null;

  const skeletonEl = skeleton
    ? typeof skeleton === 'boolean'
      ? <DefaultSkeleton align={align} />
      : (
          <div aria-hidden data-empty-skeleton className={cn('w-full', isCenter && 'flex justify-center')}>
            {skeleton}
          </div>
        )
    : null;

  // 텍스트 블록 — center 면 아이콘이 위, 아니면 왼쪽에 놓인다.
  const textBlock = (
    <div className="min-w-0">
      {titleEl}
      {descriptionEl}
    </div>
  );

  return (
    <div
      className={cn(
        'rounded-panel border',
        borderClass,
        centerPadOverride ?? padClass,
        isCenter && 'text-center',
        className,
      )}
      data-empty-tone={tone}
      data-empty-align={align}
    >
      {skeletonEl ? <div className="mb-4">{skeletonEl}</div> : null}
      {iconEl && !isCenter ? (
        <div className="flex items-start gap-3">
          {iconEl}
          {textBlock}
        </div>
      ) : (
        <>
          {iconEl && isCenter ? <div className="mb-3 flex justify-center">{iconEl}</div> : null}
          {textBlock}
        </>
      )}
      {action ? (
        <div className={cn('mt-4 flex flex-wrap gap-2', isCenter && 'justify-center')}>
          {action}
        </div>
      ) : null}
    </div>
  );
}
