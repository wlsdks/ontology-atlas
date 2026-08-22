'use client';

/**
 * The URL state replacement for `DocsVaultPage`.
 *
 * It handles only the `?slug=`, `?view=`, and `?intent=` query params: updates the URL through
 * `window.history.replaceState` and dispatches an `app:urlchange` event that callers listen to in
 * order to sync state. `doc` is the default view, so the param is removed when view is 'doc'.
 *
 * A module-level pure function — no `useCallback` wrapper is needed (it is stable by
 * construction), and it can be left out of the `useCallback` deps of every call site.
 *
 * The list order (`?sort=` · `?group=`) rides the same contract — leaving the order as hidden state
 * would drop "which order was I looking at" from shared links and agent handoffs.
 */

import {
  serializeDocsTreeGroup,
  serializeDocsTreeSort,
  type DocsTreeGroup,
  type DocsTreeSort,
} from '@/widgets/docs-vault/lib/tree-order';

// folder-topology was removed. Only 'doc' remains, but the caller contract (`view?:`) is kept.
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
  // List order — the parameter is dropped when it is the default. The judgement "a default is not
  // written into the URL" lives in one place, the serializer in tree-order.ts.
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
