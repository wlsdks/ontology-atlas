import { BrandMark } from './brand-mark';

export interface MapEntryLoadingVisualProps {
  title: string;
  description: string;
  /** 정적 HTML과 크롤러가 읽을 제품 설명. 화면에서는 로더가 주인공이다. */
  headline?: string;
  lede?: string;
}

/** 지도 콜드 부트의 한 가지 시각: 중앙 상태 + 회로형 회전 표시. */
export function MapEntryLoadingVisual({
  title,
  description,
  headline,
  lede,
}: MapEntryLoadingVisualProps) {
  return (
    <main
      id="main"
      tabIndex={-1}
      data-route-loading="true"
      data-testid="map-entry-fallback"
      aria-busy="true"
      className="flex h-full min-h-full flex-1 items-center justify-center bg-[color:var(--color-canvas)] px-6 py-10"
    >
      {headline || lede ? (
        <div className="sr-only">
          {headline ? <h1>{headline}</h1> : null}
          {lede ? <p>{lede}</p> : null}
        </div>
      ) : null}
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        data-map-loading-layout="centered"
        className="flex max-w-md flex-col items-center text-center"
      >
        <div className="relative grid size-16 place-items-center" aria-hidden="true">
          <span className="absolute inset-0 rounded-full border border-[color:var(--color-border-soft)]" />
          <span
            data-testid="map-entry-loading-spinner"
            className="absolute inset-1 rounded-full border border-transparent border-r-[color:var(--color-indigo-a46)] border-t-[color:var(--color-indigo-accent)] motion-safe:animate-spin motion-reduce:animate-none"
          />
          <BrandMark
            size={24}
            detail="compact"
            className="size-6 text-[color:var(--color-indigo-accent)]"
          />
        </div>
        <p className="mt-5 text-title font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {title}
        </p>
        <p className="mt-2 break-keep text-body leading-body text-[color:var(--color-text-tertiary)]">
          {description}
        </p>
      </div>
    </main>
  );
}
