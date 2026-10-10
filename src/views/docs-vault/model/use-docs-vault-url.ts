'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { getTopologyProjectHref } from '@/entities/project';
import {
  buildOntologyInsightsReturnHref,
  buildTopologyReturnHref,
  buildTopologyReturnMarker,
  parseInsightsReturnMarker,
  parseTopologyReturnMarker,
} from '@/entities/knowledge-graph';
import { buildDocsVaultHref } from '@/entities/docs-vault';
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
  parseDocsVaultSource,
  scheduleStateSync,
  type DocsVaultView,
} from '../lib/persistence';
import type { useVaultManifest } from './use-vault-manifest';

export function useDocsVaultAddress() {
  const searchParams = useSearchParams();
  const routePathname = usePathname();
  const querySlug = searchParams?.get('slug') ?? null;
  const queryView = parseView(searchParams?.get('view'));
  const querySource = parseDocsVaultSource(searchParams?.get('source'));
  const querySample =
    searchParams?.get('sample') === 'dogfood' ? ('dogfood' as const) : null;
  const queryDogfood = searchParams?.get('dogfood') ?? null;
  // An unknown order value falls back to the default.
  const queryTreeSort = parseDocsTreeSort(searchParams?.get('sort'));
  const queryTreeGroup = parseDocsTreeGroup(searchParams?.get('group'));
  const insightsReturnTab = parseInsightsReturnMarker(
    searchParams?.get('via'),
  );
  const insightsReviewId = insightsReturnTab
    ? searchParams?.get('review') ?? null
    : null;
  // `via=topology:<nodeId>` sends the crumb back to that node, selected.
  const topologyReturnNode = parseTopologyReturnMarker(searchParams?.get('via'));
  const projectsListHref = '/projects/';
  // On a hard navigation `/` falls through to the gateway before the vault restores,
  // so the crumb goes straight to the map.
  const workspaceHref = insightsReturnTab
    ? buildOntologyInsightsReturnHref(insightsReturnTab, insightsReviewId)
    : topologyReturnNode
      ? buildTopologyReturnHref(topologyReturnNode)
      : '/topology';
  const getDocHref = useCallback(
    (slug: string, hash?: string) =>
      buildDocsVaultHref({
        slug,
        hash,
        // Keep the origin across in-vault hops so the crumb keeps its way back.
        via: insightsReturnTab
          ? `insights:${insightsReturnTab}`
          : topologyReturnNode
            ? buildTopologyReturnMarker(topologyReturnNode)
            : null,
        reviewId: insightsReviewId,
      }),
    [insightsReturnTab, insightsReviewId, topologyReturnNode],
  );
  // `/?p=` loses its query in the locale-less root redirect; link /topology directly.
  const getProjectHref = useCallback(
    (slug: string) => getTopologyProjectHref(slug),
    [],
  );

  const replaceUrlState = replaceDocsVaultUrlState;
  const [view, setView] = useState<DocsVaultView>(queryView);
  const generalDocsHref = useCallback((slug: string) => {
    const query = new URLSearchParams(searchParams?.toString());
    query.delete('tab');
    query.set('slug', slug);
    const suffix = query.toString();
    return `/docs/${suffix ? `?${suffix}` : ''}${typeof window === 'undefined' ? '' : window.location.hash}`;
  }, [searchParams]);
  const legacyLibraryRedirectHref = useCallback(() => {
    const query = new URLSearchParams(searchParams?.toString());
    query.set('tab', 'ontology');
    const suffix = query.toString();
    return `/library/${suffix ? `?${suffix}` : ''}${typeof window === 'undefined' ? '' : window.location.hash}`;
  }, [searchParams]);
  const libraryOntologyHref = useMemo(() => {
    const query = new URLSearchParams(searchParams?.toString());
    query.delete('slug');
    query.delete('view');
    query.set('tab', 'ontology');
    const suffix = query.toString();
    return `/library/${suffix ? `?${suffix}` : ''}`;
  }, [searchParams]);
  return {
    searchParams,
    routePathname,
    querySlug,
    queryView,
    view,
    setView,
    querySource,
    querySample,
    queryDogfood,
    queryTreeSort,
    queryTreeGroup,
    insightsReturnTab,
    workspaceHref,
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
  // Once on mount, backfill from localStorage when the URL carries no value.
  const initialPrefsAppliedRef = useRef(false);
  useEffect(() => {
    if (initialPrefsAppliedRef.current) return;
    initialPrefsAppliedRef.current = true;
    scheduleStateSync(() => {
      if (!searchParams?.has('view')) setView(queryView);
    });
  }, [searchParams, queryView, setView]);

  // URL to state only; user actions push state to the URL themselves.
  useEffect(() => {
    if (!vaultScopeSettled || !outOfScopeQuerySlug) return;
    router.replace(generalDocsHref(outOfScopeQuerySlug), { scroll: false });
  }, [generalDocsHref, outOfScopeQuerySlug, router, vaultScopeSettled]);
  useEffect(() => {
    if (!vaultScopeSettled || !legacyRedirectToLibrary) return;
    router.replace(legacyLibraryRedirectHref(), { scroll: false });
  }, [legacyLibraryRedirectHref, legacyRedirectToLibrary, router, vaultScopeSettled]);
  const prevQuerySlug = usePrevious(normalizedQuerySlug);
  useEffect(() => {
    if (outOfScopeQuerySlug) return;
    if (prevQuerySlug !== normalizedQuerySlug && normalizedQuerySlug !== selectedSlug) {
      scheduleStateSync(() => setSelectedSlug(normalizedQuerySlug));
    }
  }, [normalizedQuerySlug, outOfScopeQuerySlug, prevQuerySlug, selectedSlug, setSelectedSlug]);
  const prevQueryView = usePrevious(queryView);
  useEffect(() => {
    if (prevQueryView !== queryView && queryView !== view) {
      scheduleStateSync(() => setView(queryView));
    }
  }, [prevQueryView, queryView, view, setView]);
  // Order also changes through back, shared links and agent URLs.
  const prevQueryTreeSort = usePrevious(queryTreeSort);
  useEffect(() => {
    if (prevQueryTreeSort !== queryTreeSort && queryTreeSort !== treeSort) {
      scheduleStateSync(() => setTreeSort(queryTreeSort));
    }
  }, [prevQueryTreeSort, queryTreeSort, treeSort]);
  const prevQueryTreeGroup = usePrevious(queryTreeGroup);
  useEffect(() => {
    if (prevQueryTreeGroup !== queryTreeGroup && queryTreeGroup !== treeGroup) {
      scheduleStateSync(() => setTreeGroup(queryTreeGroup));
    }
  }, [prevQueryTreeGroup, queryTreeGroup, treeGroup]);

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
