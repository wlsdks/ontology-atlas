import { useMatches } from '@tanstack/react-router';
import { useMemo } from 'react';

import { parseSearch, stringifySearch, type AtlasSearch } from './atlas-search';

export interface CommittedAddress {
  pathname: string;
  /** With its leading `?`, or empty. */
  searchString: string;
}

/**
 * The address of the screen on show. The router writes history before the incoming screen has
 * rendered, so `window.location` already names the next screen while the last one is still mounted;
 * a screen that reads its address from the committed match never renders an address that is not its own.
 */
export function useCommittedAddress(): CommittedAddress {
  const address = useMatches({
    select: (matches) => {
      const leaf = matches[matches.length - 1];
      return leaf === undefined ? '' : `${leaf.pathname}${stringifySearch(leaf.search as Record<string, unknown>)}`;
    },
  });
  const queryStart = address.indexOf('?');
  return queryStart < 0
    ? { pathname: address, searchString: '' }
    : { pathname: address.slice(0, queryStart), searchString: address.slice(queryStart) };
}

/** The query of the screen on show, as the router parsed it; for chrome that reads a key beside the screen. */
export function useCommittedSearch(): AtlasSearch {
  const { searchString } = useCommittedAddress();
  return useMemo(() => parseSearch(searchString), [searchString]);
}
