'use client';

import { useEffect, useRef } from 'react';
import {
  useTerritories,
  writeGalaxy,
  writeTerritories,
  writeView3d,
} from '@/shared/lib/appearance-preferences';
import type { HomeRouteState } from './url-state';
import type { HomeRouteStateUpdateOptions } from './use-home-route-state';

/**
 * Keeps `?view=territories` and the view picker's stored choice saying the same thing.
 *
 * The picker stores the choice (like Galaxy and the 3D arrangements), so the map keeps the view
 * a reader chose across visits. The address carries it too, so a link opens Territories and a
 * reload keeps it. On arrival an address that names the view wins, because it is something
 * someone handed over; after that the stored choice leads and the address follows it.
 */
export function useTerritoriesViewSync(
  routeMapView: HomeRouteState['mapView'],
  setRouteState: (
    updater: Partial<HomeRouteState>,
    options?: HomeRouteStateUpdateOptions,
  ) => void,
): void {
  const stored = useTerritories();
  const arrivedRef = useRef(false);
  useEffect(() => {
    if (!arrivedRef.current) {
      arrivedRef.current = true;
      if (routeMapView === 'territories' && !stored) {
        writeGalaxy(false);
        writeView3d(false);
        writeTerritories(true);
        return;
      }
    }
    const wanted = stored ? 'territories' : null;
    if (routeMapView !== wanted) setRouteState({ mapView: wanted }, { replace: true });
  }, [stored, routeMapView, setRouteState]);
}
