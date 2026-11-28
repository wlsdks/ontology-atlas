import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { buildTopologyProjectHref } from '@/entities/project';
import {
  buildTopologyReturnMarker,
  parseTopologyReturnMarker,
} from '@/entities/knowledge-graph';
import { buildDocsVaultHref } from '@/entities/docs-vault';
import { firstSearchText } from '@/shared/lib/navigation/search-text';
import { stringifySearch } from '@/shared/lib/navigation/atlas-search';
import type { LibrarySearch } from '@/shared/lib/navigation/screen-searches';
import { useCommittedAddress } from '@/shared/lib/navigation/use-committed-address';
import { usePrevious } from '@/shared/lib/use-previous';
import {
  parseDocsTreeGroup,
  parseDocsTreeSort,
  type DocsTreeGroup,
  type DocsTreeSort,
} from '@/widgets/docs-vault';
import { replaceDocsVaultUrlState } from '../lib/url-state';
import {
  parseDocsVaultView as parseView,
  scheduleStateSync,
  type DocsVaultView,
} from '../lib/persistence';
import type { useVaultManifest } from './use-vault-manifest';

export function useDocsVaultAddress(search: LibrarySearch) {
  const { pathname: routePathname } = useCommittedAddress();
  const searchString = useMemo(() => stringifySearch(search), [search]);
  const searchParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const querySlug = firstSearchText(search.slug) ?? null;
  const queryView = parseView(firstSearchText(search.view));
  const queryDogfood = firstSearchText(search.dogfood) ?? null;
  const queryTreeSort = parseDocsTreeSort(firstSearchText(search.sort));
  const queryTreeGroup = parseDocsTreeGroup(firstSearchText(search.group));
  // `via=topology:<nodeId>` sends the crumb back to that node, selected.
  const topologyReturnNode = parseTopologyReturnMarker(firstSearchText(search.via));
  const projectsListHref = '/projects/';
  const getDocHref = useCallback(
    (slug: string, hash?: string) =>
      buildDocsVaultHref({
        slug,
        hash,
        via: topologyReturnNode
          ? buildTopologyReturnMarker(topologyReturnNode)
          : null,
      }),
    [topologyReturnNode],
  );
  // `/?p=` loses its query in the locale-less root redirect; link /topology directly.
  const getProjectHref = useCallback(
    (slug: string) => buildTopologyProjectHref(slug),
    [],
  );

  const replaceUrlState = replaceDocsVaultUrlState;
  const [view, setView] = useState<DocsVaultView>(queryView);
  const generalDocsHref = useCallback((slug: string) => {
    const query = new URLSearchParams(searchString);
    query.delete('tab');
    query.set('slug', slug);
    const suffix = query.toString();
    return `/docs/${suffix ? `?${suffix}` : ''}${typeof window === 'undefined' ? '' : window.location.hash}`;
  }, [searchString]);
  const legacyLibraryRedirectHref = useCallback(() => {
    const query = new URLSearchParams(searchString);
    query.set('tab', 'ontology');
    const suffix = query.toString();
    return `/library/${suffix ? `?${suffix}` : ''}${typeof window === 'undefined' ? '' : window.location.hash}`;
  }, [searchString]);
  const libraryOntologyHref = useMemo(() => {
    const query = new URLSearchParams(searchString);
    query.delete('slug');
    query.delete('view');
    query.set('tab', 'ontology');
    const suffix = query.toString();
    return `/library/${suffix ? `?${suffix}` : ''}`;
  }, [searchString]);
  return {
    searchParams,
    routePathname,
    querySlug,
    queryView,
    view,
    setView,
    queryDogfood,
    queryTreeSort,
    queryTreeGroup,
    getDocHref,
    getProjectHref,
    projectsListHref,
    replaceUrlState,
    generalDocsHref,
    legacyLibraryRedirectHref,
    libraryOntologyHref,
  };
}

export function useDocsVaultUrlSync({
  address,
  vault,
  selectedSlug,
  setSelectedSlug,
  setAdvancedOpen,
  vaultScopeSettled,
}: {
  address: ReturnType<typeof useDocsVaultAddress>;
  vault: ReturnType<typeof useVaultManifest>;
  selectedSlug: string | null;
  setSelectedSlug: (slug: string | null) => void;
  setAdvancedOpen: (open: boolean) => void;
  vaultScopeSettled: boolean;
}) {
  const {
    searchParams,
    queryView,
    queryTreeSort,
    queryTreeGroup,
    view,
    setView,
    replaceUrlState,
    generalDocsHref,
    legacyLibraryRedirectHref,
  } = address;
  const { normalizedQuerySlug, outOfScopeQuerySlug, legacyRedirectToLibrary } = vault;
  const router = useRouter();
  const [treeSort, setTreeSort] = useState<DocsTreeSort>(queryTreeSort);
  const [treeGroup, setTreeGroup] = useState<DocsTreeGroup>(queryTreeGroup);
  const initialPrefsAppliedRef = useRef(false);
  useEffect(() => {
    if (initialPrefsAppliedRef.current) return;
    initialPrefsAppliedRef.current = true;
    scheduleStateSync(() => {
      if (!searchParams.has('view')) setView(queryView);
    });
  }, [searchParams, queryView, setView]);

  useEffect(() => {
    if (!vaultScopeSettled || !outOfScopeQuerySlug) return;
    router.replace(generalDocsHref(outOfScopeQuerySlug), { scroll: false });
  }, [generalDocsHref, outOfScopeQuerySlug, router, vaultScopeSettled]);
  useEffect(() => {
    if (!vaultScopeSettled || !legacyRedirectToLibrary) return;
    router.replace(legacyLibraryRedirectHref(), { scroll: false });
  }, [legacyLibraryRedirectHref, legacyRedirectToLibrary, router, vaultScopeSettled]);
  const previousQuerySlug = usePrevious(normalizedQuerySlug);
  useEffect(() => {
    if (outOfScopeQuerySlug) return;
    if (previousQuerySlug !== normalizedQuerySlug && normalizedQuerySlug !== selectedSlug) {
      scheduleStateSync(() => setSelectedSlug(normalizedQuerySlug));
    }
  }, [normalizedQuerySlug, outOfScopeQuerySlug, previousQuerySlug, selectedSlug, setSelectedSlug]);
  const previousQueryView = usePrevious(queryView);
  useEffect(() => {
    if (previousQueryView !== queryView && queryView !== view) {
      scheduleStateSync(() => setView(queryView));
    }
  }, [previousQueryView, queryView, view, setView]);
  // Order also changes through back, shared links and agent URLs.
  const previousQueryTreeSort = usePrevious(queryTreeSort);
  useEffect(() => {
    if (previousQueryTreeSort !== queryTreeSort && queryTreeSort !== treeSort) {
      scheduleStateSync(() => setTreeSort(queryTreeSort));
    }
  }, [previousQueryTreeSort, queryTreeSort, treeSort]);
  const previousQueryTreeGroup = usePrevious(queryTreeGroup);
  useEffect(() => {
    if (previousQueryTreeGroup !== queryTreeGroup && queryTreeGroup !== treeGroup) {
      scheduleStateSync(() => setTreeGroup(queryTreeGroup));
    }
  }, [previousQueryTreeGroup, queryTreeGroup, treeGroup]);

  const handleViewChange = useCallback(
    (next: DocsVaultView) => {
      setView(next);
      replaceUrlState({ view: next });
      setAdvancedOpen(false);
    },
    [replaceUrlState, setAdvancedOpen, setView],
  );

  const handleTreeSortChange = useCallback(
    (next: DocsTreeSort) => {
      setTreeSort(next);
      replaceUrlState({ sort: next });
    },
    [replaceUrlState],
  );

  const handleTreeGroupChange = useCallback(
    (next: DocsTreeGroup) => {
      setTreeGroup(next);
      replaceUrlState({ group: next });
    },
    [replaceUrlState],
  );
  return {
    treeSort,
    treeGroup,
    handleViewChange,
    handleTreeSortChange,
    handleTreeGroupChange,
  };
}
