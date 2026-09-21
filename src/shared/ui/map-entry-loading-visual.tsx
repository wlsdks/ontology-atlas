'use client';

import { useEffect, useId, useRef } from 'react';
import { usePrefersReducedMotion } from '@/shared/lib/use-prefers-reduced-motion';

export interface MapEntryLoadingVisualProps {
  title: string;
  description: string;
  /** Product description for static HTML and crawlers. On screen, the loader is the protagonist. */
  headline?: string;
  lede?: string;
}

/** An indeterminate field assembles around a stable core while the real map prepares. */
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
        className="flex w-full max-w-lg flex-col items-center px-4 text-center"
      >
        <MapWaitCluster />
        <p className="mt-4 text-display font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
          {title}
        </p>
        <p className="mt-3 max-w-sm break-keep text-body-lg text-[color:var(--color-text-tertiary)]">
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
  const glowId = useId();
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
      className="map-wait-cluster relative h-56 w-80 max-w-full"
    >
      <span className="map-wait-halo absolute inset-0" />
      <svg className="absolute inset-0 size-full" viewBox="0 0 360 240" fill="none">
        <defs><radialGradient id={glowId}><stop stopColor="var(--color-indigo-text-soft)" stopOpacity="0.65" /><stop offset="0.18" stopColor="var(--color-indigo-accent)" stopOpacity="0.22" /><stop offset="1" stopColor="var(--color-indigo-accent)" stopOpacity="0" /></radialGradient></defs>
        <ellipse cx="180" cy="120" rx="138" ry="80" fill={`url(#${glowId})`} />
        {[-24, 42, 110].map((angle, index) => <g key={angle} transform={`translate(180 120) rotate(${angle})`}>
          <ellipse rx={84 + index * 14} ry={30 + index * 5} stroke="var(--color-indigo-line-a32)" />
          <g transform={`scale(1 ${0.36})`}>
            <g className={`map-wait-orbit map-wait-orbit-${index}`}>
              <circle cx={84 + index * 14} r="5" fill="var(--color-indigo-text-soft)" />
              <circle cx={84 + index * 14} r="13" fill="var(--color-indigo-line-a13)" />
            </g>
          </g>
        </g>)}
        {WAIT_POINTS.map(([cx, cy, radius]) => (
          <circle
            key={`${cx}-${cy}`}
            className="map-wait-point"
            cx={cx * 2}
            cy={cy * 2}
            r={radius}
            fill="var(--color-text-quaternary)"
          />
        ))}
        <circle cx="180" cy="120" r="20" fill="var(--color-indigo-line-a06)" />
        <circle cx="180" cy="120" r="7" fill="var(--color-indigo-text-soft)" />
        <circle cx="180" cy="120" r="3" fill="var(--color-text-primary)" />
        <path d="M180 98V142M158 120H202" stroke="var(--color-indigo-text-soft)" strokeWidth="0.7" />
      </svg>
    </div>
  );
}
