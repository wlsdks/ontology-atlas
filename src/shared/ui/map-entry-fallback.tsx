import { getTranslations } from 'next-intl/server';

/**
 * The server-rendered surface for the map entry routes (`/`, `/topology`).
 *
 * Why it exists separately: those views are client components, so static export
 * bakes the nearest Suspense fallback into the HTML. The generic
 * `RouteLoadingFallback` is **deliberately** designed to say only "this screen is
 * still coming", which is right elsewhere but here becomes **the entire page
 * content**.
 *
 * Measured 2026-07-27: the deployed `/en/topology/` shipped 193KB and contained 142
 * human-readable characters, whose central sentence was "loading the screen". That
 * URL is the demo address the README and the launch assets point at — so that is how
 * anything not running JS (link preview cards, crawlers) and anyone whose bundle has
 * not arrived yet sees the page.
 *
 * **No new copy is written here.** The headline and lead are sentences the README
 * already published; inventing positioning here is a PO-council trigger. No install
 * command either — nothing is published to npm, so that command would be a lie.
 *
 * It is replaced once the map hydrates, so nothing changes for a human eye, and on a
 * slow device there is something to read instead of a blank screen.
 */
export async function MapEntryFallback({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'mapEntry' });

  return (
    <main
      id="main"
      tabIndex={-1}
      data-route-loading="true"
      data-testid="map-entry-fallback"
      aria-busy="true"
      className="flex h-full min-h-full flex-1 flex-col justify-center gap-6 bg-[color:var(--color-canvas)] px-6 py-10 md:px-12"
    >
      <div className="max-w-2xl">
        <h1 className="text-display leading-display font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] break-keep text-[color:var(--color-text-primary)]">
          {t('headline')}
        </h1>
        <p className="mt-3 max-w-xl break-keep text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
          {t('lede')}
        </p>
      </div>

      <p className="max-w-xl break-keep text-body leading-body text-[color:var(--color-text-tertiary)]">
        {t('demoNote')}
      </p>

      {/* That the map is still loading comes last and quietest. This sentence being
          the page's protagonist is the defect this fixes. */}
      <p role="status" className="text-label text-[color:var(--color-text-quaternary)]">
        {t('mapComing')}
      </p>
    </main>
  );
}
