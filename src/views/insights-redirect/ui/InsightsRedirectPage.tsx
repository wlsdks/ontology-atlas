'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { useRouter } from '@/i18n/navigation';
import { translateOntologyDeeplinkToTopologyParam } from '@/entities/knowledge-graph';
import { RouteLoadingFallback } from '@/shared/ui';

const ANALYSIS_REVIEW_PREFIX = 'analysis:';

/** The concept a saved Analysis address named, as the map's canonical `?p=` value, or null. */
function namedConcept(search: URLSearchParams): string | null {
  const review = search.get('review');
  const raw = review?.startsWith(ANALYSIS_REVIEW_PREFIX)
    ? review.slice(ANALYSIS_REVIEW_PREFIX.length)
    : search.get('node');
  const canonical = raw ? translateOntologyDeeplinkToTopologyParam(raw) : '';
  return canonical || null;
}

/** Where a retired Analysis address lands; the first matching rule wins. */
export function buildInsightsRedirectHref(search: URLSearchParams): string {
  const tab = search.get('tab');
  if (tab === 'harness') {
    const query = new URLSearchParams(search);
    query.delete('tab');
    query.set('view', 'overview');
    return `/architecture/?${query.toString()}`;
  }
  if (tab === 'library') return '/library/?tab=wiki';
  const concept = namedConcept(search);
  if (concept) return `/topology/?${new URLSearchParams({ p: concept }).toString()}`;
  return '/topology/';
}

export function InsightsRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const target = buildInsightsRedirectHref(new URLSearchParams(searchParams.toString()));

  useEffect(() => {
    router.replace(target);
  }, [router, target]);

  return <RouteLoadingFallback />;
}
