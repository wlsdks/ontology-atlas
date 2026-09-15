'use client';

import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@/shared/lib/use-prefers-reduced-motion';

export interface MapEntryLoadingVisualProps {
  title: string;
  description: string;
  /** Product description for static HTML and crawlers. On screen, the loader is the protagonist. */
  headline?: string;
  lede?: string;
}

/** Map cold boot keeps one centered status and a quiet point of light. */
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
      className="flex h-full min-h-full flex-1 items-center justify-center bg-[color:var(--color-canvas)] px-6 py-10"
    >
      {headline || lede ? (
        <div className="sr-only">
          {headline ? <h1>{headline}</h1> : null}
          {lede ? <p>{lede}</p> : null}
        </div>
      ) : null}
      <MapEntryLoadingScene title={title} description={description} />
    </main>
  );
}

export function MapEntryLoadingScene({ title, description }: Pick<MapEntryLoadingVisualProps, "title" | "description">) {
  return (
      <div
        role="status"
        aria-live="polite"
        data-map-loading-layout="centered"
        className="flex max-w-sm flex-col items-center px-4 text-center"
      >
        <MapWaitCluster />
        <p className="mt-4 text-title font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {title}
        </p>
        <p className="mt-1.5 max-w-xs break-keep text-body leading-body text-[color:var(--color-text-tertiary)]">
          {description}
        </p>
      </div>
  );
}

const WAIT_POINTS = [
  [35, 41, 1.4],
  [54, 72, 1.1],
  [72, 30, 1.2],
  [106, 25, 1],
  [121, 68, 1.35],
  [145, 43, 1.05],
] as const;

function MapWaitCluster() {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const cluster = ref.current;
    if (!cluster || reducedMotion) return;
    if (typeof IntersectionObserver === 'undefined') {
      cluster.dataset.mapWaitMotion = 'still';
      return;
    }
    let intersecting = true;
    const update = () => {
      cluster.dataset.mapWaitMotion = !document.hidden && intersecting ? 'running' : 'paused';
    };
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = entry?.isIntersecting === true;
      update();
    });
    observer.observe(cluster);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, [reducedMotion]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-testid="map-wait-cluster"
      data-map-wait-motion={reducedMotion ? 'still' : 'running'}
      className="map-wait-cluster relative h-28 w-44 max-w-full"
    >
      <span className="map-wait-halo absolute inset-0" />
      <svg className="absolute inset-0 size-full" viewBox="0 0 176 112" fill="none">
        {WAIT_POINTS.map(([cx, cy, radius]) => (
          <circle
            key={`${cx}-${cy}`}
            className="map-wait-point"
            cx={cx}
            cy={cy}
            r={radius}
            fill="var(--color-text-quaternary)"
          />
        ))}
        <circle cx="88" cy="54" r="9" fill="var(--color-indigo-line-a06)" />
        <circle cx="88" cy="54" r="4" fill="var(--color-indigo-accent)" />
        <circle cx="89" cy="53" r="1" fill="var(--color-text-primary)" />
      </svg>
    </div>
  );
}
