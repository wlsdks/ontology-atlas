import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

interface DetailCardProps {
  /** 작은 eyebrow 라벨 (mono, uppercase) */
  eyebrow?: string;
  /** 메인 헤딩 */
  title?: string;
  /** 헤딩 아래 보조 설명 */
  description?: string;
  /** 헤더 우측 액션 영역 (버튼·링크 등) */
  headerAction?: ReactNode;
  /** 본문 */
  children?: ReactNode;
  /** outer className 오버라이드 */
  className?: string;
  /** 헤더 아래 본문 className 오버라이드 */
  contentClassName?: string;
}

/**
 * 프로젝트 상세·사이드바·어드민 등에서 재사용하는 공통 카드 프레임.
 * rounded-[28px] · border · bg-panel 디자인 토큰 통일. 헤더/본문 분리.
 */
export function DetailCard({
  eyebrow,
  title,
  description,
  headerAction,
  children,
  className,
  contentClassName,
}: DetailCardProps) {
  const hasHeader = eyebrow || title || description || headerAction;
  return (
    <article
      className={cn(
        'overflow-hidden rounded-[28px] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)]',
        className,
      )}
    >
      {hasHeader ? (
        <header className="flex items-start justify-between gap-4 border-b border-[color:var(--color-divider)] px-6 py-5 md:px-8">
          <div>
            {eyebrow ? (
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                {eyebrow}
              </p>
            ) : null}
            {title ? (
              <h2 className="mt-2 text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
                {description}
              </p>
            ) : null}
          </div>
          {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
        </header>
      ) : null}
      <div className={cn('px-6 py-5 md:px-8', contentClassName)}>{children}</div>
    </article>
  );
}
