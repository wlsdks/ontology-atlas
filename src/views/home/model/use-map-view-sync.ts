'use client';

import { useEffect, useRef } from 'react';
import {
  useGalaxy,
  useHexBoard,
  useMapArrangement,
  useTerritories,
  useView3d,
  writeGalaxy,
  writeHexBoard,
  writeMapArrangement,
  writeTerritories,
  writeView3d,
} from '@/shared/lib/appearance-preferences';
import type { HomeMapView, HomeRouteState } from './url-state';
import type { HomeRouteStateUpdateOptions } from './use-home-route-state';

/** Writes all the flags as the view picker does. */
function applyMapView(view: HomeMapView): void {
  writeTerritories(view === 'territories');
  writeHexBoard(view === 'hex');
  if (view === 'territories' || view === 'galaxy' || view === 'hex') {
    writeGalaxy(view === 'galaxy');
    writeView3d(false);
    return;
  }
  // The picker's own order, so the dome assembles once.
  writeGalaxy(false);
  writeMapArrangement(view);
  writeView3d(true);
}

/**
 * `arrival`: an address naming a view wins and is adopted, else the stored view is written
 * once. `stored-changed`: the address follows the reader's pick, the only steady-state
 * write. `address-changed`: a named view is adopted; no view leaves the address alone, or it
 * ping-pongs with other writers until WebKit refuses `history.replaceState`.
 */
export function decideMapViewSync(
  cause: 'arrival' | 'stored-changed' | 'address-changed',
  stored: HomeMapView | null,
  address: HomeMapView | null,
): { adopt: HomeMapView | null; write: HomeMapView | null | undefined } {
  if (cause === 'stored-changed') {
    return { adopt: null, write: address === stored ? undefined : stored };
  }
  if (address && address !== stored) return { adopt: address, write: undefined };
  if (cause === 'arrival' && stored && !address) return { adopt: null, write: stored };
  return { adopt: null, write: undefined };
}

/**
 * Keeps `?view=` and the picker's stored choice equal, writing the address only on a pick or
 * arrival. Every picker view is addressable; the flat map is the parameter's absence.
 */
export function useMapViewSync(
  routeMapView: HomeRouteState['mapView'],
  setRouteState: (
    updater: Partial<HomeRouteState>,
    options?: HomeRouteStateUpdateOptions,
  ) => void,
): void {
  const territories = useTerritories();
  const hexBoard = useHexBoard();
  const galaxy = useGalaxy();
  const view3d = useView3d();
  const arrangement = useMapArrangement();
  // The picker's precedence (`View3dMenu`), so both read one view from the same flags.
  const stored: HomeMapView | null = view3d
    ? arrangement
    : hexBoard
      ? 'hex'
      : territories
        ? 'territories'
        : galaxy
          ? 'galaxy'
          : null;
  const lastRef = useRef<{ stored: HomeMapView | null; address: HomeMapView | null } | null>(null);
  useEffect(() => {
    const last = lastRef.current;
    lastRef.current = { stored, address: routeMapView };
    const cause = !last
      ? 'arrival'
      : last.stored !== stored
        ? 'stored-changed'
        : last.address !== routeMapView
          ? 'address-changed'
          : null;
    if (!cause) return;
    const { adopt, write } = decideMapViewSync(cause, stored, routeMapView);
    if (adopt) {
      applyMapView(adopt);
      lastRef.current = { stored: adopt, address: routeMapView };
    }
    if (write !== undefined) setRouteState({ mapView: write }, { replace: true });
  }, [stored, routeMapView, setRouteState]);
}
