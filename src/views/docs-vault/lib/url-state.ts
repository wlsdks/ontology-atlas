'use client';

/**
 * R11 #16 step 4 — DocsVaultPage 의 URL state replace 추출.
 *
 * `?slug=`, `?view=`, `?intent=` query params 만 다룸. window.history.replaceState 로
 * url 갱신 + `app:urlchange` event dispatch (caller 들이 그것 listen 해서
 * state 동기화). doc 이 default view 라 view='doc' 일 땐 query param 제거.
 *
 * 모듈-level 순수 함수 — useCallback 으로 wrap 할 필요 0 (자동 stable).
 * 호출 사이트 (handleViewChange, handleSourceChange, openDocBySlug, etc) 의
 * useCallback deps 에서 *제거 가능* — module reference 는 영원히 같음.
 *
 * 목록 순서(`?sort=` · `?group=`) 도 같은 계약을 탄다 — 정렬을 숨은 상태로
 * 두면 공유 링크와 에이전트 핸드오프에서 "무슨 순서로 보던 중" 이 빠진다.
 */

import {
  serializeDocsTreeGroup,
  serializeDocsTreeSort,
  type DocsTreeGroup,
  type DocsTreeSort,
} from '@/widgets/docs-vault/lib/tree-order';

// P5a — folder-topology 제거. 'doc' 만 남지만 caller 계약(`view?:`) 은 유지.
export type DocsVaultView = 'doc';

export function replaceDocsVaultUrlState(next: {
  slug?: string | null;
  view?: DocsVaultView;
  intent?: 'local' | null;
  sort?: DocsTreeSort;
  group?: DocsTreeGroup;
}): void {
  if (typeof window === 'undefined') return;
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
  if ('intent' in next) {
    if (next.intent === 'local') url.searchParams.set('intent', 'local');
    else url.searchParams.delete('intent');
  }
  // 목록 순서 — 기본값이면 파라미터를 지운다. "기본값은 URL 에 쓰지 않는다"
  // 판단은 tree-order.ts 의 serializer 한 곳에만 둔다.
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
