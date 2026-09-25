'use client';

import { useEffect, useRef } from 'react';
import {
  useGalaxy,
  useMapArrangement,
  useTerritories,
  useView3d,
  writeGalaxy,
  writeMapArrangement,
  writeTerritories,
  writeView3d,
} from '@/shared/lib/appearance-preferences';
import type { HomeMapView, HomeRouteState } from './url-state';
import type { HomeRouteStateUpdateOptions } from './use-home-route-state';

/** Stores a view named by an address, writing all the flags as the view picker does. */
function applyMapView(view: HomeMapView): void {
  writeTerritories(view === 'territories');
  if (view === 'territories' || view === 'galaxy') {
    writeGalaxy(view === 'galaxy');
    writeView3d(false);
    return;
  }
  // The arrangement first, then 3D on — the picker's own order, so the dome assembles once.
  writeGalaxy(false);
  writeMapArrangement(view);
  writeView3d(true);
}

/**
 * Keeps `?view=` and the view picker's stored choice saying the same thing.
 *
 * The picker stores the choice, so the map keeps the view a reader chose across visits. The
 * address carries it too, so a link opens the same view and a reload keeps it. On arrival an
 * address that names a view wins, because it is something someone handed over; after that the
 * stored choice leads and the address follows it.
 *
 * Every view the picker offers is addressable (interaction audit, 2026-09-25): only Territories
 * used to be, so a reload or a shared link on Strata, Neural or Galaxy fell back to the flat
 * map. The flat map is the absence of the parameter.
 */
export function useMapViewSync(
  routeMapView: HomeRouteState['mapView'],
  setRouteState: (
    updater: Partial<HomeRouteState>,
    options?: HomeRouteStateUpdateOptions,
  ) => void,
): void {
  const territories = useTerritories();
  const galaxy = useGalaxy();
  const view3d = useView3d();
  const arrangement = useMapArrangement();
  // The picker's own precedence (`View3dMenu`), so both read one view from the same flags.
  const stored: HomeMapView | null = view3d
    ? arrangement
    : territories
      ? 'territories'
      : galaxy
        ? 'galaxy'
        : null;
  const arrivedRef = useRef(false);
  useEffect(() => {
    if (!arrivedRef.current) {
      arrivedRef.current = true;
      if (routeMapView !== null && routeMapView !== stored) {
        applyMapView(routeMapView);
        return;
      }
    }
    if (routeMapView !== stored) setRouteState({ mapView: stored }, { replace: true });
  }, [stored, routeMapView, setRouteState]);
}
