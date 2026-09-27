'use client';

import { useTranslations } from 'next-intl';
import { BrandWaitingMark } from './brand-waiting-mark';

/**
 * States one fact: the screen has not arrived. Static export bakes the nearest Suspense
 * fallback into each client route's HTML, and a `null` fallback ships a body without `#main`,
 * so "broken", "empty" and "loading" look alike. It appears after a 400ms `animation-delay`,
 * which reduced motion keeps, so a fast entry never flashes it. `data-route-loading`
 * keeps `RouteFocusManager` from treating it as the destination.
 */
export function RouteLoadingFallback({embedded=false}:{embedded?:boolean}={}) {
  const Container=embedded?'div':'main';
  const t = useTranslations('nav');
  return (
    <Container
      id={embedded?undefined:"main"}
      tabIndex={-1}
      data-route-loading="true"
      data-testid="route-loading-fallback"
      aria-busy="true"
      // Viewport height belongs to the shell; a page root only fills its slot.
      className="flex h-full min-h-full flex-1 items-center justify-center bg-[color:var(--color-canvas)] p-6"
    >
      <div
        role="status"
        className="route-loading-in flex flex-col items-center gap-3 text-label text-[color:var(--color-text-quaternary)]"
      >
        <BrandWaitingMark active initialVisibility="visible" />
        <p>{t('surfaceLoading')}</p>
      </div>
    </Container>
  );
}
