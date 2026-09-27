'use client';

/**
 * Replaces `DocsVaultPage` URL state through `history.replaceState` and
 * dispatches `app:urlchange` for callers to sync. The default view is omitted. A module-level function,
 * so it needs no `useCallback` and stays out of deps.
 */

import {
  serializeDocsTreeGroup,
  serializeDocsTreeSort,
  type DocsTreeGroup,
  type DocsTreeSort,
} from '@/widgets/docs-vault';

// One view remains; the `view?:` caller contract is kept.
export type DocsVaultView = 'doc';

export function replaceDocsVaultUrlState(next: {
  slug?: string | null;
  view?: DocsVaultView;
  intent?: 'local' | null;
  source?: 'server' | 'local' | null;
  sample?: 'dogfood' | null;
  sort?: DocsTreeSort;
  group?: DocsTreeGroup;
}): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if ('source' in next) {
    if (next.source) url.searchParams.set('source', next.source);
    else url.searchParams.delete('source');
  }
  if ('sample' in next) {
    if (next.sample) url.searchParams.set('sample', next.sample);
    else url.searchParams.delete('sample');
  }
  if ('slug' in next) {
    if (next.slug) url.searchParams.set('slug', next.slug);
    else url.searchParams.delete('slug');
  }
  if ('view' in next) {
    if (next.view && next.view !== 'doc') {
      url.searchParams.set('view', next.view);
    } else {
      url.searchParams.delete('view');
    }
  }
  if ('intent' in next) {
    if (next.intent === 'local') url.searchParams.set('intent', 'local');
    else url.searchParams.delete('intent');
  }
  // Defaults are omitted by the serializer in tree-order.ts.
  if ('sort' in next && next.sort) {
    const value = serializeDocsTreeSort(next.sort);
    if (value) url.searchParams.set('sort', value);
    else url.searchParams.delete('sort');
  }
  if ('group' in next && next.group) {
    const value = serializeDocsTreeGroup(next.group);
    if (value) url.searchParams.set('group', value);
    else url.searchParams.delete('group');
  }
  window.history.replaceState({}, '', url.toString());
  window.dispatchEvent(new Event('app:urlchange'));
}
