'use client';

import { useTranslations } from 'next-intl';

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
 * **What it does not do.** No spinner, no progress bar, no percentage — it does not pretend
 * to know progress it cannot measure. Exactly one fact is known and exactly one sentence is
 * written.
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
export function RouteLoadingFallback() {
  const t = useTranslations('nav');
  return (
    <main
      id="main"
      tabIndex={-1}
      data-route-loading="true"
      data-testid="route-loading-fallback"
      aria-busy="true"
      // Viewport height belongs to the shell; a page root only fills its slot.
      className="flex h-full min-h-full flex-1 items-center justify-center bg-[color:var(--color-canvas)] p-6"
    >
      <p
        role="status"
        className="route-loading-in text-label text-[color:var(--color-text-quaternary)]"
      >
        {t('surfaceLoading')}
      </p>
    </main>
  );
}
