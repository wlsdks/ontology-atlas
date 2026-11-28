import type { AnyRouter } from '@tanstack/react-router';

import { parseSearch } from './atlas-search';

export interface AddressNavigation {
  replace?: boolean;
  /** `false` keeps the scroll position, as a pane that only changes its selection does. */
  scroll?: boolean;
}

/**
 * Moves the router to an address written as text (`/en/library/?q=a%20b#h`), the form product code
 * builds. Query and hash reach the router as the bytes written, so none is re-encoded on the way.
 */
export function navigateToAddress(router: AnyRouter, address: string, { replace, scroll }: AddressNavigation = {}): void {
  const target = new URL(address, window.location.origin);
  void router.navigate({
    to: target.pathname,
    search: parseSearch(target.search),
    hash: target.hash.slice(1),
    replace: replace === true,
    resetScroll: scroll !== false,
  });
}
