'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { getTopologyProjectHref } from '@/entities/project';
import {
  buildOntologyInsightsReturnHref,
  buildTopologyReturnHref,
  buildTopologyReturnMarker,
  parseInsightsReturnMarker,
  parseTopologyReturnMarker,
} from '@/entities/knowledge-graph';
import { buildDocsVaultHref } from '@/entities/docs-vault';
import { parseDocsTreeGroup, parseDocsTreeSort } from '@/widgets/docs-vault';
import { replaceDocsVaultUrlState } from '../lib/url-state';
import { parseDocsVaultView as parseView, parseDocsVaultSource } from '../lib/persistence';

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
