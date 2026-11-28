import { withBasePath } from '@/shared/lib/public-pages/base-path';
import {
  serializeDocsTreeGroup,
  serializeDocsTreeSort,
  type DocsTreeGroup,
  type DocsTreeSort,
} from '@/widgets/docs-vault';

import type { DocsVaultView } from './persistence';
import { currentAddress, guardedHistoryWrite } from '@/shared/lib/navigation/history-write-guard';

interface DocsVaultUrlState {
  slug?: string | null;
  view?: DocsVaultView;
  sort?: DocsTreeSort;
  group?: DocsTreeGroup;
}

function docsVaultHref(next: DocsVaultUrlState): string {
  const written = currentAddress();
  const query = new URLSearchParams(written.search);
  if ('slug' in next) {
    if (next.slug) query.set('slug', next.slug);
    else query.delete('slug');
  }
  if ('view' in next) {
    if (next.view && next.view !== 'doc') {
      query.set('view', next.view);
    } else {
      query.delete('view');
    }
  }
  if ('sort' in next && next.sort) {
    const value = serializeDocsTreeSort(next.sort);
    if (value) query.set('sort', value);
    else query.delete('sort');
  }
  if ('group' in next && next.group) {
    const value = serializeDocsTreeGroup(next.group);
    if (value) query.set('group', value);
    else query.delete('group');
  }
  const search = query.toString();
  return `${written.pathname}${search === '' ? '' : `?${search}`}${written.hash}`;
}

export function replaceDocsVaultUrlState(next: DocsVaultUrlState): void {
  guardedHistoryWrite('replace', docsVaultHref(next));
}

const withoutTrailingSlash = (pathname: string) => pathname.replace(/\/+$/, '');

export function settleDocsVaultAddress(routePathname: string, slug: string): void {
  if (typeof window === 'undefined') return;
  if (withoutTrailingSlash(window.location.pathname) !== withoutTrailingSlash(withBasePath(routePathname))) return;
  guardedHistoryWrite('replace', docsVaultHref({ slug }));
}
