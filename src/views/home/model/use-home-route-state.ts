'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePathname } from '@/i18n/navigation';
import {
  applyHomeRouteState,
  DEFAULT_HOME_ROUTE_STATE,
  parseHomeRouteState,
  type HomeRouteState,
} from './url-state';

/** history.pushState 직후 dispatch 하는 커스텀 이벤트 이름. */
const HOME_URL_CHANGE_EVENT = 'app:urlchange';

function readHomeSearch() {
  if (typeof window === 'undefined') return '';
  return window.location.search;
}

/**
 * 홈 페이지의 라우트 state (selectedSlug, activeCategory, featuredPathId 등) 를
 * URL 쿼리 파라미터에 직렬화·복원하는 훅.
 *
 * 이중 구독: (1) useSyncExternalStore 로 popstate + 앱 내 pushState 이벤트 ,
 * (2) Next.js `useSearchParams` 로 app-router 네비게이션. 이전엔 (1) 만 구독해
 * Next.js `<Link>` 로 이동하는 "← 워크스페이스 지도" 버튼이 URL 은 바꾸지만
 * route state 갱신을 못 시키는 버그. 둘 다 구독해서 어느 경로로 바뀌든 즉시
 * 반영. window.location 을 fresh read 해서 최신값 보장.
 */
export function useHomeRouteState(): [
  HomeRouteState,
  (
    updater:
      | Partial<HomeRouteState>
      | ((current: HomeRouteState) => HomeRouteState),
  ) => void,
] {
  const pathname = usePathname();
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  // useSearchParams 는 app-router 변화를 구독 — Link/router.push 시 trigger.
  // 값 자체는 window.location 과 동기화되므로 아래 routeState 계산에 직접
  // 사용하지 않고 "re-render 트리거" 용으로만 참조.
  const routerSearchParams = useSearchParams();
  const search = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === 'undefined') return () => undefined;
      window.addEventListener('popstate', onStoreChange);
      window.addEventListener(HOME_URL_CHANGE_EVENT, onStoreChange);
      return () => {
        window.removeEventListener('popstate', onStoreChange);
        window.removeEventListener(HOME_URL_CHANGE_EVENT, onStoreChange);
      };
    },
    readHomeSearch,
    () => '',
  );

  // routerSearchParams 가 바뀌어도 useMemo 가 재실행되도록 deps 에 포함.
  // 값 자체는 window.location.search 가 진실원. eslint react-hooks rule 이
  // deps 추론을 못 해 명시적으로 .toString() 값을 변수로 뽑아 dep 에 넣는다.
  const routerSearchKey = routerSearchParams?.toString() ?? '';
  const routeState = useMemo(() => {
    // routerSearchKey 는 re-run trigger 용으로만 dep 에 포함.
    void routerSearchKey;
    if (!hydrated) return DEFAULT_HOME_ROUTE_STATE;
    const currentSearch =
      typeof window !== 'undefined' ? window.location.search : search;
    return currentSearch.length > 0
      ? parseHomeRouteState(new URLSearchParams(currentSearch))
      : DEFAULT_HOME_ROUTE_STATE;
  }, [hydrated, search, routerSearchKey]);

  const updateRouteState = useCallback(
    (
      updater:
        | Partial<HomeRouteState>
        | ((current: HomeRouteState) => HomeRouteState),
    ) => {
      if (typeof window === 'undefined') return;
      const current = parseHomeRouteState(
        new URLSearchParams(window.location.search),
      );
      const next =
        typeof updater === 'function'
          ? updater(current)
          : { ...current, ...updater };
      const params = applyHomeRouteState(
        new URLSearchParams(window.location.search),
        next,
      );
      const query = params.toString();
      window.history.pushState(
        {},
        '',
        query ? `${pathname}?${query}` : pathname,
      );
      window.dispatchEvent(new Event(HOME_URL_CHANGE_EVENT));
    },
    [pathname],
  );

  return [routeState, updateRouteState];
}
