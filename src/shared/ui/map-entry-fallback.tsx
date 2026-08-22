import { getTranslations } from 'next-intl/server';
import { MapEntryLoadingVisual } from './map-entry-loading-visual';

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
    <MapEntryLoadingVisual
      title={t('mapComing')}
      description={t('loadingDetail')}
      headline={t('headline')}
      lede={t('lede')}
    />
  );
}
