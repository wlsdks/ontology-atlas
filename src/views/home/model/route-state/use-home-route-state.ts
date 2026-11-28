import { useCallback, useMemo, useState } from 'react';
import {
  applyHomeRouteState,
  parseHomeRouteState,
  type HomeRouteState,
  type HomeSearch,
} from './url-state';
import { parseSearch } from '@/shared/lib/navigation/atlas-search';
import { currentAddress, guardedHistoryWrite } from '@/shared/lib/navigation/history-write-guard';

export interface HomeRouteStateUpdateOptions {
  replace?: boolean;
}

/**
 * The map's state as the address holds it. `search` is the map route's own query, so the state a
 * render sees is the address of the screen on show; an update writes the next address through the
 * history door and the router hands the new query back.
 *
 * The router hands it back in a transition, after any state set in the same event has rendered, so
 * until then the state is this hook's own last write while the window still holds exactly that
 * address. Without it a panel closed beside its address write renders once with the old query, and
 * an effect reading that query opens it again. Any other address, the next screen's during a
 * navigation among them, falls back to the committed `search`.
 */
export function useHomeRouteState(search: HomeSearch): [
  HomeRouteState,
  (
    updater:
      | Partial<HomeRouteState>
      | ((current: HomeRouteState) => HomeRouteState),
    options?: HomeRouteStateUpdateOptions,
  ) => void,
] {
  const [ownWrite, setOwnWrite] = useState<{ address: string } | null>(null);
  const live = ownWrite === null ? null : currentAddress();
  const writtenSearch =
    ownWrite !== null && live !== null && `${live.pathname}${live.search}` === ownWrite.address
      ? live.search
      : null;
  const routeState = useMemo(
    () => parseHomeRouteState(writtenSearch === null ? search : parseSearch(writtenSearch)),
    [search, writtenSearch],
  );

  const updateRouteState = useCallback(
    (
      updater:
        | Partial<HomeRouteState>
        | ((current: HomeRouteState) => HomeRouteState),
      options?: HomeRouteStateUpdateOptions,
    ) => {
      // Read fresh: two updates in one event must build on each other, not on the last render.
      const written = currentAddress();
      const query = new URLSearchParams(written.search);
      const current = parseHomeRouteState(parseSearch(written.search));
      const next =
        typeof updater === 'function'
          ? updater(current)
          : { ...current, ...updater };
      const params = applyHomeRouteState(query, next).toString();
      const nextUrl = params ? `${written.pathname}?${params}` : written.pathname;
      // An identical URL pushes nothing, or Back changes nothing on screen and reads as broken.
      if (nextUrl === `${written.pathname}${written.search}`) return;
      // Through the shared budget, or a runaway loop hits WebKit's 100-per-10s limit and throws
      // (`shared/lib/navigation/history-write-guard.ts`).
      if (!guardedHistoryWrite(options?.replace ? 'replace' : 'push', nextUrl)) return;
      // What the window holds now, so the render compares the bytes the history actually kept.
      const landed = currentAddress();
      setOwnWrite({ address: `${landed.pathname}${landed.search}` });
    },
    [],
  );

  return [routeState, updateRouteState];
}
