'use client';

import { useEffect, useRef } from 'react';
import {
  useHexBoard,
  useTerritories,
  writeGalaxy,
  writeHexBoard,
  writeTerritories,
  writeView3d,
} from '@/shared/lib/appearance-preferences';
import type { HomeRouteState } from './url-state';
import type { HomeRouteStateUpdateOptions } from './use-home-route-state';

/**
 * Keeps `?view=territories` (or `?view=hex`) and the view picker's stored choice saying the same thing.
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
  const territories = useTerritories();
  const hexBoard = useHexBoard();
  const stored = hexBoard ? 'hex' : territories ? 'territories' : null;
  const arrivedRef = useRef(false);
  useEffect(() => {
    if (!arrivedRef.current) {
      arrivedRef.current = true;
      if (routeMapView && routeMapView !== stored) {
        writeGalaxy(false);
        writeView3d(false);
        writeTerritories(routeMapView === 'territories');
        writeHexBoard(routeMapView === 'hex');
        return;
      }
    }
    const wanted = stored;
    if (routeMapView !== wanted) setRouteState({ mapView: wanted }, { replace: true });
  }, [stored, routeMapView, setRouteState]);
}
