import { useTranslations } from 'use-intl';

import { MapEntryLoadingVisual } from '@/shared/ui/fallbacks/map-entry-loading-visual';

/** The map's loading picture while its screen code arrives, in the window's language. */
export function MapEntryPending() {
  const t = useTranslations('mapEntry');
  return <MapEntryLoadingVisual title={t('mapComing')} description={t('loadingDetail')} />;
}
