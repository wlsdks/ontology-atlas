'use client';

import { useTranslations } from 'next-intl';
import { BrandWaitingMark } from './brand-waiting-mark';

/**
 * The surface that states one fact: the screen has not arrived yet.
 *
 * **Why it exists.** Every full-screen route in this app is a client view using
 * `useSearchParams()`. Static export cannot prerender such a view, so it bakes the nearest
 * Suspense fallback into the HTML instead. When that fallback is `null`, the deployed
 * `index.html` body contains **nothing at all — not even `#main`**. Until the bundle arrives
 * and hydrates, the user sees a black screen with only the rail. On a fast machine that is
 * 120ms and invisible; under CPU or network pressure it stretches into seconds, and for that
 * whole time "broken", "empty vault" and "loading" look identical.
 *
 * The waiting character accompanies that sentence without claiming a read, completion,
 * percentage or measured progress. The entire group keeps the same anti-flash delay.
 *
 * **Why it appears only after 400ms.** Most entries finish sooner, and rendering immediately
 * would flash a caption on every normal entry — worse than the problem being fixed. The
 * delay is a CSS `animation-delay`, not a duration, so it survives the global
 * `prefers-reduced-motion` rule (which only forces duration to 0.01ms): reduced-motion users
 * still see it at 400ms, without a flash.
 *
 * `data-route-loading` marks this temporary `#main` so `RouteFocusManager` does not mistake
 * it for the destination and send focus into it.
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
