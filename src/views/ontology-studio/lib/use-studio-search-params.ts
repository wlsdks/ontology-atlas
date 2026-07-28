"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  STUDIO_URL_CHANGE_EVENT,
  carryStudioContext,
  nextStudioUrl,
} from "./studio-route-params";

/**
 * 공방이 읽는 검색 파라미터 — `history.pushState` 로 바뀐 주소까지 본다.
 *
 * `useSearchParams` 는 라우터가 일으킨 이동만 안다. 공방의 같은-라우트 이동은
 * `pushStudioParams` 가 직접 `history.pushState` 로 쓰므로(왜인지는
 * `studio-route-params.ts` 상단), 그 훅만 쓰면 주소는 바뀌는데 화면이 안 바뀐다.
 * 그래서 우리가 쓴 주소는 우리가 알린다.
 *
 * 첫 값은 `useSearchParams` 에서 받는다 — 서버에서 그려진 첫 프레임과 딥링크
 * 하드로드가 그 경로로 오기 때문이다. 이후는 `window.location.search` 가
 * 진실원이고, `popstate`(뒤로/앞으로)도 같은 경로로 흡수한다.
 */
export function useStudioSearchParams(): URLSearchParams {
  const routerParams = useSearchParams();
  const [search, setSearch] = useState<string | null>(null);

  // 우리 값이 라우터 값을 영영 가리지 않나: 공방을 떠나면 이 컴포넌트가
  // 언마운트되고 돌아올 때 상태가 처음부터 다시 시작한다. 공방 **안**의
  // 이동은 이제 전부 우리 것이라, 라우터가 이 라우트에서 주소를 바꾸는
  // 경로가 남아 있지 않다. 그래서 되돌리는 이펙트를 두지 않는다.
  //
  // **마운트 시점에는 읽지 않는다.** 첫 값은 `useSearchParams` 의 것이다 —
  // 하드로드에서는 둘이 같고, 라우터가 진실원인 경로를 우리가 가로채지 않는다.
  useEffect(() => {
    const sync = () => setSearch(window.location.search);
    window.addEventListener(STUDIO_URL_CHANGE_EVENT, sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener(STUDIO_URL_CHANGE_EVENT, sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  return search === null ? routerParams : new URLSearchParams(search);
}

/**
 * 공방 안에서의 이동 — 경로는 그대로, 쿼리만 바꾼다.
 *
 * 맥락 파라미터(`via`·`review`·`guides`)는 자동으로 따라온다. 나머지는
 * 호출자가 준 값이 전부다 — 안 지우면 이전 화면의 편집 요청이 새 노드에
 * 그대로 붙는다.
 */
export function useStudioNavigate(): (next: URLSearchParams) => void {
  return useCallback((next: URLSearchParams) => {
    const current = new URLSearchParams(window.location.search);
    const merged = carryStudioContext(current, next);
    const url = nextStudioUrl(
      window.location.pathname,
      window.location.search,
      merged,
    );
    if (!url) return;
    window.history.pushState({}, "", url);
    window.dispatchEvent(new Event(STUDIO_URL_CHANGE_EVENT));
  }, []);
}
