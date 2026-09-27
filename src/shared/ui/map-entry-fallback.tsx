import { getTranslations } from 'next-intl/server';
import { MapEntryLoadingVisual } from './map-entry-loading-visual';

/**
 * The server-rendered surface for the map entry routes. Static export makes it the whole page
 * for anything without JS, so it carries the README's published headline instead of "loading".
 * New positioning copy would go through `pnpm po:route`, and there is no install command
 * because nothing is published to npm.
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
