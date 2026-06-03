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
 */

export type DocsVaultView = 'doc' | 'folder-topology';

export function replaceDocsVaultUrlState(next: {
  slug?: string | null;
  view?: DocsVaultView;
  intent?: 'local' | null;
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
  window.history.replaceState({}, '', url.toString());
  window.dispatchEvent(new Event('app:urlchange'));
}
