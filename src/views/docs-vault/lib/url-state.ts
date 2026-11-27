'use client';

import { withBasePath } from '@/shared/lib/public-pages/base-path';
import {
  serializeDocsTreeGroup,
  serializeDocsTreeSort,
  type DocsTreeGroup,
  type DocsTreeSort,
} from '@/widgets/docs-vault';

import type { DocsVaultView } from './persistence';
import { guardedHistoryWrite } from '@/shared/lib/navigation/history-write-guard';

interface DocsVaultUrlState {
  slug?: string | null;
  view?: DocsVaultView;
  sort?: DocsTreeSort;
  group?: DocsTreeGroup;
}

function docsVaultHref(next: DocsVaultUrlState): string {
  const url = new URL(window.location.href);
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
  return url.toString();
}

export function replaceDocsVaultUrlState(next: DocsVaultUrlState): void {
  if (typeof window === 'undefined') return;
  guardedHistoryWrite('replace', docsVaultHref(next));
  window.dispatchEvent(new Event('app:urlchange'));
}

const withoutTrailingSlash = (pathname: string) => pathname.replace(/\/+$/, '');

export function settleDocsVaultAddress(routePathname: string, slug: string): void {
  if (typeof window === 'undefined') return;
  if (withoutTrailingSlash(window.location.pathname) !== withoutTrailingSlash(withBasePath(routePathname))) return;
  guardedHistoryWrite('replace', docsVaultHref({ slug }));
  window.dispatchEvent(new Event('app:urlchange'));
}
