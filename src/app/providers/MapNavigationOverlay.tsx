'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { cancelMapNavigation, useMapNavigationPending } from '@/shared/lib/map-navigation-pending';
import { resolveActiveNavDestination } from '@/shared/lib/nav-destination';
import { readCrossfadeBudgetMs } from '@/shared/lib/route-view-transition';
import { SKELETON_DELAY_MS, useDelayedVisible } from '@/shared/lib/use-presence';
import { Button, Surface } from '@/shared/ui';
import { MapEntryLoadingScene } from '@/shared/ui/map-entry-loading-visual';

export function MapNavigationOverlay() {
  const pending = useMapNavigationPending();
  const router = useRouter();
  const t = useTranslations('mapEntry');
  const pathname = usePathname() ?? '/';
  const arrived = useRef<number | null>(null);
  const sceneDue = useDelayedVisible(pending !== null, readCrossfadeBudgetMs() + SKELETON_DELAY_MS);
  const [sceneVisible, setSceneVisible] = useState(false);
  if (sceneDue && !sceneVisible) setSceneVisible(true);
  useEffect(() => () => cancelMapNavigation(), []);
  useEffect(() => {
    if (!pending) { arrived.current = null; return; }
    if (resolveActiveNavDestination(pathname) === 'map') { arrived.current = pending.id; return; }
    const from = pending.from.split(/[?#]/, 1)[0].replace(/\/$/, '');
    if (arrived.current === pending.id || pathname.replace(/\/$/, '') !== from) cancelMapNavigation(pending.id);
  }, [pathname, pending]);
  return (
    <Surface open={pending !== null} motion="overlay" data-testid="map-navigation-wait" data-map-navigation-phase={pending?.phase}
      onExited={() => setSceneVisible(false)}
      data-map-navigation-scene={sceneVisible ? 'shown' : 'held'}
      className="fixed inset-y-0 left-0 right-0 z-30 flex flex-col items-center justify-center bg-[color:var(--color-canvas)] px-6 pb-[var(--topology-mobile-bottom-tab-reserve)] lg:left-[var(--app-nav-rail-width)] lg:pb-0">
      {sceneVisible ? (
        <div className="map-overlay-in flex flex-col items-center gap-8">
          <MapEntryLoadingScene title={t('mapComing')} description={pending?.phase === 'stalled' ? t('takingLonger') : t('loadingDetail')} />
          <Button variant="ghost" size="sm" className="atlas-touch-floor" onClick={() => {
            const from = pending?.from;
            cancelMapNavigation();
            if (from) router.replace(from);
          }}>{t('returnToPrevious')}</Button>
        </div>
      ) : null}
    </Surface>
  );
}
