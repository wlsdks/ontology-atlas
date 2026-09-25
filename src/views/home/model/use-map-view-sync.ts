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

/** Stores a view named by an address, writing all the flags as the view picker does. */
function applyMapView(view: HomeMapView): void {
  writeTerritories(view === 'territories');
  writeHexBoard(view === 'hex');
  if (view === 'territories' || view === 'galaxy' || view === 'hex') {
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
 * What the sync does for one change, as a pure decision (so the no-ping-pong rule is testable).
 *
 * - `arrival`: the first look. An address that names a view wins (someone handed it over) and
 *   is adopted into the stored choice; otherwise a stored view is written to the address once.
 * - `stored-changed`: the reader picked a view. The address follows — this is the only
 *   steady-state write.
 * - `address-changed`: something else moved the address (Back/Forward, a link, or a harness
 *   that re-writes the route). An address naming a view is adopted; an address naming none is
 *   **left alone**. Writing the stored view back here is what ping-ponged with any other writer
 *   of the address (the installed app's route verifier re-wrote it every 400 ms, and each write
 *   answered each re-write until WebKit refused `history.replaceState`, 2026-09-25).
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
 * Keeps `?view=` and the view picker's stored choice saying the same thing.
 *
 * The picker stores the choice, so the map keeps the view a reader chose across visits. The
 * address carries it too, so a link opens the same view and a reload keeps it. The address is
 * written only when the reader changes the view (and once on arrival), never in answer to an
 * address change — see `decideMapViewSync`.
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
  const hexBoard = useHexBoard();
  const galaxy = useGalaxy();
  const view3d = useView3d();
  const arrangement = useMapArrangement();
  // The picker's own precedence (`View3dMenu`), so both read one view from the same flags.
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
      // The stored choice now equals the address; the next run sees nothing to write.
      lastRef.current = { stored: adopt, address: routeMapView };
    }
    if (write !== undefined) setRouteState({ mapView: write }, { replace: true });
  }, [stored, routeMapView, setRouteState]);
}
